begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(48);

select extensions.ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ),
  'profiles has row level security enabled'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'unauthenticated browser role has no profile select grant'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated browser role has the narrow profile select grant'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated browser role has no direct profile write grants'
);
select extensions.hasnt_column(
  'public',
  'profiles',
  'is_admin',
  'profiles does not expose an administrator flag'
);
select extensions.hasnt_column(
  'public',
  'profiles',
  'role',
  'profiles does not expose a role field'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'profile_private.current_user_is_registered()',
    'EXECUTE'
  ),
  'RLS can execute only the narrow registered-user capability helper'
);
select extensions.ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created_create_profile'
      and not tgisinternal
  ),
  'auth user profile trigger exists'
);

insert into auth.users (
  id,
  aud,
  role,
  is_anonymous,
  raw_app_meta_data,
  raw_user_meta_data
) values (
  '90000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  true,
  '{}'::jsonb,
  '{"display_name":"  Backfilled Guest  "}'::jsonb
);
delete from public.profiles
where user_id = '90000000-0000-4000-8000-000000000001';
select extensions.ok(
  not exists (
    select 1
    from public.profiles
    where user_id = '90000000-0000-4000-8000-000000000001'
  ),
  'legacy fixture begins without a profile'
);
insert into public.profiles (user_id, display_name)
select
  users.id,
  profile_private.derive_guest_display_name(users.id)
from auth.users as users
where users.id = '90000000-0000-4000-8000-000000000001'
on conflict (user_id) do nothing;
select extensions.is(
  (
    select display_name
    from public.profiles
    where user_id = '90000000-0000-4000-8000-000000000001'
  ),
  profile_private.derive_guest_display_name(
    '90000000-0000-4000-8000-000000000001'
  ),
  'missing anonymous profile recovery uses the generated guest identity'
);

insert into auth.users (
  id,
  aud,
  role,
  is_anonymous,
  raw_app_meta_data,
  raw_user_meta_data
) values
  (
    '91000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    true,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    false,
    '{"provider":"discord"}'::jsonb,
    '{"full_name":"  Renée 星  "}'::jsonb
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    true,
    '{}'::jsonb,
    '{"display_name":"","full_name":"Valid Fallback","is_admin":true}'::jsonb
  );

select extensions.is(
  (
    select count(*)::integer
    from public.profiles
    where user_id in (
      '91000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002',
      '93000000-0000-4000-8000-000000000003'
    )
  ),
  3,
  'new anonymous and permanent auth users each receive one profile'
);
select extensions.is(
  (
    select display_name
    from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'
  ),
  profile_private.derive_guest_display_name(
    '91000000-0000-4000-8000-000000000001'
  ),
  'anonymous user without metadata receives the stable friendly guest label'
);
select extensions.is(
  (
    select display_name
    from public.profiles
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  'Renée 星',
  'safe provider metadata supplies a Unicode display name'
);
select extensions.is(
  (
    select display_name
    from public.profiles
    where user_id = '93000000-0000-4000-8000-000000000003'
  ),
  profile_private.derive_guest_display_name(
    '93000000-0000-4000-8000-000000000003'
  ),
  'anonymous user metadata cannot replace the generated guest identity'
);
select extensions.is(
  profile_private.derive_guest_display_name(
    '91000000-0000-4000-8000-000000000001'
  ),
  profile_private.derive_guest_display_name(
    '91000000-0000-4000-8000-000000000001'
  ),
  'the same user ID always derives the same guest display name'
);
select extensions.ok(
  (
    select bool_and(
      profile_private.derive_guest_display_name(test_id)
        ~ '^[A-Z][a-z]+[A-Z][a-z]+-[0-9]{3}$'
      and char_length(profile_private.derive_guest_display_name(test_id)) <= 40
    )
    from unnest(array[
      '11000000-0000-4000-8000-000000000001'::uuid,
      '22000000-0000-4000-8000-000000000002'::uuid,
      '33000000-0000-4000-8000-000000000003'::uuid
    ]) as ids(test_id)
  ),
  'different UUID fixtures derive valid readable generated names'
);

insert into auth.users (
  id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data
) values
  (
    '94000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb
  ),
  (
    '95000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb
  );
update public.profiles
set display_name =
  'Guest ' || upper(substr(replace(user_id::text, '-', ''), 1, 4))
where user_id = '94000000-0000-4000-8000-000000000004';
update public.profiles
set display_name = 'Custom Tester'
where user_id = '95000000-0000-4000-8000-000000000005';
update public.profiles as profiles
set display_name = profile_private.derive_guest_display_name(profiles.user_id)
from auth.users as users
where users.id = profiles.user_id
  and users.is_anonymous is true
  and profiles.display_name =
    'Guest ' || upper(substr(replace(profiles.user_id::text, '-', ''), 1, 4));
select extensions.is(
  (
    select display_name from public.profiles
    where user_id = '94000000-0000-4000-8000-000000000004'
  ),
  profile_private.derive_guest_display_name(
    '94000000-0000-4000-8000-000000000004'
  ),
  'the old untouched Guest XXXX fallback is upgraded'
);
select extensions.is(
  (
    select display_name from public.profiles
    where user_id = '95000000-0000-4000-8000-000000000005'
  ),
  'Custom Tester',
  'guest-name backfill preserves custom profile names'
);

set local role anon;
select extensions.throws_ok(
  $$select * from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'unauthenticated requests cannot read profiles'
);
select extensions.throws_ok(
  $$select public.ensure_own_profile()$$,
  '42501',
  'permission denied for function ensure_own_profile',
  'unauthenticated requests cannot ensure a profile'
);

reset role;
update auth.users
set raw_user_meta_data =
  raw_user_meta_data || '{"is_registered":true,"is_admin":true}'::jsonb
where id = '91000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","is_anonymous":true}',
  true
);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.profiles),
  1,
  'an authenticated anonymous user can read only their own profile row'
);
select extensions.is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  0,
  'an authenticated anonymous user cannot read another profile'
);
select extensions.lives_ok(
  $$select public.ensure_own_profile()$$,
  'ensuring an existing profile is idempotent'
);
select extensions.is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'
  ),
  1,
  'trigger and ensure execution never duplicate a profile'
);
select extensions.throws_ok(
  $$select public.update_own_profile('Player One', null)$$,
  'P0001',
  'account_required',
  'anonymous users cannot customize their profile even with capability-shaped metadata'
);

reset role;
create temporary table profile_upgrade_fixture (
  room_id uuid primary key
) on commit drop;
grant all on profile_upgrade_fixture to authenticated;
insert into public.rooms (
  id, join_code, host_user_id, seed, territory_count,
  continent_count, assignment_mode, max_seats
) values (
  '96000000-0000-4000-8000-000000000006',
  'ABCDEF12',
  '91000000-0000-4000-8000-000000000001',
  'profile-upgrade-room',
  12,
  2,
  'random',
  2
);
insert into public.room_members (room_id, user_id, display_name, role)
values (
  '96000000-0000-4000-8000-000000000006',
  '91000000-0000-4000-8000-000000000001',
  'Stable Guest Room',
  'host'
);
insert into public.room_seats (room_id, seat_index)
values
  ('96000000-0000-4000-8000-000000000006', 0),
  ('96000000-0000-4000-8000-000000000006', 1);
insert into profile_upgrade_fixture values (
  '96000000-0000-4000-8000-000000000006'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.update_own_profile('Player One', null)$$,
  'P0001',
  'account_required',
  'a missing anonymous claim fails closed'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","is_anonymous":"false"}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.update_own_profile('Player One', null)$$,
  'P0001',
  'account_required',
  'a malformed anonymous claim fails closed'
);

reset role;
update auth.users
set is_anonymous = false,
    email = 'registered-profile-test@example.invalid',
    raw_user_meta_data = raw_user_meta_data || '{"is_registered":true,"is_admin":true}'::jsonb
where id = '91000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
set local role authenticated;
select extensions.lives_ok(
  $$select public.update_own_profile(
    '  Player One  ',
    'https://cdn.example.com/avatar.png'
  )$$,
  'authenticated user can update safe fields through the controlled RPC'
);
select extensions.is(
  (
    select user_id from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'guest-to-email registration preserves the profile user ID'
);
select extensions.is(
  (
    select rooms.host_user_id
    from public.rooms
    join profile_upgrade_fixture on profile_upgrade_fixture.room_id = rooms.id
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'guest-to-email registration preserves existing room ownership'
);
select extensions.is(
  (
    select display_name || '|' || avatar_url
    from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'
  ),
  'Player One|https://cdn.example.com/avatar.png',
  'controlled update normalizes and stores only safe presentation fields'
);
select extensions.ok(
  (
    select updated_at > created_at
    from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'
  ),
  'controlled update advances the database-generated update timestamp'
);
select extensions.is(
  (
    select display_name
    from public.profiles
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  'Renée 星',
  'updating the caller profile leaves another user profile unchanged'
);
select extensions.throws_ok(
  $$insert into public.profiles (user_id, display_name)
    values ('94000000-0000-4000-8000-000000000004', 'Fabricated')$$,
  '42501',
  'permission denied for table profiles',
  'direct browser profile insert is denied'
);
select extensions.throws_ok(
  $$update public.profiles
    set display_name = 'Fabricated'
    where user_id = '92000000-0000-4000-8000-000000000002'$$,
  '42501',
  'permission denied for table profiles',
  'user A cannot directly update user B'
);
select extensions.throws_ok(
  $$delete from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table profiles',
  'direct browser profile delete is denied'
);
select extensions.throws_ok(
  $$select public.update_own_profile('   ', null)$$,
  'P0001',
  'invalid_profile_display_name',
  'empty profile display name is rejected'
);
select extensions.throws_ok(
  $$select public.update_own_profile(repeat('x', 41), null)$$,
  'P0001',
  'invalid_profile_display_name',
  'excessive profile display name is rejected'
);
select extensions.throws_ok(
  $$select public.update_own_profile(E'Bad\nName', null)$$,
  'P0001',
  'invalid_profile_display_name',
  'control characters in a profile display name are rejected'
);
select extensions.throws_ok(
  $$select public.update_own_profile('Player One', 'http://example.com/a.png')$$,
  'P0001',
  'invalid_profile_avatar_url',
  'non-HTTPS avatar URL is rejected'
);
select extensions.throws_ok(
  $$select public.update_own_profile(
    'Player One',
    'https://example.com/' || repeat('x', 2049)
  )$$,
  'P0001',
  'invalid_profile_avatar_url',
  'excessive avatar URL is rejected'
);
select extensions.throws_ok(
  $$select public.update_own_profile(
    'Player One',
    'https://user:password@example.com/a.png'
  )$$,
  'P0001',
  'invalid_profile_avatar_url',
  'credential-bearing avatar URL is rejected'
);
select extensions.lives_ok(
  $$select public.update_own_profile('Player One', null)$$,
  'avatar URL may be cleared'
);

reset role;
delete from public.profiles
where user_id = '91000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select extensions.lives_ok(
  $$select public.ensure_own_profile()$$,
  'missing own profile can be recovered safely'
);
select extensions.is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '91000000-0000-4000-8000-000000000001'
  ),
  1,
  'missing-profile recovery creates exactly one caller-owned row'
);

reset role;
select extensions.ok(
  (
    select raw_user_meta_data ->> 'is_admin'
    from auth.users
    where id = '93000000-0000-4000-8000-000000000003'
  ) = 'true',
  'user-controlled administrator-shaped metadata remains presentation-only input'
);
delete from auth.users
where id = '92000000-0000-4000-8000-000000000002';
select extensions.ok(
  not exists (
    select 1
    from public.profiles
    where user_id = '92000000-0000-4000-8000-000000000002'
  ),
  'deleting an auth user cascades to the profile'
);

select extensions.is(
  (
    select count(*)::integer
    from auth.users as users
    left join public.profiles as profiles on profiles.user_id = users.id
    where profiles.user_id is null
  ),
  0,
  'every remaining auth user has a profile'
);

select * from extensions.finish();
rollback;
