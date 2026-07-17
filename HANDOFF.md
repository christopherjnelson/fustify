# Codex Handoff

## Current state

The strategic-readability milestone is complete. The prototype renders a deterministic globe with visible non-playable oceans, 42 contiguous territories, 6 spatially coherent gameplay continents, 4 balanced placeholder players, numbered army markers, smooth camera focus, selected/debug sea routes, and serialized graph/cohesion analysis. There is no backend or persisted match state.

The implementation has been verified with:

```bash
pnpm test
pnpm lint
pnpm build
pnpm format:check
```

All commands pass. Vitest covers terrain masks, territories, ownership, armies, physical landmasses, compact continents, route redundancy, graph algorithms, bonuses, validation, and serialization. Vite may emit a non-blocking chunk-size warning for the Three.js/R3F production bundle.

## Start here

- `README.md` explains the generation technique, architecture decisions, limitations, and deferred scope.
- `src/core/generation/generatePlanet.ts` is the top-level deterministic generation pipeline.
- `src/core/generation/generateTerrain.ts` builds and smooths deterministic land-likelihood candidates.
- `src/core/generation/generateTerritories.ts` selects spread land seeds and performs contiguous graph growth.
- `src/core/generation/buildConnections.ts` derives land borders and a minimal sea-route tree.
- `src/core/generation/generateContinents.ts` selects connected, boundary-weighted compact continent partitions.
- `src/core/generation/generatePlayers.ts` creates players and balanced connected ownership.
- `src/core/generation/analyzeGraph.ts` contains independent Tarjan graph analysis and cohesion metrics.
- `src/core/generation/validatePlanet.ts` contains Zod shape validation and graph invariants.
- `src/components/Planet.tsx` builds separate land/ocean meshes and maps land raycasts back to territories.
- `src/components/ArmyMarkers.tsx` builds shared-material numbered sprite markers without per-territory React components.
- `src/components/CameraController.tsx` handles renderer-local focus interpolation.
- `src/state/useGameStore.ts` owns the generated planet and interactive UI state.

## Important invariants

- Do not use `Math.random()` inside generation. Add a named deterministic seed stream when a generation phase needs randomness.
- Increment `GENERATOR_VERSION` in `src/core/generation/constants.ts` when a generation change intentionally alters existing seeded worlds.
- Keep `PlanetDefinition` serializable and free of React or Three.js objects.
- Ocean cells must remain unassigned and territory cells must remain contiguous land.
- Strategic connections must remain symmetrical, deduplicated, self-link-free, and globally connected.
- Physical landmasses and gameplay continents are independent domain concepts.
- Gameplay continents must remain connected and spatially coherent according to land-border weights.
- Every territory must have one valid player owner and an army value inside placeholder bounds.
- Serialized graph analysis must match a fresh analysis of generated connections.
- Continents must remain non-empty and graph-connected.
- Rendering and logical generation currently share the same icosphere subdivision constant so visual borders and adjacency agree.

## Suggested next Codex task

Add shareable, versioned planet setup URLs without expanding into gameplay. Introduce a small setup model containing seed, generator version, territory count, and continent count; encode it in URL query parameters; initialize the store from valid parameters; update the URL after regeneration; handle malformed or unsupported values safely; and add unit tests for parsing and serialization. Preserve deterministic generation and reset hover/selection when setup changes.

Acceptance criteria:

1. Loading a copied URL reconstructs the same logical planet.
2. Seed and configurable territory/continent counts are reflected in the HUD and URL.
3. Invalid parameters fall back to documented defaults without crashing.
4. Existing generator and graph tests continue to pass.
5. New setup parsing/serialization tests are included.
6. `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm format:check` pass.

## Scope still deliberately deferred

Do not introduce multiplayer, a backend, authentication, combat, reinforcement rules, detailed or true voxel terrain, individual troops, sound, animations, or AI unless a new task explicitly changes the scope.
