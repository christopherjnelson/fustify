create extension if not exists pg_net with schema extensions;

create table public.discord_room_announcement_config (
  id boolean primary key default true,
  enabled boolean not null default false,
  webhook_username text not null default 'Fustify',
  avatar_url text,
  embed_title_template text not null
    default 'New public room: {{room_name}}',
  embed_description_template text not null
    default '[Join {{room_name}}]({{join_url}})',
  embed_color integer not null default 9134824,
  footer_text text,
  canonical_origin text not null default 'https://dev.fustify.com',
  include_seed boolean not null default false,
  include_open_seats boolean not null default true,
  include_configuration_summary boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint discord_room_announcement_config_singleton check (id),
  constraint discord_room_announcement_config_username_valid check (
    webhook_username = btrim(webhook_username)
    and char_length(webhook_username) between 1 and 80
  ),
  constraint discord_room_announcement_config_avatar_valid check (
    avatar_url is null
    or (
      avatar_url = btrim(avatar_url)
      and char_length(avatar_url) between 1 and 2048
      and avatar_url ~ '^https://'
    )
  ),
  constraint discord_room_announcement_config_title_valid check (
    embed_title_template = btrim(embed_title_template)
    and char_length(embed_title_template) between 1 and 512
  ),
  constraint discord_room_announcement_config_description_valid check (
    embed_description_template = btrim(embed_description_template)
    and char_length(embed_description_template) between 1 and 4096
  ),
  constraint discord_room_announcement_config_color_valid check (
    embed_color between 0 and 16777215
  ),
  constraint discord_room_announcement_config_footer_valid check (
    footer_text is null
    or (
      footer_text = btrim(footer_text)
      and char_length(footer_text) between 1 and 2048
    )
  ),
  constraint discord_room_announcement_config_origin_valid check (
    canonical_origin = btrim(canonical_origin)
    and char_length(canonical_origin) between 1 and 2048
    and canonical_origin ~ '^https://[^/?#]+$'
  )
);

comment on table public.discord_room_announcement_config is
  'Studio-editable Discord announcement formatting. Supported placeholders: {{room_name}}, {{join_url}}, {{open_seats}}, {{max_seats}}, {{seed}}, {{territory_count}}, {{continent_count}}, {{assignment_mode}}, and {{configuration_summary}}.';

insert into public.discord_room_announcement_config (id)
values (true);

create trigger discord_room_announcement_config_set_updated_at
before update on public.discord_room_announcement_config
for each row execute function multiplayer_private.set_updated_at();

create table public.discord_room_announcements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.rooms (id) on delete restrict,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  processing_at timestamptz,
  sent_at timestamptz,
  discord_message_id text,
  last_error text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint discord_room_announcements_room_unique unique (room_id),
  constraint discord_room_announcements_status_valid check (
    status in ('pending', 'processing', 'sent', 'failed', 'skipped')
  ),
  constraint discord_room_announcements_attempt_count_valid check (
    attempt_count >= 0
  ),
  constraint discord_room_announcements_message_id_valid check (
    discord_message_id is null
    or (
      char_length(discord_message_id) between 1 and 32
      and discord_message_id ~ '^[0-9]+$'
    )
  ),
  constraint discord_room_announcements_error_valid check (
    last_error is null or char_length(last_error) <= 200
  )
);

create trigger discord_room_announcements_set_updated_at
before update on public.discord_room_announcements
for each row execute function multiplayer_private.set_updated_at();

alter table public.discord_room_announcement_config enable row level security;
alter table public.discord_room_announcements enable row level security;

revoke all on table public.discord_room_announcement_config
  from public, anon, authenticated;
revoke all on table public.discord_room_announcements
  from public, anon, authenticated;
grant select on table public.discord_room_announcement_config to service_role;
grant select, update on table public.discord_room_announcements to service_role;

create function multiplayer_private.queue_discord_room_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room_id uuid;
begin
  if tg_table_name = 'rooms' then
    target_room_id := new.id;
  elsif tg_op = 'DELETE' then
    target_room_id := old.room_id;
  else
    target_room_id := new.room_id;
  end if;

  insert into public.discord_room_announcements (room_id)
  select rooms.id
  from public.rooms
  where rooms.id = target_room_id
    and rooms.visibility = 'public'
    and rooms.status = 'waiting'
    and (
      select count(*)
      from public.room_members
      where room_members.room_id = rooms.id
    ) < rooms.max_seats
    and (
      select count(*)
      from public.room_seats
      where room_seats.room_id = rooms.id
    ) = rooms.max_seats
  on conflict on constraint discord_room_announcements_room_unique do nothing;

  return new;
end;
$$;

alter function multiplayer_private.queue_discord_room_announcement()
  owner to postgres;
revoke all on function multiplayer_private.queue_discord_room_announcement()
  from public, anon, authenticated, service_role;

create constraint trigger rooms_queue_discord_announcement_on_insert
after insert on public.rooms
deferrable initially deferred
for each row
execute function multiplayer_private.queue_discord_room_announcement();

create constraint trigger rooms_queue_discord_announcement_on_eligibility_update
after update on public.rooms
deferrable initially deferred
for each row
when (
  old.visibility is distinct from new.visibility
  or old.status is distinct from new.status
  or old.max_seats is distinct from new.max_seats
)
execute function multiplayer_private.queue_discord_room_announcement();

create constraint trigger room_members_queue_discord_announcement_on_insert
after insert on public.room_members
deferrable initially deferred
for each row
execute function multiplayer_private.queue_discord_room_announcement();

create constraint trigger room_members_queue_discord_announcement_on_delete
after delete on public.room_members
deferrable initially deferred
for each row
execute function multiplayer_private.queue_discord_room_announcement();

create function multiplayer_private.dispatch_discord_room_announcement(
  p_announcement_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  invocation_secret text;
begin
  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'discord_room_announcement_function_url';

  select decrypted_secret into invocation_secret
  from vault.decrypted_secrets
  where name = 'discord_room_announcement_invocation_secret';

  if function_url is null or invocation_secret is null then
    return false;
  end if;

  perform net.http_post(
    url := function_url,
    body := jsonb_build_object('announcementId', p_announcement_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', invocation_secret
    ),
    timeout_milliseconds := 5000
  );
  return true;
exception
  when others then
    return false;
end;
$$;

alter function multiplayer_private.dispatch_discord_room_announcement(uuid)
  owner to postgres;
revoke all on function
  multiplayer_private.dispatch_discord_room_announcement(uuid)
  from public, anon, authenticated, service_role;

create function multiplayer_private.invoke_discord_room_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Invocation setup must never roll back room creation. If dispatch cannot
  -- be queued, the pending row remains visible for a controlled retry.
  perform multiplayer_private.dispatch_discord_room_announcement(new.id);
  return new;
end;
$$;

alter function multiplayer_private.invoke_discord_room_announcement()
  owner to postgres;
revoke all on function multiplayer_private.invoke_discord_room_announcement()
  from public, anon, authenticated, service_role;

create trigger discord_room_announcements_invoke_edge_function
after insert on public.discord_room_announcements
for each row execute function
  multiplayer_private.invoke_discord_room_announcement();

create function public.claim_discord_room_announcement(
  p_announcement_id uuid
)
returns table (
  announcement_id uuid,
  room_id uuid,
  attempt_count integer
)
language sql
security definer
set search_path = ''
as $$
  update public.discord_room_announcements
  set
    status = 'processing',
    attempt_count = discord_room_announcements.attempt_count + 1,
    processing_at = statement_timestamp(),
    sent_at = null,
    discord_message_id = null,
    last_error = null
  where discord_room_announcements.id = p_announcement_id
    and discord_room_announcements.status = 'pending'
  returning
    discord_room_announcements.id,
    discord_room_announcements.room_id,
    discord_room_announcements.attempt_count;
$$;

alter function public.claim_discord_room_announcement(uuid)
  owner to postgres;
revoke all on function public.claim_discord_room_announcement(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_discord_room_announcement(uuid)
  to service_role;

create function multiplayer_private.reset_discord_room_announcement(
  p_announcement_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.discord_room_announcements
  set
    status = 'pending',
    processing_at = null,
    sent_at = null,
    discord_message_id = null,
    last_error = null
  where id = p_announcement_id
    and status in ('failed', 'processing');

  if not found then
    return false;
  end if;

  perform multiplayer_private.dispatch_discord_room_announcement(
    p_announcement_id
  );
  return true;
end;
$$;

comment on function
  multiplayer_private.reset_discord_room_announcement(uuid) is
  'Operator-only manual retry and async redispatch. Verify that Discord did not accept an ambiguous timed-out request before retrying.';

alter function multiplayer_private.reset_discord_room_announcement(uuid)
  owner to postgres;
revoke all on function
  multiplayer_private.reset_discord_room_announcement(uuid)
  from public, anon, authenticated, service_role;
