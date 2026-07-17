# Codex Handoff

## Current state

The first technical prototype is complete. It renders a deterministic, interactive 3D strategic globe with 42 territories and 6 connected continents. The repository is a new Vite/React/TypeScript application; there is no backend or persisted match state.

The implementation has been verified with:

```bash
pnpm test
pnpm lint
pnpm build
pnpm format:check
```

All commands pass. Vitest currently runs 9 generator tests. Vite emits a non-blocking warning because the Three.js/R3F production chunk is about 328 KB gzip.

## Start here

- `README.md` explains the generation technique, architecture decisions, limitations, and deferred scope.
- `src/core/generation/generatePlanet.ts` is the top-level deterministic generation pipeline.
- `src/core/generation/buildAdjacency.ts` classifies icosphere faces and derives graph edges from rendered borders.
- `src/core/generation/generateContinents.ts` creates connected graph partitions.
- `src/core/generation/validatePlanet.ts` contains Zod shape validation and graph invariants.
- `src/components/Planet.tsx` builds the single colored globe mesh and maps raycast face indices back to territories.
- `src/state/useGameStore.ts` owns the generated planet and interactive UI state.

## Important invariants

- Do not use `Math.random()` inside generation. Add a named deterministic seed stream when a generation phase needs randomness.
- Increment `GENERATOR_VERSION` in `src/core/generation/constants.ts` when a generation change intentionally alters existing seeded worlds.
- Keep `PlanetDefinition` serializable and free of React or Three.js objects.
- Territory adjacency must remain non-empty, symmetrical, deduplicated, self-link-free, and globally connected.
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
