create schema if not exists multiplayer_private;

revoke all on schema multiplayer_private from public, anon, authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  host_user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'waiting',
  seed text not null default 'atlas-prime',
  territory_count integer not null default 42,
  continent_count integer not null default 5,
  assignment_mode text not null default 'random',
  max_seats integer not null default 5,
  revision bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint rooms_join_code_format check (join_code ~ '^[0-9A-F]{8}$'),
  constraint rooms_join_code_unique unique (join_code),
  constraint rooms_status_valid check (status in ('waiting', 'active', 'closed')),
  constraint rooms_seed_valid check (
    seed = btrim(seed)
    and char_length(seed) between 1 and 64
  ),
  constraint rooms_territory_count_valid check (territory_count between 12 and 48),
  constraint rooms_continent_count_valid check (
    continent_count between 2 and 5
    and continent_count <= territory_count
  ),
  constraint rooms_assignment_mode_valid check (assignment_mode in ('random', 'player-draft')),
  constraint rooms_max_seats_valid check (max_seats between 2 and 5),
  constraint rooms_revision_valid check (revision >= 0)
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'member',
  joined_at timestamptz not null default statement_timestamp(),
  last_active_at timestamptz not null default statement_timestamp(),
  primary key (room_id, user_id),
  constraint room_members_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 32
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint room_members_role_valid check (role in ('host', 'member'))
);

create unique index room_members_one_host_per_room
  on public.room_members (room_id)
  where role = 'host';

create table public.room_seats (
  room_id uuid not null references public.rooms (id) on delete cascade,
  seat_index integer not null,
  occupant_user_id uuid,
  controller_type text not null default 'human',
  ready boolean not null default false,
  claimed_at timestamptz,
  primary key (room_id, seat_index),
  constraint room_seats_member_fk
    foreign key (room_id, occupant_user_id)
    references public.room_members (room_id, user_id)
    on delete set null (occupant_user_id),
  constraint room_seats_index_nonnegative check (seat_index >= 0),
  constraint room_seats_controller_valid check (controller_type in ('human', 'bot')),
  constraint room_seats_occupancy_consistent check (
    (occupant_user_id is null and claimed_at is null and ready is false)
    or (occupant_user_id is not null and claimed_at is not null)
  ),
  constraint room_seats_humans_only_for_foundation check (
    controller_type = 'human'
  )
);

create unique index room_seats_one_human_seat_per_user
  on public.room_seats (room_id, occupant_user_id)
  where occupant_user_id is not null and controller_type = 'human';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms (id) on delete restrict,
  status text not null default 'preview',
  revision bigint not null default 0,
  setup_snapshot jsonb not null,
  seat_order_snapshot jsonb not null,
  generator_metadata jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint matches_status_valid check (status in ('preview', 'closed')),
  constraint matches_revision_valid check (revision >= 0),
  constraint matches_setup_snapshot_object check (jsonb_typeof(setup_snapshot) = 'object'),
  constraint matches_seat_order_snapshot_array check (jsonb_typeof(seat_order_snapshot) = 'array'),
  constraint matches_generator_metadata_object check (jsonb_typeof(generator_metadata) = 'object')
);

create index room_members_user_id_idx on public.room_members (user_id);
create index room_seats_occupant_user_id_idx on public.room_seats (occupant_user_id);

create function multiplayer_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function multiplayer_private.set_updated_at();

create trigger matches_set_updated_at
before update on public.matches
for each row execute function multiplayer_private.set_updated_at();

create function multiplayer_private.validate_room_seat_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  capacity integer;
begin
  select rooms.max_seats into capacity
  from public.rooms
  where rooms.id = new.room_id;

  if capacity is null or new.seat_index >= capacity then
    raise exception using errcode = '23514', message = 'invalid_seat';
  end if;
  return new;
end;
$$;

create trigger room_seats_validate_capacity
before insert or update of room_id, seat_index on public.room_seats
for each row execute function multiplayer_private.validate_room_seat_capacity();

create function multiplayer_private.protect_match_snapshots()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.room_id is distinct from old.room_id
    or new.setup_snapshot is distinct from old.setup_snapshot
    or new.seat_order_snapshot is distinct from old.seat_order_snapshot
    or new.generator_metadata is distinct from old.generator_metadata then
    raise exception using errcode = 'P0001', message = 'match_snapshot_immutable';
  end if;
  return new;
end;
$$;

create trigger matches_protect_snapshots
before update on public.matches
for each row execute function multiplayer_private.protect_match_snapshots();

create function multiplayer_private.require_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  return caller_id;
end;
$$;

create function multiplayer_private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.room_members
      where room_members.room_id = target_room_id
        and room_members.user_id = auth.uid()
    );
$$;

create function multiplayer_private.validate_display_name(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := btrim(coalesce(candidate, ''));
begin
  if char_length(normalized) not between 1 and 32 or normalized ~ '[[:cntrl:]]' then
    raise exception using errcode = 'P0001', message = 'invalid_display_name';
  end if;
  return normalized;
end;
$$;

create function multiplayer_private.normalize_join_code(candidate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(btrim(coalesce(candidate, '')), '[[:space:]-]', '', 'g'));
$$;

create function multiplayer_private.random_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(encode(extensions.gen_random_bytes(4), 'hex'));
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_seats enable row level security;
alter table public.matches enable row level security;

create policy rooms_member_select
on public.rooms for select
to authenticated
using ((select multiplayer_private.is_room_member(id)));

create policy room_members_member_select
on public.room_members for select
to authenticated
using ((select multiplayer_private.is_room_member(room_id)));

create policy room_seats_member_select
on public.room_seats for select
to authenticated
using ((select multiplayer_private.is_room_member(room_id)));

create policy matches_member_select
on public.matches for select
to authenticated
using ((select multiplayer_private.is_room_member(room_id)));

revoke all on public.rooms, public.room_members, public.room_seats, public.matches from public, anon, authenticated;
grant select on public.rooms, public.room_members, public.room_seats, public.matches to authenticated;
grant usage on schema multiplayer_private to authenticated;
grant execute on function multiplayer_private.is_room_member(uuid) to authenticated;

create function public.create_room(
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
  normalized_name text := multiplayer_private.validate_display_name(display_name);
  normalized_seed text := btrim(coalesce(seed, ''));
  candidate_code text;
  created_room public.rooms;
  attempt integer;
begin
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
        raise exception using errcode = 'P0001', message = 'room_code_unavailable';
      end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (created_room.id, caller_id, normalized_name, 'host');

  insert into public.room_seats (room_id, seat_index)
  select created_room.id, generated.seat_index
  from generate_series(0, max_seats - 1) as generated(seat_index);

  return created_room;
end;
$$;

create function public.join_room(join_code text, display_name text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  normalized_name text := multiplayer_private.validate_display_name(display_name);
  normalized_code text := multiplayer_private.normalize_join_code(join_code);
  target_room public.rooms;
  member_count integer;
begin
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
  values (target_room.id, caller_id, normalized_name, 'member');

  update public.rooms
  set revision = revision + 1
  where id = target_room.id
  returning * into target_room;
  return target_room;
end;
$$;

create function public.leave_room(room_id uuid)
returns void
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
  where rooms.id = leave_room.room_id
  for update;
  if not found or not multiplayer_private.is_room_member(room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;

  update public.room_seats
  set occupant_user_id = null, ready = false, claimed_at = null
  where room_seats.room_id = leave_room.room_id
    and occupant_user_id = caller_id;

  if target_room.host_user_id = caller_id then
    update public.rooms
    set status = 'closed', revision = revision + 1
    where id = leave_room.room_id and status <> 'closed';
  else
    update public.rooms
    set revision = revision + 1
    where id = leave_room.room_id;
  end if;

  delete from public.room_members
  where room_members.room_id = leave_room.room_id
    and room_members.user_id = caller_id;
end;
$$;

create function public.claim_room_seat(room_id uuid, seat_index integer)
returns public.room_seats
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  target_room public.rooms;
  target_seat public.room_seats;
begin
  select * into target_room
  from public.rooms
  where rooms.id = claim_room_seat.room_id
  for update;
  if not found or not multiplayer_private.is_room_member(room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  select * into target_seat
  from public.room_seats
  where room_seats.room_id = claim_room_seat.room_id
    and room_seats.seat_index = claim_room_seat.seat_index
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_seat';
  end if;
  if target_seat.occupant_user_id = caller_id then
    return target_seat;
  end if;
  if target_seat.occupant_user_id is not null then
    raise exception using errcode = 'P0001', message = 'seat_conflict';
  end if;
  if exists (
    select 1 from public.room_seats
    where room_seats.room_id = claim_room_seat.room_id
      and room_seats.occupant_user_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'already_seated';
  end if;

  update public.room_seats
  set occupant_user_id = caller_id,
      controller_type = 'human',
      ready = true,
      claimed_at = statement_timestamp()
  where room_seats.room_id = claim_room_seat.room_id
    and room_seats.seat_index = claim_room_seat.seat_index
  returning * into target_seat;

  update public.rooms set revision = revision + 1 where id = room_id;
  return target_seat;
end;
$$;

create function public.release_room_seat(room_id uuid)
returns void
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
  where rooms.id = release_room_seat.room_id
  for update;
  if not found or not multiplayer_private.is_room_member(room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  update public.room_seats
  set occupant_user_id = null, ready = false, claimed_at = null
  where room_seats.room_id = release_room_seat.room_id
    and room_seats.occupant_user_id = caller_id;

  if found then
    update public.rooms set revision = revision + 1 where id = room_id;
  end if;
end;
$$;

create function public.update_room_settings(
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

  update public.rooms
  set seed = normalized_seed,
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
  on conflict (room_id, seat_index) do nothing;

  return target_room;
end;
$$;

create function public.start_room_match(room_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  target_room public.rooms;
  existing_match public.matches;
  created_match public.matches;
  occupied_count integer;
  seat_order jsonb;
begin
  select * into target_room
  from public.rooms
  where rooms.id = start_room_match.room_id
  for update;
  if not found or not multiplayer_private.is_room_member(room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.host_user_id <> caller_id then
    raise exception using errcode = 'P0001', message = 'host_only';
  end if;

  select * into existing_match
  from public.matches
  where matches.room_id = start_room_match.room_id;
  if found then
    return existing_match;
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  select count(*), jsonb_agg(
    jsonb_build_object(
      'seatIndex', room_seats.seat_index,
      'userId', room_seats.occupant_user_id,
      'displayName', room_members.display_name,
      'controllerType', room_seats.controller_type
    ) order by room_seats.seat_index
  ) into occupied_count, seat_order
  from public.room_seats
  join public.room_members
    on room_members.room_id = room_seats.room_id
   and room_members.user_id = room_seats.occupant_user_id
  where room_seats.room_id = start_room_match.room_id
    and room_seats.occupant_user_id is not null
    and room_seats.controller_type = 'human';

  if occupied_count < 2 then
    raise exception using errcode = 'P0001', message = 'not_enough_players';
  end if;

  insert into public.matches (
    room_id,
    setup_snapshot,
    seat_order_snapshot,
    generator_metadata
  ) values (
    target_room.id,
    jsonb_build_object(
      'version', 1,
      'seed', target_room.seed,
      'territoryCount', target_room.territory_count,
      'continentCount', target_room.continent_count,
      'playerCount', occupied_count,
      'assignmentMode', target_room.assignment_mode
    ),
    seat_order,
    jsonb_build_object(
      'generatorVersion', 3,
      'worldSetupVersion', 1,
      'correctionProfile', 'corrected-v1'
    )
  ) returning * into created_match;

  update public.rooms
  set status = 'active', revision = revision + 1
  where id = target_room.id;
  return created_match;
end;
$$;

create function public.close_room(room_id uuid)
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
  where rooms.id = close_room.room_id
  for update;
  if not found or not multiplayer_private.is_room_member(room_id) then
    raise exception using errcode = 'P0001', message = 'room_access_denied';
  end if;
  if target_room.host_user_id <> caller_id then
    raise exception using errcode = 'P0001', message = 'host_only';
  end if;

  if target_room.status <> 'closed' then
    update public.rooms
    set status = 'closed', revision = revision + 1
    where id = close_room.room_id
    returning * into target_room;
  end if;
  return target_room;
end;
$$;

revoke all on function public.create_room(text, text, integer, integer, text, integer) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.leave_room(uuid) from public, anon;
revoke all on function public.claim_room_seat(uuid, integer) from public, anon;
revoke all on function public.release_room_seat(uuid) from public, anon;
revoke all on function public.update_room_settings(uuid, text, integer, integer, text, integer) from public, anon;
revoke all on function public.start_room_match(uuid) from public, anon;
revoke all on function public.close_room(uuid) from public, anon;

grant execute on function public.create_room(text, text, integer, integer, text, integer) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.claim_room_seat(uuid, integer) to authenticated;
grant execute on function public.release_room_seat(uuid) to authenticated;
grant execute on function public.update_room_settings(uuid, text, integer, integer, text, integer) to authenticated;
grant execute on function public.start_room_match(uuid) to authenticated;
grant execute on function public.close_room(uuid) to authenticated;

revoke all on all functions in schema multiplayer_private from public, anon, authenticated;
grant execute on function multiplayer_private.is_room_member(uuid) to authenticated;

alter publication supabase_realtime add table
  public.rooms,
  public.room_members,
  public.room_seats,
  public.matches;
