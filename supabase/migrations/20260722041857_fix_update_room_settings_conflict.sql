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
  on conflict on constraint room_seats_pkey do nothing;

  return target_room;
end;
$$;
