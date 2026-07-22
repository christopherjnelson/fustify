create function multiplayer_private.release_seat_on_member_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.room_seats
  set occupant_user_id = null,
      ready = false,
      claimed_at = null
  where room_seats.room_id = old.room_id
    and room_seats.occupant_user_id = old.user_id;
  return old;
end;
$$;

create trigger room_members_release_seat_before_delete
before delete on public.room_members
for each row execute function multiplayer_private.release_seat_on_member_delete();

revoke all on function multiplayer_private.release_seat_on_member_delete()
from public, anon, authenticated;
