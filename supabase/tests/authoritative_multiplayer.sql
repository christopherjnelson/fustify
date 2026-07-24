begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

insert into auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

create temporary table authority_fixture (room_id uuid, join_code text) on commit drop;
grant all on authority_fixture to authenticated, service_role;
insert into authority_fixture
select id, join_code
from public.create_room('Authority Host', 'authority-test', 12, 2, 'random', 2);
select public.claim_room_seat((select room_id from authority_fixture), 0);

reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000002","is_anonymous":false}', true);
set local role authenticated;
select public.join_room(
  (select join_code from authority_fixture),
  'Authority Guest'
);
select public.claim_room_seat((select room_id from authority_fixture), 1);

reset role;
set local role service_role;
select public.authority_initialize_room_match(
  (select room_id from authority_fixture),
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '{"version":2,"assignmentMode":"random"}'::jsonb,
  '[{"seatIndex":0,"userId":"30000000-0000-4000-8000-000000000001","playerId":"player-01"},{"seatIndex":1,"userId":"30000000-0000-4000-8000-000000000002","playerId":"player-02"}]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
  repeat('a', 64)
);

select extensions.is(
  (select status from public.matches where id = '40000000-0000-4000-8000-000000000001'),
  'active',
  'trusted initialization activates the canonical match'
);
select extensions.is(
  (select revision from public.matches where id = '40000000-0000-4000-8000-000000000001'),
  0::bigint,
  'authoritative match begins at revision zero'
);

select * from public.authority_commit_match_command(
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  0,
  'PLACE_REINFORCEMENT',
  '{"type":"PLACE_REINFORCEMENT","territoryId":"territory-1","amount":1}'::jsonb,
  repeat('b', 64),
  '50000000-0000-4000-8000-000000000001',
  '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
  repeat('c', 64),
  null,
  null
);
select extensions.is(
  (select revision from public.matches where id = '40000000-0000-4000-8000-000000000001'),
  1::bigint,
  'accepted command increments revision exactly once'
);
select extensions.is(
  (
    select count(*)::integer
    from public.match_commands
    where match_id = '40000000-0000-4000-8000-000000000001'
  ),
  1,
  'accepted command appends exactly one audit record'
);

select * from public.authority_commit_match_command(
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  0,
  'PLACE_REINFORCEMENT',
  '{"type":"PLACE_REINFORCEMENT","territoryId":"territory-1","amount":1}'::jsonb,
  repeat('b', 64),
  '50000000-0000-4000-8000-000000000001',
  '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
  repeat('c', 64),
  null,
  null
);
select extensions.is(
  (
    select count(*)::integer
    from public.match_commands
    where match_id = '40000000-0000-4000-8000-000000000001'
  ),
  1,
  'same idempotency key and payload is not applied twice'
);
select extensions.is(
  (select revision from public.matches where id = '40000000-0000-4000-8000-000000000001'),
  1::bigint,
  'idempotent retry preserves the accepted revision'
);

select extensions.throws_ok(
  $$select * from public.authority_commit_match_command(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 1,
    'END_ATTACK_PHASE', '{"type":"END_ATTACK_PHASE"}'::jsonb,
    repeat('d', 64), '50000000-0000-4000-8000-000000000001',
    '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
    repeat('e', 64), null, null
  )$$,
  'P0001', 'idempotency_conflict',
  'reused idempotency key with a different command is rejected'
);
select extensions.throws_ok(
  $$select * from public.authority_commit_match_command(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 0,
    'END_ATTACK_PHASE', '{"type":"END_ATTACK_PHASE"}'::jsonb,
    repeat('d', 64), '50000000-0000-4000-8000-000000000002',
    '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
    repeat('e', 64), null, null
  )$$,
  'P0001', 'revision_conflict',
  'stale expected revision is rejected'
);
select extensions.throws_ok(
  $$select * from public.authority_commit_match_command(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002', 1,
    'END_ATTACK_PHASE', '{"type":"END_ATTACK_PHASE"}'::jsonb,
    repeat('d', 64), '50000000-0000-4000-8000-000000000003',
    '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
    repeat('e', 64), null, null
  )$$,
  'P0001', 'not_your_turn',
  'seated player cannot act outside their turn'
);
select extensions.throws_ok(
  $$select * from public.authority_commit_match_command(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003', 1,
    'END_ATTACK_PHASE', '{"type":"END_ATTACK_PHASE"}'::jsonb,
    repeat('d', 64), '50000000-0000-4000-8000-000000000004',
    '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
    repeat('e', 64), null, null
  )$$,
  'P0001', 'seat_required',
  'room outsider without a seat cannot commit'
);

reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;
select extensions.throws_ok(
  $$update public.matches set revision = 99$$,
  '42501', 'permission denied for table matches',
  'browser cannot modify revision or state'
);
select extensions.throws_ok(
  $$insert into public.match_commands (
    match_id, sequence, actor_user_id, actor_seat_index, command_type,
    command_payload, command_hash, client_idempotency_key, previous_revision,
    resulting_revision, resulting_state_fingerprint
  ) values (
    '40000000-0000-4000-8000-000000000001', 2,
    '30000000-0000-4000-8000-000000000001', 0, 'ATTACK', '{}', repeat('a',64),
    '50000000-0000-4000-8000-000000000005', 1, 2, repeat('a',64)
  )$$,
  '42501', 'permission denied for table match_commands',
  'browser cannot fabricate command log rows'
);
select extensions.throws_ok(
  $$select * from public.authority_commit_match_command(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 1,
    'END_ATTACK_PHASE', '{"type":"END_ATTACK_PHASE"}'::jsonb,
    repeat('d', 64), '50000000-0000-4000-8000-000000000006',
    '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null}'::jsonb,
    repeat('e', 64), null, null
  )$$,
  '42501', 'permission denied for function authority_commit_match_command',
  'browser cannot invoke the trusted commit function'
);

reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000003","is_anonymous":false}', true);
set local role authenticated;
select extensions.is(
  (select count(*)::integer from public.matches),
  0,
  'non-member cannot read canonical match state'
);
select extensions.is(
  (select count(*)::integer from public.match_commands),
  0,
  'non-member cannot read command history'
);

reset role;
set local role service_role;
select * from public.authority_commit_match_command(
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 1,
  'ATTACK', '{"type":"ATTACK"}'::jsonb,
  repeat('f', 64), '50000000-0000-4000-8000-000000000007',
  '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","phase":"capture","pendingCapture":{"fromTerritoryId":"a","toTerritoryId":"b"},"winnerId":"player-01"}'::jsonb,
  repeat('1', 64), 'player-01', '30000000-0000-4000-8000-000000000001'
);
select extensions.is(
  (select status from public.matches where id = '40000000-0000-4000-8000-000000000001'),
  'active',
  'a winner with mandatory capture movement remains active'
);
select * from public.authority_commit_match_command(
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 2,
  'MOVE_AFTER_CAPTURE', '{"type":"MOVE_AFTER_CAPTURE"}'::jsonb,
  repeat('4', 64), '50000000-0000-4000-8000-000000000009',
  '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","phase":"game-over","winnerId":"player-01"}'::jsonb,
  repeat('5', 64), 'player-01', '30000000-0000-4000-8000-000000000001'
);
select extensions.is(
  (select status from public.matches where id = '40000000-0000-4000-8000-000000000001'),
  'completed',
  'winner commit marks the match completed'
);
select extensions.throws_ok(
  $$select * from public.authority_commit_match_command(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 3,
    'END_TURN', '{"type":"END_TURN"}'::jsonb,
    repeat('2', 64), '50000000-0000-4000-8000-000000000008',
    '{"matchId":"40000000-0000-4000-8000-000000000001","activePlayerId":"player-01","phase":"game-over","winnerId":"player-01"}'::jsonb,
    repeat('3', 64), 'player-01', '30000000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'match_completed',
  'completed match rejects later commands'
);

select * from extensions.finish();
rollback;
