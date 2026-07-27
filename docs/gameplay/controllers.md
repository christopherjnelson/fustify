# Controllers and bot simulation

Fustify treats a player seat and the controller operating it as separate
configuration. A `LocalPlayerConfig` owns the stable player ID, display name,
palette color, seat order, and `controllerType`. The supported public controller
types are `local-human` and `heuristic-bot`; names and colors never imply control.

Fresh production setup creates four seats: seat 1 is `local-human`, seats 2–4
are `heuristic-bot`, and added seats 5–6 default to `heuristic-bot`. Explicit
URLs and restored v0–v4 saves keep their counts and persisted controllers;
historical players without controller data still migrate to `local-human`.

## Authoritative command boundary

```text
MatchState + PlanetDefinition
  → detached GameObservation + getLegalGameCommands()
  → PlayerController.chooseAction()
  → gameReducer() validation
  → new MatchState + public event
```

`getLegalGameCommands` builds commands with the existing reinforcement, attack,
dice, capture-range, connectivity, and fortification helpers. It is guidance,
not authority: interactive and headless runners submit the chosen command to
`gameReducer` again. Rejected commands cannot mutate the prior state.

Observations contain public phase, turn, army, ownership, adjacency, continent,
elimination, pending-capture, reinforcement, and recent event information. They
are detached from canonical objects and recursively frozen. Recent history is
bounded to avoid copying an ever-growing log during bulk simulation. World
geometry, renderer state, promises, pacing, and store methods are never exposed.

## Determinism and seeds

World generation uses `worldSeed`. Combat and controller decisions use the
independent `matchSeed` stored as `MatchState.seed`. Interactive matches derive
it from the world seed, ownership variant, and player count. Headless
matches accept it explicitly.

The balanced heuristic is versioned as `balanced-v1`. Equal-score choices use
the seeded generator with match seed, controller version, explicit canonical
controller stream slot, turn, phase, and decision index. Literal player IDs and
display labels are excluded. The browser assigns slots by canonical turn order;
the diagnostic rotates slots explicitly. Headless matches allocate a distinct
stateless controller instance per player, and each decision creates its own
seeded generator, so mutable RNG state is never shared. It never calls
`Math.random()`. Presentation delays and
reduced-motion settings do not enter this seed. Identical world, assignment,
match seed, player order, controller configuration, and heuristic version replay
the same authoritative transitions.

Player-ID renaming is permutation-equivariant: preserving seats, territory and
army state, controller configuration, and stream slots preserves the command
sequence and maps the winner through the same rename. Starting-position and
default match-seed derivation use player count rather than label text. Stream
IDs are `controller-1` through `controller-N`; they are diagnostic/runtime
allocation identifiers, not persisted personalities.

For six-seat diagnostics, assignment slots are one-based in reports and are
derived only after zero-based seat and assignment rotations are normalized.
`createHeadlessPlayerAllocation` passes assignment-rotated players to setup but
restores the independently seat-rotated player order for `createMatch`; the
match seed and controller streams therefore do not inherit assignment labels.

## Balanced heuristic

Weights and minimum thresholds live in
`src/core/controllers/heuristicController.ts`. Reinforcement scores hostile army
pressure, hostile border count, continent defense, and safe overstacking. Attack
scores army advantage, dice, continent completion, opponent-continent breaks,
elimination opportunities, and source exposure. A score below `8` ends attack.
Capture movement balances destination and source threat. Fortification prefers
safe-interior to threatened-frontier movement and skips below score `4`.

This is one deterministic, general-purpose opponent—not a claim of optimal
play. There are no remote-model controllers, hidden reasoning displays,
learning, personalities, or private-information channels.

## Interactive orchestration

`useBotTurnRunner` requests one command per canonical state fingerprint. The
store checks match ID, active player, turn, phase, combat sequence, event count,
and a transient controller epoch before applying it. New worlds, load, reset,
and rematch invalidate the epoch. Effects are aborted on teardown, and stale
commands are ignored. Human gameplay dispatch is locked on bot seats; menus and
read-only utilities remain available. Factual action summaries and highlights
are transient UI state and are not saved.

Controller errors are logged as structured data. The bounded fallback ends an
optional phase where possible, ends the turn when legal, or selects the first
deterministic mandatory command. There is no retry loop.

## Headless matches and reports

The headless runner imports no React, DOM, Three.js, timers, or animation code.
It generates canonical setup, calls the same controller, and applies every
command through `gameReducer`. After every command it checks ownership, integer
armies, elimination, active-player eligibility, reinforcement and capture phase
consistency, attack adjacency, fortification paths, victory, and action-after-
completion constraints.

Outcomes are `victory`, `stalemate`, `turn-cap`, `command-cap`, or
`engine-error`; caps never award a winner. Defaults are 1,200 turns, 30,000
commands, and 160 completed turns without an ownership change. Checkpoints are
stored on ownership changes and every tenth turn rather than every command.

```bash
pnpm test:bot
pnpm test:bot:stress
pnpm simulate:bots -- --games 10000
pnpm simulate:bots -- --games 500 --territories 18 --continents 3 --players 3
pnpm simulate:bots -- --reproduce '<descriptor-json>' --trace
```

The CLI writes Fustify-prefixed JSON files beneath ignored
`artifacts/bot-simulations/`. Reports include versioned Fustify project metadata,
run ID, timestamp, Git commit when available, configuration, completed games,
outcomes, win rates, average and percentile turns, invariant failures,
reproduction descriptors, runtime, throughput, and controller version. Normal
bulk reports omit final states and traces. A focused trace records phase, player,
command, reducer result, and changed ownership or armies.

## Persistence and URLs

Save schema v4 persists `controllerType` on every player. Versions 0–3 migrate
missing controller data to `local-human`; no historical save silently becomes a
bot match. Pending promises, controller epochs, statuses, highlights, delays,
traces, and reports are transient.

Setup URLs continue to describe geography and assignment only. They do not
already serialize names, colors, or seats, so controller configuration remains
with canonical local match setup rather than adding a competing partial profile
format to URLs.

The local verification dashboard adapts this existing report contract rather
than replacing it. It presents outcomes, win distribution, turn percentiles,
caps, errors, invariant failures, throughput, and exact reproduction commands.
See [`../operations/verification.md`](../operations/verification.md).
Authentication, upload, database storage, tournament,
networking, and remote providers remain out of scope.

The dedicated balance-study orchestrator expands the same headless runner over
deterministic world, match, assignment, and rotated-seat matrices. It writes
schema-v1 atomic reports and resumable checkpoints for the local `/admin`
viewer; it is not a competing simulation engine. See
[`balance-studies.md`](balance-studies.md).

The corrected seed scheme intentionally changes bot choices produced by old
reproduction descriptors, even though world generation, combat rules, and all
engine transitions remain deterministic. New descriptors include controller
stream rotation where relevant and replay stably under this scheme. Save schema
v4 and setup URLs are unchanged because controller streams are derived runtime
state rather than persisted state.
