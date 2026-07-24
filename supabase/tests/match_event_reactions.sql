begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(32);

insert into auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb),
  ('60000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb),
  ('60000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb),
  ('60000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb);

create temporary table reaction_fixture (
  label text primary key,
  room_id uuid not null,
  join_code text not null,
  match_id uuid not null
) on commit drop;
grant all on reaction_fixture to authenticated, service_role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into reaction_fixture
select
  'primary',
  id,
  join_code,
  '70000000-0000-4000-8000-000000000001'
from public.create_room('Reaction Host', 'reaction-primary', 12, 2, 'random', 3);
select public.claim_room_seat(
  (select room_id from reaction_fixture where label = 'primary'),
  0
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select public.join_room(
  (select join_code from reaction_fixture where label = 'primary'),
  'Reaction Guest'
);
select public.claim_room_seat(
  (select room_id from reaction_fixture where label = 'primary'),
  1
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select public.join_room(
  (select join_code from reaction_fixture where label = 'primary'),
  'Unseated Member'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into reaction_fixture
select
  'secondary',
  id,
  join_code,
  '70000000-0000-4000-8000-000000000002'
from public.create_room('Other Match Host', 'reaction-secondary', 12, 2, 'random', 2);
select public.claim_room_seat(
  (select room_id from reaction_fixture where label = 'secondary'),
  0
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select public.join_room(
  (select join_code from reaction_fixture where label = 'secondary'),
  'Other Match Guest'
);
select public.claim_room_seat(
  (select room_id from reaction_fixture where label = 'secondary'),
  1
);

reset role;
set local role service_role;
select public.authority_initialize_room_match(
  (select room_id from reaction_fixture where label = 'primary'),
  (select match_id from reaction_fixture where label = 'primary'),
  '60000000-0000-4000-8000-000000000001',
  '{"version":2}'::jsonb,
  '[{"seatIndex":0,"userId":"60000000-0000-4000-8000-000000000001","playerId":"player-01"},{"seatIndex":1,"userId":"60000000-0000-4000-8000-000000000002","playerId":"player-02"}]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"matchId":"70000000-0000-4000-8000-000000000001","activePlayerId":"player-01","winnerId":null,"events":[{"id":"event-1","turnNumber":1,"type":"turn-started","message":"Started."},{"turnNumber":1,"type":"turn-ended","message":"Legacy."}]}'::jsonb,
  repeat('a', 64)
);
select public.authority_initialize_room_match(
  (select room_id from reaction_fixture where label = 'secondary'),
  (select match_id from reaction_fixture where label = 'secondary'),
  '60000000-0000-4000-8000-000000000002',
  '{"version":2}'::jsonb,
  '[{"seatIndex":0,"userId":"60000000-0000-4000-8000-000000000002","playerId":"player-01"},{"seatIndex":1,"userId":"60000000-0000-4000-8000-000000000004","playerId":"player-02"}]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"matchId":"70000000-0000-4000-8000-000000000002","activePlayerId":"player-01","winnerId":null,"events":[{"id":"event-9","turnNumber":1,"type":"turn-started","message":"Started."}]}'::jsonb,
  repeat('b', 64)
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'fire'
  )$$,
  'claimed participant can set a valid reaction'
);
select extensions.is(
  (select count(*)::integer from public.match_event_reactions),
  1,
  'one desired reaction creates one row'
);
select extensions.lives_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'fire'
  )$$,
  'setting the existing desired reaction is an idempotent no-op'
);
select extensions.is(
  (select count(*)::integer from public.match_event_reactions),
  1,
  'idempotent retry does not duplicate the row'
);
select extensions.lives_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'laugh'
  )$$,
  'participant can replace the existing reaction'
);
select extensions.is(
  (select reaction from public.match_event_reactions),
  'laugh',
  'replacement stores the explicit desired reaction'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'heart'
  )$$,
  'a second claimed participant reacts independently'
);
select extensions.is(
  (select count(*)::integer from public.match_event_reactions),
  2,
  'one row is retained per participant and event'
);
select extensions.is(
  (
    select count(*) filter (where reaction = 'laugh')::integer
      + count(*) filter (where reaction = 'heart')::integer
    from public.match_event_reactions
  ),
  2,
  'aggregate counts derive from the two reaction rows'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', null
  )$$,
  'explicit null removes the caller reaction'
);
select extensions.is(
  (select count(*)::integer from public.match_event_reactions),
  1,
  'removal decrements exactly one aggregate row'
);
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'sparkles'
  )$$,
  'P0001',
  'invalid_event_reaction',
  'invalid stable reaction value is rejected'
);
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-404', 'fire'
  )$$,
  'P0001',
  'match_event_not_found',
  'invented event identity is rejected'
);
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-9', 'fire'
  )$$,
  'P0001',
  'match_event_not_found',
  'event identity from another match is rejected'
);
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'legacy', 'fire'
  )$$,
  'P0001',
  'match_event_not_found',
  'legacy event without canonical identity cannot receive reactions'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'fire'
  )$$,
  'P0001',
  'seat_required',
  'unseated room member cannot react'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'fire'
  )$$,
  'P0001',
  'seat_required',
  'non-member cannot react to another match'
);
select extensions.is(
  (select count(*)::integer from public.match_event_reactions),
  0,
  'non-member cannot read reactions from an inaccessible match'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok(
  $$insert into public.match_event_reactions (
    match_id, event_id, user_id, reaction
  ) values (
    '70000000-0000-4000-8000-000000000001', 'event-1',
    '60000000-0000-4000-8000-000000000001', 'angry'
  )$$,
  '42501',
  'permission denied for table match_event_reactions',
  'browser role cannot directly insert or act for another user'
);
select extensions.throws_ok(
  $$update public.match_event_reactions set reaction = 'angry'$$,
  '42501',
  'permission denied for table match_event_reactions',
  'browser role cannot directly update reactions'
);
select extensions.throws_ok(
  $$delete from public.match_event_reactions$$,
  '42501',
  'permission denied for table match_event_reactions',
  'browser role cannot directly delete reactions'
);

reset role;
select extensions.is(
  (
    select pg_get_function_arguments(oid)
    from pg_proc
    where oid = 'public.set_match_event_reaction(uuid,text,text)'::regprocedure
  ),
  'p_match_id uuid, p_event_id text, p_reaction text',
  'controlled RPC accepts no caller-supplied user identity'
);

set local role anon;
select extensions.throws_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'fire'
  )$$,
  '42501',
  'permission denied for function set_match_event_reaction',
  'unauthenticated browser role cannot execute the write RPC'
);

reset role;
select extensions.ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_event_reactions'
  ),
  'reaction rows are included in the Realtime publication'
);

set local role service_role;
update public.matches
set status = 'completed',
    winner_player_id = 'player-01',
    winner_user_id = '60000000-0000-4000-8000-000000000001'
where id = '70000000-0000-4000-8000-000000000001';

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok(
  $$select public.set_match_event_reaction(
    '70000000-0000-4000-8000-000000000001', 'event-1', 'angry'
  )$$,
  'claimed participant can react while reviewing a completed match'
);
select extensions.is(
  (
    select count(*)::integer
    from public.match_event_reactions
    where match_id = '70000000-0000-4000-8000-000000000001'
  ),
  2,
  'completed-match reaction preserves independent participant rows'
);
select extensions.is(
  (
    select revision
    from public.matches
    where id = '70000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'reaction writes do not change gameplay revision'
);
select extensions.is(
  (
    select state_fingerprint
    from public.matches
    where id = '70000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  'reaction writes do not change gameplay fingerprint'
);
select extensions.is(
  (
    select winner_user_id
    from public.matches
    where id = '70000000-0000-4000-8000-000000000001'
  ),
  '60000000-0000-4000-8000-000000000001'::uuid,
  'reaction writes do not change the winner'
);
select extensions.is(
  (
    select count(*)::integer
    from public.match_commands
    where match_id = '70000000-0000-4000-8000-000000000001'
  ),
  0,
  'reaction writes do not create gameplay commands'
);
select extensions.is(
  (
    select jsonb_array_length(state_snapshot -> 'events')
    from public.matches
    where id = '70000000-0000-4000-8000-000000000001'
  ),
  2,
  'reaction writes leave canonical event history unchanged'
);

reset role;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is(
  (
    select count(*)::integer
    from public.match_event_reactions
    where match_id = '70000000-0000-4000-8000-000000000001'
  ),
  2,
  'authorized participant can read completed-match aggregate rows'
);

select * from extensions.finish();
rollback;
