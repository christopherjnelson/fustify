create function profile_private.derive_guest_display_name(target_user_id uuid)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  adjectives constant text[] := array[
    'Amber', 'Brisk', 'Calm', 'Clever', 'Copper', 'Coral', 'Cosmic', 'Dapper',
    'Dawn', 'Gentle', 'Golden', 'Happy', 'Jolly', 'Kind', 'Lively', 'Lucky',
    'Mellow', 'Misty', 'Nimble', 'Noble', 'Quiet', 'Rapid', 'Silver', 'Sunny',
    'Swift', 'Tiny', 'Velvet', 'Verdant', 'Warm', 'Wild', 'Wise', 'Zesty'
  ];
  nouns constant text[] := array[
    'Badger', 'Beacon', 'Comet', 'Crane', 'Dolphin', 'Falcon', 'Finch', 'Fox',
    'Gecko', 'Harbor', 'Heron', 'Koala', 'Lynx', 'Maple', 'Marten', 'Meteor',
    'Otter', 'Owl', 'Panda', 'Pine', 'Puffin', 'Rabbit', 'Raven', 'Robin',
    'Seal', 'Sparrow', 'Stag', 'Star', 'Tiger', 'Turtle', 'Whale', 'Willow'
  ];
  digest text := md5(target_user_id::text);
  adjective_index integer;
  noun_index integer;
  suffix integer;
begin
  adjective_index :=
    1 + mod((('x' || substr(digest, 1, 8))::bit(32)::bigint), array_length(adjectives, 1));
  noun_index :=
    1 + mod((('x' || substr(digest, 9, 8))::bit(32)::bigint), array_length(nouns, 1));
  suffix :=
    100 + mod((('x' || substr(digest, 17, 8))::bit(32)::bigint), 900);

  return adjectives[adjective_index] || nouns[noun_index] || '-' || suffix::text;
end;
$$;

create or replace function profile_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    case
      when new.is_anonymous is true
        then profile_private.derive_guest_display_name(new.id)
      else profile_private.derive_display_name(new.id, new.raw_user_meta_data)
    end
  )
  on conflict (user_id) do nothing;
  return new;
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
  user_is_anonymous boolean;
  ensured_profile public.profiles;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
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

update public.profiles as profiles
set
  display_name = profile_private.derive_guest_display_name(profiles.user_id),
  updated_at = statement_timestamp()
from auth.users as users
where users.id = profiles.user_id
  and users.is_anonymous is true
  and profiles.display_name =
    'Guest ' || upper(substr(replace(profiles.user_id::text, '-', ''), 1, 4));

create function profile_private.current_user_is_registered()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() -> 'is_anonymous' = 'false'::jsonb, false);
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

create or replace function public.set_match_event_reaction(
  p_match_id uuid,
  p_event_id text,
  p_reaction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_match public.matches;
  actor_seat_index integer;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;
  if not profile_private.current_user_is_registered() then
    raise exception using errcode = 'P0001', message = 'account_required';
  end if;
  if p_reaction is not null
    and p_reaction not in ('fire', 'laugh', 'heart', 'angry') then
    raise exception using errcode = 'P0001', message = 'invalid_event_reaction';
  end if;

  select * into target_match
  from public.matches
  where matches.id = p_match_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'match_not_found';
  end if;

  select (seat.value ->> 'seatIndex')::integer into actor_seat_index
  from jsonb_array_elements(target_match.seat_order_snapshot) as seat(value)
  where seat.value ->> 'userId' = caller_id::text;

  if actor_seat_index is null
    or not exists (
      select 1
      from public.room_members
      where room_members.room_id = target_match.room_id
        and room_members.user_id = caller_id
    )
    or not exists (
      select 1
      from public.room_seats
      where room_seats.room_id = target_match.room_id
        and room_seats.seat_index = actor_seat_index
        and room_seats.occupant_user_id = caller_id
        and room_seats.controller_type = 'human'
    ) then
    raise exception using errcode = 'P0001', message = 'seat_required';
  end if;

  if p_event_id is null
    or not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(target_match.state_snapshot -> 'events') = 'array'
            then target_match.state_snapshot -> 'events'
          else '[]'::jsonb
        end
      ) as event(value)
      where jsonb_typeof(event.value) = 'object'
        and event.value ->> 'id' = p_event_id
    ) then
    raise exception using errcode = 'P0001', message = 'match_event_not_found';
  end if;

  if p_reaction is null then
    delete from public.match_event_reactions
    where match_event_reactions.match_id = p_match_id
      and match_event_reactions.event_id = p_event_id
      and match_event_reactions.user_id = caller_id;
    return;
  end if;

  insert into public.match_event_reactions (
    match_id,
    event_id,
    user_id,
    reaction
  ) values (
    p_match_id,
    p_event_id,
    caller_id,
    p_reaction
  )
  on conflict (match_id, event_id, user_id) do update
  set reaction = excluded.reaction
  where match_event_reactions.reaction is distinct from excluded.reaction;
end;
$$;

revoke all on all functions in schema profile_private
  from public, anon, authenticated;
