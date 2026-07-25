begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(23);

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
    select 'public', id, join_code
    from public.create_room(
      '', 'public-browser-world', 12, 2, 'random', 2,
      'Atlas Prime', 'public'
    )$$,
  'a registered host can create a named public game'
);
select extensions.is(
  (
    select name || ':' || visibility
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'public')
  ),
  'Atlas Prime:public',
  'room name and public visibility persist transactionally'
);
select extensions.is(
  (
    select max_seats
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'public')
  ),
  2,
  'room creation persists the requested maximum players'
);
select extensions.lives_ok(
  $$insert into browser_test_rooms
    select 'private', id, join_code
    from public.create_room(
      '', 'private-browser-world', 12, 2, 'random', 3,
      'Hidden Orbit', 'private'
    )$$,
  'the same secure creation path can create a private game'
);

reset role;
insert into public.rooms (
  join_code,
  host_user_id,
  status,
  name,
  visibility
) values
  (
    'AA11AA11',
    'd1000000-0000-4000-8000-000000000001',
    'active',
    'Already Started',
    'public'
  ),
  (
    'BB22BB22',
    'd1000000-0000-4000-8000-000000000001',
    'closed',
    'Already Closed',
    'public'
  );

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

select extensions.is(
  (select count(*)::integer from public.list_public_rooms()),
  1,
  'a registered non-member sees only public waiting games'
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
  'the public listing contains no room code, user id, or email field'
);
select extensions.is(
  (
    select
      current_players::text || ':' ||
      jsonb_array_length(players)::text
    from public.list_public_rooms()
  ),
  '1:1',
  'the listing calculates member count and safe player data server-side'
);
select extensions.is(
  (select room_state from public.list_public_rooms()),
  'waiting',
  'an available public room is labeled waiting'
);
select extensions.is(
  (
    select count(*)::integer
    from public.list_public_rooms()
    where room_name in ('Already Started', 'Already Closed', 'Hidden Orbit')
  ),
  0,
  'private, started, and closed rooms are excluded'
);
select extensions.lives_ok(
  $$select public.join_public_room(
    (select room_id from browser_test_rooms where label = 'public')
  )$$,
  'a registered player can join an available public room by id'
);
select extensions.is(
  (
    select count(*)::integer
    from public.room_members
    where room_id =
      (select room_id from browser_test_rooms where label = 'public')
  ),
  2,
  'public joining adds one canonical room membership'
);
select extensions.lives_ok(
  $$select public.join_public_room(
    (select room_id from browser_test_rooms where label = 'public')
  )$$,
  'retrying the same public join is idempotent'
);
select extensions.is(
  (
    select count(*)::integer
    from public.room_members
    where room_id =
      (select room_id from browser_test_rooms where label = 'public')
  ),
  2,
  'an idempotent public-join retry does not duplicate membership'
);
select extensions.is(
  (
    select room_state
    from public.list_public_rooms()
    where room_id =
      (select room_id from browser_test_rooms where label = 'public')
  ),
  'full',
  'the listing calculates a full waiting room server-side'
);

reset role;
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
select extensions.throws_ok(
  $$select public.join_public_room(
    (select room_id from browser_test_rooms where label = 'public')
  )$$,
  'P0001',
  'full_room',
  'the authoritative public join rejects a player after the final seat is taken'
);
select extensions.throws_ok(
  $$select public.join_public_room(
    (select room_id from browser_test_rooms where label = 'private')
  )$$,
  'P0001',
  'public_room_unavailable',
  'a private room cannot be joined through the public-room id RPC'
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
select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'room-thumbnails',
      (select room_id::text || '/world.webp'
       from browser_test_rooms where label = 'public'),
      'd1000000-0000-4000-8000-000000000001'
    )$$,
  'the public-room host can create the one stable thumbnail object'
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
update storage.objects
set metadata = '{"replacedBy":"non-host"}'::jsonb
where bucket_id = 'room-thumbnails'
  and name = (
    select room_id::text || '/world.webp'
    from browser_test_rooms
    where label = 'public'
  );
reset role;
select extensions.is(
  (
    select metadata is null
    from storage.objects
    where bucket_id = 'room-thumbnails'
      and name = (
        select room_id::text || '/world.webp'
        from browser_test_rooms
        where label = 'public'
      )
  ),
  true,
  'a non-host cannot replace another room thumbnail object'
);

set local role authenticated;
select extensions.throws_ok(
  $$select public.publish_room_thumbnail(
    (select room_id from browser_test_rooms where label = 'public'),
    (select room_id::text || '/world.webp'
     from browser_test_rooms where label = 'public')
  )$$,
  'P0001',
  'host_only',
  'a non-host cannot publish another room thumbnail metadata'
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
select public.publish_room_thumbnail(
  (select room_id from browser_test_rooms where label = 'public'),
  (select room_id::text || '/world.webp'
   from browser_test_rooms where label = 'public')
);
select extensions.is(
  (
    select thumbnail_path || ':' || thumbnail_version::text
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'public')
  ),
  (
    select room_id::text || '/world.webp:1'
    from browser_test_rooms
    where label = 'public'
  ),
  'successful host publication stores the stable path and increments its cache version'
);
select public.update_room_settings(
  (select room_id from browser_test_rooms where label = 'public'),
  'replacement-world',
  12,
  2,
  'random',
  2
);
select extensions.is(
  (
    select (thumbnail_path is null)::text || ':' || thumbnail_version::text
    from public.rooms
    where id = (select room_id from browser_test_rooms where label = 'public')
  ),
  'true:2',
  'a persisted world change invalidates stale thumbnail metadata transactionally'
);

reset role;
select extensions.is(
  (
    select
      public::text || ':' ||
      file_size_limit::text || ':' ||
      allowed_mime_types[1]
    from storage.buckets
    where id = 'room-thumbnails'
  ),
  'true:1048576:image/webp',
  'the dedicated public bucket restricts thumbnail size and MIME type'
);

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
  $$select * from public.list_public_rooms()$$,
  'P0001',
  'account_required',
  'anonymous accounts cannot browse public multiplayer rooms'
);

select * from extensions.finish();
rollback;
