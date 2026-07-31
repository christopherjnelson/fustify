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

`pnpm bundle:check` regenerates the report and grades it. It resolves route
graphs through the manifest by Rollup chunk name rather than hashed filenames,
follows static imports only, counts each shared chunk exactly once, checks gzip
route budgets and the raw largest-chunk budget, and rejects forbidden
test/development/Node imports. It refuses to grade a stale report and writes
`.fustify/reports/bundle/audit.json` with the full contributing asset list, the
Node version, and any failures. On failure it prints the exact assets that make
up the offending route.

Budget definitions live in `src/build/bundleBudget.ts` and are unit tested in
`src/build/bundleBudget.test.ts`. Browser-level route isolation is enforced by
`tests/e2e/bundle-isolation.spec.ts`.

| Budget                                             |           Limit |
| -------------------------------------------------- | --------------: |
| `public-shell` initial JavaScript, gzip            |   158,000 bytes |
| `homepage-preview` loaded JS, gzip                 |   470,000 bytes |
| `auth-page` initial JavaScript, gzip               |   150,000 bytes |
| `auth-profile-completion` initial JavaScript, gzip |   150,000 bytes |
| `local-game` setup JavaScript, gzip                |   472,000 bytes |
| `local-active-match` loaded JS, gzip               |   496,000 bytes |
| `multiplayer-entry` lobby/room JS, gzip            |   475,500 bytes |
| `multiplayer-match` loaded JS, gzip                |   504,000 bytes |
| `admin` initial JavaScript, gzip                   |   166,000 bytes |
| Largest JavaScript chunk, raw                      | 1,080,000 bytes |

The check uses Node's gzip implementation, whose byte count is slightly more
conservative than Vite's displayed gzip estimate, and it depends on the Node
version in use. CSS, fonts, images, source maps, and lazy chunks outside the
selected route graph are not counted.

`public-shell` remains the first-paint homepage graph and excludes the
dynamically imported WebGL preview. `homepage-preview` measures the eventual
homepage graph after opt-in, including the module worker that generates the
42-territory, 5-continent world. Vite does not list module workers as normal
manifest imports, so the checker explicitly discovers the emitted
`homeWorld.worker-*` asset and includes it in both the preview budget and the
largest-JavaScript check.

Bundle-analysis mode defines deterministic, non-secret placeholder Supabase
configuration. This keeps the production client graph measurable even when a
developer or CI runner has no `.env.local`; the placeholders are used only by
the analysis build and are never credentials.

## Reproducibility and policy

Run `pnpm clean` before collecting a formal comparison, then run
`pnpm bundle:check` twice with the same Node version. Vite content hashes and
the emitted asset bytes should agree between clean runs; `audit.json` may differ
only in its timestamp. Record the Node version with any measurement because
cross-version gzip totals are not evidence of application growth.

Review every budget failure. Do not raise a limit merely to make the check
pass. A feature adding more than approximately 15 KB gzip to an initial route
requires an explicit route/chunk explanation. Protected gameplay and admin
graphs must stay lazy; `tests/e2e/bundle-isolation.spec.ts` enforces that
boundary.

Rebaseline only for an intentional feature milestone after two clean,
reproducible builds. Update this runbook, the relevant constants, tests, and
completion report together. Treat a tiny raw largest-chunk overage as possible
threshold noise, but investigate any meaningful gzip increase on an initial
route.

## Investigating future growth

Run `pnpm bundle:check`, read the per-route contributing asset list it prints on
failure, then open the generated treemap for module-level detail. Check for new
dynamic-entry dependencies, duplicate package versions, barrels that pull
unexpected code, import-time side effects, and any test or Node-only paths.

Do not raise a budget to make the check pass. Explain the route graph, identify
the contributing assets, and preserve lazy boundaries before considering an
intentional rebaseline.
