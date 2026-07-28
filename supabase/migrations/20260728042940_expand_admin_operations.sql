create table public.account_moderation (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null default 'active',
  banned_until timestamptz,
  revoked_after timestamptz,
  reason text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_moderation_state_valid
    check (state in ('active', 'banned', 'revoked', 'deleted')),
  constraint account_moderation_reason_valid
    check (
      reason is null
      or (
        reason = btrim(reason)
        and char_length(reason) between 3 and 500
        and reason !~ '[[:cntrl:]]'
      )
    )
);

create trigger account_moderation_set_updated_at
before update on public.account_moderation
for each row execute function multiplayer_private.set_updated_at();

create table public.admin_action_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  request_id uuid not null,
  idempotency_key uuid not null,
  outcome text not null,
  error_code text,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint admin_action_audit_action_valid
    check (
      action = btrim(action)
      and char_length(action) between 3 and 80
      and action ~ '^[a-z0-9_]+$'
    ),
  constraint admin_action_audit_target_type_valid
    check (
      target_type = btrim(target_type)
      and char_length(target_type) between 3 and 40
      and target_type ~ '^[a-z0-9_]+$'
    ),
  constraint admin_action_audit_target_id_valid
    check (char_length(target_id) between 1 and 200),
  constraint admin_action_audit_reason_valid
    check (
      reason = btrim(reason)
      and char_length(reason) between 3 and 500
      and reason !~ '[[:cntrl:]]'
    ),
  constraint admin_action_audit_outcome_valid
    check (outcome in ('succeeded', 'failed')),
  constraint admin_action_audit_error_code_valid
    check (
      error_code is null
      or (
        char_length(error_code) between 1 and 80
        and error_code ~ '^[a-z0-9_]+$'
      )
    ),
  constraint admin_action_audit_before_object
    check (
      before_summary is null
      or jsonb_typeof(before_summary) = 'object'
    ),
  constraint admin_action_audit_after_object
    check (
      after_summary is null
      or jsonb_typeof(after_summary) = 'object'
    ),
  unique (actor_user_id, idempotency_key)
);

create index admin_action_audit_created_idx
  on public.admin_action_audit (created_at desc, id desc);
create index account_moderation_state_idx
  on public.account_moderation (state, updated_at desc);

alter table public.account_moderation enable row level security;
alter table public.admin_action_audit enable row level security;

revoke all on public.account_moderation, public.admin_action_audit
  from public, anon, authenticated;
grant select, insert, update, delete on public.account_moderation
  to service_role;
grant select, insert on public.admin_action_audit
  to service_role;
grant usage, select on sequence public.admin_action_audit_id_seq
  to service_role;

create function admin_private.user_has_app_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and exists (
      select 1
      from auth.users
      where users.id = p_user_id
        and users.deleted_at is null
        and (
          users.banned_until is null
          or users.banned_until <= statement_timestamp()
        )
    )
    and not exists (
      select 1
      from public.account_moderation
      where account_moderation.user_id = p_user_id
        and (
          account_moderation.state = 'deleted'
          or account_moderation.state = 'revoked'
          or (
            account_moderation.state = 'banned'
            and (
              account_moderation.banned_until is null
              or account_moderation.banned_until > statement_timestamp()
            )
          )
        )
    );
$$;

create or replace function multiplayer_private.require_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not profile_private.current_user_is_registered() then
    raise exception using errcode = 'P0001', message = 'account_required';
  end if;
  if not admin_private.user_has_app_access(caller_id) then
    raise exception using errcode = 'P0001', message = 'account_blocked';
  end if;
  return caller_id;
end;
$$;

create or replace function multiplayer_private.is_room_member(
  target_room_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile_private.current_user_is_registered()
    and admin_private.user_has_app_access(auth.uid())
    and exists (
      select 1
      from public.room_members
      where room_members.room_id = target_room_id
        and room_members.user_id = auth.uid()
    );
$$;

create or replace function profile_private.current_user_is_registered()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() -> 'is_anonymous' = 'false'::jsonb, false)
    and admin_private.user_has_app_access(auth.uid());
$$;

create or replace function public.ensure_own_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  user_metadata jsonb;
  user_is_anonymous boolean;
  ensured_profile public.profiles;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not admin_private.user_has_app_access(caller_id) then
    raise exception using errcode = 'P0001', message = 'account_blocked';
  end if;

  select users.raw_user_meta_data, users.is_anonymous
  into user_metadata, user_is_anonymous
  from auth.users as users
  where users.id = caller_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;

  insert into public.profiles (user_id, display_name)
  values (
    caller_id,
    case
      when user_is_anonymous is true
        then profile_private.derive_guest_display_name(caller_id)
      else profile_private.derive_display_name(caller_id, user_metadata)
    end
  )
  on conflict (user_id) do nothing;

  select profiles.*
  into ensured_profile
  from public.profiles as profiles
  where profiles.user_id = caller_id;

  return ensured_profile;
end;
$$;

alter policy room_thumbnail_host_insert
on storage.objects
with check (
  admin_private.user_has_app_access((select auth.uid()))
  and bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

alter policy room_thumbnail_host_update
on storage.objects
using (
  admin_private.user_has_app_access((select auth.uid()))
  and bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
)
with check (
  admin_private.user_has_app_access((select auth.uid()))
  and bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

alter policy room_thumbnail_host_delete
on storage.objects
using (
  admin_private.user_has_app_access((select auth.uid()))
  and bucket_id = 'room-thumbnails'
  and exists (
    select 1
    from public.rooms
    where rooms.host_user_id = (select auth.uid())
      and rooms.visibility = 'public'
      and storage.objects.name = rooms.id::text || '/world.webp'
  )
);

create function public.admin_server_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'generated_at', statement_timestamp(),
    'database_bytes', pg_database_size(current_database()),
    'database_connections', (
      select count(*)
      from pg_stat_activity
      where datname = current_database()
    ),
    'registered_accounts', (
      select count(*) from auth.users
      where is_anonymous is false and deleted_at is null
    ),
    'anonymous_accounts', (
      select count(*) from auth.users
      where is_anonymous is true and deleted_at is null
    ),
    'banned_accounts', (
      select count(*) from public.account_moderation
      where state = 'banned'
        and (banned_until is null or banned_until > statement_timestamp())
    ),
    'cleanup_candidates', (
      select count(*)
      from public.rooms
      where rooms.status = 'closed'
        and rooms.updated_at < statement_timestamp() - interval '30 days'
        and not exists (
          select 1 from public.room_members
          where room_members.room_id = rooms.id
        )
        and not exists (
          select 1 from public.matches
          where matches.room_id = rooms.id
        )
    ),
    'stuck_launches', (
      select count(*)
      from multiplayer_private.match_launches
      where started_at < statement_timestamp() - interval '5 minutes'
    ),
    'announcement_attention', (
      select count(*)
      from public.discord_room_announcements
      where status in ('failed', 'processing', 'pending')
    ),
    'thumbnail_objects', (
      select count(*)
      from storage.objects
      where bucket_id = 'room-thumbnails'
    ),
    'thumbnail_bytes', (
      select coalesce(sum((metadata ->> 'size')::bigint), 0)
      from storage.objects
      where bucket_id = 'room-thumbnails'
    ),
    'orphan_thumbnails', (
      select count(*)
      from storage.objects
      where bucket_id = 'room-thumbnails'
        and not exists (
          select 1 from public.rooms
          where rooms.thumbnail_path = storage.objects.name
        )
    ),
    'cron_failures_24h', (
      select count(*)
      from cron.job_run_details
      where status = 'failed'
        and start_time >= statement_timestamp() - interval '24 hours'
    ),
    'missing_profiles', (
      select count(*)
      from auth.users
      where users.deleted_at is null
        and not exists (
          select 1 from public.profiles
          where profiles.user_id = users.id
        )
    ),
    'inconsistent_rooms', (
      select count(*)
      from public.rooms
      where not exists (
        select 1 from public.room_members
        where room_members.room_id = rooms.id
          and room_members.user_id = rooms.host_user_id
          and room_members.role = 'host'
      )
      or (
        rooms.status = 'waiting'
        and exists (
          select 1 from public.matches
          where matches.room_id = rooms.id
        )
      )
    ),
    'incomplete_matches', (
      select count(*)
      from public.matches
      where status = 'preview'
        or (
          status in ('active', 'completed')
          and (
            planet_snapshot is null
            or state_snapshot is null
            or state_fingerprint is null
          )
        )
    ),
    'latest_migration', (
      select max(version)
      from supabase_migrations.schema_migrations
    ),
    'cache_hit_ratio', (
      select coalesce(
        sum(blks_hit)::numeric
          / nullif(sum(blks_hit + blks_read), 0),
        1
      )
      from pg_stat_database
      where datname = current_database()
    ),
    'index_hit_ratio', (
      select coalesce(
        sum(idx_blks_hit)::numeric
          / nullif(sum(idx_blks_hit + idx_blks_read), 0),
        1
      )
      from pg_statio_user_indexes
    ),
    'largest_tables', (
      select coalesce(jsonb_agg(table_health order by total_bytes desc), '[]'::jsonb)
      from (
        select
          schemaname,
          relname,
          pg_total_relation_size(relid) as total_bytes,
          n_live_tup,
          n_dead_tup
        from pg_stat_user_tables
        order by pg_total_relation_size(relid) desc
        limit 10
      ) as table_health
    ),
    'trends', jsonb_build_object(
      'accounts_24h', (
        select count(*) from auth.users
        where created_at >= statement_timestamp() - interval '24 hours'
      ),
      'accounts_30d', (
        select count(*) from auth.users
        where created_at >= statement_timestamp() - interval '30 days'
      ),
      'commands_24h', (
        select count(*) from public.match_commands
        where created_at >= statement_timestamp() - interval '24 hours'
      ),
      'rooms_24h', (
        select count(*) from public.rooms
        where created_at >= statement_timestamp() - interval '24 hours'
      ),
      'matches_completed_30d', (
        select count(*) from public.matches
        where status = 'completed'
          and updated_at >= statement_timestamp() - interval '30 days'
      )
    )
  );
$$;

create function public.admin_cleanup_candidates()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rooms.id,
        'name', rooms.name,
        'updated_at', rooms.updated_at,
        'thumbnail_path', rooms.thumbnail_path
      )
      order by rooms.updated_at
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.rooms
    where status = 'closed'
      and updated_at < statement_timestamp() - interval '30 days'
      and not exists (
        select 1 from public.room_members
        where room_members.room_id = rooms.id
      )
      and not exists (
        select 1 from public.matches
        where matches.room_id = rooms.id
      )
    order by updated_at
    limit 100
  ) as rooms;
$$;

create function admin_private.nightly_room_cleanup_dry_run()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.rooms
  where status = 'closed'
    and updated_at < statement_timestamp() - interval '30 days'
    and not exists (
      select 1 from public.room_members
      where room_members.room_id = rooms.id
    )
    and not exists (
      select 1 from public.matches
      where matches.room_id = rooms.id
    );
$$;

select cron.schedule(
  'admin-nightly-room-cleanup-dry-run',
  '17 3 * * *',
  'select admin_private.nightly_room_cleanup_dry_run()'
);

create function public.admin_retry_discord_announcement(
  p_announcement_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.discord_room_announcements;
begin
  select * into target
  from public.discord_room_announcements
  where id = p_announcement_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'announcement_not_found';
  end if;
  if target.status = 'processing'
    and target.updated_at > statement_timestamp() - interval '10 minutes' then
    raise exception using errcode = 'P0001', message = 'announcement_not_stuck';
  end if;
  if target.status not in ('failed', 'processing') then
    raise exception using errcode = 'P0001', message = 'announcement_not_retryable';
  end if;

  return multiplayer_private.reset_discord_room_announcement(
    p_announcement_id
  );
end;
$$;

create function public.admin_close_room(
  p_room_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.rooms;
begin
  select * into target
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target.status = 'closed' then
    return jsonb_build_object('changed', false, 'status', 'closed');
  end if;
  if target.status = 'active' and not p_force then
    raise exception using errcode = 'P0001', message = 'force_required';
  end if;

  update public.matches
  set status = 'closed'
  where room_id = p_room_id
    and status <> 'completed';

  delete from multiplayer_private.match_launches
  where room_id = p_room_id;

  update public.rooms
  set status = 'closed',
      revision = revision + 1
  where id = p_room_id;

  return jsonb_build_object('changed', true, 'status', 'closed');
end;
$$;

create function public.admin_purge_room(p_room_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.rooms;
begin
  select * into target
  from public.rooms
  where rooms.id = p_room_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target.status <> 'closed'
    or exists (
      select 1 from public.room_members
      where room_members.room_id = p_room_id
    )
    or exists (
      select 1 from public.matches
      where matches.room_id = p_room_id
    ) then
    raise exception using errcode = 'P0001', message = 'room_not_purgeable';
  end if;

  delete from public.discord_room_announcements
  where room_id = p_room_id;
  delete from public.rooms where id = p_room_id;

  return jsonb_build_object(
    'purged', true,
    'thumbnail_path', target.thumbnail_path
  );
end;
$$;

revoke all on function admin_private.user_has_app_access(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_server_health()
  from public, anon, authenticated;
revoke all on function public.admin_cleanup_candidates()
  from public, anon, authenticated;
revoke all on function admin_private.nightly_room_cleanup_dry_run()
  from public, anon, authenticated, service_role;
revoke all on function public.admin_retry_discord_announcement(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_close_room(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.admin_purge_room(uuid)
  from public, anon, authenticated;

grant execute on function public.admin_server_health() to service_role;
grant execute on function public.admin_cleanup_candidates() to service_role;
grant execute on function public.admin_retry_discord_announcement(uuid)
  to service_role;
grant execute on function public.admin_close_room(uuid, boolean)
  to service_role;
grant execute on function public.admin_purge_room(uuid) to service_role;

comment on table public.admin_action_audit is
  'Append-only record of privileged Fustify administration actions.';
comment on table public.account_moderation is
  'Application-owned immediate access enforcement for Auth accounts.';
