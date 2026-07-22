# Production bundle analysis

## Commands and output

`pnpm bundle:analyze` performs the same TypeScript and minified Vite production
build as `pnpm build`, with analysis plugins and a manifest enabled only for the
`bundle-analysis` mode. It creates:

- `.fustify/reports/bundle/report.html`: static interactive treemap
- `.fustify/reports/bundle/stats.json`: machine-readable module graph and sizes
- `.fustify/reports/bundle/dist/`: isolated analyzed build and Vite manifest

The command does not open a browser or alter ordinary `dist/`. All of these
paths are covered by the existing `.fustify/reports` ignore rule.

`pnpm bundle:check` regenerates the report, resolves route graphs through the
manifest instead of hashed filenames, and checks gzip route budgets, the raw
largest-chunk budget, and forbidden test/development/Node imports. The current
budgets intentionally allow small bundler variation above the measured build:

| Budget                         |           Limit |
| ------------------------------ | --------------: |
| Initial game JavaScript, gzip  |   380,000 bytes |
| Initial admin JavaScript, gzip |   125,000 bytes |
| Largest JavaScript chunk, raw  | 1,075,000 bytes |

The check uses Node's gzip implementation, whose byte count is slightly more
conservative than Vite's displayed gzip estimate. CSS, images, source maps, and
lazy chunks outside the selected route graph are not counted as initial-route
JavaScript.

## July 2026 baseline

Starting commit: `37825085f457771db21e3b7c3a077e6ecb37edf0`.

The production build transformed 736 modules and emitted this warning:

```text
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
```

| Asset                        |         Raw | Vite gzip |
| ---------------------------- | ----------: | --------: |
| `index-76o5PNAb.css`         |    36.83 kB |   8.87 kB |
| `AdminDashboard-DoXSZW0F.js` |    19.82 kB |   5.61 kB |
| `reportSource-CVybTRLt.js`   |    20.77 kB |   5.91 kB |
| `schemas-B7swTkdL.js`        |    73.17 kB |  19.57 kB |
| `index-BoXoufQ1.js`          |   195.31 kB |  61.61 kB |
| `App-C1NDLR33.js`            | 1,039.22 kB | 285.09 kB |

`index.html` is 0.58 kB raw/0.35 kB gzip. The two PNG brand assets are 228,078
and 402,524 bytes and are not JavaScript. No `.map` files were emitted because
the production configuration does not currently enable source maps.

The root route loads `index`, `schemas`, and `App`: about 1,307.70 kB raw and
366,271 bytes using the check's gzip method (366.27 kB by summing Vite's
displayed estimates). The admin route loads `index`, `schemas`,
`AdminDashboard`, and `reportSource`: about 309.07 kB raw and 92,697 bytes by
the check's gzip method (92.70 kB by Vite's displayed estimates). These are
three JavaScript requests for root and four for admin; the shared `schemas`
chunk exists because both save validation and admin report validation use Zod.

## Cause and route boundaries

The visualizer attributes about 88% of the large `App` chunk's rendered module
weight to Three.js, React Three Fiber, and small Drei/Three-stdlib helpers.
Globe/generation/presentation code is about 7%, other application code about
3%, game/controllers about 1%, and save persistence below 1%. The shared
`index` chunk is about 94% React DOM by rendered module weight; `schemas` is
Zod. These percentages describe relative module contribution before Vite's
final minification, so they should not be added to the emitted byte table.

There is one installed copy of each runtime library in the browser graph.
Three's `three.core.js` and `three.module.js` entries are complementary parts of
the same package build, not duplicate installed versions. No admin presentation
code is in `App`; no globe, generation, game orchestration, URL setup, test
support, Playwright, Vitest, Node runner, or reporting plugin code is in the
admin route. The development-only visual scenario import is removed from the
production graph by its `import.meta.env.DEV` guard.

The existing dynamic imports in `src/main.tsx` are the meaningful architecture:
`App` for the game, plus `AdminDashboard` and `reportSource` for admin. The
neutral globe is intentional first-render content, so deferring its renderer
would change the loading experience. Smaller phase panels and save parsing are
tightly coupled to immediate setup/save status; splitting them would add
requests and loading states for only a small reduction. No manual chunks or
warning-threshold increase were justified by the measurements.

## Investigating future growth

Run `pnpm bundle:check`, open the generated treemap, and compare route totals
and the largest module groups. Check for new dynamic-entry dependencies,
duplicate package versions, barrels that pull unexpected code, import-time side
effects, and any test or Node-only paths. Treat source-map size separately.
Prefer removing unexpected imports or adding a real route/feature boundary over
package-name vendor chunks. If intentional rendering dependencies grow beyond
the tolerance, document the new measurement and architectural reason before
changing a budget.
