# Authoritative multiplayer beta

Fustify multiplayer is a registered-account, human-only mode for 2–5 players.
Every room begins as an editable private waiting room. Its host may keep it
private, start it privately, or irreversibly publish its final configuration as
a public lobby. Private rooms use room codes; public rooms use their canonical
direct URL and never expose or accept a room code. It reuses the local
deterministic generator, setup code, `gameReducer`, globe, minimap, territory
navigator, accessible phase controls, and victory rules. Multiplayer is
considered playable only after the remote migration, deployed Edge Function,
security harness, and complete two-browser winner test all pass.

## Routes and lifecycle

- `/multiplayer` requires a registered Supabase account and renders the
  published waiting-room browser, private creation dialog, and private
  room-code join form.
- `/multiplayer/room/:roomId` is the existing pre-game room lobby. It allows one
  human seat per member. Start is disabled until two seats are claimed, while
  the database independently enforces the same minimum against concurrent
  changes. Browser Back and in-app navigation warn the host that leaving closes
  the room and warn seated non-host players that leaving releases their seat.
  Unseated viewers leave without a confirmation dialog. Confirmed and silent
  exits both complete the authoritative `leave_room` cleanup before navigation.
- `/multiplayer/match/:matchId` restores the persisted canonical world and
  mutable match snapshot. It never invents ownership or combat results locally.

The host selects 12–48 territories, 2–5 continents, 2–5 seats, and a seed.
Multiplayer accepts random assignment only; player draft remains unchanged in
local play. There are no bots, bot takeover, mid-match joins, spectators,
matchmaking, started-game browsing, chat, timers, kicking, or host migration.

Public discovery uses the registered-only `list_public_rooms` function. It
returns safe presentation fields for public rooms still in `waiting` status and
never returns a join code, user ID, email, private room, or started/closed room.
`join_public_room` locks the room row and rechecks visibility, status,
membership, and authoritative capacity before returning only the joined room
ID. The browser then uses
`https://dev.fustify.com/multiplayer/room/<encoded-room-uuid>`. It polls every
12 seconds while visible and refetches on focus; private room rows are not
exposed through Realtime.

`publish_room` is the single publication boundary. It takes a room row lock,
requires the current registered host and a private waiting room, validates the
room, profile, capacity, member, seat, assignment, and generator configuration,
then changes visibility to public and clears the private code in one
transaction. A database trigger permanently rejects changes to advertised
settings on public, active, or closed rooms. The deferred Discord trigger runs
only for the same private-to-public visibility transition, while public
discovery filters on that committed public state.

Public cards render stored 640×360 WebP previews from the public
`room-thumbnails` bucket. The host alone can upsert the exact
`{room-id}/world.webp` path. Room creation, private setting persistence, and
publication do not depend on thumbnail success. The client requests the
best-effort preview only after authoritative publication; thumbnail metadata
remains lifecycle metadata rather than an editable advertised setting.

## Authority boundary

Browsers call the `multiplayer-game` Edge Function with their current JWT. The
function verifies the token with Supabase Auth, resolves current room membership
and the claimed seat, loads the canonical match, validates actor/turn/revision,
parses an exact `GameAction`, and invokes the shared platform-neutral
`gameReducer`. Combat uses the reducer's deterministic stream derived from the
persisted match seed and `combatSequence`; clients can select legal attack dice
but cannot submit rolls, casualties, ownership, a winner, or resulting state.

The service-role credential is an automatically provisioned Edge Function
environment value. It is never stored in Git, Vite variables, browser code,
fixtures, screenshots, command payloads, or logs.

Initialization also crosses this boundary. The function generates the complete
`PlanetDefinition`, random starting position, initial armies, player order,
turn/phase/reinforcement values, combat sequence, events, and match status. It
persists those snapshots before clients enter the match. Setup and generator
metadata remain as audit/reproduction data.

Before generation begins, the Node authority acquires a short-lived launch
lease on the room and moves it to `active`. Room Realtime and the two-second
reconciliation path therefore show the same indeterminate launch screen to
every current member, not only the host whose start request is pending. The
canonical match insert clears the lease atomically. A failed initializer
returns a still-matchless room to `waiting`, while a later host retry may
recover a lease abandoned for more than five minutes.

## Durable state and command protocol

`public.matches` contains immutable setup/seat/generator/planet snapshots and
the mutable canonical `state_snapshot`, monotonically increasing `revision`,
SHA-256 `state_fingerprint`, last command type, status, and winner IDs.

`public.match_commands` is append-only to browser roles. Each accepted row has:

- match and sequence/resulting revision;
- authenticated actor user and seat;
- exact reducer command type and validated payload;
- SHA-256 command hash;
- client-generated UUID idempotency key;
- previous/resulting revision and resulting state fingerprint;
- server timestamp.

The Edge Function alone can execute `authority_initialize_room_match` and
`authority_commit_match_command`. The commit function locks the match row,
checks current room membership and seat mapping again, requires the expected
revision, inserts one command, updates one snapshot/fingerprint, advances the
revision exactly once, and records completion/winner in the same transaction.
Browser roles have `SELECT` only through member-scoped RLS and cannot execute
either authority function or write either table.

Every command uses a UUID idempotency key. Repeating the same key, actor,
expected revision, and payload returns its already-accepted revision and
fingerprint without another reducer transition. Reusing the key for a different
payload is `idempotency_conflict`. A new key with an old revision is
`revision_conflict`; clients refetch canonical state and do not replay it.

Activity reactions are persistent social metadata outside this protocol.
Canonical `MatchEvent.id` values are generated by the shared trusted engine,
persisted inside `state_snapshot.events`, and remain stable across canonical
refetch and command retry. Each claimed participant may store one `fire`,
`laugh`, `heart`, or `angry` reaction per canonical event. The controlled RPC
uses explicit desired-state set/remove semantics and validates that the event
belongs to the specified match; legacy events without canonical IDs remain
visible but are not reactable.

## UI, Realtime, and recovery

Only the active seat gets enabled gameplay actions. A pending submission locks
repeat input and is not applied optimistically. Accepted responses and Realtime
notifications cause a canonical refetch and whole-state replacement. Friendly
feedback covers another player's turn, invalid actions, conflicts, reconnecting,
seat loss, and completion. Ambiguous failures refetch in `finally`-safe command
handling so the UI cannot remain permanently pending.

Each active route subscribes only to its current match; the lobby subscribes
only to its current room. Realtime is an invalidation hint, never the source of
truth. Older/duplicate revisions are ignored. `SUBSCRIBED`, online, focus, and
periodic reconciliation refetch canonical state, covering refresh, suspension,
temporary offline periods, missed/out-of-order events, and reconnect during
reinforcement, attack, capture movement, fortification, or another turn.

The Activity dock separately fetches RLS-protected reaction rows and subscribes
to changes filtered to the current match. Insert, update, or delete is only an
invalidation hint: clients refetch all current reaction rows and
deterministically rebuild counts plus their own selected reaction. Reaction
updates do not replace the gameplay event array, increment Activity unread
state, move feed ordering, change gameplay revision, or trigger the authority
Edge Function.

## Verification

Focused commands are:

```bash
pnpm test
pnpm test:e2e
pnpm test:visual
pnpm test:multiplayer:authority
pnpm test:multiplayer:concurrency
pnpm test:e2e:multiplayer
pnpm test:visual:multiplayer
pnpm bundle:check
```

The remote authority harness uses separate anonymous identities to verify RLS,
non-member/unseated/out-of-turn denial, direct snapshot and command-log write
denial, stale revisions, and duplicate/reused idempotency keys. The desktop
Playwright test drives the real UI from create/join/claim/start through
reinforcement, server combat, capture movement, attack end, fortification skip,
turn change, active-phase refresh, and a deterministic winner. Both browsers
must agree on every observed revision and final fingerprint. The mobile test
restores an active match and checks readability/clipping.

## Production smoke test (`dev.fustify.com`)

1. Open two separate devices or isolated browser profiles.
2. Create a private 12-territory, 2-continent, 2-seat random room; verify it is
   absent from discovery and Discord, then select **Open Public Lobby** and
   confirm the irreversible lock. Verify its final settings are advertised
   without a code, join from its card/direct URL, and claim both seats. Verify
   Start was unavailable before the second claim.
3. Start and confirm both browsers show revision 0 and the same fingerprint.
4. Complete at least one turn on each device, including combat and capture move.
5. Refresh both devices during active phases and confirm phase, armies,
   revision, and fingerprint recover unchanged.
6. Disconnect one device, play on the other where legal, reconnect, and verify
   canonical catch-up.
7. Complete the small match and confirm identical winner, final revision, and
   fingerprint.

There are no hidden production test bypasses. If any step fails, keep the
feature labeled incomplete and capture the function/Postgres/Realtime logs plus
the match ID and last agreed revision.
