begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(37);

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
  profile_private.derive_display_name(users.id, users.raw_user_meta_data)
from auth.users as users
on conflict (user_id) do nothing;
select extensions.is(
  (
    select display_name
    from public.profiles
    where user_id = '90000000-0000-4000-8000-000000000001'
  ),
  'Backfilled Guest',
  'migration backfill creates a normalized profile for an existing auth user'
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
  'Guest 9100',
  'anonymous user without metadata receives a stable short guest label'
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
  'Valid Fallback',
  'invalid preferred metadata falls through to the next safe name'
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
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.profiles),
  4,
  'an authenticated anonymous user can read public profile rows'
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
select extensions.lives_ok(
  $$select public.update_own_profile(
    '  Player One  ',
    'https://cdn.example.com/avatar.png'
  )$$,
  'authenticated user can update safe fields through the controlled RPC'
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
