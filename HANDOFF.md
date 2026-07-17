# Codex Handoff

## Current state

Worldseed is a deterministic globe-strategy prototype with a complete trusted local hot-seat loop. The generated planet remains immutable while a separate serializable match state owns live territory ownership, armies, turns, phases, selections, pending captures, combat sequence, elimination, victory, and events.

The playable loop is:

1. Reinforce with territory-count and fully owned continent bonuses.
2. Attack zero or more strategically adjacent enemies across land borders or sea routes.
3. Complete mandatory post-capture army movement.
4. Fortify once through an owned path or skip.
5. End the turn and advance to the next non-eliminated player.

Combat uses deterministic match-seed/combat-sequence RNG streams, standard attacker/defender dice limits, defender-wins-ties comparisons, and replayable event records. Captures update ownership, elimination, and victory. The globe supports ownership, continent, and terrain views plus phase-aware source/target treatment and renderer-local horizon fading for army markers.

There is no backend, persistence, authentication, networking, or server authority.

## Verification baseline

The current baseline is 57 passing Vitest tests: 33 generation/graph tests and 24 match-rule tests. Before handoff, run:

```bash
pnpm test
pnpm lint
pnpm build
pnpm format:check
git diff --check
```

Vite may emit the existing non-blocking Three.js/R3F chunk-size warning.

## Start here

- `README.md` documents generation, match rules, interaction, branding, limitations, and deferred scope.
- `src/core/game/` contains the pure match engine, legal-action helpers, deterministic combat, turn progression, and tests.
- `src/core/generation/generatePlanet.ts` is the immutable world-generation entrypoint.
- `src/core/generation/analyzeGraph.ts` contains strategic graph and cohesion analysis.
- `src/state/useGameStore.ts` coordinates the current planet, match reducer, and UI-only preferences.
- `src/components/Planet.tsx` maps match state and legal-action sets onto the generated globe.
- `src/components/ArmyMarkers.tsx` owns numbered marker rendering and camera-facing horizon visibility.
- `src/components/TerritoryHud.tsx` contains phase-specific hot-seat controls and event/debug panels.
- `src/app/App.tsx` owns the board-level logo variant selection.

## Branding state

Branding is outside the match HUD. The upper-right board logo defaults to variant B and is selected through the `logo` query parameter:

```text
/?logo=a
/?logo=b
```

The retained transparent assets are:

- `public/assets/worldseed-logo-a.png` — original logo backup
- `public/assets/worldseed-logo-b.png` — glitch-style secondary logo, current default

Keep both until a future task explicitly selects and removes a variant.

## Important invariants

- Never mutate `PlanetDefinition` during gameplay.
- Keep `PlanetDefinition` and `MatchState` serializable and free of React or Three.js objects.
- Components dispatch typed game actions; gameplay rules and validation stay in `src/core/game/`.
- Invalid actions return structured errors and must not mutate match state.
- Do not use `Math.random()` for generation or combat. Add named deterministic streams.
- Ocean cells remain unassigned; territory cells remain contiguous land.
- Strategic adjacency remains symmetric, deduplicated, self-link-free, and globally connected.
- Physical landmasses and gameplay continents remain separate concepts.
- React Three Fiber owns scene objects and frame-level marker/camera calculations; avoid frame-by-frame Zustand updates.
- Land borders and sea routes both count for attacks and owned-path fortification.
- A captured territory requires its legal post-capture move before any other action.
- Regenerating creates a new match for the new world; Reset Match restores the deterministic initial state for the current seed.

## Recommended next milestone

Add a versioned, shareable setup/match URL model while preserving the existing `logo` query parameter. Include seed and supported generation settings, safe parsing/fallback behavior, URL updates after regeneration, and tests proving copied URLs reconstruct the same world. Accessible keyboard/list-based territory navigation is the next complementary usability improvement.

## Deliberately deferred

- Multiplayer, networking, and server authority
- Authentication, persistence, matchmaking, reconnects, and spectators
- Cards, trading, and alliances
- AI opponents
- Detailed terrain modifiers and true voxel terrain
- Individual troop models
- Sound and production animation polish
- Production mobile polish
