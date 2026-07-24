begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(25);

insert into auth.users (
  id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', true, '{}'::jsonb,
    '{"is_registered":true,"email":"forged@example.invalid"}'::jsonb
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb
  );

insert into public.rooms (
  id, join_code, host_user_id, status, seed, territory_count,
  continent_count, assignment_mode, max_seats
) values (
  'b1000000-0000-4000-8000-000000000001',
  'A1B2C3D4',
  'a2000000-0000-4000-8000-000000000002',
  'active',
  'legacy-account-required',
  12,
  2,
  'random',
  2
);
insert into public.room_members (room_id, user_id, display_name, role)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    'Registered Host',
    'host'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Legacy Guest',
    'member'
  );
insert into public.room_seats (
  room_id, seat_index, occupant_user_id, ready, claimed_at
) values
  (
    'b1000000-0000-4000-8000-000000000001',
    0,
    'a2000000-0000-4000-8000-000000000002',
    true,
    statement_timestamp()
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    1,
    'a1000000-0000-4000-8000-000000000001',
    true,
    statement_timestamp()
  );
insert into public.matches (
  id, room_id, status, revision, setup_snapshot, seat_order_snapshot,
  generator_metadata, planet_snapshot, state_snapshot, state_fingerprint
) values (
  'c1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'active',
  1,
  '{}'::jsonb,
  '[{"seatIndex":0,"userId":"a2000000-0000-4000-8000-000000000002","playerId":"player-01"},{"seatIndex":1,"userId":"a1000000-0000-4000-8000-000000000001","playerId":"player-02"}]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"matchId":"c1000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null,"events":[{"id":"event-1"}]}'::jsonb,
  repeat('a', 64)
);
insert into public.match_commands (
  match_id, sequence, actor_user_id, actor_seat_index, command_type,
  command_payload, command_hash, client_idempotency_key, previous_revision,
  resulting_revision, resulting_state_fingerprint
) values (
  'c1000000-0000-4000-8000-000000000001',
  1,
  'a2000000-0000-4000-8000-000000000002',
  0,
  'TEST',
  '{}'::jsonb,
  repeat('b', 64),
  'd1000000-0000-4000-8000-000000000001',
  0,
  1,
  repeat('a', 64)
);
insert into public.match_event_reactions (
  match_id, event_id, user_id, reaction
) values (
  'c1000000-0000-4000-8000-000000000001',
  'event-1',
  'a1000000-0000-4000-8000-000000000001',
  'fire'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","is_anonymous":true}',
  true
);
set local role authenticated;

select extensions.is(
  (select count(*)::integer from public.profiles),
  1,
  'anonymous user can read only their own profile'
);
select extensions.is(
  (
    select count(*)::integer from public.profiles
    where user_id = 'a2000000-0000-4000-8000-000000000002'
  ),
  0,
  'anonymous user cannot read another profile'
);
select extensions.is((select count(*)::integer from public.rooms), 0, 'anonymous user cannot select rooms');
select extensions.is((select count(*)::integer from public.room_members), 0, 'anonymous user cannot select room members');
select extensions.is((select count(*)::integer from public.room_seats), 0, 'anonymous user cannot select room seats');
select extensions.is((select count(*)::integer from public.matches), 0, 'anonymous user cannot select matches');
select extensions.is((select count(*)::integer from public.match_commands), 0, 'anonymous user cannot select match commands');
select extensions.is((select count(*)::integer from public.match_event_reactions), 0, 'anonymous user cannot select reactions');

select extensions.throws_ok(
  $$select public.create_room('Legacy Guest')$$,
  'P0001', 'account_required',
  'anonymous user cannot create replacement or rematch rooms'
);
select extensions.throws_ok(
  $$select public.join_room('A1B2C3D4', 'Legacy Guest')$$,
  'P0001', 'account_required',
  'anonymous user cannot join a room'
);
select extensions.throws_ok(
  $$select public.leave_room('b1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'account_required',
  'anonymous user cannot leave a room through the multiplayer RPC'
);
select extensions.throws_ok(
  $$select public.claim_room_seat('b1000000-0000-4000-8000-000000000001', 1)$$,
  'P0001', 'account_required',
  'anonymous user cannot claim a seat'
);
select extensions.throws_ok(
  $$select public.release_room_seat('b1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'account_required',
  'anonymous user cannot release a seat'
);
select extensions.throws_ok(
  $$select public.update_room_settings(
    'b1000000-0000-4000-8000-000000000001',
    'changed', 12, 2, 'random', 2
  )$$,
  'P0001', 'account_required',
  'anonymous user cannot update room configuration'
);
select extensions.throws_ok(
  $$select public.close_room('b1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'account_required',
  'anonymous user cannot close a room'
);
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    'c1000000-0000-4000-8000-000000000001', 'event-1', 'heart'
  )$$,
  'P0001', 'account_required',
  'anonymous user cannot mutate reactions'
);
select extensions.throws_ok(
  $$select public.start_room_match('b1000000-0000-4000-8000-000000000001')$$,
  '42501',
  'permission denied for function start_room_match',
  'anonymous browser role cannot call the retired match initializer'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.create_room('Missing Claim')$$,
  'P0001', 'account_required',
  'missing is_anonymous claim fails closed'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","is_anonymous":"false"}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.create_room('Malformed Claim')$$,
  'P0001', 'account_required',
  'malformed is_anonymous claim fails closed'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","is_anonymous":true}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.create_room('Forged Profile Capability')$$,
  'P0001', 'account_required',
  'profile and user metadata cannot grant registered capability'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.profiles),
  2,
  'registered user retains intended profile reads'
);
select extensions.is(
  (select count(*)::integer from public.rooms),
  1,
  'registered room member retains scoped room reads'
);
select extensions.lives_ok(
  $$select public.create_room(
    'Registered Host', 'registered-room', 12, 2, 'random', 2
  )$$,
  'registered user retains room creation'
);

reset role;
select extensions.is(
  (
    select count(*)::integer
    from public.rooms
    where id = 'b1000000-0000-4000-8000-000000000001'
  ),
  1,
  'existing multiplayer rows remain intact'
);
set local role service_role;
select extensions.is(
  (
    select count(*)::integer
    from public.matches
    where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  1,
  'service role retains active match access'
);

select * from extensions.finish();
rollback;
