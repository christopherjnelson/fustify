update public.matches
set status = 'active'
where status = 'completed'
  and state_snapshot ->> 'phase' = 'capture'
  and state_snapshot -> 'pendingCapture' is not null;

create or replace function public.authority_commit_match_command(
  p_match_id uuid,
  p_actor_user_id uuid,
  p_expected_revision bigint,
  p_command_type text,
  p_command_payload jsonb,
  p_command_hash text,
  p_client_idempotency_key uuid,
  p_state_snapshot jsonb,
  p_state_fingerprint text,
  p_winner_player_id text,
  p_winner_user_id uuid
)
returns table (
  duplicate boolean,
  resulting_revision bigint,
  resulting_state_fingerprint text,
  match_status text,
  winner_player_id text,
  winner_user_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_match public.matches;
  prior_command public.match_commands;
  actor_seat integer;
  actor_player text;
begin
  select * into target_match
  from public.matches
  where matches.id = p_match_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'match_not_found';
  end if;

  select * into prior_command
  from public.match_commands
  where match_commands.match_id = p_match_id
    and match_commands.client_idempotency_key = p_client_idempotency_key;
  if found then
    if prior_command.actor_user_id <> p_actor_user_id
      or prior_command.command_hash <> p_command_hash
      or prior_command.command_payload <> p_command_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return query select
      true,
      prior_command.resulting_revision,
      prior_command.resulting_state_fingerprint,
      target_match.status,
      target_match.winner_player_id,
      target_match.winner_user_id;
    return;
  end if;

  if target_match.status = 'completed'
    and target_match.state_snapshot ->> 'phase' <> 'capture' then
    raise exception using errcode = 'P0001', message = 'match_completed';
  end if;
  if target_match.status <> 'active'
    and not (
      target_match.status = 'completed'
      and target_match.state_snapshot ->> 'phase' = 'capture'
    ) then
    raise exception using errcode = 'P0001', message = 'match_not_active';
  end if;
  if target_match.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;

  select (seat.value ->> 'seatIndex')::integer,
         seat.value ->> 'playerId'
    into actor_seat, actor_player
  from jsonb_array_elements(target_match.seat_order_snapshot) as seat(value)
  where seat.value ->> 'userId' = p_actor_user_id::text;
  if actor_seat is null
    or actor_player is null
    or not exists (
      select 1 from public.room_members
      where room_members.room_id = target_match.room_id
        and room_members.user_id = p_actor_user_id
    )
    or not exists (
      select 1 from public.room_seats
      where room_seats.room_id = target_match.room_id
        and room_seats.seat_index = actor_seat
        and room_seats.occupant_user_id = p_actor_user_id
        and room_seats.controller_type = 'human'
    ) then
    raise exception using errcode = 'P0001', message = 'seat_required';
  end if;
  if target_match.state_snapshot ->> 'activePlayerId' <> actor_player then
    raise exception using errcode = 'P0001', message = 'not_your_turn';
  end if;
  if jsonb_typeof(p_command_payload) <> 'object'
    or jsonb_typeof(p_state_snapshot) <> 'object'
    or p_command_hash !~ '^[0-9a-f]{64}$'
    or p_state_fingerprint !~ '^[0-9a-f]{64}$'
    or p_state_snapshot ->> 'matchId' <> p_match_id::text
    or p_state_snapshot ->> 'winnerId' is distinct from p_winner_player_id
    or (p_winner_player_id is null) <> (p_winner_user_id is null) then
    raise exception using errcode = 'P0001', message = 'invalid_authoritative_state';
  end if;

  insert into public.match_commands (
    match_id, sequence, actor_user_id, actor_seat_index, command_type,
    command_payload, command_hash, client_idempotency_key,
    previous_revision, resulting_revision, resulting_state_fingerprint
  ) values (
    p_match_id, p_expected_revision + 1, p_actor_user_id, actor_seat,
    p_command_type, p_command_payload, p_command_hash,
    p_client_idempotency_key, p_expected_revision,
    p_expected_revision + 1, p_state_fingerprint
  );

  update public.matches
  set state_snapshot = p_state_snapshot,
      state_fingerprint = p_state_fingerprint,
      revision = p_expected_revision + 1,
      last_command_type = p_command_type,
      status = case when p_state_snapshot ->> 'phase' = 'game-over' then 'completed' else 'active' end,
      winner_player_id = p_winner_player_id,
      winner_user_id = p_winner_user_id
  where id = p_match_id
  returning * into target_match;

  return query select
    false,
    target_match.revision,
    target_match.state_fingerprint,
    target_match.status,
    target_match.winner_player_id,
    target_match.winner_user_id;
end;
$$;
