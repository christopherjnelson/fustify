# Authoritative multiplayer beta

Fustify multiplayer is a private, anonymous, human-only mode for 2–5 players.
It reuses the local deterministic generator, setup code, `gameReducer`, globe,
minimap, territory navigator, accessible phase controls, and victory rules.
Multiplayer is considered playable only after the remote migration, deployed
Edge Function, security harness, and complete two-browser winner test all pass.

## Routes and lifecycle

- `/multiplayer` restores or creates an anonymous Supabase Auth session.
- `/multiplayer/room/:roomId` creates/joins a private room and claims one human
  seat per member. Start is disabled until two seats are claimed, while the
  database independently enforces the same minimum against concurrent changes.
- `/multiplayer/match/:matchId` restores the persisted canonical world and
  mutable match snapshot. It never invents ownership or combat results locally.

The host selects 12–48 territories, 2–5 continents, 2–5 seats, and a seed.
Multiplayer accepts random assignment only; player draft remains unchanged in
local play. There are no bots, bot takeover, mid-match joins, spectators,
matchmaking, public rooms, chat, timers, kicking, or host migration.

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

## Verification

Focused commands are:

```bash
pnpm test
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
2. Create a 12-territory, 2-continent, 2-seat random room; join and claim both
   seats; verify Start was unavailable before the second claim.
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
