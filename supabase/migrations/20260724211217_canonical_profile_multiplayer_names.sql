alter table public.room_members
  drop constraint room_members_display_name_valid;

alter table public.room_members
  add constraint room_members_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 40
    and display_name !~ '[[:cntrl:]]'
  );

create function multiplayer_private.require_profile_display_name(
  caller_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  canonical_name text;
begin
  if caller_id is null or caller_id <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;

  select profiles.display_name
  into canonical_name
  from public.profiles
  where profiles.user_id = caller_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;

  return profile_private.normalize_display_name(canonical_name);
end;
$$;

create or replace function public.create_room(
  display_name text,
  seed text default 'atlas-prime',
  territory_count integer default 42,
  continent_count integer default 5,
  assignment_mode text default 'random',
  max_seats integer default 5
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  canonical_name text :=
    multiplayer_private.require_profile_display_name(caller_id);
  normalized_seed text := btrim(coalesce(seed, ''));
  candidate_code text;
  created_room public.rooms;
  attempt integer;
begin
  -- display_name is retained only for compatibility with deployed clients.
  perform display_name;

  if char_length(normalized_seed) not between 1 and 64 then
    raise exception using errcode = 'P0001', message = 'invalid_settings';
  end if;
  if territory_count not between 12 and 48
    or continent_count not between 2 and 5
    or continent_count > territory_count
    or assignment_mode not in ('random', 'player-draft')
    or max_seats not between 2 and 5 then
    raise exception using errcode = 'P0001', message = 'invalid_settings';
  end if;

  for attempt in 1..8 loop
    candidate_code := multiplayer_private.random_join_code();
    begin
      insert into public.rooms (
        join_code, host_user_id, seed, territory_count,
        continent_count, assignment_mode, max_seats
      ) values (
        candidate_code, caller_id, normalized_seed, territory_count,
        continent_count, assignment_mode, max_seats
      ) returning * into created_room;
      exit;
    exception when unique_violation then
      if attempt = 8 then
        raise exception using
          errcode = 'P0001',
          message = 'room_code_unavailable';
      end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (created_room.id, caller_id, canonical_name, 'host');

  insert into public.room_seats (room_id, seat_index)
  select created_room.id, generated.seat_index
  from generate_series(0, max_seats - 1) as generated(seat_index);

  return created_room;
end;
$$;

create or replace function public.join_room(join_code text, display_name text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  canonical_name text :=
    multiplayer_private.require_profile_display_name(caller_id);
  normalized_code text := multiplayer_private.normalize_join_code(join_code);
  target_room public.rooms;
  member_count integer;
begin
  -- display_name is retained only for compatibility with deployed clients.
  perform display_name;

  if normalized_code !~ '^[0-9A-F]{8}$' then
    raise exception using errcode = 'P0001', message = 'invalid_code';
  end if;

  select * into target_room
  from public.rooms
  where rooms.join_code = normalized_code
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_code';
  end if;
  if exists (
    select 1 from public.room_members
    where room_members.room_id = target_room.id
      and room_members.user_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'already_joined';
  end if;
  if target_room.status = 'closed' then
    raise exception using errcode = 'P0001', message = 'closed_room';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_active';
  end if;

  select count(*) into member_count
  from public.room_members
  where room_members.room_id = target_room.id;
  if member_count >= target_room.max_seats then
    raise exception using errcode = 'P0001', message = 'full_room';
  end if;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (target_room.id, caller_id, canonical_name, 'member');

  update public.rooms
  set revision = revision + 1
  where id = target_room.id
  returning * into target_room;
  return target_room;
end;
$$;

create or replace function public.authority_initialize_room_match(
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
  canonical_count integer;
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
    raise exception using
      errcode = 'P0001',
      message = 'multiplayer_draft_unsupported';
  end if;

  select count(*), count(profiles.user_id)
  into occupied_count, canonical_count
  from public.room_seats
  left join public.profiles
    on profiles.user_id = room_seats.occupant_user_id
  where room_seats.room_id = p_room_id
    and room_seats.occupant_user_id is not null
    and room_seats.controller_type = 'human';
  if occupied_count < 2 then
    raise exception using errcode = 'P0001', message = 'not_enough_players';
  end if;
  if canonical_count <> occupied_count then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;
  if occupied_count > 5
    or jsonb_typeof(p_setup_snapshot) <> 'object'
    or jsonb_typeof(p_seat_order_snapshot) <> 'array'
    or jsonb_array_length(p_seat_order_snapshot) <> occupied_count
    or jsonb_typeof(p_generator_metadata) <> 'object'
    or jsonb_typeof(p_planet_snapshot) <> 'object'
    or jsonb_typeof(p_state_snapshot) <> 'object'
    or p_state_fingerprint !~ '^[0-9a-f]{64}$'
    or exists (
      select 1
      from public.room_seats
      join public.profiles
        on profiles.user_id = room_seats.occupant_user_id
      where room_seats.room_id = p_room_id
        and room_seats.occupant_user_id is not null
        and room_seats.controller_type = 'human'
        and not exists (
          select 1
          from jsonb_array_elements(p_seat_order_snapshot) as snapshot(seat)
          where snapshot.seat -> 'seatIndex' =
              to_jsonb(room_seats.seat_index)
            and snapshot.seat ->> 'userId' =
              room_seats.occupant_user_id::text
            and snapshot.seat ->> 'displayName' =
              profiles.display_name
            and snapshot.seat ->> 'controllerType' = 'human'
        )
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_authoritative_state';
  end if;

  select * into target_match
  from public.matches
  where matches.room_id = p_room_id
  for update;
  if found and target_match.state_snapshot is not null then
    return target_match;
  end if;
  if found then
    raise exception using
      errcode = 'P0001',
      message = 'legacy_match_incomplete';
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

revoke all on function
  multiplayer_private.require_profile_display_name(uuid)
  from public, anon, authenticated;
revoke all on function
  public.create_room(text, text, integer, integer, text, integer)
  from public, anon;
revoke all on function public.join_room(text, text)
  from public, anon;
revoke all on function public.authority_initialize_room_match(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;

grant execute on function
  public.create_room(text, text, integer, integer, text, integer)
  to authenticated;
grant execute on function public.join_room(text, text)
  to authenticated;
grant execute on function public.authority_initialize_room_match(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, text
) to service_role;
