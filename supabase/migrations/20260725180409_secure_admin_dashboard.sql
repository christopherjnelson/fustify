create schema if not exists admin_private;

revoke all on schema admin_private from public, anon, authenticated;

create type public.app_role as enum ('admin');

revoke all on type public.app_role from public, anon, authenticated;
grant usage on type public.app_role to service_role;

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;

revoke all on public.user_roles from public, anon, authenticated;
grant select, insert, update, delete on public.user_roles to service_role;

create function admin_private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_roles
      where user_roles.user_id = (select auth.uid())
        and user_roles.role = 'admin'::public.app_role
    );
$$;

create function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select admin_private.current_user_is_admin();
$$;

create function public.admin_dashboard_overview()
returns table (
  generated_at timestamptz,
  registered_accounts bigint,
  public_waiting_rooms bigint,
  private_waiting_rooms bigint,
  active_matches bigint,
  total_matches bigint,
  public_waiting_with_thumbnail bigint,
  public_waiting_missing_thumbnail bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not admin_private.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'admin_access_denied';
  end if;

  return query
  select
    statement_timestamp(),
    (select count(*) from auth.users where is_anonymous is false),
    (
      select count(*)
      from public.rooms
      where visibility = 'public' and status = 'waiting'
    ),
    (
      select count(*)
      from public.rooms
      where visibility = 'private' and status = 'waiting'
    ),
    (select count(*) from public.matches where status = 'active'),
    (select count(*) from public.matches),
    (
      select count(*)
      from public.rooms
      where visibility = 'public'
        and status = 'waiting'
        and thumbnail_path is not null
    ),
    (
      select count(*)
      from public.rooms
      where visibility = 'public'
        and status = 'waiting'
        and thumbnail_path is null
    );
end;
$$;

create index rooms_admin_recent_idx
  on public.rooms (updated_at desc, id desc);

create function public.admin_recent_rooms()
returns table (
  room_name text,
  visibility text,
  host_display_name text,
  current_members integer,
  claimed_seats integer,
  maximum_players integer,
  room_state text,
  thumbnail_available boolean,
  generator_version integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not admin_private.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'admin_access_denied';
  end if;

  return query
  select
    rooms.name,
    rooms.visibility,
    coalesce(host_profile.display_name, 'Unknown player'),
    (
      select count(*)::integer
      from public.room_members
      where room_members.room_id = rooms.id
    ),
    (
      select count(*)::integer
      from public.room_seats
      where room_seats.room_id = rooms.id
        and room_seats.occupant_user_id is not null
    ),
    rooms.max_seats,
    rooms.status,
    rooms.thumbnail_path is not null,
    rooms.generator_version,
    rooms.created_at,
    rooms.updated_at
  from public.rooms
  left join public.profiles as host_profile
    on host_profile.user_id = rooms.host_user_id
  order by rooms.updated_at desc, rooms.id desc
  limit 20;
end;
$$;

revoke all on all functions in schema admin_private
  from public, anon, authenticated;
revoke all on function public.current_user_is_admin()
  from public, anon, authenticated;
revoke all on function public.admin_dashboard_overview()
  from public, anon, authenticated;
revoke all on function public.admin_recent_rooms()
  from public, anon, authenticated;

grant execute on function public.current_user_is_admin()
  to authenticated;
grant execute on function public.admin_dashboard_overview()
  to authenticated;
grant execute on function public.admin_recent_rooms()
  to authenticated;
