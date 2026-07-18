# Codex Handoff

## Current state

Worldseed now includes a responsive, read-only equirectangular minimap throughout world preview, assignment, ready setup, and active play. The 3D globe remains the authoritative gameplay surface. The minimap projects the existing `PlanetDefinition.surfaceCells`, canonical territory centers and connections, setup ownership, and live `MatchState`; it does not regenerate from the seed or own parallel IDs or state.

The existing three pregame lifecycle states—`neutral-preview`, `assignment-in-progress`, and `ready`—remain intact before `handoff`, `playing`, and `game-over`. A generated world is neutral: every `PlanetDefinition` territory has `ownerId: null` and zero armies. No `MatchState` exists until a complete assignment is explicitly started.

Players can choose deterministic distributed random assignment or a local player-controlled territory draft. Random remains the default for URLs, existing saves, simulations, and broad gameplay tests. The working tree should be clean at handoff.

## Important boundaries

- `WorldSetup`: URL-shareable seed, world counts, player count, and assignment strategy.
- `PlanetDefinition`: immutable neutral geography and topology. It no longer supplies playable ownership.
- `MatchSetup`: a discriminated union for neutral preview, draft in progress, or ready assignment.
- `StartingPosition`: complete owner/army map plus rebuilt balance analysis; present only in ready setup.
- `MatchState`: nullable before play, then mutable rules state for turns, combat, events, elimination, and victory.
- View state: camera focus, hover, panels, display mode, and debug preferences.
- Minimap view state: only the derived globe-center longitude/latitude; projection geometry and ownership remain derived and are not persisted.

`createMatch` rejects neutral generated geography unless it receives a ready `MatchSetup`. Gameplay actions remain rejected outside `playing`. Reset/rematch is a store-level setup operation rather than a reducer command because the pure game state does not own starting setup.

## Main implementation locations

- `src/core/setup/startingPositions.ts`: setup discriminated union, deterministic random assignment, balance scoring, and mode-aware validation.
- `src/core/setup/territoryAssignment.ts`: assignment strategy boundary, round-robin draft commands, duplicate prevention, completion, and deterministic draft armies.
- `src/core/generation/generatePlanet.ts`: neutral geography generation only.
- `src/core/persistence/saveGame.ts`: schema v3, setup/draft saves, v0/v1/v2 migrations, and derived-analysis rebuilding.
- `src/state/useGameStore.ts`: lifecycle transitions, nullable match boundary, setup save/resume, random reroll, draft commands, and action gating.
- `src/components/PregamePanel.tsx`: profiles, accessible strategy radios, neutral messaging, keyboard draft picker, balance review, and explicit start.
- `src/components/Planet.tsx`: neutral geography colors, progressive draft ownership colors, and active-match markers/legal cues.
- `src/core/minimap/projection.ts`: deterministic equirectangular projection, polygon clipping, line/route seam splitting, great-circle sampling, and geometry cache.
- `src/components/Minimap.tsx`: non-interactive SVG renderer with ownership-only style updates and a camera-center reticle.
- `src/presentation/territoryVisuals.ts`: shared globe/minimap ownership-state and territory-color resolution.
- `src/presentation/globeOrientation.ts`: shared globe rotation and camera-to-geographic-focus conversion.
- `src/testSupport/visualScenarios.ts`: development-only neutral, random-ready, draft-progress, draft-complete, and draft-invalid scenarios plus gameplay fixtures.

## Neutral setup and assignment behavior

Initial load and every world generation/reroll display only geography. No ownership generator runs and no balance result is shown. Player names and colors can be edited only while neutral. Assignment mode is included as the optional URL parameter `assignment=random|player-draft`; old URLs omit it and continue to default to random.

Beginning random assignment calls the existing 32-candidate distributed generator without duplicating it. A successful result enters ready; reroll increments only `ownershipVariant`, preserving the planet and URL. Random hard blockers and Poor-layout confirmation remain unchanged.

The player draft is deterministic round-robin: accepted pick `n` belongs to seat `n % playerCount`. With uneven totals, earlier seats receive one extra territory. The active player can pick an unowned territory from the globe or accessible select/button controls. Duplicate and unknown picks are rejected without advancing. Cancel and restart clear ownership without regenerating geography. The last pick derives equal fixed starting-army totals with a named deterministic stream and enters ready before play.

Manual balance is advisory. Drafts still hard-fail incomplete/extra/unknown ownership, invalid players, count or army parity violations, zero allocations, and non-positive territory armies. Clusters, full continents, gateway concentration, and Poor balance scores are warnings rather than blockers.

The minimap follows the same lifecycle directly: neutral setup has geographical colors, drafts mix owned and neutral territories immediately, ready setup is fully owned, and active reducer ownership changes replace the corresponding fill. Cancel/restart clears only derived ownership styling and does not rebuild geography.

## Persistence and migration

Save schema version 3 stores assignment mode, setup phase, optional draft `{pickIndex, territoryOwners}`, optional completed starting position, nullable match state, application mode, and timestamp. Save setup works in neutral, drafting, and ready states. Match start and semantic gameplay transitions continue to autosave.

No schema change was needed for the minimap. Projected geometry and camera focus are deliberately absent from saves. Loading reconstructs the canonical planet and derives identical flat geometry.

Versions 0, 1, and 2 migrate to `assignmentMode: random`, `setupPhase: ready`, and `draft: null`. All schema versions reconstruct the planet and recompute balance analysis from the saved ownership map. Active saves resume through handoff; pregame saves resume directly to their setup phase. Large mutable draft state is deliberately local-only and never serialized into the URL.

## Visual and accessibility coverage

The visual suite covers the existing setup/gameplay states plus draft-start, a deliberate land-and-sea-route antimeridian world, and three representative globe-focus orientations at 1920×1080, 1366×768, and 390×844. Draft-complete and draft-invalid captures intentionally scroll the setup panel to prove the final Start match control and alert are reachable.

Manual inspection of all 81 full-page captures found a clear neutral/owned distinction, progressive draft coloring, reachable internal scrolling, no setup-panel/minimap overlap, no clipped controls, no full-width seam artifacts, readable routes and borders, distinct reticle positions, and visible invalid feedback at every maintained viewport. The mobile layout retains a usable globe band between its independently scrolling primary panel and compact minimap. No detached horizon markers or underlying gameplay controls appear during setup.

The interaction suite additionally covers minimap visibility, neutral/random/draft/live ownership, cancel/restart resets, reducer ownership, non-interaction, keyboard exclusion, camera-focus synchronization, and responsive separation from primary controls.

## Verification baseline

- Clean-baseline Playwright interaction: the complete pre-change all-project suite passed uninterrupted, 66/66 in 10.4 minutes.
- Unit: 139 passing tests across 13 files, plus two intentionally gated simulation tests.
- Playwright interaction: 75/75 passing checks (25 at each maintained viewport) in one uninterrupted 12.0-minute invocation.
- Playwright visual: 81/81 passing comparisons after the 81/81 baseline-update run and human inspection of every full-page capture at all three maintained viewports.
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
- The minimap has no click-to-focus, selection, tooltip, army labels, independent pan/zoom, or gameplay controls. Optional minimap-to-globe focusing is the clearest follow-up after usability evidence.
- Future human, heuristic, replay, or remote-model controllers should continue using validated store/game actions. No AI/controller abstractions were added in this rendering milestone.

The logical next step is structured local playtesting of both assignment modes, especially first-seat advantage in round-robin drafts, mobile pass-the-device ergonomics during 42 picks, and whether an optional snake strategy is justified by evidence.
