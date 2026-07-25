begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(26);

select extensions.ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.user_roles'::regclass
  ),
  'user roles have RLS enabled'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.user_roles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.user_roles', 'DELETE'),
  'authenticated users have no direct role-table privileges'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.current_user_is_admin()',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the role check'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.admin_dashboard_overview()',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.admin_recent_rooms()',
      'EXECUTE'
    ),
  'anonymous callers cannot obtain admin dashboard data'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.current_user_is_admin()',
    'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.admin_dashboard_overview()',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.admin_recent_rooms()',
      'EXECUTE'
    ),
  'authenticated callers can reach authorization-checked RPC boundaries'
);
select extensions.is(
  (
    select pronargs::integer
    from pg_proc
    where oid = 'public.current_user_is_admin()'::regprocedure
  ),
  0,
  'the current-user role check accepts no caller-supplied identity'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  is_anonymous,
  raw_app_meta_data,
  raw_user_meta_data
) values
  (
    'e1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'ordinary-admin-test@example.invalid',
    false,
    '{}'::jsonb,
    '{"display_name":"Ordinary Player"}'::jsonb
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'assigned-admin-test@example.invalid',
    false,
    '{}'::jsonb,
    '{"display_name":"Assigned Admin"}'::jsonb
  ),
  (
    'e3000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'cascade-admin-test@example.invalid',
    false,
    '{}'::jsonb,
    '{"display_name":"Cascade Admin"}'::jsonb
  );

insert into public.user_roles (user_id, role)
values
  ('e2000000-0000-4000-8000-000000000002', 'admin'),
  ('e3000000-0000-4000-8000-000000000003', 'admin');

insert into public.rooms (
  id,
  join_code,
  host_user_id,
  status,
  name,
  visibility,
  thumbnail_path,
  thumbnail_version,
  generator_version,
  created_at,
  updated_at
) values
  (
    'e4000000-0000-4000-8000-000000000004',
    'E4E4E4E4',
    'e2000000-0000-4000-8000-000000000002',
    'waiting',
    'Newest Public Room',
    'public',
    'e4000000-0000-4000-8000-000000000004/world.webp',
    1,
    4,
    '2026-07-25 12:00:00+00',
    '2026-07-25 13:00:00+00'
  ),
  (
    'e5000000-0000-4000-8000-000000000005',
    'E5E5E5E5',
    'e2000000-0000-4000-8000-000000000002',
    'waiting',
    'Private Room',
    'private',
    null,
    0,
    4,
    '2026-07-25 11:00:00+00',
    '2026-07-25 11:00:00+00'
  ),
  (
    'e6000000-0000-4000-8000-000000000006',
    'E6E6E6E6',
    'e2000000-0000-4000-8000-000000000002',
    'waiting',
    'Public Room Missing Thumbnail',
    'public',
    null,
    0,
    4,
    '2026-07-25 10:00:00+00',
    '2026-07-25 10:00:00+00'
  );

insert into public.room_members (room_id, user_id, display_name, role)
values
  (
    'e4000000-0000-4000-8000-000000000004',
    'e2000000-0000-4000-8000-000000000002',
    'Assigned Admin',
    'host'
  ),
  (
    'e4000000-0000-4000-8000-000000000004',
    'e1000000-0000-4000-8000-000000000001',
    'Ordinary Player',
    'member'
  );

insert into public.room_seats (
  room_id,
  seat_index,
  occupant_user_id,
  ready,
  claimed_at
) values
  (
    'e4000000-0000-4000-8000-000000000004',
    0,
    'e2000000-0000-4000-8000-000000000002',
    true,
    statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000004',
    1,
    null,
    false,
    null
  );

insert into public.matches (
  id,
  room_id,
  status,
  setup_snapshot,
  seat_order_snapshot,
  generator_metadata,
  planet_snapshot,
  state_snapshot,
  state_fingerprint
) values (
  'e7000000-0000-4000-8000-000000000007',
  'e4000000-0000-4000-8000-000000000004',
  'active',
  '{}'::jsonb,
  '[]'::jsonb,
  '{"version":4,"id":"v2-normalized"}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  repeat('0', 64)
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1000000-0000-4000-8000-000000000001","user_id":"e2000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'e1000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select extensions.is(
  public.current_user_is_admin(),
  false,
  'a registered non-admin receives false'
);
select extensions.throws_ok(
  $$select * from public.admin_dashboard_overview()$$,
  '42501',
  'admin_access_denied',
  'a registered non-admin cannot obtain overview data'
);
select extensions.throws_ok(
  $$select * from public.admin_recent_rooms()$$,
  '42501',
  'admin_access_denied',
  'a registered non-admin cannot obtain recent-room data'
);
select extensions.is(
  public.current_user_is_admin(),
  false,
  'a caller-supplied UUID-shaped claim cannot influence the role check'
);
select extensions.throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ('e1000000-0000-4000-8000-000000000001', 'admin')$$,
  '42501',
  'permission denied for table user_roles',
  'ordinary users cannot insert their own role'
);
select extensions.throws_ok(
  $$update public.user_roles set created_at = statement_timestamp()$$,
  '42501',
  'permission denied for table user_roles',
  'ordinary users cannot update role assignments'
);
select extensions.throws_ok(
  $$delete from public.user_roles$$,
  '42501',
  'permission denied for table user_roles',
  'ordinary users cannot delete role assignments'
);
select extensions.throws_ok(
  $$select count(*) from public.user_roles$$,
  '42501',
  'permission denied for table user_roles',
  'ordinary users cannot enumerate role assignments'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;

select extensions.is(
  public.current_user_is_admin(),
  false,
  'the safe role check returns false when auth.uid is absent'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e2000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'e2000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select extensions.is(
  public.current_user_is_admin(),
  true,
  'an assigned admin receives true'
);
select extensions.lives_ok(
  $$select * from public.admin_dashboard_overview()$$,
  'an assigned admin can obtain the overview'
);
select extensions.lives_ok(
  $$select * from public.admin_recent_rooms()$$,
  'an assigned admin can obtain recent rooms'
);
select extensions.is(
  (
    select active_matches
    from public.admin_dashboard_overview()
  ),
  1::bigint,
  'active-match count uses the authoritative active status'
);
select extensions.is(
  (
    select
      public_waiting_rooms::text || ':' ||
      private_waiting_rooms::text || ':' ||
      public_waiting_with_thumbnail::text || ':' ||
      public_waiting_missing_thumbnail::text
    from public.admin_dashboard_overview()
  ),
  '2:1:1:1',
  'overview calculates visibility and thumbnail health server-side'
);
select extensions.is(
  (
    select
      room_name || ':' ||
      host_display_name || ':' ||
      current_members::text || ':' ||
      claimed_seats::text || ':' ||
      generator_version::text
    from public.admin_recent_rooms()
    limit 1
  ),
  'Newest Public Room:Assigned Admin:2:1:4',
  'recent rooms return bounded operational fields in deterministic order'
);
select extensions.ok(
  not (
    to_jsonb((select recent from public.admin_recent_rooms() as recent limit 1))
    ?| array[
      'email',
      'join_code',
      'host_user_id',
      'user_id',
      'raw_app_meta_data',
      'raw_user_meta_data',
      'provider',
      'token'
    ]
  ),
  'admin room data excludes emails, UUID identities, codes, and auth metadata'
);
select extensions.cmp_ok(
  (select count(*) from public.admin_recent_rooms()),
  '<=',
  20::bigint,
  'recent-room results are capped at twenty rows'
);

reset role;
delete from public.user_roles
where user_id = 'e2000000-0000-4000-8000-000000000002';
set local role authenticated;

select extensions.is(
  public.current_user_is_admin(),
  false,
  'removing an admin role invalidates subsequent role checks'
);
select extensions.throws_ok(
  $$select * from public.admin_dashboard_overview()$$,
  '42501',
  'admin_access_denied',
  'removing an admin role blocks subsequent privileged calls'
);

reset role;
delete from auth.users
where id = 'e3000000-0000-4000-8000-000000000003';
select extensions.is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = 'e3000000-0000-4000-8000-000000000003'
  ),
  0,
  'deleting an Auth user cascades to its role rows'
);

select * from extensions.finish();
rollback;
