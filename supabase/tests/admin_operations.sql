begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.account_moderation'::regclass),
  'account moderation has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_action_audit'::regclass),
  'admin audit has RLS enabled'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.account_moderation', 'SELECT')
    and not has_table_privilege('authenticated', 'public.admin_action_audit', 'SELECT'),
  'browser roles cannot read privileged administration tables'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.admin_server_health()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.admin_close_room(uuid,boolean)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.admin_purge_room(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.admin_cleanup_candidates()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.admin_retry_discord_announcement(uuid)', 'EXECUTE'),
  'browser roles cannot invoke server-only administration functions'
);

insert into auth.users (
  id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'admin-operations@example.invalid',
    false, '{}'::jsonb, '{}'::jsonb
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'blocked-operations@example.invalid',
    false, '{}'::jsonb, '{}'::jsonb
  );

insert into public.account_moderation (
  user_id, state, reason, updated_by
) values (
  'a2000000-0000-4000-8000-000000000002',
  'banned',
  'Database test moderation',
  'a1000000-0000-4000-8000-000000000001'
);

select extensions.is(
  admin_private.user_has_app_access('a1000000-0000-4000-8000-000000000001'),
  true,
  'active account retains application access'
);
select extensions.is(
  admin_private.user_has_app_access('a2000000-0000-4000-8000-000000000002'),
  false,
  'moderated account loses application access'
);
update public.account_moderation
set state = 'revoked'
where user_id = 'a2000000-0000-4000-8000-000000000002';
select extensions.is(
  admin_private.user_has_app_access('a2000000-0000-4000-8000-000000000002'),
  false,
  'revoked account remains blocked independently of Auth session validity'
);

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select public.ensure_own_profile()$$,
  'P0001',
  'account_blocked',
  'blocked account cannot mutate its profile through an existing JWT'
);
select extensions.throws_ok(
  $$select multiplayer_private.require_user_id()$$,
  'P0001',
  'account_blocked',
  'blocked account is rejected by the shared mutation boundary'
);

reset role;
set local role service_role;

insert into public.rooms (
  id, join_code, host_user_id, status, name, visibility, created_at, updated_at
) values
  (
    'a3000000-0000-4000-8000-000000000003',
    'A3A3A3A3',
    'a1000000-0000-4000-8000-000000000001',
    'waiting',
    'Closable room',
    'private',
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    'a4000000-0000-4000-8000-000000000004',
    'A4A4A4A4',
    'a1000000-0000-4000-8000-000000000001',
    'closed',
    'Purgeable room',
    'private',
    statement_timestamp() - interval '31 days',
    statement_timestamp() - interval '31 days'
  ),
  (
    'a5000000-0000-4000-8000-000000000005',
    'A5A5A5A5',
    'a1000000-0000-4000-8000-000000000001',
    'closed',
    'Historical room',
    'private',
    statement_timestamp() - interval '31 days',
    statement_timestamp() - interval '31 days'
  );

insert into public.matches (
  id, room_id, status, setup_snapshot, seat_order_snapshot, generator_metadata
) values (
  'a6000000-0000-4000-8000-000000000006',
  'a5000000-0000-4000-8000-000000000005',
  'closed',
  '{}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb
);

select public.admin_close_room('a3000000-0000-4000-8000-000000000003', false);
select extensions.is(
  (select status from public.rooms where id = 'a3000000-0000-4000-8000-000000000003'),
  'closed',
  'server function closes a waiting room'
);
select extensions.is(
  (public.admin_close_room(
    'a3000000-0000-4000-8000-000000000003',
    false
  ) ->> 'changed')::boolean,
  false,
  'a concurrent or repeated close is idempotent after the row lock'
);

select extensions.throws_ok(
  $$select public.admin_purge_room('a5000000-0000-4000-8000-000000000005')$$,
  'P0001',
  'room_not_purgeable',
  'room tied to match history cannot be purged'
);
select extensions.is(
  (
    select count(*)::integer
    from public.rooms
    where id = 'a5000000-0000-4000-8000-000000000005'
  ),
  1,
  'failed purge leaves the historical room intact transactionally'
);
select public.admin_purge_room('a4000000-0000-4000-8000-000000000004');
select extensions.is(
  (select count(*)::integer from public.rooms where id = 'a4000000-0000-4000-8000-000000000004'),
  0,
  'eligible closed room is purged'
);
select extensions.is(
  (public.admin_server_health() ? 'database_bytes'),
  true,
  'health snapshot includes database size'
);
select extensions.is(
  (public.admin_server_health() ? 'cleanup_candidates'),
  true,
  'health snapshot includes cleanup candidates'
);
select extensions.is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'admin-nightly-room-cleanup-dry-run'
  ),
  1,
  'nightly cleanup is scheduled in dry-run mode'
);

insert into public.admin_action_audit (
  actor_user_id, action, target_type, target_id, reason, request_id,
  idempotency_key, outcome
) values (
  'a1000000-0000-4000-8000-000000000001',
  'room_close',
  'room',
  'a3000000-0000-4000-8000-000000000003',
  'Database test action',
  'a7000000-0000-4000-8000-000000000007',
  'a8000000-0000-4000-8000-000000000008',
  'succeeded'
);
select extensions.throws_ok(
  $$update public.admin_action_audit set reason = 'Rewritten audit' where id = 1$$,
  '42501',
  null,
  'service role cannot update append-only audit rows'
);
select extensions.throws_ok(
  $$delete from public.admin_action_audit
    where idempotency_key = 'a8000000-0000-4000-8000-000000000008'$$,
  '42501',
  null,
  'service role cannot delete append-only audit rows'
);
select extensions.throws_ok(
  $$insert into public.admin_action_audit (
    actor_user_id, action, target_type, target_id, reason, request_id,
    idempotency_key, outcome
  ) values (
    'a1000000-0000-4000-8000-000000000001',
    'room_close', 'room', 'duplicate', 'Duplicate database test',
    'a9000000-0000-4000-8000-000000000009',
    'a8000000-0000-4000-8000-000000000008',
    'succeeded'
  )$$,
  '23505',
  null,
  'idempotency keys prevent duplicate audit actions'
);

select * from extensions.finish();
rollback;
