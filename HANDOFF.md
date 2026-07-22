# Fustify Handoff

## Supabase multiplayer foundation (July 2026)

Branch `feat/supabase-multiplayer-foundation` starts at
`cd5a263397e717081b3826b55571e32075db16b3`. The dedicated remote project is
`fustify-multiplayer` (`qwmsybhpjnfjiyxcspwj`, `us-east-1`); unrelated connected
projects were audited and left untouched. Four source-controlled migrations
create a private normalized lobby schema, restrictive grants/RLS, eight
authenticated transactional RPCs, and Realtime publication membership.

`/multiplayer` lazily restores or creates a persisted anonymous Supabase session.
Private rooms support durable members, five seats, host-only 42/5 defaults and
settings, concurrency-safe claims, canonical Realtime refetch/recovery, and an
idempotent host-only start transaction. Match start snapshots immutable setup,
seat order, and generator metadata. Every member renders the same corrected
world in a read-only globe/minimap preview and exposes a development fingerprint.
Gameplay commands are deliberately excluded.

Normal local and multiplayer creation now caps continents and seats at five,
while existing valid six-continent/six-seat saves, URLs, fixtures, and canonical
worlds retain compatibility. Do not change the generator as part of follow-up
multiplayer work; investigate six-continent quality separately.

Operational details, remote audit, migration/type commands, security boundaries,
cleanup, tests, limitations, and the next server-authoritative gameplay milestone
are in `MULTIPLAYER.md` and `SUPABASE.md`.

## Continent-generation quality (July 2026)

Branch `fix/continent-generation-quality` starts at
`e765a5324dad4253d110e037b11e353f98d6e004`. A 34-world real-UI Playwright
baseline found 15 land-disconnected continents and one severe exposed strip.
The combined 42/6 sample failed 10/22; 42/5 failed 4/8, so the adjacent
configuration was not better. History shows 42/6 was the initial prototype
default; the defect entered with physical landmasses when continent growth used
strategic adjacency and could cross sea routes.

Generation now limits terrain landmasses to the requested continent count,
allocates continent seeds per physical landmass, grows only over land borders,
and screens 96 deterministic candidates for hard connectivity and explicit
strip/tendril components. Validation independently enforces land-only
continent connectivity. Natural size diversity remains (the audited corrected
matrix includes 1–15-territory continents), while `calm-reef-648` and
`golden-citadel-587` are permanent unit and Playwright fixtures.

Run `pnpm test:world-visual` for acceptance or
`WORLD_AUDIT_PHASE=<name> pnpm audit:world-visual` for a non-blocking evidence
run. Ignored results include an HTML index, summary, metrics, minimaps, and four
canonical globe views under `.fustify/reports/world-generation/<phase>/`.
Generator seed output intentionally changes, but setup URLs, save schema v4,
migrations, territory-ID state restoration, gameplay, bonuses, controllers,
and sea routes retain their contracts. Full details are in
`WORLD_GENERATION.md`.

## Production bundle audit (July 2026)

Branch `perf/audit-production-bundle` starts at
`37825085f457771db21e3b7c3a077e6ecb37edf0`. The measured 1,039.22 kB raw
`App` chunk is about 88% Three.js/React Three Fiber by rendered module weight
and is required to show the initial neutral globe. Existing dynamic imports
keep `/admin` independent at about 309.07 kB raw route JavaScript; browser
coverage now asserts both route graphs directly.

`pnpm bundle:analyze` writes an ignored static treemap, raw statistics,
manifest, and isolated build under `.fustify/reports/bundle/`.
`pnpm bundle:check` applies tolerant, hash-independent route/chunk budgets and
rejects test, development-only, and Node runner imports. No manual chunks,
source-map setting, warning threshold, gameplay, generation, visuals, URLs,
admin behavior, or save schema v4 semantics changed. See `BUNDLE_ANALYSIS.md`
for the complete baseline and investigation procedure.

## Gameplay UX and study-liveness polish (July 2026)

Branch `feat/gameplay-ux-heartbeat-polish` starts at
`467ba01ccf98d0ea20d19bf495a0bad010fde24c`. Balance studies now use an atomic,
rate-limited heartbeat sidecar driven from bounded headless command-loop
progress opportunities. `/admin` distinguishes current, delayed, and stale
runner heartbeats from completed matches and checkpoints while continuing to
parse historical reports without heartbeat data.

Neutral world selection shows subtle dotted globe routes sourced directly from
canonical sea-route connections; Start Game restores contextual gameplay-only
route visibility. End Attack is separated from combat controls and confirms
only while legal attacks remain. The shared movement amount presentation omits
the slider when capture or fortification has exactly one legal value.

The right-panel work is intentionally limited to the new phase-actions section,
confirmation overlay, spacing, and fixed-value display. A broader panel
information-architecture or mobile HUD redesign remains deferred.

## Assignment-position diagnostics (July 2026)

Branch `fix/assignment-position-diagnostics` starts at `e568c3e`. Diagnostic
rotation blocks now use integer quotient/remainder accounting; factor inference
uses only complete 36-match prefixes while overall outcomes retain every match.
Standard is 576 (16 blocks) and thorough is 1,800 (50). New reports add exposure
cross-tabs, pre-turn graph/continent metrics, per-block summaries, evidence, and
held-world assignment reproductions. Report schema remains v1 additively and
saves remain v4.

The audit found no authoritative mapping or seed-chain correctness defect, so
gameplay and assignment rules were not changed. Focused run
`balance-2026-07-22T00-50-46-985Z-six-seat-diagnostic-block` completed 36/36:
34 victories, 1 stalemate, 1 turn cap, 0 engine errors, valid mapping;
assignment wins were 6/4/7/7/4/6. One fixture is intentionally insufficient
for factor classification and does not resolve the historical 121-versus-61
observation. Chris should run the documented 576-match standard diagnostic.

> This handoff now also includes a local verification dashboard milestone.
> Canonical operational details are in `VERIFICATION.md`; the historical
> controller context below remains valid.

## Current state

Branch `fix/controller-identity-bias` starts at
`f2a47f95b3cfd4e10ce10f4e346f0a47343008f1`. Investigation proved that the
six-seat runner rotated arrays without reassigning `seatIndex`; setup and match
sorting restored the original order, while aggregation attributed wins to
rotations that never occurred. The reducer also advanced turns through
`PlanetDefinition.players` instead of the authoritative match player order.
The correction applies real seat/assignment rotations, independently exposes
controller stream slots, validates complete 36-match coverage, and provides
compact `--debug-block` JSON.

Literal player IDs were also present in controller, default match, and starting
position seed material. Those label leaks are removed. Controller ties now use
match seed, `balanced-v1`, explicit stream slot, turn, phase, and decision
index. Player renaming is covered at command and complete-match levels. This
changes old bot choice sequences while leaving rules/combat deterministic and
save schema v4/URLs unchanged.

Branch `feat/seat-balance-diagnostics` starts at
`b32589e6e761897e2d5486a00815537e4048878d`. It corrects unresolved-outcome
seat reporting, makes 4/5/6-seat results primary in `/admin`, and adds a
six-seat paired rotation diagnostic without changing rules or bot heuristics.
Future agents should ask users to run standard/thorough diagnostics locally and
share the compact JSON; only smoke belongs in implementation verification.

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
world seed, ownership variant, and player count; headless matches accept it
explicitly. Controller tie-breaking adds controller version, explicit stream
slot, turn, phase, and decision index to a seeded stream. No controller calls
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
