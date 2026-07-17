# Worldseed agent guidance

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
