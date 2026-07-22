alter table public.matches
  add column planet_snapshot jsonb,
  add column state_snapshot jsonb,
  add column state_fingerprint text,
  add column last_command_type text,
  add column winner_player_id text,
  add column winner_user_id uuid references auth.users (id) on delete set null;

alter table public.matches drop constraint matches_status_valid;
alter table public.matches
  add constraint matches_status_valid
  check (status in ('preview', 'active', 'completed', 'closed'));
alter table public.matches
  add constraint matches_planet_snapshot_object
  check (planet_snapshot is null or jsonb_typeof(planet_snapshot) = 'object'),
  add constraint matches_state_snapshot_object
  check (state_snapshot is null or jsonb_typeof(state_snapshot) = 'object'),
  add constraint matches_fingerprint_format
  check (state_fingerprint is null or state_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint matches_authoritative_state_complete
  check (
    (status in ('preview', 'closed'))
    or (
      planet_snapshot is not null
      and state_snapshot is not null
      and state_fingerprint is not null
    )
  ),
  add constraint matches_completed_winner
  check (
    status <> 'completed'
    or (winner_player_id is not null and winner_user_id is not null)
  );

create table public.match_commands (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete restrict,
  sequence bigint not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  actor_seat_index integer not null,
  command_type text not null,
  command_payload jsonb not null,
  command_hash text not null,
  client_idempotency_key uuid not null,
  previous_revision bigint not null,
  resulting_revision bigint not null,
  resulting_state_fingerprint text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint match_commands_sequence_positive check (sequence > 0),
  constraint match_commands_actor_seat_nonnegative check (actor_seat_index >= 0),
  constraint match_commands_payload_object check (jsonb_typeof(command_payload) = 'object'),
  constraint match_commands_hash_format check (command_hash ~ '^[0-9a-f]{64}$'),
  constraint match_commands_fingerprint_format check (resulting_state_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint match_commands_revision_step check (
    previous_revision >= 0
    and resulting_revision = previous_revision + 1
    and sequence = resulting_revision
  ),
  constraint match_commands_match_sequence_unique unique (match_id, sequence),
  constraint match_commands_idempotency_unique unique (match_id, client_idempotency_key)
);

create index match_commands_match_created_idx
  on public.match_commands (match_id, created_at desc);
create index match_commands_actor_user_id_idx
  on public.match_commands (actor_user_id);
create index matches_winner_user_id_idx
  on public.matches (winner_user_id)
  where winner_user_id is not null;

alter table public.match_commands enable row level security;

create policy match_commands_member_select
on public.match_commands for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = match_commands.match_id
      and multiplayer_private.is_room_member(matches.room_id)
  )
);

revoke all on public.match_commands from public, anon, authenticated;
grant select on public.match_commands to authenticated;

create or replace function multiplayer_private.protect_match_snapshots()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.room_id is distinct from old.room_id
    or new.setup_snapshot is distinct from old.setup_snapshot
    or new.seat_order_snapshot is distinct from old.seat_order_snapshot
    or new.generator_metadata is distinct from old.generator_metadata
    or (
      old.planet_snapshot is not null
      and new.planet_snapshot is distinct from old.planet_snapshot
    ) then
    raise exception using errcode = 'P0001', message = 'match_snapshot_immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.start_room_match(uuid) from authenticated;

create function public.authority_initialize_room_match(
  p_room_id uuid,
  p_match_id uuid,
  p_actor_user_id uuid,
  p_setup_snapshot jsonb,
  p_seat_order_snapshot jsonb,
  p_generator_metadata jsonb,
  p_planet_snapshot jsonb,
  p_state_snapshot jsonb,
  p_state_fingerprint text
)
returns public.matches
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_room public.rooms;
  target_match public.matches;
  occupied_count integer;
begin
  select * into target_room
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found or not exists (
    select 1 from public.room_members
    where room_members.room_id = p_room_id
      and room_members.user_id = p_actor_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.host_user_id <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'host_only';
  end if;
  if target_room.assignment_mode <> 'random' then
    raise exception using errcode = 'P0001', message = 'multiplayer_draft_unsupported';
  end if;

  select count(*) into occupied_count
  from public.room_seats
  where room_seats.room_id = p_room_id
    and occupant_user_id is not null
    and controller_type = 'human';
  if occupied_count < 2 then
    raise exception using errcode = 'P0001', message = 'not_enough_players';
  end if;
  if occupied_count > 5
    or jsonb_typeof(p_setup_snapshot) <> 'object'
    or jsonb_typeof(p_seat_order_snapshot) <> 'array'
    or jsonb_array_length(p_seat_order_snapshot) <> occupied_count
    or jsonb_typeof(p_generator_metadata) <> 'object'
    or jsonb_typeof(p_planet_snapshot) <> 'object'
    or jsonb_typeof(p_state_snapshot) <> 'object'
    or p_state_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'invalid_authoritative_state';
  end if;

  select * into target_match
  from public.matches
  where matches.room_id = p_room_id
  for update;
  if found and target_match.state_snapshot is not null then
    return target_match;
  end if;
  if found then
    raise exception using errcode = 'P0001', message = 'legacy_match_incomplete';
  end if;
  if target_room.status not in ('waiting', 'active') then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  insert into public.matches (
    id, room_id, status, revision, setup_snapshot, seat_order_snapshot,
    generator_metadata, planet_snapshot, state_snapshot, state_fingerprint
  ) values (
    p_match_id, p_room_id, 'active', 0, p_setup_snapshot,
    p_seat_order_snapshot, p_generator_metadata, p_planet_snapshot,
    p_state_snapshot, p_state_fingerprint
  ) returning * into target_match;

  update public.rooms
  set status = 'active', revision = revision + 1
  where id = p_room_id;
  return target_match;
end;
$$;

create function public.authority_commit_match_command(
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

  if target_match.status = 'completed' then
    raise exception using errcode = 'P0001', message = 'match_completed';
  end if;
  if target_match.status <> 'active' then
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
      status = case when p_winner_player_id is null then 'active' else 'completed' end,
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

revoke all on all functions in schema multiplayer_private
  from public, anon, authenticated;
grant execute on function multiplayer_private.is_room_member(uuid) to authenticated;
revoke all on function public.authority_initialize_room_match(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function public.authority_commit_match_command(
  uuid, uuid, bigint, text, jsonb, text, uuid, jsonb, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.authority_initialize_room_match(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text
) to service_role;
grant execute on function public.authority_commit_match_command(
  uuid, uuid, bigint, text, jsonb, text, uuid, jsonb, text, text, uuid
) to service_role;
grant select, insert, update on public.matches to service_role;
grant select, update on public.rooms to service_role;
grant select on public.room_members, public.room_seats to service_role;
grant select, insert on public.match_commands to service_role;
grant usage, select on sequence public.match_commands_id_seq to service_role;

alter publication supabase_realtime add table public.match_commands;
