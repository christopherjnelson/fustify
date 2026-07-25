begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(19);

select extensions.is(
  (select count(*)::integer from public.discord_room_announcements),
  0,
  'the migration does not backfill existing rooms'
);

insert into auth.users (
  id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data
)
values
  (
    '63000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    false,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '63000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    false,
    '{}'::jsonb,
    '{}'::jsonb
  );

insert into public.rooms (
  id, join_code, host_user_id, status, visibility, name, max_seats, created_at
)
values
  (
    '64000000-0000-4000-8000-000000000001',
    '64000001',
    '63000000-0000-4000-8000-000000000001',
    'waiting',
    'private',
    'Publication candidate',
    3,
    statement_timestamp()
  ),
  (
    '64000000-0000-4000-8000-000000000002',
    '64000002',
    '63000000-0000-4000-8000-000000000001',
    'waiting',
    'private',
    'Still private',
    3,
    statement_timestamp()
  ),
  (
    '64000000-0000-4000-8000-000000000003',
    '64000003',
    '63000000-0000-4000-8000-000000000001',
    'waiting',
    'public',
    'Historical public insert',
    3,
    statement_timestamp()
  );

insert into public.room_members (
  room_id, user_id, display_name, role, last_active_at
)
values
  (
    '64000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    'Host',
    'host',
    statement_timestamp()
  ),
  (
    '64000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000001',
    'Host',
    'host',
    statement_timestamp()
  ),
  (
    '64000000-0000-4000-8000-000000000003',
    '63000000-0000-4000-8000-000000000001',
    'Host',
    'host',
    statement_timestamp()
  );

insert into public.room_seats (room_id, seat_index)
select rooms.id, generated.seat_index
from public.rooms
cross join lateral generate_series(0, rooms.max_seats - 1)
  as generated(seat_index)
where rooms.id between
  '64000000-0000-4000-8000-000000000001'::uuid
  and '64000000-0000-4000-8000-000000000003'::uuid;

set constraints all immediate;
select extensions.is(
  (select count(*)::integer from public.discord_room_announcements),
  0,
  'creation and historical public inserts are not announcement events'
);

update public.rooms
set revision = revision + 1
where id = '64000000-0000-4000-8000-000000000001';
update public.room_members
set last_active_at = statement_timestamp()
where room_id = '64000000-0000-4000-8000-000000000001';
insert into public.room_members (
  room_id, user_id, display_name, role
) values (
  '64000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000002',
  'Guest',
  'member'
);
delete from public.room_members
where room_id = '64000000-0000-4000-8000-000000000001'
  and user_id = '63000000-0000-4000-8000-000000000002';
set constraints all immediate;
select extensions.is(
  (select count(*)::integer from public.discord_room_announcements),
  0,
  'private settings, heartbeat, membership, and unrelated updates enqueue nothing'
);

set constraints all deferred;
update public.rooms
set visibility = 'public', join_code = null
where id = '64000000-0000-4000-8000-000000000001';
set constraints all immediate;
select extensions.is(
  (
    select count(*)::integer
    from public.discord_room_announcements
    where room_id = '64000000-0000-4000-8000-000000000001'
  ),
  1,
  'the private-to-public publication transition enqueues once'
);
select extensions.is(
  (
    select status
    from public.discord_room_announcements
    where room_id = '64000000-0000-4000-8000-000000000001'
  ),
  'pending',
  'a new publication announcement starts pending'
);

update public.rooms
set revision = revision + 1
where id = '64000000-0000-4000-8000-000000000001';
insert into public.room_members (
  room_id, user_id, display_name, role
) values (
  '64000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000002',
  'Guest',
  'member'
);
delete from public.room_members
where room_id = '64000000-0000-4000-8000-000000000001'
  and user_id = '63000000-0000-4000-8000-000000000002';
set constraints all immediate;
select extensions.is(
  (
    select count(*)::integer
    from public.discord_room_announcements
    where room_id = '64000000-0000-4000-8000-000000000001'
  ),
  1,
  'later room and occupancy changes cannot duplicate the publication outbox row'
);

select extensions.is(
  (
    select attempt_count
    from public.claim_discord_room_announcement(
      (
        select id
        from public.discord_room_announcements
        where room_id = '64000000-0000-4000-8000-000000000001'
      )
    )
  ),
  1,
  'the first service claim increments the attempt count atomically'
);
select extensions.is(
  (
    select count(*)::integer
    from public.claim_discord_room_announcement(
      (
        select id
        from public.discord_room_announcements
        where room_id = '64000000-0000-4000-8000-000000000001'
      )
    )
  ),
  0,
  'a concurrent or repeated delivery claim cannot acquire processing work'
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
    values ('64000000-0000-4000-8000-000000000002')$$,
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
  (select count(*)::integer from public.discord_room_announcement_config),
  1,
  'one protected formatting configuration record exists'
);
select extensions.is(
  (
    select include_seed::text || ':' || include_open_seats::text || ':' ||
      canonical_origin
    from public.discord_room_announcement_config
  ),
  'true:false:https://dev.fustify.com',
  'the payload requires the locked seed, stable capacity, and canonical production origin'
);
select extensions.ok(
  (
    select obj_description(
      'public.discord_room_announcement_config'::regclass
    ) like '%{{room_name}}%{{join_url}}%{{configuration_summary}}%'
  ),
  'the configuration documents its supported non-sensitive placeholders'
);
select extensions.ok(
  multiplayer_private.reset_discord_room_announcement(
    (
      select id
      from public.discord_room_announcements
      where room_id = '64000000-0000-4000-8000-000000000001'
    )
  ),
  'an operator retains the explicit manual retry reset for failed or stuck work'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.rooms'::regclass
      and tgname = 'rooms_queue_discord_announcement_on_publication'
      and not tgisinternal
  ),
  1,
  'one room trigger defines the shared publication announcement boundary'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_trigger
    where tgname in (
      'rooms_queue_discord_announcement_on_insert',
      'rooms_queue_discord_announcement_on_eligibility_update',
      'room_members_queue_discord_announcement_on_insert',
      'room_members_queue_discord_announcement_on_delete'
    )
      and not tgisinternal
  ),
  0,
  'creation, eligibility, and member triggers no longer announce rooms'
);

select * from extensions.finish();
rollback;
