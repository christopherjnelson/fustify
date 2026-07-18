# Codex Handoff

## Current state

Worldseed now has three explicit pregame lifecycle states—`neutral-preview`, `assignment-in-progress`, and `ready`—before its existing `handoff`, `playing`, and `game-over` application modes. A generated world is neutral: every `PlanetDefinition` territory has `ownerId: null` and zero armies. No `MatchState` exists until a complete assignment is explicitly started.

Players can choose deterministic distributed random assignment or a local player-controlled territory draft. Random remains the default for URLs, existing saves, simulations, and broad gameplay tests. The working tree should be clean at handoff.

## Important boundaries

- `WorldSetup`: URL-shareable seed, world counts, player count, and assignment strategy.
- `PlanetDefinition`: immutable neutral geography and topology. It no longer supplies playable ownership.
- `MatchSetup`: a discriminated union for neutral preview, draft in progress, or ready assignment.
- `StartingPosition`: complete owner/army map plus rebuilt balance analysis; present only in ready setup.
- `MatchState`: nullable before play, then mutable rules state for turns, combat, events, elimination, and victory.
- View state: camera focus, hover, panels, display mode, and debug preferences.

`createMatch` rejects neutral generated geography unless it receives a ready `MatchSetup`. Gameplay actions remain rejected outside `playing`. Reset/rematch is a store-level setup operation rather than a reducer command because the pure game state does not own starting setup.

## Main implementation locations

- `src/core/setup/startingPositions.ts`: setup discriminated union, deterministic random assignment, balance scoring, and mode-aware validation.
- `src/core/setup/territoryAssignment.ts`: assignment strategy boundary, round-robin draft commands, duplicate prevention, completion, and deterministic draft armies.
- `src/core/generation/generatePlanet.ts`: neutral geography generation only.
- `src/core/persistence/saveGame.ts`: schema v3, setup/draft saves, v0/v1/v2 migrations, and derived-analysis rebuilding.
- `src/state/useGameStore.ts`: lifecycle transitions, nullable match boundary, setup save/resume, random reroll, draft commands, and action gating.
- `src/components/PregamePanel.tsx`: profiles, accessible strategy radios, neutral messaging, keyboard draft picker, balance review, and explicit start.
- `src/components/Planet.tsx`: neutral geography colors, progressive draft ownership colors, and active-match markers/legal cues.
- `src/testSupport/visualScenarios.ts`: development-only neutral, random-ready, draft-progress, draft-complete, and draft-invalid scenarios plus gameplay fixtures.

## Neutral setup and assignment behavior

Initial load and every world generation/reroll display only geography. No ownership generator runs and no balance result is shown. Player names and colors can be edited only while neutral. Assignment mode is included as the optional URL parameter `assignment=random|player-draft`; old URLs omit it and continue to default to random.

Beginning random assignment calls the existing 32-candidate distributed generator without duplicating it. A successful result enters ready; reroll increments only `ownershipVariant`, preserving the planet and URL. Random hard blockers and Poor-layout confirmation remain unchanged.

The player draft is deterministic round-robin: accepted pick `n` belongs to seat `n % playerCount`. With uneven totals, earlier seats receive one extra territory. The active player can pick an unowned territory from the globe or accessible select/button controls. Duplicate and unknown picks are rejected without advancing. Cancel and restart clear ownership without regenerating geography. The last pick derives equal fixed starting-army totals with a named deterministic stream and enters ready before play.

Manual balance is advisory. Drafts still hard-fail incomplete/extra/unknown ownership, invalid players, count or army parity violations, zero allocations, and non-positive territory armies. Clusters, full continents, gateway concentration, and Poor balance scores are warnings rather than blockers.

## Persistence and migration

Save schema version 3 stores assignment mode, setup phase, optional draft `{pickIndex, territoryOwners}`, optional completed starting position, nullable match state, application mode, and timestamp. Save setup works in neutral, drafting, and ready states. Match start and semantic gameplay transitions continue to autosave.

Versions 0, 1, and 2 migrate to `assignmentMode: random`, `setupPhase: ready`, and `draft: null`. All schema versions reconstruct the planet and recompute balance analysis from the saved ownership map. Active saves resume through handoff; pregame saves resume directly to their setup phase. Large mutable draft state is deliberately local-only and never serialized into the URL.

## Visual and accessibility coverage

The visual suite now covers 22 scenarios at 1920×1080, 1366×768, and 390×844: world setup, neutral pregame, random ready, draft in progress, draft complete, duplicate-pick feedback, Poor/invalid/expanded/rerolled random states, and the existing handoff/gameplay/save states. Draft-complete and draft-invalid captures intentionally scroll the setup panel to prove the final Start match control and alert are reachable.

Manual inspection of all affected full-page captures found a clear neutral/owned distinction, progressive draft coloring, reachable internal scrolling, no setup-panel/globe obstruction beyond the intended mobile overlay, no clipped controls, and visible invalid feedback at every maintained viewport. No detached horizon markers or underlying gameplay controls appear during setup.

The interaction suite covers radio keyboard operation, turn announcements, duplicate feedback, explicit completion/start, neutral save/resume, in-progress draft save/resume, plus all existing gameplay and navigator behavior.

## Verification baseline

- Unit: 127 passing tests across 12 files, plus two intentionally gated simulation tests.
- Playwright interaction: 66 passing checks (22 at each maintained viewport). The all-project run reached 61 passes before the execution environment stopped Vite at its ten-minute boundary; a separate complete mobile run passed all 22, including the five connection-refused cases.
- Playwright visual: 66 passing comparisons after baseline update and human inspection.
- Coverage: 92% statements, 85.76% branches, 100% functions, 93.05% lines.
- Simulation smoke: 20 deterministic random-assignment runs pass without invariant failure.
- Simulation stress: 270 deterministic random-assignment runs across 135 world/setup combinations pass without invariant failure.
- Lint, production build, formatting, and `git diff --check`: passing. Vite retains the existing non-blocking bundle-size warning.

Run the complete gates with:

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

## Known limitations and next steps

- Draft order is simple round-robin rather than snake order. It is predictable and fair by territory count, but it does not compensate for strategic first-pick value.
- Draft progress uses the existing single browser-local save slot and requires the explicit Save setup control; it is not cloud-backed or automatically synchronized.
- Balance remains heuristic. Manual layouts intentionally permit strategically lopsided choices that are structurally legal.
- Native confirmation remains for destructive flow changes and Poor random starts.
- There is no AI, backend, authentication, online multiplayer, spectator mode, or hidden-information protection.

The logical next step is structured local playtesting of both assignment modes, especially first-seat advantage in round-robin drafts, mobile pass-the-device ergonomics during 42 picks, and whether an optional snake strategy is justified by evidence.
