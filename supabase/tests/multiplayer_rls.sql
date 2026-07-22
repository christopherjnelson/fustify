begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(25);

insert into auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb);

create temporary table test_rooms (
  label text primary key,
  room_id uuid not null,
  join_code text not null
) on commit drop;
grant all on test_rooms to authenticated, service_role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$insert into test_rooms
    select 'primary', id, join_code
    from public.create_room('Alpha')$$,
  'anonymous authenticated user can create a room'
);
select extensions.is(
  (select count(*)::integer from public.room_members where role = 'host'),
  1,
  'creator becomes the host member'
);
select extensions.is(
  (select count(*)::integer from public.room_seats),
  5,
  'new room creates five user-visible seats'
);
select extensions.is(
  (select continent_count from public.rooms limit 1),
  5,
  'new room defaults to five continents'
);
select extensions.lives_ok(
  $$select public.update_room_settings(
    (select room_id from test_rooms where label = 'primary'),
    'host-settings', 42, 5, 'random', 5
  )$$,
  'host can update supported room settings'
);
select extensions.is(
  (select seed from public.rooms limit 1),
  'host-settings',
  'host settings update persists canonically'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.join_room(
    (select join_code from test_rooms where label = 'primary'),
    'Bravo'
  )$$,
  'second anonymous user joins with the correct code'
);
select extensions.throws_ok(
  $$select public.update_room_settings(
    (select room_id from test_rooms where label = 'primary'),
    'changed', 42, 5, 'random', 5
  )$$,
  'P0001',
  'host_only',
  'non-host cannot change settings'
);
select extensions.throws_ok(
  $$select public.start_room_match(
    (select room_id from test_rooms where label = 'primary')
  )$$,
  '42501',
  'permission denied for function start_room_match',
  'non-host cannot invoke the legacy match initializer'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.rooms),
  0,
  'non-member cannot read a guessed room UUID'
);
select extensions.is(
  (select count(*)::integer from public.room_seats),
  0,
  'non-member cannot read another room seats'
);
select extensions.is(
  (select count(*)::integer from public.matches),
  0,
  'non-member cannot read another room match'
);
select extensions.throws_ok(
  $$select public.join_room('FFFFFFFF', 'Charlie')$$,
  'P0001',
  'invalid_code',
  'incorrect room code reveals no private data'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.throws_ok(
  $$update public.rooms set seed = 'fabricated'$$,
  '42501',
  'permission denied for table rooms',
  'members cannot update tables directly'
);
select public.claim_room_seat((select room_id from test_rooms where label = 'primary'), 0);
select extensions.throws_ok(
  $$select public.claim_room_seat(
    (select room_id from test_rooms where label = 'primary'), 1
  )$$,
  'P0001',
  'already_seated',
  'one user cannot occupy two seats'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.claim_room_seat(
    (select room_id from test_rooms where label = 'primary'), 0
  )$$,
  'P0001',
  'seat_conflict',
  'two users cannot occupy the same seat'
);
select public.claim_room_seat((select room_id from test_rooms where label = 'primary'), 1);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
create temporary table test_matches (first_id uuid, second_id uuid) on commit drop;
grant all on test_matches to authenticated, service_role;
select extensions.throws_ok(
  $$select public.start_room_match(
    (select room_id from test_rooms where label = 'primary')
  )$$,
  '42501',
  'permission denied for function start_room_match',
  'browser roles cannot initialize mutable match state'
);

reset role;
set local role service_role;
insert into test_matches (first_id)
select id from public.authority_initialize_room_match(
  (select room_id from test_rooms where label = 'primary'),
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '{"version":2}'::jsonb,
  '[{"seatIndex":0,"userId":"10000000-0000-4000-8000-000000000001","playerId":"player-01"},{"seatIndex":1,"userId":"10000000-0000-4000-8000-000000000002","playerId":"player-02"}]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"matchId":"20000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
  repeat('a', 64)
);
select extensions.is(
  (
    select count(*)::integer
    from public.matches
    where room_id = (select room_id from test_rooms where label = 'primary')
  ),
  1,
  'trusted initialization creates exactly one authoritative match'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.throws_ok(
  $$update public.matches set setup_snapshot = '{}'::jsonb$$,
  '42501',
  'permission denied for table matches',
  'match setup snapshot is immutable through client access'
);

reset role;
select extensions.throws_ok(
  $$update public.matches
    set setup_snapshot = jsonb_set(setup_snapshot, '{seed}', '"tampered"')$$,
  'P0001',
  'match_snapshot_immutable',
  'snapshot immutability is also enforced at the database boundary'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$insert into test_rooms
    select 'closed', id, join_code
    from public.create_room('Alpha Two')$$,
  'host can create a second private room'
);
select public.close_room((select room_id from test_rooms where label = 'closed'));

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.join_room(
    (select join_code from test_rooms where label = 'closed'),
    'Charlie'
  )$$,
  'P0001',
  'closed_room',
  'closed room cannot be joined'
);
select extensions.throws_ok(
  $$select public.close_room(
    (select room_id from test_rooms where label = 'closed')
  )$$,
  'P0001',
  'room_access_denied',
  'user cannot operate on another room'
);

reset role;
delete from auth.users
where id = '10000000-0000-4000-8000-000000000002';
select extensions.ok(
  not exists (
    select 1 from public.room_seats
    where occupant_user_id = '10000000-0000-4000-8000-000000000002'
  ),
  'deleting a member identity safely releases its seat'
);

set local role anon;
select extensions.throws_ok(
  $$select public.create_room('Unauthenticated')$$,
  '42501',
  'permission denied for function create_room',
  'functions reject unauthenticated callers'
);

reset role;
select * from extensions.finish();
rollback;
