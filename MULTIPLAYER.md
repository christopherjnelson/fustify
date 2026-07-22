# Multiplayer foundation

Fustify's first multiplayer slice is a private-lobby and synchronized
match-start preview. It deliberately stops before synchronized gameplay: no
attacks, reinforcements, fortifications, combat reducer, command log, or mutable
match snapshot crosses the network yet.

## Routes and identity

- `/multiplayer` restores a persisted Supabase session or creates an anonymous
  authenticated user with `signInAnonymously()`.
- `/multiplayer/room/:roomId` is a private lobby. A direct URL reveals nothing
  unless the current authenticated user is a durable room member.
- `/multiplayer/match/:matchId` reads the immutable setup and seat-order
  snapshots and renders the existing corrected deterministic world read-only.

Display names belong to `room_members`; they are not credentials. Supabase's
browser client persists and refreshes anonymous sessions. If a cached session
is invalid, multiplayer discards it locally and creates a new anonymous session.
The Supabase client is dynamically imported only for multiplayer routes, so `/`
and `/admin` neither initialize Auth nor require multiplayer configuration.

## Room lifecycle

1. An authenticated anonymous user calls `create_room`; the transaction creates
   a waiting room, makes the caller host/member, and creates five open seats.
2. Another authenticated user calls `join_room` with the case-insensitive,
   shareable eight-character code. Joining is the only code lookup exposed to
   clients and does not return room data on failure.
3. Members claim or release one human seat through transactional functions.
   Durable Postgres rows—not Realtime Presence—are authoritative.
4. The host may update the seed, 12–48 territory count, 2–5 continent count,
   assignment mode, and 2–5 seat capacity through `update_room_settings`.
5. With at least two claimed human seats, the host calls `start_room_match`.
   One transaction locks the room, validates it, creates exactly one immutable
   match snapshot, changes the room to `active`, and advances revisions.
6. `close_room` prevents future joins. `leave_room` releases the caller's seat
   and membership; a host closes the room before leaving. Automated tests clean
   up through these same supported functions. Closed room and Auth audit rows
   are retained rather than deleted remotely.

Normal world creation defaults to 42 territories / 5 continents, with new
worlds and tables temporarily capped at five continents and five seats. The
existing local engine, saves, setup URLs, canonical worlds, and fixtures
continue to accept valid six-continent and six-player data where practical.
Six-continent generation is a deferred quality investigation, not a normal
creation option in this milestone.

## Durable data and transactions

The normalized `public` schema contains:

- `rooms`: private join code, host, lifecycle, world settings, capacity,
  revision, and timestamps.
- `room_members`: one durable row per room/user with display name and role.
- `room_seats`: zero-based capacity rows with a human occupant, ready metadata,
  and claim time. Constraints enforce one occupant per seat and one human seat
  per room/user.
- `matches`: one row per room with status/revision, immutable JSON setup and
  seat-order snapshots, generator metadata, and timestamps.

Mutations are RPC-only: `create_room`, `join_room`, `leave_room`,
`claim_room_seat`, `release_room_seat`, `update_room_settings`,
`start_room_match`, and `close_room`. Each uses `auth.uid()`, validates the
caller, is `SECURITY DEFINER` only because it crosses restrictive RLS, has an
empty search path, fully qualifies objects, and is executable only by
`authenticated`. Stable database errors map to accessible UI feedback.

Seat claims lock the room and selected seat. The primary key and partial unique
human-occupancy index are the final concurrency guard: simultaneous claims of
one seat produce exactly one winner and one `seat_conflict`. Match start locks
the room and is idempotent; repeated host requests return the existing match
instead of fabricating another.

## Realtime and recovery

Each lobby opens one Supabase Realtime channel filtered to its current room for
`rooms`, `room_members`, `room_seats`, and `matches`. Events are hints to refetch
all canonical rows. A request sequence discards stale responses, a short debounce
coalesces duplicate events, and a periodic reconciliation plus online/focus and
`SUBSCRIBED` callbacks repairs missed or out-of-order events. Channels are
removed on route change/unmount. A browser refresh reconstructs state from the
persisted anonymous session and Postgres; correctness never requires receiving
every event.

Starting creates a setup snapshot containing the seed, territory/continent and
player counts, and assignment mode, plus a seat-order snapshot and generator
version. Every member generates the same corrected `PlanetDefinition` locally.
Development/test builds expose an FNV-1a world fingerprint so two clients can
prove agreement. The preview intentionally has no gameplay controls.

## Tests and next milestone

`supabase/tests/multiplayer_rls.sql` uses separate identities for RLS, grants,
RPC authorization, immutability, lifecycle, and idempotency checks.
`pnpm test:multiplayer:concurrency` performs a real simultaneous remote claim.
`pnpm test:e2e:multiplayer` runs two isolated anonymous browser contexts plus a
focused mobile lobby check. `pnpm test:visual:multiplayer` compares the focused
desktop/laptop/mobile lobby baselines without running the unchanged gameplay
visual matrix. See [SUPABASE.md](./SUPABASE.md) for remote workflow.

The exact next milestone is a server-authoritative match command protocol:
versioned commands, transactional validation/reduction, durable ordered command
records or snapshots, idempotency keys, and Realtime-driven gameplay recovery.
It should build on the immutable setup created here without weakening lobby RLS.
