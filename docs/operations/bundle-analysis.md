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

| Budget                                  |           Limit |
| --------------------------------------- | --------------: |
| `public-shell` initial JavaScript, gzip |   158,000 bytes |
| `homepage-preview` loaded JS, gzip      |   470,000 bytes |
| `auth-page` initial JavaScript, gzip    |   150,000 bytes |
| `local-game` initial JavaScript, gzip   |   472,000 bytes |
| `multiplayer-entry` initial JS, gzip    |   475,000 bytes |
| `admin` initial JavaScript, gzip        |    94,000 bytes |
| Largest JavaScript chunk, raw           | 1,080,000 bytes |

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

## Current baseline, route map, and rationale

See **[`../performance/bundle-budget-audit.md`](../performance/bundle-budget-audit.md)**
for the audited commit, tool versions, reproducibility evidence, the exact
contributing asset list for every route, chunk composition, historical growth
attribution, dependency duplication findings, the optimizations applied, and the
rationale and headroom behind each budget above.

## Investigating future growth

Run `pnpm bundle:check`, read the per-route contributing asset list it prints on
failure, then open the generated treemap for module-level detail. Check for new
dynamic-entry dependencies, duplicate package versions, barrels that pull
unexpected code, import-time side effects, and any test or Node-only paths.

Do not raise a budget to make the check pass. The ongoing bundle policy,
including the ~15 KB per-feature investigation threshold and the rebaselining
rules, is documented in the audit.
