begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(37);

insert into auth.users (
  id,
  aud,
  role,
  is_anonymous,
  raw_app_meta_data,
  raw_user_meta_data
) values
  (
    'd1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    false,
    '{}'::jsonb,
    '{"display_name":"Public Host"}'::jsonb
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    false,
    '{}'::jsonb,
    '{"display_name":"Public Guest"}'::jsonb
  ),
  (
    'd3000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    false,
    '{}'::jsonb,
    '{"display_name":"Last Seat Racer"}'::jsonb
  ),
  (
    'd4000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    true,
    '{}'::jsonb,
    '{}'::jsonb
  );

create temporary table browser_test_rooms (
  label text primary key,
  room_id uuid not null,
  join_code text not null
) on commit drop;
grant all on browser_test_rooms to authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$insert into browser_test_rooms
    select 'primary', id, join_code
    from public.create_room(
      '', 'first-private-world', 12, 2, 'random', 3,
      'Atlas Prime', 'public'
    )$$,
  'a registered host can create a room through the compatibility signature'
);
select extensions.is(
  (
    select visibility || ':' || status || ':' || (join_code is not null)::text
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'primary')
  ),
  'private:waiting:true',
  'creation is authoritatively private and waiting with a usable code'
);
select extensions.is(
  (select count(*)::integer from public.list_public_rooms()),
  0,
  'a newly created private room is not publicly discoverable'
);

reset role;
set constraints all immediate;
select extensions.is(
  (
    select count(*)::integer
    from public.discord_room_announcements
    where room_id = (select room_id from browser_test_rooms where label = 'primary')
  ),
  0,
  'private creation does not enqueue a Discord announcement'
);

set local role authenticated;
select extensions.lives_ok(
  $$select public.update_room_settings(
    (select room_id from browser_test_rooms where label = 'primary'),
    'locked-public-world', 18, 6, 'random', 3, 'Final Atlas'
  )$$,
  'the private host can edit all advertised settings'
);
select extensions.is(
  (
    select name || ':' || seed || ':' || territory_count::text || ':' ||
      continent_count::text || ':' || max_seats::text
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'primary')
  ),
  'Final Atlas:locked-public-world:18:6:3',
  'private edits persist canonically before publication'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select extensions.lives_ok(
  $$select public.join_room(
    (select join_code from browser_test_rooms where label = 'primary'), ''
  )$$,
  'private code joining remains available before publication'
);
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'primary')
  )$$,
  'P0001',
  'host_only',
  'a non-host member cannot publish the room'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select extensions.is(
  (
    select room_visibility || ':' || room_revision::text
    from public.publish_room(
      (select room_id from browser_test_rooms where label = 'primary')
    )
  ),
  'public:3',
  'the host atomically publishes the final private waiting room'
);

reset role;
set constraints all immediate;
select extensions.is(
  (
    select visibility || ':' || (join_code is null)::text
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'primary')
  ),
  'public:true',
  'publication clears the private code while making the room public'
);
select extensions.is(
  (
    select count(*)::integer
    from public.discord_room_announcements
    where room_id = (select room_id from browser_test_rooms where label = 'primary')
  ),
  1,
  'the successful publication transition enqueues exactly one announcement'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d3000000-0000-4000-8000-000000000003","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd3000000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;
select extensions.is(
  (
    select room_name || ':' || room_seed || ':' ||
      territory_count::text || ':' || continent_count::text || ':' ||
      maximum_players::text || ':' || assignment_mode
    from public.list_public_rooms()
  ),
  'Final Atlas:locked-public-world:18:6:3:random',
  'public discovery returns the final locked stable configuration'
);
select extensions.is(
  (
    select
      to_jsonb(listed) ? 'join_code'
      or to_jsonb(listed) ? 'host_user_id'
      or to_jsonb(listed) ? 'email'
    from public.list_public_rooms() as listed
  ),
  false,
  'public discovery exposes no code, host identifier, or email'
);
select extensions.throws_ok(
  $$select public.join_room(
    (select join_code from browser_test_rooms where label = 'primary'), ''
  )$$,
  'P0001',
  'invalid_code',
  'the retired private code cannot join a published room'
);
select extensions.lives_ok(
  $$select * from public.join_public_room(
    (select room_id from browser_test_rooms where label = 'primary')
  )$$,
  'the canonical direct-link RPC accepts an eligible published room'
);
select extensions.is(
  (
    select array_agg(key order by key)::text
    from jsonb_object_keys(
      to_jsonb((
        select joined
        from public.join_public_room(
          (select room_id from browser_test_rooms where label = 'primary')
        ) as joined
      ))
    ) as keys(key)
  ),
  '{id}',
  'public joining returns only the room id and never its retired code'
);
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'primary')
  )$$,
  'P0001',
  'host_only',
  'a non-host still cannot repeat publication'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.update_room_settings(
    (select room_id from browser_test_rooms where label = 'primary'),
    'mutated', 12, 2, 'random', 3, 'Mutated'
  )$$,
  'P0001',
  'published_room_settings_locked',
  'the settings RPC rejects published rooms'
);
select extensions.throws_ok(
  $$update public.rooms
    set seed = 'browser-direct-mutation'
    where id = (select room_id from browser_test_rooms where label = 'primary')$$,
  '42501',
  'permission denied for table rooms',
  'authenticated browsers retain no direct room update grant'
);
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'primary')
  )$$,
  'P0001',
  'room_already_published',
  'the host cannot publish the same room twice'
);

reset role;
select extensions.throws_ok(
  $$update public.rooms
    set visibility = 'private'
    where id = (select room_id from browser_test_rooms where label = 'primary')$$,
  'P0001',
  'published_room_settings_locked',
  'database enforcement prevents public-to-private reversion'
);
select extensions.throws_ok(
  $$update public.rooms
    set seed = 'direct-mutation'
    where id = (select room_id from browser_test_rooms where label = 'primary')$$,
  'P0001',
  'published_room_settings_locked',
  'database enforcement prevents direct published-setting mutation'
);
update public.rooms
set revision = revision + 1
where id = (select room_id from browser_test_rooms where label = 'primary');
set constraints all immediate;
select extensions.is(
  (
    select count(*)::integer
    from public.discord_room_announcements
    where room_id = (select room_id from browser_test_rooms where label = 'primary')
  ),
  1,
  'unrelated lifecycle metadata does not duplicate the announcement'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
insert into browser_test_rooms
select 'full', id, join_code
from public.create_room('', 'full-room', 12, 2, 'random', 2, 'Full', 'private');

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select public.join_room(
  (select join_code from browser_test_rooms where label = 'full'), ''
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'full')
  )$$,
  'P0001',
  'full_room',
  'a full room cannot be published'
);
insert into browser_test_rooms
select 'draft', id, join_code
from public.create_room(
  '', 'draft-room', 12, 2, 'player-draft', 3, 'Draft', 'private'
);
reset role;
select extensions.throws_ok(
  $$update public.rooms
    set
      visibility = 'public',
      join_code = null,
      seed = 'racing-mutation'
    where id = (select room_id from browser_test_rooms where label = 'draft')$$,
  'P0001',
  'invalid_public_room_configuration',
  'a publication transition cannot smuggle a concurrent setting mutation'
);
select extensions.is(
  (
    select visibility || ':' || seed
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'draft')
  ),
  'private:draft-room',
  'a failed transition leaves the private room editable and unpublished'
);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'draft')
  )$$,
  'P0001',
  'multiplayer_draft_unsupported',
  'an unsupported assignment configuration cannot be published'
);
insert into browser_test_rooms
select 'closed', id, join_code
from public.create_room('', 'closed-room', 12, 2, 'random', 3, 'Closed', 'private');
select public.close_room(
  (select room_id from browser_test_rooms where label = 'closed')
);
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'closed')
  )$$,
  'P0001',
  'room_not_waiting',
  'a closed room cannot be published'
);
insert into browser_test_rooms
select 'active', id, join_code
from public.create_room('', 'active-room', 12, 2, 'random', 3, 'Active', 'private');

reset role;
update public.rooms
set status = 'active'
where id = (select room_id from browser_test_rooms where label = 'active');

set local role authenticated;
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'active')
  )$$,
  'P0001',
  'room_not_waiting',
  'an active room cannot be published'
);
select extensions.throws_ok(
  $$select * from public.join_public_room(
    (select room_id from browser_test_rooms where label = 'draft')
  )$$,
  'P0001',
  'public_room_unavailable',
  'public direct-link joining rejects private rooms'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000004","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'd4000000-0000-4000-8000-000000000004',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.publish_room(
    (select room_id from browser_test_rooms where label = 'draft')
  )$$,
  'P0001',
  'account_required',
  'an anonymous Auth identity cannot publish a room'
);

reset role;
insert into public.rooms (
  id, join_code, host_user_id, status, visibility, name
) values (
  'd5000000-0000-4000-8000-000000000005',
  'D5000005',
  'd1000000-0000-4000-8000-000000000001',
  'waiting',
  'public',
  'Existing Public'
);
select extensions.throws_ok(
  $$update public.rooms
    set name = 'Unlocked historical room'
    where id = 'd5000000-0000-4000-8000-000000000005'$$,
  'P0001',
  'published_room_settings_locked',
  'existing public rooms are treated as already published and locked'
);

set local role anon;
select extensions.throws_ok(
  $$select * from public.publish_room(
    'd5000000-0000-4000-8000-000000000005'
  )$$,
  '42501',
  'permission denied for function publish_room',
  'unauthenticated callers cannot execute publication'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.publish_room(uuid)',
    'execute'
  ),
  'the anonymous role has no publication execute grant'
);

reset role;
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.publish_room(uuid)',
    'execute'
  ),
  'the authenticated role has the narrowly authorized publication grant'
);
select extensions.ok(
  (
    select prosecdef and 'search_path=""' = any (coalesce(proconfig, '{}'))
    from pg_proc
    where oid = 'public.publish_room(uuid)'::regprocedure
  ),
  'publication is security-definer with an empty fixed search path'
);
select extensions.ok(
  lower(pg_get_functiondef('public.publish_room(uuid)'::regprocedure))
    like '%for update%'
  and lower(pg_get_functiondef(
    'public.update_room_settings(uuid,text,integer,integer,text,integer,text)'::regprocedure
  )) like '%for update%',
  'publication and settings updates serialize on the same room-row lock'
);

select * from extensions.finish();
rollback;
