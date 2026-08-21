create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text unique,
  host_user_id text not null references auth_users (id) on delete restrict,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'closed')),
  seed text not null default 'atlas-prime'
    check (seed = btrim(seed) and char_length(seed) between 1 and 64),
  territory_count integer not null default 42
    check (territory_count between 12 and 48),
  continent_count integer not null default 6
    check (continent_count between 2 and 6 and continent_count <= territory_count),
  assignment_mode text not null default 'random'
    check (assignment_mode in ('random', 'player-draft')),
  max_seats integer not null default 5 check (max_seats between 2 and 5),
  revision bigint not null default 0 check (revision >= 0),
  name text not null default 'New Game'
    check (
      name = btrim(name)
      and char_length(name) between 1 and 60
      and name !~ '[[:cntrl:]]'
    ),
  visibility text not null default 'private'
    check (visibility in ('public', 'private')),
  thumbnail_path text,
  thumbnail_version bigint not null default 0 check (thumbnail_version >= 0),
  generator_version integer not null default 4 check (generator_version in (3, 4)),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (join_code is null or join_code ~ '^[0-9A-F]{8}$'),
  check (thumbnail_path is null or thumbnail_path = id::text || '/world.webp')
);

create index if not exists rooms_host_user_id_idx on rooms (host_user_id);
create index if not exists rooms_public_waiting_created_idx
  on rooms (created_at desc, id desc)
  where visibility = 'public' and status = 'waiting';

create table if not exists room_members (
  room_id uuid not null references rooms (id) on delete cascade,
  user_id text not null references auth_users (id) on delete cascade,
  display_name text not null
    check (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 40
      and display_name !~ '[[:cntrl:]]'
    ),
  role text not null default 'member' check (role in ('host', 'member')),
  joined_at timestamptz not null default statement_timestamp(),
  last_active_at timestamptz not null default statement_timestamp(),
  primary key (room_id, user_id)
);

create unique index if not exists room_members_one_host_per_room
  on room_members (room_id) where role = 'host';
create index if not exists room_members_user_id_idx on room_members (user_id);

create table if not exists room_seats (
  room_id uuid not null references rooms (id) on delete cascade,
  seat_index integer not null check (seat_index >= 0),
  occupant_user_id text,
  controller_type text not null default 'human'
    check (controller_type in ('human', 'bot')),
  ready boolean not null default false,
  claimed_at timestamptz,
  primary key (room_id, seat_index),
  foreign key (room_id, occupant_user_id)
    references room_members (room_id, user_id)
    on delete set null (occupant_user_id),
  check (
    (occupant_user_id is null and claimed_at is null and ready is false)
    or (occupant_user_id is not null and claimed_at is not null)
  )
);

create unique index if not exists room_seats_one_human_seat_per_user
  on room_seats (room_id, occupant_user_id)
  where occupant_user_id is not null and controller_type = 'human';
create index if not exists room_seats_occupant_user_id_idx
  on room_seats (occupant_user_id);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references rooms (id) on delete restrict,
  status text not null default 'preview'
    check (status in ('preview', 'active', 'completed', 'closed')),
  revision bigint not null default 0 check (revision >= 0),
  setup_snapshot jsonb not null check (jsonb_typeof(setup_snapshot) = 'object'),
  seat_order_snapshot jsonb not null
    check (jsonb_typeof(seat_order_snapshot) = 'array'),
  generator_metadata jsonb not null
    check (jsonb_typeof(generator_metadata) = 'object'),
  planet_snapshot jsonb check (
    planet_snapshot is null or jsonb_typeof(planet_snapshot) = 'object'
  ),
  state_snapshot jsonb check (
    state_snapshot is null or jsonb_typeof(state_snapshot) = 'object'
  ),
  state_fingerprint text check (
    state_fingerprint is null or state_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  last_command_type text,
  winner_player_id text,
  winner_user_id text references auth_users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (
    status in ('preview', 'closed')
    or (
      planet_snapshot is not null
      and state_snapshot is not null
      and state_fingerprint is not null
    )
  ),
  check (
    status <> 'completed'
    or (winner_player_id is not null and winner_user_id is not null)
  )
);

create index if not exists matches_winner_user_id_idx
  on matches (winner_user_id) where winner_user_id is not null;

create table if not exists match_commands (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches (id) on delete restrict,
  sequence bigint not null check (sequence > 0),
  actor_user_id text not null references auth_users (id) on delete restrict,
  actor_seat_index integer not null check (actor_seat_index >= 0),
  command_type text not null,
  command_payload jsonb not null check (jsonb_typeof(command_payload) = 'object'),
  command_hash text not null check (command_hash ~ '^[0-9a-f]{64}$'),
  client_idempotency_key uuid not null,
  previous_revision bigint not null check (previous_revision >= 0),
  resulting_revision bigint not null,
  resulting_state_fingerprint text not null
    check (resulting_state_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  unique (match_id, sequence),
  unique (match_id, client_idempotency_key),
  check (
    resulting_revision = previous_revision + 1
    and sequence = resulting_revision
  )
);

create index if not exists match_commands_match_created_idx
  on match_commands (match_id, created_at desc);

create table if not exists match_event_reactions (
  match_id uuid not null references matches (id) on delete cascade,
  event_id text not null,
  user_id text not null references auth_users (id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 32),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (match_id, event_id, user_id)
);

create table if not exists match_launches (
  room_id uuid primary key references rooms (id) on delete cascade,
  match_id uuid not null unique,
  started_at timestamptz not null default statement_timestamp()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on rooms;
create trigger rooms_set_updated_at
before update on rooms
for each row execute function set_updated_at();

drop trigger if exists matches_set_updated_at on matches;
create trigger matches_set_updated_at
before update on matches
for each row execute function set_updated_at();

drop trigger if exists match_event_reactions_set_updated_at
  on match_event_reactions;
create trigger match_event_reactions_set_updated_at
before update on match_event_reactions
for each row execute function set_updated_at();
