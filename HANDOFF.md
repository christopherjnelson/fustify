# Fustify Handoff

> This handoff now also includes a local verification dashboard milestone.
> Canonical operational details are in `VERIFICATION.md`; the historical
> controller context below remains valid.

## Current state

Branch `feat/recommended-match-defaults` starts at
`920ccf4ea47166074280555c6dcb6a689c31b1f2`. This milestone aligns fresh setup
with 42 territories, 6 continents, and four seats (one human, three bots), adds
bot-default seats five and six, and versions product-balance versus
engine-coverage presets without changing rules or save schema v4.

Branch `feat/admin-verification-dashboard` starts at
`b6c7c06c7f7d11ed8a2bc014f2cc7b2fc536ebac`. It adds schema-v1 atomic reports,
standard/full report-enabled runners, a narrow development-only GET API, and a
read-only reactive `/admin` viewer. It does not change gameplay, deterministic
controllers, generation, URL behavior, or save schema v4. Future hosted data
should implement the `AdminReportSource` boundary with authentication rather
than exposing local filesystem behavior in production.

Branch `feat/rebrand-fustify` started from `c2c9f8b` and renames the public
product from its former Worldseed working title to Fustify. Runtime branding is
centralized in `src/branding.ts`; package, browser, accessible UI,
documentation, persistence, and simulation-report metadata use the new name.
Gameplay, generation, URL semantics, controller behavior, and save schema stay
unchanged. Every seat retains stable identity, name, color, and turn order while
independently selecting `local-human` or `heuristic-bot`.

The deterministic `balanced-v1` bot plays through the same legal helpers and
`gameReducer` as humans. Browser orchestration is asynchronous, executes one
command at a time, shows factual status/highlights, locks human gameplay input,
and invalidates stale work after world changes, load, reset, rematch, or
unmount. Headless matches use the same controller and reducer without React,
DOM, Three.js, timers, or pacing.

## Important boundaries

- `LocalPlayerConfig`: player identity, presentation, seat, and canonical
  controller type.
- `PlanetDefinition`: immutable world geometry/topology; it never depends on a
  controller or renderer.
- `MatchSetup`: players/controller configuration, assignment mode, setup phase,
  and optional completed ownership.
- `MatchState`: authoritative mutable rules state and match RNG seed.
- `GameObservation`: detached and recursively frozen public match data with a
  bounded recent public-event window.
- `getLegalGameCommands`: controller guidance generated from existing rule
  helpers; every chosen command is validated again by `gameReducer`.
- `botExecution` and `controllerEpoch`: transient browser orchestration only;
  never saved or placed in URLs.

Human and bot actions converge at the reducer. Controllers cannot declare a
capture, elimination, phase change, or victory; they can only propose a typed
command. Invalid or stale commands cannot mutate canonical state.

## Main implementation locations

- `src/core/controllers/`: contracts, immutable observations, legal-command
  enumeration, deterministic fallback, and the `balanced-v1` heuristic.
- `src/app/useBotTurnRunner.ts`: one-command asynchronous browser runner,
  pacing, summaries, cancellation, and safe fallback.
- `src/state/useGameStore.ts`: human input lock, bot dispatch fingerprint and
  epoch validation, match lifecycle invalidation, persistence boundary.
- `src/core/simulation/botMatch.ts`: sequential headless runner, metrics,
  classified termination, aggregation, and reproduction descriptors.
- `src/core/simulation/matchInvariants.ts`: after-command state-integrity checks.
- `scripts/simulateBots.ts`: JSON-report and exact-reproduction CLI.
- `CONTROLLERS.md`: architecture, heuristic, RNG, cap, report, and replay docs.

## Determinism

World generation uses `worldSeed`. Combat and controllers use an independent
`matchSeed` stored in `MatchState.seed`. Interactive matches derive it from the
world seed, ownership variant, and ordered player IDs; headless matches accept
it explicitly. Controller tie-breaking adds controller version, player, turn,
phase, and decision index to a seeded stream. No controller calls
`Math.random()`, and UI pacing never enters the seed.

Heuristic weights are centralized. Reinforcement considers hostile pressure,
border count, and continent defense. Attack considers army advantage, dice,
continent completion/breaking, elimination, and exposed sources, with a minimum
desirability threshold of 8. Capture movement balances destination/source
threat. Fortification prefers safe-interior to threatened-frontier movement and
skips below threshold 4.

## Persistence and URLs

Save schema version 4 persists controller type for every player. Versions 0–2
still migrate to random/ready setup; versions 0–3 add
`controllerType: local-human`, so historical saves never silently gain bots.
Active bot saves resume through the normal handoff and safely restart
orchestration. Promises, timers, controller epochs, status, highlights, traces,
and reports are not persisted.

Setup URLs continue describing geography and assignment only. They did not
previously serialize player profiles, so controller configuration was not added
as a partial competing profile format. Existing explicit URLs remain valid.

New saves use `fustify.local-match`. Restore checks it first and falls back to
the historical `worldseed.local-match` key. A legacy value is copied only after
successful v0–v4 validation/migration, and the old value is retained. The
development-only `__WORLDSEED_VISUAL__` bridge and world-seed source identifiers
remain intentionally unchanged as internal compatibility names.

## Headless simulation

Outcomes are `victory`, `stalemate`, `turn-cap`, `command-cap`, and
`engine-error`; capped matches never receive an invented winner. Defaults are
1,200 turns, 30,000 commands, and 160 completed turns without ownership change.
The runner checks valid ownership, integer/minimum armies, elimination, active
player eligibility, reinforcement/capture consistency, legal attack adjacency,
owned fortification paths, victory correctness, no post-completion action, and
frozen canonical world data after every command.

Metrics include outcomes, winner, turns/rounds/commands, attacks, captures,
armies lost, ownership checkpoints, elimination order, continent-control turns
and bonuses, lead changes, longest no-capture period, rejected commands,
invariant failures, runtime, and aggregate throughput. Bulk reports omit final
states/traces; focused replay traces retain command results and relevant army or
ownership changes.

Commands:

```bash
pnpm test:bot
pnpm test:bot:stress
pnpm simulate:bots -- --games 10000
pnpm simulate:bots -- --reproduce '<descriptor-json>' --trace
```

Reports go to ignored `artifacts/bot-simulations/` and contain run/timestamp,
Git commit when available, configuration, seeds, controller version, outcome
distribution, win rates, match-length percentiles, failures/reproductions, and
throughput. No dashboard, database, upload, or authentication was added.

## Verification completed

- Unit: 162 passed, 3 intentionally gated/skipped across 17 files.
- Coverage: 92.18% statements, 86.13% branches, 100% functions, 93.22% lines.
- Playwright interaction: 102/102 across 1920×1080, 1366×768, and 390×844.
- Playwright visual comparison: 105/105; no baseline updates were required.
- Manual visual review: all 105 full-page captures reviewed as desktop, laptop,
  and mobile contact sheets; the wordmark remains unclipped and clear of panels,
  modals, the minimap, and globe controls.
- Existing quick simulation: 20 deterministic bounded runs passed.
- Existing stress simulation: 270 deterministic bounded runs passed in
  285.65 seconds.
- Bot quick suite: 9 passed, 1 stress test gated.
- Bot stress: 30 all-bot matches plus focused tests passed in 19.56 seconds.
- Focused deterministic replay: victory for player 1 after 29 turns and 271
  commands, with zero invariant violations.
- Extended final-code run: 250/250 victories, zero stalemates/caps/engine
  errors/invariant failures in 72.48 seconds (3.45 games/s); player 1 won 55.2%,
  player 2 44.8%; mean 25.688 turns, median 15, p95 87, p99 140.
- Lint, production build, formatting, and `git diff --check` passed. The
  existing Vite large-chunk warning remains non-blocking.

## Known limitations and next milestone

- `balanced-v1` is intentionally one understandable heuristic, not optimal AI.
- The final 250-game two-player sample shows a 55.2% first-seat win rate. This is a
  balance finding, not silently tuned away in this milestone; larger matrices
  across player/world counts should determine whether rules, assignment, or the
  heuristic drives it.
- The normal extended runner is sequential for deterministic ordering. At the
  measured 12-territory throughput, 10,000 games are an explicit long run rather
  than a normal test gate.
- Controller observations expose public information only, but this remains a
  trusted local app rather than a secure multiplayer authority.
- Setup URLs omit full player profiles/controllers by design; saves are the
  canonical resume mechanism.
- There is no passive/random testing controller because the existing generation
  simulator already provides two seeded legal-action policies, and another
  parallel rules surface was not justified.
- No remote model, API-key flow, backend proxy, dashboard, replay UI,
  tournament, networking, fog of war, cards, or unrelated rule was added.

The recommended next milestone is a larger multi-configuration balance study
using the JSON reports, especially first-seat advantage, continent bonuses,
stalemate rates on 3–6 player worlds, and whether an internal passive controller
adds measurable diagnostic value. A small read-only local analysis dashboard can
then consume the existing report format without changing the engine boundary.
