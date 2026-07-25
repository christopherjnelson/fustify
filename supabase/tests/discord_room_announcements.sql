begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(21);

select extensions.is(
  (select count(*)::integer from public.discord_room_announcements),
  0,
  'the migration does not backfill existing rooms'
);

insert into auth.users (
  id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', false, '{}'::jsonb, '{}'::jsonb);

insert into public.rooms (
  id, join_code, host_user_id, status, visibility, name, max_seats, created_at
)
values
  ('64000000-0000-4000-8000-000000000001', '64000001', '63000000-0000-4000-8000-000000000001', 'waiting', 'public', 'Eligible public', 3, statement_timestamp()),
  ('64000000-0000-4000-8000-000000000002', '64000002', '63000000-0000-4000-8000-000000000001', 'waiting', 'private', 'Initially private', 3, statement_timestamp()),
  ('64000000-0000-4000-8000-000000000003', '64000003', '63000000-0000-4000-8000-000000000001', 'closed', 'public', 'Closed', 3, statement_timestamp()),
  ('64000000-0000-4000-8000-000000000004', '64000004', '63000000-0000-4000-8000-000000000001', 'active', 'public', 'Active', 3, statement_timestamp()),
  ('64000000-0000-4000-8000-000000000005', '64000005', '63000000-0000-4000-8000-000000000001', 'waiting', 'public', 'Full', 2, statement_timestamp()),
  ('64000000-0000-4000-8000-000000000006', '64000006', '63000000-0000-4000-8000-000000000001', 'closed', 'public', 'Expired lifecycle', 3, statement_timestamp() - interval '20 minutes');

insert into public.room_members (
  room_id, user_id, display_name, role, last_active_at
)
values
  ('64000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'Host', 'host', statement_timestamp()),
  ('64000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000001', 'Host', 'host', statement_timestamp()),
  ('64000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', 'Host', 'host', statement_timestamp()),
  ('64000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000001', 'Host', 'host', statement_timestamp()),
  ('64000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000001', 'Host', 'host', statement_timestamp()),
  ('64000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000002', 'Guest', 'member', statement_timestamp()),
  ('64000000-0000-4000-8000-000000000006', '63000000-0000-4000-8000-000000000001', 'Host', 'host', statement_timestamp() - interval '20 minutes');

insert into public.room_seats (room_id, seat_index)
select rooms.id, generated.seat_index
from public.rooms
cross join lateral generate_series(0, rooms.max_seats - 1)
  as generated(seat_index)
where rooms.id between
  '64000000-0000-4000-8000-000000000001'::uuid
  and '64000000-0000-4000-8000-000000000006'::uuid;

set constraints all immediate;

select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000001'),
  1,
  'an eligible public room insertion produces one announcement'
);
select extensions.is(
  (select status
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000001'),
  'pending',
  'a new eligible announcement starts pending'
);
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000002'),
  0,
  'a private room insertion does not enqueue'
);
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id in (
     '64000000-0000-4000-8000-000000000003',
     '64000000-0000-4000-8000-000000000004'
   )),
  0,
  'closed and non-waiting rooms do not enqueue'
);
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000005'),
  0,
  'a full room does not enqueue'
);
select extensions.is(
  (select status
   from public.rooms
   where id = '64000000-0000-4000-8000-000000000006'),
  'closed',
  'expiration is represented by the closed lifecycle state'
);
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000006'),
  0,
  'an expired room does not enqueue'
);

set constraints all deferred;
update public.rooms
set visibility = 'public'
where id = '64000000-0000-4000-8000-000000000002';
set constraints all immediate;
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000002'),
  1,
  'a private-to-public transition enqueues once'
);

update public.room_members
set last_active_at = statement_timestamp()
where room_id = '64000000-0000-4000-8000-000000000001';
insert into public.room_members (
  room_id, user_id, display_name, role
)
values (
  '64000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000002',
  'Guest',
  'member'
);
delete from public.room_members
where room_id = '64000000-0000-4000-8000-000000000001'
  and user_id = '63000000-0000-4000-8000-000000000002';
update public.rooms
set revision = revision + 1
where id = '64000000-0000-4000-8000-000000000001';
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000001'),
  1,
  'heartbeats, joins, leaves, and unrelated room updates do not duplicate'
);

set constraints all deferred;
update public.rooms
set visibility = 'private'
where id = '64000000-0000-4000-8000-000000000001';
update public.rooms
set visibility = 'public'
where id = '64000000-0000-4000-8000-000000000001';
set constraints all immediate;
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcements
   where room_id = '64000000-0000-4000-8000-000000000001'),
  1,
  'repeated eligibility evaluation remains unique per room'
);

select extensions.is(
  (select attempt_count
   from public.claim_discord_room_announcement(
     (select id
      from public.discord_room_announcements
      where room_id = '64000000-0000-4000-8000-000000000001')
   )),
  1,
  'the first service claim increments the attempt count atomically'
);
select extensions.is(
  (select count(*)::integer
   from public.claim_discord_room_announcement(
     (select id
      from public.discord_room_announcements
      where room_id = '64000000-0000-4000-8000-000000000001')
   )),
  0,
  'a concurrent or repeated claim cannot acquire a processing row'
);

set local role anon;
select extensions.throws_ok(
  $$select * from public.discord_room_announcements$$,
  '42501',
  'permission denied for table discord_room_announcements',
  'anonymous clients cannot read the outbox'
);
select extensions.throws_ok(
  $$select * from public.discord_room_announcement_config$$,
  '42501',
  'permission denied for table discord_room_announcement_config',
  'anonymous clients cannot read announcement configuration'
);
select extensions.throws_ok(
  $$insert into public.discord_room_announcements (room_id)
    values ('64000000-0000-4000-8000-000000000003')$$,
  '42501',
  'permission denied for table discord_room_announcements',
  'anonymous clients cannot mutate the outbox'
);

reset role;
set local role authenticated;
select extensions.throws_ok(
  $$update public.discord_room_announcement_config set enabled = false$$,
  '42501',
  'permission denied for table discord_room_announcement_config',
  'authenticated clients cannot mutate announcement configuration'
);
select extensions.throws_ok(
  $$select * from public.claim_discord_room_announcement(
    '61000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'permission denied for function claim_discord_room_announcement',
  'authenticated clients cannot claim outbox work'
);

reset role;
select extensions.is(
  (select count(*)::integer
   from public.discord_room_announcement_config),
  1,
  'one protected formatting configuration record exists'
);
select extensions.ok(
  (
    select obj_description(
      'public.discord_room_announcement_config'::regclass
    ) like '%{{room_name}}%{{join_url}}%{{configuration_summary}}%'
  ),
  'the configuration documents its supported placeholders'
);
select extensions.ok(
  multiplayer_private.reset_discord_room_announcement(
    (select id
     from public.discord_room_announcements
     where room_id = '64000000-0000-4000-8000-000000000001')
  ),
  'an operator has an explicit manual retry reset for failed or stuck work'
);

select * from extensions.finish();
rollback;
