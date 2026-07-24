create table public.match_event_reactions (
  match_id uuid not null references public.matches (id) on delete cascade,
  event_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (match_id, event_id, user_id),
  constraint match_event_reactions_event_id_valid check (
    event_id = btrim(event_id)
    and char_length(event_id) between 1 and 128
  ),
  constraint match_event_reactions_reaction_valid check (
    reaction in ('fire', 'laugh', 'heart', 'angry')
  )
);

create index match_event_reactions_user_id_idx
  on public.match_event_reactions (user_id);

create trigger match_event_reactions_set_updated_at
before update on public.match_event_reactions
for each row execute function multiplayer_private.set_updated_at();

alter table public.match_event_reactions enable row level security;

create policy match_event_reactions_member_select
on public.match_event_reactions for select
to authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = match_event_reactions.match_id
      and multiplayer_private.is_room_member(matches.room_id)
  )
);

revoke all on public.match_event_reactions
  from public, anon, authenticated;
grant select on public.match_event_reactions to authenticated;

create function public.set_match_event_reaction(
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

revoke all on function public.set_match_event_reaction(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_match_event_reaction(uuid, text, text)
  to authenticated;

alter publication supabase_realtime
  add table public.match_event_reactions;
