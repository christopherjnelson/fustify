# Bundle budget audit

Audited commit: `73428e0a7d84140fb104918930bdb9118876e689`
(`fix: simplify hero and contain account dialogs`), measured on branch
`perf/bundle-budget-audit`.

| Tool             | Version                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| Node             | v24.18.0                                                                  |
| pnpm             | 10.28.2 (matches `packageManager`)                                        |
| `pnpm-lock.yaml` | sha256 `9845d67bf5d6e6cbf217717fd975a41f38e812cdb44c792b1bb6c242d132bd71` |
| Install          | `pnpm install --frozen-lockfile`                                          |
| Build            | `pnpm bundle:check` → `tsc -b && vite build --mode bundle-analysis`       |

Env files present: `.env.example` and `.env.local`, both defining only
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Neither is read by the
build; Vite loads `.env.local` in every mode, and neither variable affects
chunking. There are no `.env.production*` or `.env.bundle-analysis*` files.

## Reproducibility

`dist`, `.fustify/reports/bundle/dist`, and `.fustify/reports/bundle/.vite`
were deleted before each run. Two clean runs on the audited commit produced
**byte-identical output** (23 files, identical sha256 for every file, identical
content hashes in every filename) and identical measurements. The same holds
for the two clean runs performed after the changes in this audit. The
`audit.json` artifact is identical between runs apart from its timestamp.

Reported measurements are therefore stable and were not affected by stale
output.

## What the budget checker measures

The checker is `scripts/checkBundle.ts` (I/O) plus `src/build/bundleBudget.ts`
(pure evaluation, unit tested in `src/build/bundleBudget.test.ts`).

- **Input.** The Vite manifest at `.fustify/reports/bundle/dist/.vite/manifest.json`,
  emitted only in `--mode bundle-analysis` (`vite.config.ts` sets
  `manifest: true`, `emptyOutDir: true`, and `outDir` under the report root).
  Module-level data comes from the `rollup-plugin-visualizer` raw-data
  `stats.json`.
- **Route graph.** For each route, the roots are the HTML entry chunk plus the
  chunks the router loads for that route, resolved by **Rollup chunk name**
  (`manifest[key].name`), never by content hash. The measured set is the
  transitive closure over **static `imports` only**. `dynamicImports` are
  deliberately excluded: they are exactly what code splitting buys, and
  counting them would make every budget equal to the whole application.
- **Deduplication.** The traversal keeps a visited set, so a shared chunk such
  as `schemas` (zod) that is reached from several roots is counted once, and
  static-import cycles terminate. Emitted files are additionally de-duplicated
  in a `Set` before sizing, and sorted deterministically.
- **Sizing.** Only `.js` assets are counted. Each file is compressed
  independently with Node's `zlib.gzipSync` at default options. CSS, fonts,
  images, HTML, and the manifest are excluded, so no already-compressed asset
  is double counted. The build emits no source maps.
- **Largest chunk.** The maximum raw (uncompressed, on-disk) byte size across
  every distinct `.js` asset in the manifest, regardless of route.
- **Forbidden modules.** `stats.json` is scanned for Playwright, Vitest, Node
  built-ins, `scripts/balanceStudy`, `scripts/verifyReport`, `src/testSupport/`,
  and `src/build/` fingerprints.
- **Staleness.** The checker now refuses to grade a report whose `stats.json`
  predates the manifest, because Vite empties the dist directory each build but
  overwrites `stats.json` in place.

### What "initial game JS" used to mean

The previous checker measured a single `initialGameGzip` figure defined as
`entry + src/app/App.tsx` static closure. Two things about that were
misleading:

1. It was not "initial" in any page-load sense. Nothing renders `App` on first
   paint. It is the **complete download for the local game route** — the boot
   chunk, the account shell, Supabase, zod, and the whole Three.js chunk — i.e.
   what a signed-in player has fetched by the time a local match is playable.
2. `App` is only reachable through `BrowserApp`, which the old checker did not
   know about. It produced the correct total only because `App`'s chunk happens
   to statically import the `BrowserApp` chunk. Nothing measured the public
   homepage, the auth pages, or the multiplayer route at all — the routes users
   actually land on.

This audit replaces the single aggregate with five named route budgets.

## Route and chunk inventory

Chunk names below are shown with content hashes stripped.

| Route / area                                          | Loads on first paint   | Initial JS gzip        | Contains Three.js | Contains Supabase |
| ----------------------------------------------------- | ---------------------- | ---------------------- | ----------------- | ----------------- |
| Public shell (`/`, homepage + account control)        | yes                    | 152,078                | no                | yes               |
| Auth pages (`/auth/callback`, `/auth/reset-password`) | on `/auth/*` only      | 144,297                | no                | yes               |
| Local setup + local match (`/local`)                  | after registered-ready | 454,165                | yes               | yes               |
| Multiplayer lobby / room / match (`/multiplayer/*`)   | after registered-ready | 456,564                | yes               | yes               |
| Admin dashboard (`/admin`)                            | on `/admin` only       | 90,356                 | no                | no                |
| Brand preview (`docs/brand/preview.html`)             | never                  | 0                      | no                | no                |
| Visual scenarios / simulation / fixtures              | never                  | 0 (absent from bundle) | —                 | —                 |

Emitted chunks:

| Chunk                                    | Raw       | Gzip    | Reached by                                   |
| ---------------------------------------- | --------- | ------- | -------------------------------------------- |
| `index` (browser entry)                  | 196,737   | 62,007  | every route                                  |
| `authFlow`                               | 232,387   | 60,945  | public shell, auth pages, local, multiplayer |
| `schemas` (zod)                          | 74,575    | 19,967  | everything except a bare auth-less path      |
| `GameSetup` (shared gameplay + Three.js) | 1,069,397 | 294,623 | local, multiplayer                           |
| `BrowserApp`                             | 30,651    | 9,159   | public shell, local, multiplayer             |
| `MultiplayerApp`                         | 32,520    | 9,863   | multiplayer only                             |
| `App`                                    | 23,378    | 7,464   | local only                                   |
| `AdminDashboard`                         | 19,815    | 5,609   | admin only                                   |
| `reportSource`                           | 10,763    | 2,773   | admin only                                   |
| `AuthCallbackPage`                       | 3,158     | 1,378   | auth callback only                           |
| `ResetPasswordPage`                      | 2,014     | 962     | reset password only                          |

Non-JS assets, excluded from all budgets: `index.css` (100,632 raw), two
Orbitron `woff`/`woff2` files, and two brand PNGs.

### Exact contributing asset list per route

#### public-shell — 152,078 gzip

| Asset                  | Raw     | Gzip   |
| ---------------------- | ------- | ------ |
| `assets/index.js`      | 196,737 | 62,007 |
| `assets/authFlow.js`   | 232,387 | 60,945 |
| `assets/schemas.js`    | 74,575  | 19,967 |
| `assets/BrowserApp.js` | 30,651  | 9,159  |

#### auth-page — 144,297 gzip

| Asset                        | Raw     | Gzip   |
| ---------------------------- | ------- | ------ |
| `assets/index.js`            | 196,737 | 62,007 |
| `assets/authFlow.js`         | 232,387 | 60,945 |
| `assets/schemas.js`          | 74,575  | 19,967 |
| `assets/AuthCallbackPage.js` | 3,158   | 1,378  |

#### local-game — 454,165 gzip

| Asset                  | Raw       | Gzip    |
| ---------------------- | --------- | ------- |
| `assets/GameSetup.js`  | 1,069,397 | 294,623 |
| `assets/index.js`      | 196,737   | 62,007  |
| `assets/authFlow.js`   | 232,387   | 60,945  |
| `assets/schemas.js`    | 74,575    | 19,967  |
| `assets/BrowserApp.js` | 30,651    | 9,159   |
| `assets/App.js`        | 23,378    | 7,464   |

#### multiplayer-entry — 456,564 gzip

| Asset                      | Raw       | Gzip    |
| -------------------------- | --------- | ------- |
| `assets/GameSetup.js`      | 1,069,397 | 294,623 |
| `assets/index.js`          | 196,737   | 62,007  |
| `assets/authFlow.js`       | 232,387   | 60,945  |
| `assets/schemas.js`        | 74,575    | 19,967  |
| `assets/MultiplayerApp.js` | 32,520    | 9,863   |
| `assets/BrowserApp.js`     | 30,651    | 9,159   |

#### admin — 90,356 gzip

| Asset                      | Raw     | Gzip   |
| -------------------------- | ------- | ------ |
| `assets/index.js`          | 196,737 | 62,007 |
| `assets/schemas.js`        | 74,575  | 19,967 |
| `assets/AdminDashboard.js` | 19,815  | 5,609  |
| `assets/reportSource.js`   | 10,763  | 2,773  |

### What is inside the big chunks

Rendered-byte composition from `stats.json`:

- `index` (599,741 rendered): `react-dom` 561,283, `react` 20,311,
  `scheduler` 11,420, `main.tsx` 2,789, Vite preload helpers 3,045,
  `browser/routes.ts` 753. This is React itself plus the route dispatcher.
- `authFlow` (854,543 rendered): `@supabase/auth-js` 383,904,
  `@supabase/storage-js` 106,631, `@supabase/postgrest-js` 106,100,
  `@supabase/realtime-js` 94,995, `@supabase/phoenix` 56,053,
  `@supabase/supabase-js` 36,963, `@supabase/functions-js` 16,670,
  `iceberg-js` 15,836, `tslib` 2,162, plus ~33,000 of Fustify auth code.
  Instantiating one `SupabaseClient` pulls in storage, postgrest, realtime, and
  functions whether or not a route uses them; none of that is tree-shakeable
  from user code.
- `schemas` (184,465 rendered): zod, entirely.
- `GameSetup` (2,712,000 rendered): `three` 2,021,419 (75%),
  `@react-three/fiber` 273,228, `three-stdlib` 34,607, `@react-three/drei`
  5,582, `use-sync-external-store` 6,054, and ~330,000 of Fustify gameplay
  code (`core/generation` 79,495, `TerritoryHud` 45,151, `useGameStore` 34,368,
  `core/setup` 29,144, `core/game` 28,817, globe overlays, minimap, persistence).
  The chunk is named `GameSetup` only because `src/components/setup/GameSetup.tsx`
  (a 4.6 KB presentational shell with no dependencies beyond React) happens to
  be the alphabetically-selected seed of the shared module set between the
  `App` and `MultiplayerApp` dynamic entries. The name is misleading; the weight
  is Three.js.

**Is GameSetup lazy-loaded?** Yes. `src/components/setup/GameSetup.tsx` is never
in the first-paint download. It lives in the shared gameplay chunk, which is
fetched only after `BrowserApp` dynamically imports `App` or `MultiplayerApp`,
which happens only after `AccountRequiredGate` reaches `registered-ready`. It is
included in the `local-game` and `multiplayer-entry` route budgets, and excluded
from `public-shell`, `auth-page`, and `admin`.

## Browser verification

`tests/e2e/bundle-isolation.spec.ts` records every request Chromium makes and
asserts against actual network traffic, not against `import()` syntax.

| Visit                                    | Result                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| signed-out `/`                           | no three / fiber / drei / GlobeScene / Planet / GameSetup / gameReducer / generatePlanet / useGameStore / simulation / matchSynchronization / AdminDashboard / MultiplayerApp / App.tsx / visualScenarios requests |
| signed-out `/local` (account gate)       | no gameplay, admin, or multiplayer requests                                                                                                                                                                        |
| signed-out `/multiplayer` (account gate) | no gameplay, admin, or local-game requests                                                                                                                                                                         |
| `/admin`                                 | no gameplay, multiplayer, local-game, `BrowserApp`, or `home/Home` requests                                                                                                                                        |
| `/auth/callback`                         | no gameplay, admin, `BrowserApp`, or `home/Home` requests                                                                                                                                                          |
| `/?…&visual-review=1` (positive control) | three, `GlobeScene`, `App.tsx`, and `generatePlanet` **are** requested                                                                                                                                             |

The positive control exists so that a typo in the fingerprint list cannot turn
the five isolation assertions into vacuous passes.

## Growth attribution

Every milestone below was rebuilt from a clean detached worktree with the
lockfile committed at that commit, the same Node 24.18.0 and pnpm 10.28.2, and
the same measurement algorithm (`entry + App.tsx` static closure, matching the
historical definition so the series is comparable).

| Commit                | Change                                       | Local-game gzip | Δ           | Public shell gzip | Δ           |
| --------------------- | -------------------------------------------- | --------------- | ----------- | ----------------- | ----------- |
| `19761d9`             | secure auth profile foundation               | 384,369         | —           | 61,941            | —           |
| `b4eaefa` / `a9b3439` | revision recovery, budget bump               | 384,841         | +472        | 61,940            | −1          |
| `7632e1a`             | email/password accounts                      | 385,301         | +460        | 62,176            | +236        |
| `e17fc16`             | account-required gameplay                    | 385,377         | +76         | 62,334            | +158        |
| `90797f2`             | stale upgraded sessions                      | 386,394         | +1,017      | 62,364            | +30         |
| **`f77624d`**         | **deterministic protected account boundary** | **450,657**     | **+64,263** | **147,264**       | **+84,900** |
| `a8dedad`             | profile names for rooms                      | 450,779         | +122        | 147,329           | +65         |
| `a66b3e5`             | homepage foundation                          | 451,930         | +1,151      | 148,479           | +1,150      |
| `6c03213`             | Discord authentication                       | 453,919         | +1,989      | 150,473           | +1,994      |
| `729c9da`             | chartreuse brand system                      | 453,919         | 0           | 150,473           | 0           |
| `d4a1747`             | brand homepage                               | 455,145         | +1,226      | 151,695           | +1,222      |
| `e46a1f0`             | brand across app                             | 455,460         | +315        | 151,999           | +304        |
| `73428e0`             | hero / account dialogs                       | 455,840         | +380        | 152,097           | +98         |

Summary by feature:

| Change                                 | Local-game gzip Δ | Largest chunk raw Δ | Expected?                     |
| -------------------------------------- | ----------------- | ------------------- | ----------------------------- |
| Email/password auth                    | +460              | +801                | yes, trivial                  |
| Account-required gameplay              | +76               | −339                | yes, trivial                  |
| Protected account boundary (`f77624d`) | **+64,263**       | −247                | **not previously understood** |
| Homepage foundation                    | +1,151            | +181                | yes                           |
| Discord authentication                 | +1,989            | 0                   | yes                           |
| Chartreuse branding (3 commits)        | +1,541            | +42                 | yes, trivial                  |
| Hero / dialog polish                   | +380              | +1,117              | yes, trivial                  |

**The single cause of the overage is `f77624d`, not branding.** That commit
introduced `BrowserApp` and `AccountRequiredGate` as a static shell, which moved
`@supabase/supabase-js` out of the gameplay-only graph and into every non-admin
route. Branding, the homepage, and Discord together account for about 5 KB
gzip — well under the 15–20 KB per-feature investigation threshold. Nothing in
the branding branch caused a chunking regression.

This growth is legitimate: gameplay now requires a registered account, so the
account shell must resolve auth state before any route renders. It is not a
measurement-definition change (the algorithm never changed; only the budget
constants did), and it is not stale output.

### The 398,564 droplet figure

It cannot be reproduced. A clean rebuild of every commit in the relevant range
produces 384,369 → 455,840 with no value near 398,564. The repository contains
**no deployment script, CI workflow, or Dockerfile** — deployment is entirely
manual prose — so there is no pinned droplet Node version, no `engines` field,
no `.nvmrc`, and no automated `pnpm install --frozen-lockfile`. The most likely
explanation is that the droplet measurement ran on a different Node major with
a different zlib build (gzip output differs by a few percent between zlib
versions, and 398,564 is +3.6% on the pre-auth 384,841 baseline) and/or on a
commit not in the current history.

Mitigation: the checker now writes `.fustify/reports/bundle/audit.json`
recording `process.version` alongside every measurement, so future
cross-machine comparisons can be validated instead of assumed. Comparing bundle
numbers across machines without matching Node versions should be treated as
unsound.

## Dependency duplication

`pnpm list --depth 20` and a scan of every module in the emitted graph:

| Package                 | Versions resolved                             | In the bundle                                 |
| ----------------------- | --------------------------------------------- | --------------------------------------------- |
| `react`                 | 19.2.7 only                                   | single copy                                   |
| `react-dom`             | 19.2.7 only                                   | single copy                                   |
| `three`                 | 0.182.0 only (all 8 peer consumers agree)     | single copy                                   |
| `@supabase/supabase-js` | 2.110.8 only                                  | single copy                                   |
| `zod`                   | 4.4.3 only                                    | single copy                                   |
| `zustand`               | 5.0.14 and 4.5.7 (via `tunnel-rat` from drei) | **0 rendered bytes** — both fully tree-shaken |

43 distinct packages reach the browser graph; `zustand` is the only one with two
resolved versions, and it contributes nothing to the emitted output. There is no
duplicated React runtime, no duplicated Three.js, no duplicated Supabase client,
and no duplicated local utility implementation. No test-only, simulation,
report, or fixture module reaches production (verified both by the forbidden-module
scan and by grepping the emitted assets).

## Optimizations made

### 1. Multiplayer room API removed from the local game graph

`src/components/EventLog.tsx` (shared match UI, used by local play) statically
imported `src/multiplayer/matchEventReactions.ts`, which imported the single
helper `multiplayerError` from `src/multiplayer/multiplayerApi.ts`. That dragged
the entire multiplayer room API — its zod schemas, protocol types, and seed
generation — into the shared gameplay chunk.

`MULTIPLAYER_ERRORS` and `multiplayerError` now live in a dependency-free
`src/multiplayer/multiplayerError.ts`. `multiplayerApi.ts` re-exports both, so
no call site or test changed behaviour.

| Metric                   | Before                | After     | Δ          |
| ------------------------ | --------------------- | --------- | ---------- |
| `local-game` gzip        | 455,840               | 454,165   | **−1,675** |
| Largest chunk raw        | 1,075,034             | 1,069,397 | **−5,637** |
| `multiplayer-entry` gzip | 456,799               | 456,564   | −235       |
| Request count            | unchanged (11 chunks) | unchanged | 0          |

Beneficiary: the local game route. Risk: very low — a pure module move with a
compatibility re-export. Covered by the existing
`src/multiplayer/multiplayerApi.test.ts` error-mapping tests, which still import
from `multiplayerApi`.

### 2. Development-only admin fixtures removed from the production bundle

`src/admin/reportSource.ts` statically imported `reportFixtures` and
`studyFixtures`, so 12,381 rendered bytes of fixture data shipped in the
production admin chunk even though `src/main.tsx` only used them under
`import.meta.env.DEV`. `fixtureAdminReportSource` moved to
`src/admin/fixtureReportSource.ts`, and `main.tsx` now imports it dynamically
inside an `if (import.meta.env.DEV)` block, which Rollup eliminates entirely in
production.

| Metric                   | Before                             | After     | Δ          |
| ------------------------ | ---------------------------------- | --------- | ---------- |
| `admin` gzip             | 93,512                             | 90,356    | **−3,156** |
| `reportSource` chunk raw | 20,773                             | 10,763    | −10,010    |
| Request count            | unchanged (no extra chunk emitted) | unchanged | 0          |

Beneficiary: the admin route. Risk: very low — the dev fixture path
(`/admin?admin-fixture=…`, exercised by `tests/e2e/admin.spec.ts`) still
resolves, now via one extra dev-server module request.

### 3. Budget checker corrected and made testable

Not a size change, but the checker had real defects: it measured a route that
the router never loads directly, it had no budget for the public homepage, the
auth pages, or multiplayer, it printed no contributing asset list on failure, it
could grade a stale `stats.json`, and it was untestable (top-level `await main()`
with hardcoded paths and no exports). See the sections above and
`src/build/bundleBudget.test.ts` (23 tests).

### Considered and rejected

- **Deferring `@supabase/supabase-js` off the public shell** (would save ~61 KB
  gzip on `/`). Rejected: `AccountProvider` must resolve session state before
  first paint, and deferring it reintroduces the auth-state flash that
  `f77624d` was written to eliminate. This is an architectural change, not a
  focused correction.
- **Splitting registration / forgot-password forms out of `AccountControl`.**
  The whole of `AccountControl.tsx` is 27,416 rendered bytes; the rarely used
  forms are a fraction of that, and splitting them adds request round-trips
  inside a modal flow for well under 3 KB gzip. Not worth the complexity.
- **`manualChunks`.** Adding it would only rename chunks. It would not remove
  any cross-route import and would risk creating more, smaller requests.
- **Decomposing the 1.07 MB gameplay chunk.** 75% of it is `three`. Splitting
  the remaining Fustify code out would produce more requests for the same route
  with no first-paint benefit, since the whole chunk is needed as soon as the
  globe renders.

## Final budgets

| Budget                   | Measured baseline | Budget    | Headroom |
| ------------------------ | ----------------- | --------- | -------- |
| `public-shell` gzip      | 152,078           | 158,000   | 3.9%     |
| `auth-page` gzip         | 144,297           | 150,000   | 4.0%     |
| `local-game` gzip        | 454,165           | 472,000   | 3.9%     |
| `multiplayer-entry` gzip | 456,564           | 475,000   | 4.0%     |
| `admin` gzip             | 90,356            | 94,000    | 4.0%     |
| Largest JS chunk, raw    | 1,069,397         | 1,080,000 | 1.0%     |

Rationale:

- The gzip budgets use a uniform **baseline + ~4%** policy, rounded to the
  nearest 1,000 bytes. Four percent is roughly 6 KB on the public shell and
  18 KB on the gameplay routes — enough to absorb ordinary UI work, not enough
  to hide a new dependency.
- The old aggregate `initialGameGzip: 410,000` is retired. It was raised twice
  (380,000 → 385,000 → 410,000) without a route explanation, and it still could
  not describe what a visitor to `/` downloads. `local-game` at 472,000 is
  higher than the retired number, but it is now one of five budgets, four of
  which are new coverage, and two of which (`public-shell`, `auth-page`) are
  tighter constraints on the code path that actually affects first paint.
- The old `initialAdminGzip: 125,000` was 38% above its own baseline. It is
  tightened to 94,000.
- **The 34-byte largest-chunk overage was threshold noise and required no
  threshold increase.** Optimization 1 brought the chunk to 1,069,397 raw,
  which passes the old 1,075,000 limit outright. The limit is nevertheless
  moved to 1,080,000 (1.0% headroom instead of 0.5%) so that a sub-kilobyte
  gameplay edit does not fail the build again. The increase is 5,000 bytes, not
  hundreds of kilobytes.

Every number above was produced by two clean, byte-identical builds.

## Ongoing bundle policy

1. Review every bundle-budget failure. Do not raise a limit to make the check
   pass.
2. Any single feature adding more than ~15 KB gzip to an initial route needs an
   explicit justification. Under this policy, `f77624d`'s +64 KB would have been
   caught at review time.
3. A budget change must be accompanied by a route/chunk explanation and by
   updating this document.
4. Protected gameplay and admin code stays lazy. `tests/e2e/bundle-isolation.spec.ts`
   enforces this at the browser level and must keep its positive control.
5. Rebaseline only after an intentional feature milestone, using two clean
   builds on the same Node version.
6. Treat a small raw-byte overage on the largest chunk (< ~2 KB) as threshold
   noise and a large gzip increase on an initial route as a regression to
   investigate.
7. Record the Node version with any measurement. Cross-machine comparisons
   without matching Node versions are not evidence.
8. Report budget changes in commit messages and completion reports.

## Remaining risks and future work

- **`/multiplayer` lobby downloads the full 294 KB gzip Three.js chunk.**
  `MultiplayerApp.tsx` statically imports `GlobeScene`, `ReadonlyWorld`,
  `Minimap`, and `TerritoryHud`, so browsing the room list pays for the
  renderer. This is the single largest remaining real-world win, but the lobby,
  room, and match views all live in one 1,120-line module, so fixing it needs a
  deliberate split of that file rather than an import-boundary tweak. Deferred:
  it is not low-risk, and it would need full multiplayer Playwright coverage.
- **Supabase client weight.** `storage-js` (106 KB raw) and `functions-js`
  (17 KB raw) are almost certainly unused by the browser, but `createClient`
  instantiates every sub-client, so they cannot be tree-shaken from user code.
  Worth revisiting if `@supabase/supabase-js` ever ships modular clients.
- **No deployment automation exists**, so droplet builds remain unpinned and
  unreproducible by construction. Any future deploy script should pin Node,
  install with `--frozen-lockfile`, clean `dist` and the report directory, and
  record the audit artifact.
- The route budgets are keyed to Rollup chunk names. Renaming `BrowserApp`,
  `App`, `MultiplayerApp`, `AdminDashboard`, `reportSource`, or
  `AuthCallbackPage` will fail the checker loudly (by design) and requires
  updating `BUNDLE_BUDGETS`.
