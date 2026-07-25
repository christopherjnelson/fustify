begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(25);

insert into auth.users (
  id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data
)
values
  ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('51000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('51000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('51000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('51000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('51000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb);

insert into public.rooms (
  id, join_code, host_user_id, status, name, created_at
)
values
  ('52000000-0000-4000-8000-000000000001', '52000001', '51000000-0000-4000-8000-000000000001', 'waiting', 'Heartbeat', statement_timestamp() - interval '1 minute'),
  ('52000000-0000-4000-8000-000000000002', '52000002', '51000000-0000-4000-8000-000000000002', 'closed', 'Closed heartbeat', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000003', '52000003', '51000000-0000-4000-8000-000000000002', 'active', 'Active heartbeat', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000004', '52000004', '51000000-0000-4000-8000-000000000002', 'waiting', 'Stale host', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000005', '52000005', '51000000-0000-4000-8000-000000000003', 'waiting', 'Fresh valid room', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000006', '52000006', '51000000-0000-4000-8000-000000000004', 'waiting', 'Missing host recent', statement_timestamp() - interval '5 minutes'),
  ('52000000-0000-4000-8000-000000000007', '52000007', '51000000-0000-4000-8000-000000000004', 'waiting', 'Missing host stale', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000008', '52000008', '51000000-0000-4000-8000-000000000005', 'waiting', 'Recovered host', statement_timestamp() - interval '20 minutes');

insert into public.room_members (
  room_id, user_id, display_name, role, last_active_at
)
values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'Host One', 'host', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'Other Member', 'member', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', 'Closed Host', 'host', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000002', 'Active Host', 'host', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000002', 'Stale Host', 'host', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000003', 'Stale Room Guest', 'member', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000003', 'Fresh Host', 'host', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000001', 'Stale Guest', 'member', statement_timestamp() - interval '20 minutes'),
  ('52000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000002', 'Fresh Guest', 'member', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000005', 'Recovered Host', 'host', statement_timestamp() - interval '20 minutes');

insert into public.room_seats (
  room_id, seat_index, occupant_user_id, ready, claimed_at
)
values
  ('52000000-0000-4000-8000-000000000005', 0, '51000000-0000-4000-8000-000000000003', true, statement_timestamp()),
  ('52000000-0000-4000-8000-000000000005', 1, '51000000-0000-4000-8000-000000000001', true, statement_timestamp()),
  ('52000000-0000-4000-8000-000000000005', 2, '51000000-0000-4000-8000-000000000002', true, statement_timestamp());

insert into public.matches (
  id, room_id, status, setup_snapshot, seat_order_snapshot, generator_metadata
)
values (
  '53000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000003',
  'preview',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb
);

set local role anon;
select extensions.throws_ok(
  $$select public.heartbeat_room_membership('52000000-0000-4000-8000-000000000001')$$,
  '42501',
  'permission denied for function heartbeat_room_membership',
  'anonymous callers cannot heartbeat'
);

reset role;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000006","is_anonymous":true}', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.heartbeat_room_membership('52000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'account_required',
  'an anonymous authenticated identity cannot heartbeat'
);

reset role;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;
select extensions.ok(
  public.heartbeat_room_membership('52000000-0000-4000-8000-000000000001'),
  'a waiting-room member can heartbeat'
);
select extensions.ok(
  (select last_active_at > statement_timestamp() - interval '1 minute'
   from public.room_members
   where room_id = '52000000-0000-4000-8000-000000000001'
     and user_id = '51000000-0000-4000-8000-000000000001'),
  'the caller updates their own activity'
);
select extensions.ok(
  (select last_active_at < statement_timestamp() - interval '10 minutes'
   from public.room_members
   where room_id = '52000000-0000-4000-8000-000000000001'
     and user_id = '51000000-0000-4000-8000-000000000002'),
  'a caller cannot heartbeat another membership'
);
select extensions.ok(
  not public.heartbeat_room_membership('52000000-0000-4000-8000-000000000002')
  and not public.heartbeat_room_membership('52000000-0000-4000-8000-000000000003'),
  'closed and started rooms are not heartbeated'
);

reset role;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000004","is_anonymous":false}', true);
set local role authenticated;
select extensions.ok(
  not public.heartbeat_room_membership('52000000-0000-4000-8000-000000000001'),
  'a non-member receives a minimal false result'
);
reset role;
select extensions.is(
  (select count(*)::integer from public.room_members
   where room_id = '52000000-0000-4000-8000-000000000001'),
  2,
  'a non-member cannot create or update membership through heartbeat'
);

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000005","is_anonymous":false}', true);
set local role authenticated;
select extensions.ok(
  public.heartbeat_room_membership('52000000-0000-4000-8000-000000000008'),
  'a fresh concurrent heartbeat is accepted before cleanup'
);

reset role;
select multiplayer_private.expire_stale_multiplayer_rooms();

select extensions.is(
  (select status from public.rooms where id = '52000000-0000-4000-8000-000000000005'),
  'waiting',
  'a fresh host keeps the room waiting'
);
select extensions.is(
  (select status from public.rooms where id = '52000000-0000-4000-8000-000000000004'),
  'closed',
  'a stale host closes its waiting room'
);
select extensions.is(
  (select status from public.rooms where id = '52000000-0000-4000-8000-000000000006'),
  'waiting',
  'a recent room with missing host membership observes the grace period'
);
select extensions.is(
  (select status from public.rooms where id = '52000000-0000-4000-8000-000000000007'),
  'closed',
  'an old room with missing host membership closes after the grace period'
);
select extensions.is(
  (select status from public.rooms where id = '52000000-0000-4000-8000-000000000008'),
  'waiting',
  'a fresh heartbeat prevents stale closure'
);
select extensions.ok(
  not exists (
    select 1 from public.room_members
    where room_id = '52000000-0000-4000-8000-000000000005'
      and user_id = '51000000-0000-4000-8000-000000000001'
  ),
  'a stale non-host member is removed'
);
select extensions.ok(
  (select occupant_user_id is null and ready is false and claimed_at is null
   from public.room_seats
   where room_id = '52000000-0000-4000-8000-000000000005'
     and seat_index = 1),
  'the stale guest seat is released'
);
select extensions.is(
  (select count(*)::integer from public.room_members
   where room_id = '52000000-0000-4000-8000-000000000005'),
  2,
  'fresh guests and hosts remain'
);
select extensions.ok(
  exists (
    select 1 from public.room_members
    where room_id = '52000000-0000-4000-8000-000000000004'
      and role = 'member'
  ),
  'guest expiration never removes members while closing a stale-host room'
);
select extensions.is(
  (select status from public.rooms where id = '52000000-0000-4000-8000-000000000003'),
  'active',
  'started rooms are untouched'
);
select extensions.is(
  (select count(*)::integer from public.matches
   where id = '53000000-0000-4000-8000-000000000001'),
  1,
  'matches are untouched'
);

select multiplayer_private.expire_stale_multiplayer_rooms();
select extensions.is(
  (select count(*)::integer from public.room_members
   where room_id = '52000000-0000-4000-8000-000000000005'),
  2,
  'repeated cleanup is harmless'
);

set local role anon;
select extensions.throws_ok(
  $$select multiplayer_private.expire_stale_multiplayer_rooms()$$,
  '42501',
  'permission denied for schema multiplayer_private',
  'anon cannot invoke internal cleanup'
);

reset role;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"51000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;
select extensions.throws_ok(
  $$select multiplayer_private.expire_stale_multiplayer_rooms()$$,
  '42501',
  'permission denied for function expire_stale_multiplayer_rooms',
  'authenticated cannot invoke internal cleanup'
);

reset role;
select extensions.is(
  (select count(*)::integer from public.room_members
   where room_id = '52000000-0000-4000-8000-000000000001'
     and role = 'host'),
  1,
  'cleanup never removes a host through guest expiration'
);
select extensions.is(
  (select count(*)::integer from public.rooms
   where status = 'closed'
     and id in (
       '52000000-0000-4000-8000-000000000004',
       '52000000-0000-4000-8000-000000000007'
     )),
  2,
  'cleanup changes only the stale waiting rooms selected by policy'
);

select * from extensions.finish();
rollback;
