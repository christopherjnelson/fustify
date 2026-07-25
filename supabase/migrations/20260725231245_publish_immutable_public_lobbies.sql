alter table public.rooms
  alter column visibility set default 'private',
  alter column join_code drop not null;

create or replace function public.create_room(
  display_name text,
  seed text default 'atlas-prime',
  territory_count integer default 42,
  continent_count integer default 5,
  assignment_mode text default 'random',
  max_seats integer default 5,
  game_name text default 'New Game',
  room_visibility text default 'private'
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
  normalized_game_name text :=
    multiplayer_private.normalize_room_name(game_name);
  candidate_code text;
  created_room public.rooms;
  attempt integer;
begin
  -- These arguments remain only for compatibility with deployed clients.
  -- Visibility is authoritative here and is never accepted from the browser.
  perform display_name;
  perform room_visibility;

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
        join_code,
        host_user_id,
        seed,
        territory_count,
        continent_count,
        assignment_mode,
        max_seats,
        name,
        visibility
      ) values (
        candidate_code,
        caller_id,
        normalized_seed,
        territory_count,
        continent_count,
        assignment_mode,
        max_seats,
        normalized_game_name,
        'private'
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

drop function public.update_room_settings(
  uuid, text, integer, integer, text, integer
);

create function public.update_room_settings(
  room_id uuid,
  seed text,
  territory_count integer,
  continent_count integer,
  assignment_mode text,
  max_seats integer,
  game_name text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  normalized_seed text := btrim(coalesce(seed, ''));
  target_room public.rooms;
  normalized_game_name text;
  highest_occupied integer;
  member_count integer;
begin
  select * into target_room
  from public.rooms
  where rooms.id = update_room_settings.room_id
  for update;

  if not found or not multiplayer_private.is_room_member(room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.host_user_id <> caller_id then
    raise exception using errcode = 'P0001', message = 'host_only';
  end if;
  if target_room.visibility <> 'private' then
    raise exception using
      errcode = 'P0001',
      message = 'published_room_settings_locked';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  normalized_game_name := multiplayer_private.normalize_room_name(
    coalesce(game_name, target_room.name)
  );
  if char_length(normalized_seed) not between 1 and 64
    or territory_count not between 12 and 48
    or continent_count not between 2 and 5
    or continent_count > territory_count
    or assignment_mode not in ('random', 'player-draft')
    or max_seats not between 2 and 5 then
    raise exception using errcode = 'P0001', message = 'invalid_settings';
  end if;

  select max(room_seats.seat_index) into highest_occupied
  from public.room_seats
  where room_seats.room_id = update_room_settings.room_id
    and occupant_user_id is not null;

  select count(*) into member_count
  from public.room_members
  where room_members.room_id = update_room_settings.room_id;

  if coalesce(highest_occupied, -1) >= max_seats
    or member_count > max_seats then
    raise exception using errcode = 'P0001', message = 'settings_conflict';
  end if;

  if max_seats < target_room.max_seats then
    delete from public.room_seats
    where room_seats.room_id = update_room_settings.room_id
      and room_seats.seat_index >= max_seats;
  end if;

  update public.rooms
  set
    name = normalized_game_name,
    seed = normalized_seed,
    territory_count = update_room_settings.territory_count,
    continent_count = update_room_settings.continent_count,
    assignment_mode = update_room_settings.assignment_mode,
    max_seats = update_room_settings.max_seats,
    revision = revision + 1
  where id = update_room_settings.room_id
  returning * into target_room;

  insert into public.room_seats (room_id, seat_index)
  select update_room_settings.room_id, generated.seat_index
  from generate_series(0, max_seats - 1) as generated(seat_index)
  on conflict on constraint room_seats_pkey do nothing;

  return target_room;
end;
$$;

create function multiplayer_private.protect_locked_room_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.visibility = 'private'
    and new.visibility = 'public'
    and (
      new.join_code is not null
      or new.thumbnail_path is not null
      or new.name is distinct from old.name
      or new.host_user_id is distinct from old.host_user_id
      or new.seed is distinct from old.seed
      or new.territory_count is distinct from old.territory_count
      or new.continent_count is distinct from old.continent_count
      or new.assignment_mode is distinct from old.assignment_mode
      or new.max_seats is distinct from old.max_seats
      or new.generator_version is distinct from old.generator_version
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_public_room_configuration';
  end if;

  if (old.visibility = 'public' or old.status <> 'waiting')
    and (
      new.name is distinct from old.name
      or new.visibility is distinct from old.visibility
      or new.join_code is distinct from old.join_code
      or new.host_user_id is distinct from old.host_user_id
      or new.seed is distinct from old.seed
      or new.territory_count is distinct from old.territory_count
      or new.continent_count is distinct from old.continent_count
      or new.assignment_mode is distinct from old.assignment_mode
      or new.max_seats is distinct from old.max_seats
      or new.generator_version is distinct from old.generator_version
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'published_room_settings_locked';
  end if;
  return new;
end;
$$;

create trigger rooms_protect_locked_settings
before update on public.rooms
for each row
execute function multiplayer_private.protect_locked_room_settings();

create function public.publish_room(p_room_id uuid)
returns table (
  room_id uuid,
  room_visibility text,
  room_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  target_room public.rooms;
  member_count integer;
  member_profile_count integer;
  seat_count integer;
  human_seat_count integer;
  first_seat integer;
  last_seat integer;
begin
  perform multiplayer_private.require_profile_display_name(caller_id);

  select * into target_room
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found or not multiplayer_private.is_room_member(p_room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.host_user_id <> caller_id then
    raise exception using errcode = 'P0001', message = 'host_only';
  end if;
  if target_room.visibility <> 'private' then
    raise exception using errcode = 'P0001', message = 'room_already_published';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;
  if target_room.join_code is null
    or target_room.join_code !~ '^[0-9A-F]{8}$'
    or target_room.name <> btrim(target_room.name)
    or char_length(target_room.name) not between 1 and 60
    or target_room.name ~ '[[:cntrl:]]'
    or target_room.seed <> btrim(target_room.seed)
    or char_length(target_room.seed) not between 1 and 64
    or target_room.territory_count not between 12 and 48
    or target_room.continent_count not between 2 and 5
    or target_room.continent_count > target_room.territory_count
    or target_room.max_seats not between 2 and 5
    or target_room.generator_version not in (3, 4) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_public_room_configuration';
  end if;
  if target_room.assignment_mode <> 'random' then
    raise exception using
      errcode = 'P0001',
      message = 'multiplayer_draft_unsupported';
  end if;
  if not exists (
    select 1
    from public.room_members
    where room_members.room_id = target_room.id
      and room_members.user_id = caller_id
      and room_members.role = 'host'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_public_room_configuration';
  end if;

  select count(*), count(profiles.user_id)
  into member_count, member_profile_count
  from public.room_members
  left join public.profiles
    on profiles.user_id = room_members.user_id
  where room_members.room_id = target_room.id;

  if member_count >= target_room.max_seats then
    raise exception using errcode = 'P0001', message = 'full_room';
  end if;
  if member_count < 1 or member_profile_count <> member_count then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_public_room_configuration';
  end if;

  select
    count(*),
    count(*) filter (where controller_type = 'human'),
    min(seat_index),
    max(seat_index)
  into seat_count, human_seat_count, first_seat, last_seat
  from public.room_seats
  where room_seats.room_id = target_room.id;

  if seat_count <> target_room.max_seats
    or human_seat_count <> target_room.max_seats
    or first_seat <> 0
    or last_seat <> target_room.max_seats - 1 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_public_room_configuration';
  end if;

  update public.rooms
  set
    visibility = 'public',
    join_code = null,
    thumbnail_path = null,
    thumbnail_version = thumbnail_version + 1,
    revision = revision + 1
  where rooms.id = target_room.id
    and rooms.visibility = 'private'
    and rooms.status = 'waiting'
  returning
    rooms.id,
    rooms.visibility,
    rooms.revision
  into room_id, room_visibility, room_revision;

  if not found then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;
  return next;
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

  if not found or target_room.visibility <> 'private' then
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

drop function public.join_public_room(uuid);

create function public.join_public_room(p_room_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  canonical_name text :=
    multiplayer_private.require_profile_display_name(caller_id);
  target_room public.rooms;
  member_count integer;
begin
  select * into target_room
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found
    or target_room.visibility <> 'public'
    or target_room.status <> 'waiting' then
    raise exception using
      errcode = 'P0001',
      message = 'public_room_unavailable';
  end if;

  if exists (
    select 1
    from public.room_members
    where room_members.room_id = target_room.id
      and room_members.user_id = caller_id
  ) then
    return query select target_room.id;
    return;
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
  where rooms.id = target_room.id;

  return query select target_room.id;
end;
$$;

drop function public.list_public_rooms();

create function public.list_public_rooms()
returns table (
  room_id uuid,
  room_name text,
  host_display_name text,
  host_avatar_url text,
  current_players integer,
  maximum_players integer,
  room_state text,
  room_seed text,
  territory_count integer,
  continent_count integer,
  assignment_mode text,
  thumbnail_path text,
  thumbnail_version bigint,
  players jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform multiplayer_private.require_user_id();

  return query
  select
    rooms.id,
    rooms.name,
    host_profile.display_name,
    host_profile.avatar_url,
    count(room_members.user_id)::integer,
    rooms.max_seats,
    case
      when count(room_members.user_id) >= rooms.max_seats then 'full'
      else 'waiting'
    end,
    rooms.seed,
    rooms.territory_count,
    rooms.continent_count,
    rooms.assignment_mode,
    rooms.thumbnail_path,
    rooms.thumbnail_version,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'displayName', member_profiles.display_name,
          'avatarUrl', member_profiles.avatar_url
        )
        order by room_members.joined_at, room_members.user_id
      ) filter (
        where room_members.user_id is not null
          and member_profiles.user_id is not null
      ),
      '[]'::jsonb
    ),
    rooms.created_at
  from public.rooms
  join public.profiles as host_profile
    on host_profile.user_id = rooms.host_user_id
  left join public.room_members
    on room_members.room_id = rooms.id
  left join public.profiles as member_profiles
    on member_profiles.user_id = room_members.user_id
  where rooms.visibility = 'public'
    and rooms.status = 'waiting'
  group by rooms.id, host_profile.display_name, host_profile.avatar_url
  order by rooms.created_at desc, rooms.id desc;
end;
$$;

drop trigger rooms_queue_discord_announcement_on_insert
  on public.rooms;
drop trigger rooms_queue_discord_announcement_on_eligibility_update
  on public.rooms;
drop trigger room_members_queue_discord_announcement_on_insert
  on public.room_members;
drop trigger room_members_queue_discord_announcement_on_delete
  on public.room_members;

create constraint trigger rooms_queue_discord_announcement_on_publication
after update on public.rooms
deferrable initially deferred
for each row
when (
  old.visibility = 'private'
  and new.visibility = 'public'
)
execute function multiplayer_private.queue_discord_room_announcement();

update public.discord_room_announcement_config
set
  include_seed = true,
  include_open_seats = false
where id = true;

alter table public.discord_room_announcement_config
  alter column include_seed set default true;

comment on column public.discord_room_announcement_config.include_seed is
  'Legacy compatibility flag. Immutable public-lobby announcements always include the final locked seed.';

comment on function public.publish_room(uuid) is
  'Atomically publishes one host-owned private waiting room, clears its private join code, locks its advertised settings, and crosses the shared public-list/Discord announcement boundary.';

revoke all on function public.create_room(
  text, text, integer, integer, text, integer, text, text
) from public, anon, authenticated;
revoke all on function public.update_room_settings(
  uuid, text, integer, integer, text, integer, text
) from public, anon, authenticated;
revoke all on function multiplayer_private.protect_locked_room_settings()
  from public, anon, authenticated, service_role;
revoke all on function public.publish_room(uuid)
  from public, anon, authenticated;
revoke all on function public.join_room(text, text)
  from public, anon, authenticated;
revoke all on function public.join_public_room(uuid)
  from public, anon, authenticated;
revoke all on function public.list_public_rooms()
  from public, anon, authenticated;

grant execute on function public.create_room(
  text, text, integer, integer, text, integer, text, text
) to authenticated;
grant execute on function public.update_room_settings(
  uuid, text, integer, integer, text, integer, text
) to authenticated;
grant execute on function public.publish_room(uuid)
  to authenticated;
grant execute on function public.join_room(text, text)
  to authenticated;
grant execute on function public.join_public_room(uuid)
  to authenticated;
grant execute on function public.list_public_rooms()
  to authenticated;
