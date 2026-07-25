create extension if not exists pg_cron with schema pg_catalog;

create index rooms_waiting_created_idx
  on public.rooms (created_at, id)
  where status = 'waiting';

create function public.heartbeat_room_membership(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := multiplayer_private.require_user_id();
  room_is_waiting boolean;
begin
  select rooms.status = 'waiting'
  into room_is_waiting
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not coalesce(room_is_waiting, false) then
    return false;
  end if;

  update public.room_members
  set last_active_at = statement_timestamp()
  where room_members.room_id = p_room_id
    and room_members.user_id = caller_id;

  return found;
end;
$$;

alter function public.heartbeat_room_membership(uuid) owner to postgres;
revoke all on function public.heartbeat_room_membership(uuid)
  from public, anon, authenticated;
grant execute on function public.heartbeat_room_membership(uuid)
  to authenticated;

create function multiplayer_private.expire_stale_multiplayer_rooms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inactivity_cutoff constant timestamptz :=
    statement_timestamp() - interval '10 minutes';
  target_room record;
  closed_room_id uuid;
  removed_member_count integer;
begin
  for target_room in
    select rooms.id
    from public.rooms
    where rooms.status = 'waiting'
      and (
        exists (
          select 1
          from public.room_members as host_member
          where host_member.room_id = rooms.id
            and host_member.user_id = rooms.host_user_id
            and host_member.role = 'host'
            and host_member.last_active_at < inactivity_cutoff
        )
        or (
          rooms.created_at < inactivity_cutoff
          and not exists (
            select 1
            from public.room_members as host_member
            where host_member.room_id = rooms.id
              and host_member.user_id = rooms.host_user_id
              and host_member.role = 'host'
          )
        )
        or (
          exists (
            select 1
            from public.room_members as host_member
            where host_member.room_id = rooms.id
              and host_member.user_id = rooms.host_user_id
              and host_member.role = 'host'
              and host_member.last_active_at >= inactivity_cutoff
          )
          and exists (
            select 1
            from public.room_members as guest_member
            where guest_member.room_id = rooms.id
              and guest_member.role = 'member'
              and guest_member.last_active_at < inactivity_cutoff
          )
        )
      )
    order by rooms.created_at, rooms.id
    for update skip locked
    limit 100
  loop
    closed_room_id := null;

    update public.rooms
    set status = 'closed',
        revision = revision + 1
    where rooms.id = target_room.id
      and rooms.status = 'waiting'
      and (
        exists (
          select 1
          from public.room_members as host_member
          where host_member.room_id = rooms.id
            and host_member.user_id = rooms.host_user_id
            and host_member.role = 'host'
            and host_member.last_active_at < inactivity_cutoff
        )
        or (
          rooms.created_at < inactivity_cutoff
          and not exists (
            select 1
            from public.room_members as host_member
            where host_member.room_id = rooms.id
              and host_member.user_id = rooms.host_user_id
              and host_member.role = 'host'
          )
        )
      )
    returning rooms.id into closed_room_id;

    if closed_room_id is not null then
      continue;
    end if;

    delete from public.room_members as guest_member
    using public.rooms
    where rooms.id = target_room.id
      and rooms.status = 'waiting'
      and guest_member.room_id = rooms.id
      and guest_member.role = 'member'
      and guest_member.last_active_at < inactivity_cutoff
      and exists (
        select 1
        from public.room_members as host_member
        where host_member.room_id = rooms.id
          and host_member.user_id = rooms.host_user_id
          and host_member.role = 'host'
          and host_member.last_active_at >= inactivity_cutoff
      );

    get diagnostics removed_member_count = row_count;
    if removed_member_count > 0 then
      update public.rooms
      set revision = revision + 1
      where rooms.id = target_room.id
        and rooms.status = 'waiting';
    end if;
  end loop;
end;
$$;

alter function multiplayer_private.expire_stale_multiplayer_rooms()
  owner to postgres;
revoke all on function multiplayer_private.expire_stale_multiplayer_rooms()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'expire-stale-multiplayer-rooms',
  '* * * * *',
  $cron$select multiplayer_private.expire_stale_multiplayer_rooms()$cron$
);
