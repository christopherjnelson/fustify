create schema if not exists profile_private;

revoke all on schema profile_private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 40
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint profiles_avatar_url_valid check (
    avatar_url is null
    or (
      avatar_url = btrim(avatar_url)
      and char_length(avatar_url) between 1 and 2048
      and avatar_url !~ '[[:cntrl:][:space:]]'
      and avatar_url ~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    )
  )
);

create function profile_private.normalize_display_name(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := btrim(coalesce(candidate, ''));
begin
  if char_length(normalized) not between 1 and 40
    or normalized ~ '[[:cntrl:]]' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_profile_display_name';
  end if;
  return normalized;
end;
$$;

create function profile_private.normalize_avatar_url(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text;
begin
  if candidate is null then
    return null;
  end if;

  normalized := btrim(candidate);
  if char_length(normalized) not between 1 and 2048
    or normalized ~ '[[:cntrl:][:space:]]'
    or normalized !~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_profile_avatar_url';
  end if;
  return normalized;
end;
$$;

create function profile_private.derive_display_name(
  target_user_id uuid,
  user_metadata jsonb
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  metadata_key text;
  candidate text;
  normalized text;
begin
  if jsonb_typeof(user_metadata) = 'object' then
    foreach metadata_key in array array[
      'display_name',
      'full_name',
      'name',
      'username'
    ] loop
      if jsonb_typeof(user_metadata -> metadata_key) = 'string' then
        candidate := user_metadata ->> metadata_key;
        normalized := btrim(candidate);
        if char_length(normalized) between 1 and 40
          and normalized !~ '[[:cntrl:]]' then
          return normalized;
        end if;
      end if;
    end loop;
  end if;

  return 'Guest ' || upper(substr(replace(target_user_id::text, '-', ''), 1, 4));
end;
$$;

create function profile_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    profile_private.derive_display_name(new.id, new.raw_user_meta_data)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function profile_private.handle_new_auth_user();

insert into public.profiles (user_id, display_name)
select
  users.id,
  profile_private.derive_display_name(users.id, users.raw_user_meta_data)
from auth.users as users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;

create policy profiles_authenticated_select
on public.profiles for select
to authenticated
using ((select auth.uid()) is not null);

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create function public.ensure_own_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  user_metadata jsonb;
  ensured_profile public.profiles;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  select users.raw_user_meta_data
  into user_metadata
  from auth.users as users
  where users.id = caller_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;

  insert into public.profiles (user_id, display_name)
  values (
    caller_id,
    profile_private.derive_display_name(caller_id, user_metadata)
  )
  on conflict (user_id) do nothing;

  select profiles.*
  into ensured_profile
  from public.profiles as profiles
  where profiles.user_id = caller_id;

  return ensured_profile;
end;
$$;

create function public.update_own_profile(
  p_display_name text,
  p_avatar_url text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  updated_profile public.profiles;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  perform public.ensure_own_profile();

  update public.profiles
  set
    display_name = profile_private.normalize_display_name(p_display_name),
    avatar_url = profile_private.normalize_avatar_url(p_avatar_url),
    updated_at = statement_timestamp()
  where profiles.user_id = caller_id
  returning profiles.* into updated_profile;

  return updated_profile;
end;
$$;

revoke all on all functions in schema profile_private
  from public, anon, authenticated;
revoke all on function public.ensure_own_profile()
  from public, anon, authenticated;
revoke all on function public.update_own_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_own_profile()
  to authenticated;
grant execute on function public.update_own_profile(text, text)
  to authenticated;
