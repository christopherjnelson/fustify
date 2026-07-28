alter table public.profiles
  add column onboarding_completed boolean not null default false;

update public.profiles as profiles
set onboarding_completed = users.is_anonymous is false
from auth.users as users
where users.id = profiles.user_id;

create unique index profiles_completed_display_name_unique
on public.profiles (lower(display_name))
where onboarding_completed;

create or replace function profile_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider text := coalesce(new.raw_app_meta_data ->> 'provider', '');
  onboarding_complete boolean :=
    new.is_anonymous is false and provider <> 'discord';
begin
  insert into public.profiles (
    user_id,
    display_name,
    onboarding_completed
  )
  values (
    new.id,
    case
      when new.is_anonymous is true
        then profile_private.derive_guest_display_name(new.id)
      else profile_private.derive_display_name(new.id, new.raw_user_meta_data)
    end,
    onboarding_complete
  )
  on conflict (user_id) do nothing;
  return new;
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'username_unavailable';
end;
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
  user_app_metadata jsonb;
  user_is_anonymous boolean;
  ensured_profile public.profiles;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not admin_private.user_has_app_access(caller_id) then
    raise exception using errcode = 'P0001', message = 'account_blocked';
  end if;

  select
    users.raw_user_meta_data,
    users.raw_app_meta_data,
    users.is_anonymous
  into user_metadata, user_app_metadata, user_is_anonymous
  from auth.users as users
  where users.id = caller_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;

  insert into public.profiles (
    user_id,
    display_name,
    onboarding_completed
  )
  values (
    caller_id,
    case
      when user_is_anonymous is true
        then profile_private.derive_guest_display_name(caller_id)
      else profile_private.derive_display_name(caller_id, user_metadata)
    end,
    user_is_anonymous is false
      and coalesce(user_app_metadata ->> 'provider', '') <> 'discord'
  )
  on conflict (user_id) do nothing;

  select profiles.*
  into ensured_profile
  from public.profiles as profiles
  where profiles.user_id = caller_id;

  return ensured_profile;
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'username_unavailable';
end;
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
    and admin_private.user_has_app_access(auth.uid())
    and exists (
      select 1
      from public.profiles
      where profiles.user_id = auth.uid()
        and profiles.onboarding_completed
    );
$$;

create or replace function public.update_own_profile(
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
  if not profile_private.current_user_is_registered() then
    raise exception using errcode = 'P0001', message = 'account_required';
  end if;

  update public.profiles
  set
    display_name = profile_private.normalize_display_name(p_display_name),
    avatar_url = profile_private.normalize_avatar_url(p_avatar_url),
    updated_at = statement_timestamp()
  where profiles.user_id = caller_id
  returning profiles.* into updated_profile;

  if updated_profile.user_id is null then
    raise exception using errcode = 'P0001', message = 'profile_unavailable';
  end if;
  return updated_profile;
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'username_unavailable';
end;
$$;

create function public.complete_own_profile(
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
  if coalesce(auth.jwt() -> 'is_anonymous' = 'false'::jsonb, false) is false then
    raise exception using errcode = 'P0001', message = 'account_required';
  end if;
  if not admin_private.user_has_app_access(caller_id) then
    raise exception using errcode = 'P0001', message = 'account_blocked';
  end if;

  perform public.ensure_own_profile();

  update public.profiles
  set
    display_name = profile_private.normalize_display_name(p_display_name),
    avatar_url = profile_private.normalize_avatar_url(p_avatar_url),
    onboarding_completed = true,
    updated_at = statement_timestamp()
  where profiles.user_id = caller_id
  returning profiles.* into updated_profile;

  return updated_profile;
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'username_unavailable';
end;
$$;

create function public.username_options(p_candidate text)
returns table (
  available boolean,
  suggestions text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized text :=
    profile_private.normalize_display_name(p_candidate);
begin
  available := not exists (
    select 1
    from public.profiles
    where profiles.onboarding_completed
      and lower(profiles.display_name) = lower(normalized)
      and profiles.user_id is distinct from caller_id
  );

  select coalesce(array_agg(candidate order by suffix), '{}'::text[])
  into suggestions
  from (
    select
      suffix,
      left(normalized, 40 - char_length(suffix::text) - 1)
        || '-' || suffix::text as candidate
    from generate_series(2, 1001) as values(suffix)
    where not exists (
      select 1
      from public.profiles
      where profiles.onboarding_completed
        and lower(profiles.display_name) = lower(
          left(normalized, 40 - char_length(suffix::text) - 1)
            || '-' || suffix::text
        )
        and profiles.user_id is distinct from caller_id
    )
    order by suffix
    limit 3
  ) candidates;

  return next;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on function public.complete_own_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.complete_own_profile(text, text)
  to authenticated;

revoke all on function public.username_options(text)
  from public, anon, authenticated;
grant execute on function public.username_options(text)
  to anon, authenticated;

revoke all on all functions in schema profile_private
  from public, anon, authenticated;
grant execute on function profile_private.current_user_is_registered()
  to authenticated;
