alter table public.rooms
  add column name text not null default 'New Game',
  add column visibility text not null default 'public',
  add column thumbnail_path text,
  add column thumbnail_version bigint not null default 0,
  add constraint rooms_name_valid check (
    name = btrim(name)
    and char_length(name) between 1 and 60
    and name !~ '[[:cntrl:]]'
  ),
  add constraint rooms_visibility_valid check (
    visibility in ('public', 'private')
  ),
  add constraint rooms_thumbnail_path_valid check (
    thumbnail_path is null
    or thumbnail_path = id::text || '/world.webp'
  ),
  add constraint rooms_thumbnail_version_valid check (
    thumbnail_version >= 0
  );

create index rooms_public_waiting_created_idx
  on public.rooms (created_at desc, id desc)
  where visibility = 'public' and status = 'waiting';

create function multiplayer_private.normalize_room_name(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := btrim(coalesce(candidate, ''));
begin
  if char_length(normalized) not between 1 and 60
    or normalized ~ '[[:cntrl:]]' then
    raise exception using errcode = 'P0001', message = 'invalid_room_name';
  end if;
  return normalized;
end;
$$;

drop function public.create_room(text, text, integer, integer, text, integer);

create function public.create_room(
  display_name text,
  seed text default 'atlas-prime',
  territory_count integer default 42,
  continent_count integer default 5,
  assignment_mode text default 'random',
  max_seats integer default 5,
  game_name text default 'New Game',
  room_visibility text default 'public'
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
  if room_visibility not in ('public', 'private') then
    raise exception using errcode = 'P0001', message = 'invalid_visibility';
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
        room_visibility
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

create or replace function public.update_room_settings(
  room_id uuid,
  seed text,
  territory_count integer,
  continent_count integer,
  assignment_mode text,
  max_seats integer
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
  highest_occupied integer;
  member_count integer;
  world_changed boolean;
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
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;
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
  if coalesce(highest_occupied, -1) >= max_seats or member_count > max_seats then
    raise exception using errcode = 'P0001', message = 'settings_conflict';
  end if;

  if max_seats < target_room.max_seats then
    delete from public.room_seats
    where room_seats.room_id = update_room_settings.room_id
      and room_seats.seat_index >= max_seats;
  end if;

  world_changed :=
    target_room.seed is distinct from normalized_seed
    or target_room.territory_count is distinct from territory_count
    or target_room.continent_count is distinct from continent_count
    or target_room.max_seats is distinct from max_seats;

  update public.rooms
  set seed = normalized_seed,
      territory_count = update_room_settings.territory_count,
      continent_count = update_room_settings.continent_count,
      assignment_mode = update_room_settings.assignment_mode,
      max_seats = update_room_settings.max_seats,
      thumbnail_path = case
        when world_changed and visibility = 'public' then null
        else thumbnail_path
      end,
      thumbnail_version = case
        when world_changed and visibility = 'public'
          then thumbnail_version + 1
        else thumbnail_version
      end,
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

create function public.list_public_rooms()
returns table (
  room_id uuid,
  room_name text,
  host_display_name text,
  host_avatar_url text,
  current_players integer,
  maximum_players integer,
  room_state text,
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
    rooms.thumbnail_path,
    rooms.thumbnail_version,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'displayName', member_profiles.display_name,
          'avatarUrl', member_profiles.avatar_url
        )
        order by room_members.joined_at, room_members.user_id
      ) filter (where room_members.user_id is not null),
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

create function public.join_public_room(p_room_id uuid)
returns public.rooms
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
    return target_room;
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
  where rooms.id = target_room.id
  returning * into target_room;

  return target_room;
end;
$$;

create function public.publish_room_thumbnail(
  p_room_id uuid,
  p_thumbnail_path text
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  target_room public.rooms;
begin
  select * into target_room
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.host_user_id <> caller_id then
    raise exception using errcode = 'P0001', message = 'host_only';
  end if;
  if target_room.visibility <> 'public' then
    raise exception using errcode = 'P0001', message = 'private_room_thumbnail';
  end if;
  if p_thumbnail_path <> (target_room.id::text || '/world.webp') then
    raise exception using errcode = 'P0001', message = 'invalid_thumbnail_path';
  end if;

  update public.rooms
  set
    thumbnail_path = p_thumbnail_path,
    thumbnail_version = thumbnail_version + 1
  where rooms.id = target_room.id
  returning * into target_room;

  return target_room;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'room-thumbnails',
  'room-thumbnails',
  true,
  1048576,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy room_thumbnail_host_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

create policy room_thumbnail_host_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

create policy room_thumbnail_host_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
)
with check (
  bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

create policy room_thumbnail_host_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

revoke all on function multiplayer_private.normalize_room_name(text)
  from public, anon, authenticated;
revoke all on function public.create_room(
  text, text, integer, integer, text, integer, text, text
) from public, anon, authenticated;
revoke all on function public.list_public_rooms()
  from public, anon, authenticated;
revoke all on function public.join_public_room(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_room_thumbnail(uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_room(
  text, text, integer, integer, text, integer, text, text
) to authenticated;
grant execute on function public.list_public_rooms()
  to authenticated;
grant execute on function public.join_public_room(uuid)
  to authenticated;
grant execute on function public.publish_room_thumbnail(uuid, text)
  to authenticated;
