create table multiplayer_private.match_launches (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  match_id uuid not null unique,
  started_at timestamptz not null default statement_timestamp()
);

alter table multiplayer_private.match_launches enable row level security;

revoke all on table multiplayer_private.match_launches
from public, anon, authenticated;
grant select, insert, update, delete
on table multiplayer_private.match_launches to service_role;
grant usage on schema multiplayer_private to service_role;

create function public.authority_begin_room_match_initialization(
  p_room_id uuid,
  p_match_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_room public.rooms;
  target_launch multiplayer_private.match_launches;
  occupied_count integer;
begin
  select * into target_room
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found or not exists (
    select 1
    from public.room_members
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
  if exists (
    select 1 from public.matches where matches.room_id = p_room_id
  ) then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  select count(*) into occupied_count
  from public.room_seats
  where room_seats.room_id = p_room_id
    and room_seats.occupant_user_id is not null
    and room_seats.controller_type = 'human';
  if occupied_count < 2 then
    raise exception using errcode = 'P0001', message = 'not_enough_players';
  end if;

  select * into target_launch
  from multiplayer_private.match_launches
  where match_launches.room_id = p_room_id
  for update;

  if target_room.status = 'active'
    and found
    and target_launch.started_at
      < statement_timestamp() - interval '5 minutes' then
    update multiplayer_private.match_launches
    set match_id = p_match_id,
        started_at = statement_timestamp()
    where room_id = p_room_id;
    update public.rooms
    set revision = revision + 1
    where id = p_room_id;
    return;
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_not_waiting';
  end if;

  insert into multiplayer_private.match_launches (
    room_id, match_id
  ) values (
    p_room_id, p_match_id
  );
  update public.rooms
  set status = 'active',
      revision = revision + 1
  where id = p_room_id;
end;
$$;

create function public.authority_cancel_room_match_initialization(
  p_room_id uuid,
  p_match_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from multiplayer_private.match_launches
  where room_id = p_room_id
    and match_id = p_match_id;
  get diagnostics deleted_count = row_count;

  if deleted_count = 1 and not exists (
    select 1 from public.matches where matches.room_id = p_room_id
  ) then
    update public.rooms
    set status = 'waiting',
        revision = revision + 1
    where id = p_room_id
      and host_user_id = p_actor_user_id
      and status = 'active';
  end if;
end;
$$;

create function multiplayer_private.clear_room_match_launch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from multiplayer_private.match_launches
  where room_id = new.room_id
    and match_id = new.id;
  return new;
end;
$$;

create trigger matches_clear_room_match_launch
after insert on public.matches
for each row execute function multiplayer_private.clear_room_match_launch();

revoke all on function public.authority_begin_room_match_initialization(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.authority_cancel_room_match_initialization(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function multiplayer_private.clear_room_match_launch()
from public, anon, authenticated;

grant execute on function public.authority_begin_room_match_initialization(
  uuid, uuid, uuid
) to service_role;
grant execute on function public.authority_cancel_room_match_initialization(
  uuid, uuid, uuid
) to service_role;
