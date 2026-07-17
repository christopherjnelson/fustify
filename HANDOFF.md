# Codex Handoff

## Current state

Worldseed is ready for small trusted local hot-seat playtests. It has explicit `world-setup`, `pregame`, `handoff`, `playing`, and `game-over` modes, editable player profiles, deterministic starting-position candidates, balance preview, mandatory turn handoffs, and one validated browser-local save slot.

The important boundaries are:

- `WorldSetup`: URL-shareable world parameters only.
- `PlanetDefinition`: immutable generated geography and topology.
- `MatchSetup`: local profiles, stable seats, ownership variant, starting assignment, and balance analysis.
- `MatchState`: mutable rules state, combat sequence, events, and victory.
- View state: camera focus, hover, drawers, display mode, and debug preferences.

Setup URLs never contain an active match. A local save and URL setup may coexist; the opening panel offers Resume saved match or generation from the URL without silently destroying either.

## Main implementation locations

- `src/core/setup/playerConfig.ts`: profiles, palette IDs, normalization, validation.
- `src/core/setup/startingPositions.ts`: 32-candidate deterministic generation, fixed starting-army totals, hard validation, metrics, and 0–100 scoring.
- `src/core/appFlow.ts`: explicit application modes and handoff summary shape.
- `src/core/persistence/saveGame.ts`: save schema v1, Zod validation, deterministic serialization, and explicit v0 migration.
- `src/browser/localSave.ts`: the single `worldseed.local-match` localStorage slot.
- `src/state/useGameStore.ts`: flow transitions, autosave, resume, rematch, URL-history confirmation, and action blocking during handoff.
- `src/components/WorldSetupPanel.tsx`: URL setup versus local resume choice.
- `src/components/PregamePanel.tsx`: profiles, preview metrics, reroll, and start validation.
- `src/components/HandoffScreen.tsx`: focus-contained, non-dismissible next-player gate.
- `src/components/TerritoryHud.tsx`: existing rules controls plus compact save/rematch actions.
- `playwright.config.ts`: Chromium, deterministic Vite port 4173, failure artifacts, and the 1920×1080, 1366×768, and 390×844 projects.
- `tests/e2e/`: interaction/accessibility coverage, visual scenarios, and committed UI-region baselines.
- `src/testSupport/visualScenarios.ts`: development-only deterministic scenario construction using the real domain pipeline.
- `src/core/game/testFixtures.ts`: small explicit graph, ownership, continent, capture, and victory fixtures.
- `src/core/game/gameFixtures.test.ts`: readable fixture-based rules and invalid-action coverage.
- `src/core/simulation/simulator.ts`: deterministic conservative/aggressive reducer simulator with transition invariants and failure traces.
- `src/core/simulation/simulator.test.ts`: fast, stress, and single-seed replay matrices.

## Starting-position rules

The candidate seed includes world seed, generator version, stable player IDs, ownership variant, and candidate index. Each valid candidate owns every territory exactly once, gives every territory at least one army, keeps territory totals within one, and keeps equal army totals. A complete bonus-4-or-greater continent is hard-invalid.

The score penalizes territory and army spread, excess components, borders, sea-route endpoints, articulation/gateway disparity, average degree, landmass spread, isolated territories, and complete continents. Ratings are Excellent 90+, Good 75+, Uneven 55+, and Poor below 55. The scoring is deliberately heuristic.

Equal starting-army totals are 40/35/30/25/20 for 2/3/4/5/6 players. One army is assigned to every owned territory before deterministic distribution of the remainder.

## Turn handoff and persistence

`END_TURN` still prepares the next turn and reinforcement pool in the pure reducer. The store then switches to `handoff`; Begin turn only clears selections and reveals that already-prepared state, so reinforcements are not calculated twice. Game actions are rejected outside `playing`.

Autosave occurs after match start, Begin turn, reinforcement, combat, capture movement, phase transitions, fortification, turn advancement, handoff, and victory. Selection, hover, focus, camera, and display changes do not save. Resume reconstructs the planet from validated `WorldSetup`, verifies territory IDs/count, restores the exact match, clears private selections, and enters handoff unless the match is over.

## Visual inspection workflow

Playwright 1.61.1 uses its bundled Chromium 149 fallback build for Ubuntu 24.04. The configuration starts Vite automatically on port 4173. Run `pnpm exec playwright install chromium` once on a new machine, then use:

```bash
pnpm test:e2e
pnpm test:visual
pnpm test:visual:update
```

The visual suite covers world setup, pregame, first handoff, reinforcement, attack source/target, combat result, pending capture, player elimination, fortification, game over, navigator, event log, and saved-resume prompt at all three viewport sizes. UI-region baselines live in `tests/e2e/visual.spec.ts-snapshots/`; full-page human-review captures are generated under `test-results/ui-review/<project>/` and intentionally ignored by Git.

The visual driver is available only in Vite development mode with `visual-review=1`. Production-build inspection confirmed that `__WORLDSEED_VISUAL__` and `visualScenarios` are absent from `dist`. The fixed seed, camera, reduced motion, UTC timezone, deterministic font, disabled orbit controls, and hidden star field keep captures stable. Do not replace human review with baseline assertions: inspect clipping, scroll regions, globe overlap, dialog obstruction, contrast, phase-control visibility, and horizon markers after UI changes. `AGENTS.md` contains the required agent checklist.

The first full inspection found and fixed two issues: the mobile event-log capture did not reveal the log below the HUD's internal fold, and the translucent game-over surface allowed underlying controls to reduce contrast. No remaining desktop/laptop clipping, inaccessible mobile phase controls, modal obstruction, or detached horizon markers was observed.

## Gameplay simulation and coverage

`pnpm test:simulation` runs the quick deterministic matrix. `pnpm test:simulation:stress` covers 135 world/setup combinations across 2–6 players, 12/18/24 territories, 2/3/4 continents, three ownership variants, both bot policies, and a 750-action limit per match. The bounded world or starting-position candidate search can reject an individual small-world seed; the simulator retries deterministic suffixes and uses the successful actual planet seed in every transition failure trace.

Replay a failure using the reported values:

```bash
SIMULATION_SEED='<seed>' SIMULATION_TERRITORIES=18 \
SIMULATION_CONTINENTS=3 SIMULATION_PLAYERS=4 \
SIMULATION_VARIANT=0 SIMULATION_POLICY=aggressive \
pnpm test:simulation:replay
```

`pnpm test:coverage` reports the pure game and save-schema modules and writes an HTML report to `coverage/`. Focus on meaningful command, phase, and validation branches rather than an arbitrary 100% target.

The current focused report is 92.54% statements, 87.5% branches, 100% functions, and 92.68% lines. The main gaps are defensive reducer command variants and malformed save-version/shape cases; combat, match creation, event construction, reinforcement, and legal-action lines have complete coverage.

Current deterministic results: smoke reached 7 victories in 20 runs over 7,767 transitions; stress reached 124 victories in 270 runs over 146,287 transitions. Other runs reached the configured action bound without invariant failure.

## Verification baseline

The current baseline is 112 passing Vitest tests across 11 files (plus two intentionally gated simulation cases), 57 Playwright interaction/accessibility checks, and 42 Playwright visual comparisons. Run:

```bash
pnpm test
pnpm test:coverage
pnpm test:simulation
pnpm test:simulation:stress
pnpm test:e2e
pnpm test:visual
pnpm lint
pnpm build
pnpm format:check
git diff --check
```

Vite may emit the existing non-blocking Three.js/R3F chunk-size warning.

## Known limitations and next milestone

- Balance is heuristic rather than mathematically perfect.
- Saves are browser-local, single-slot, and tied to a compatible generator version.
- Confirmation prompts use native browser confirmation for destructive flow changes.
- Broader production mobile polish and formal usability testing remain outstanding.
- There is no AI, backend, authentication, cloud save, matchmaking, or online multiplayer.

The repository is ready for the next task. Start with structured friend playtesting, using the local save/resume flow and the Playwright screenshots to record reproducible UI states. Follow with evidence-based tuning of balance weights, starting-army totals, handoff copy, and narrow-screen pregame layout. Keep online authority and cards deferred until the local loop is validated.
