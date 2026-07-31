# Fustify agent guidance

## Documentation router

Keep `README.md` and this file at the repository root. Long-form documentation
lives under `docs/`; load only the guides relevant to the task:

- Documentation index: [`docs/README.md`](docs/README.md)
- Product overview, local setup, commands, rules, and architecture:
  [`README.md`](README.md)
- Multiplayer lifecycle and authority model:
  [`docs/gameplay/multiplayer.md`](docs/gameplay/multiplayer.md)
- Bots, controller boundaries, simulation, and replay:
  [`docs/gameplay/controllers.md`](docs/gameplay/controllers.md)
- Balance-study operation and interpretation:
  [`docs/gameplay/balance-studies.md`](docs/gameplay/balance-studies.md)
- Verification reports and the development admin dashboard:
  [`docs/operations/verification.md`](docs/operations/verification.md)
- Supabase schema, security, Auth, functions, and remote validation:
  [`docs/operations/supabase.md`](docs/operations/supabase.md)
- Production builds and bundle budgets:
  [`docs/operations/bundle-analysis.md`](docs/operations/bundle-analysis.md)
- Droplet deployment, rollback, and recovery:
  [`docs/operations/deployment.md`](docs/operations/deployment.md)
- Generator invariants, visual audits, and normalized-generator design:
  [`docs/world-generation/README.md`](docs/world-generation/README.md)
- Brand assets and usage: [`docs/brand/README.md`](docs/brand/README.md)

When guidance conflicts, follow this file first, then the current domain
runbook. Update the relevant domain guide when behavior or operational commands
change.

## Required visual workflow

For changes that affect layout, controls, dialogs, responsive behavior, globe presentation, or accessibility, use the Playwright workflow in addition to unit tests.

1. Ensure Chromium is installed with `pnpm exec playwright install chromium`.
2. Run `pnpm test:e2e` for DOM, keyboard, focus, camera-request, and phase-action behavior.
3. Run `pnpm test:visual` for the committed UI-region comparisons.
4. Inspect the full-page PNGs under `test-results/ui-review/desktop-1920/`, `laptop-1366/`, and `mobile-390/` yourself. Passing screenshot assertions are not a substitute for visual review.
5. Check clipping, internal scrolling, panel/globe overlap, modal obstruction, contrast, hidden phase controls, responsive spacing, and detached horizon markers.
6. If an intentional UI change requires new baselines, run `pnpm test:visual:update`, inspect every affected full-page capture, and then rerun `pnpm test:visual`.

Playwright starts Vite on port 4173. Its Chromium projects are 1920×1080, 1366×768, and 390×844. Full-page review output is generated under `test-results/ui-review/`; UI-region baselines are committed under `tests/e2e/visual.spec.ts-snapshots/`.

## Scenario-fixture safety

The visual scenario driver lives in `src/testSupport/visualScenarios.ts`. It must remain development-only and gated by both `import.meta.env.DEV` and the `visual-review=1` query parameter in `src/main.tsx`. Do not import it from production application modules, expose it without the development guard, or use fixture-only state in normal gameplay.

Scenarios should use real domain construction and transitions wherever practical: `generatePlanet`, player and match setup helpers, `createMatch`, and `gameReducer`. Keep the fixed seed, camera, reduced-motion behavior, font, timezone, and hidden star field stable. Avoid full-scene pixel assertions against WebGL; prefer DOM assertions, focused UI-region screenshots, reasonable tolerances, and full-page images for human review.

When adding a user-visible application state, add or update a deterministic visual scenario and its interaction/accessibility coverage.

## Gameplay verification workflow

Rules changes must be checked against all three gameplay layers:

1. `pnpm test` for hand-authored fixtures, persistence, setup, and generation tests.
2. `pnpm test:simulation` for the fast deterministic conservative/aggressive matrix.
3. `pnpm test:simulation:stress` before handing off changes to rules, generation, setup, persistence, or turn flow.

Use `pnpm test:coverage` to inspect pure rules and persistence branches. Do not change gameplay semantics solely to increase a coverage percentage.

Simulation failures must retain the reproduction block printed by the harness. Replay it with `SIMULATION_SEED`, `SIMULATION_TERRITORIES`, `SIMULATION_CONTINENTS`, `SIMULATION_PLAYERS`, `SIMULATION_VARIANT`, and `SIMULATION_POLICY` followed by `pnpm test:simulation:replay`. The simulator must continue to choose actions through the real legal-action helpers and apply them through `gameReducer`; do not introduce a parallel rules implementation.

## Verification dashboard workflow

Use `pnpm verify:report` for ordinary completed implementation work and
`pnpm verify:report:full` when Playwright and stress suites are required. Keep
the development-only `/admin` page open when useful and include the generated
verification run ID in the handoff. Reports live under ignored
`.fustify/reports/`; do not commit run history. Never claim that a suite passed
when its structured report says pending, skipped, interrupted, or incomplete.

## Balance-study purpose

Keep product-balance conclusions focused on 42-territory, 6-continent worlds
with 4–6 seats. Retain small/two-player/unusual configurations as explicitly
labeled engine coverage. Never reinterpret legacy study reports under newer
preset definitions; preserve preset-version metadata and per-player-count seat
baselines.
