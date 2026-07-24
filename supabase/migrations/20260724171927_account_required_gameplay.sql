create or replace function multiplayer_private.require_user_id()
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
  if not profile_private.current_user_is_registered() then
    raise exception using errcode = 'P0001', message = 'account_required';
  end if;
  return caller_id;
end;
$$;

create or replace function multiplayer_private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select profile_private.current_user_is_registered()
    and exists (
      select 1
      from public.room_members
      where room_members.room_id = target_room_id
        and room_members.user_id = auth.uid()
    );
$$;

drop policy profiles_authenticated_select on public.profiles;
create policy profiles_registered_or_self_select
on public.profiles for select
to authenticated
using (
  profile_private.current_user_is_registered()
  or (select auth.uid()) = user_id
);

grant usage on schema profile_private to authenticated;
grant execute on function profile_private.current_user_is_registered()
  to authenticated;

revoke all on function multiplayer_private.require_user_id()
  from public, anon, authenticated;
revoke all on function multiplayer_private.is_room_member(uuid)
  from public, anon, authenticated;
grant execute on function multiplayer_private.is_room_member(uuid)
  to authenticated;
