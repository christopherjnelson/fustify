# Fustify

**Strategy on a different world every time.**

Fustify is a browser strategy game played across deterministic, procedurally
generated spherical worlds. Registered players can play locally against
heuristic bots or friends on the same device, or create public and private
authoritative multiplayer rooms for 2–5 human players.

The current application provides:

- A branded home page with separate local and online game entry points plus a progressively loaded generated-globe preview
- Email/password and Discord accounts, profile names, password recovery, and safe return-to-game flows
- A rotatable and zoomable 3D globe with desktop and touch-compatible orbit controls
- A responsive equirectangular minimap derived from the same canonical globe geometry and ownership state, with focus-only territory navigation
- A versioned normalized world generator with deterministic landmasses, territories, continents, borders, and sea routes
- Normal creation at 42 playable territories, temporarily capped at 5 land-connected gameplay continents
- Four recommended editable seats (one Local Human and three Heuristic Bots), expandable to five; custom two- and three-seat tables remain supported
- Compatibility loading for existing valid six-continent/six-seat saves, URLs, canonical worlds, and fixtures
- Registered-account 2–5-player public or private rooms with a public game browser, immutable published settings, stored world previews, durable seats, direct public links, and private room codes
- Trusted Node API match initialization plus authoritative reducer commands, ordered revisions/idempotency, deterministic server combat, Realtime recovery, reconnect, and shared victory
- Persistent multiplayer Activity reactions and optional Discord announcements for newly published public rooms
- A randomly named neutral world with continent-cohesive fictional geography, before any player ownership exists
- Subtle dotted canonical sea routes on the 3D globe while choosing a neutral world
- Curated readable names that are also canonical deterministic world seeds
- Random distributed assignment or a complete local round-robin territory draft
- A deterministic 32-candidate random starting-position generator with balance preview and assignment rerolls
- Explicit neutral-preview, assignment-in-progress, ready, handoff, playing, and game-over lifecycle states
- Browser-local save, autosave, validation, migration, deletion, and exact resume
- A separate serializable match state containing live ownership, armies, phase, selections, events, elimination, and victory
- An asynchronous controller boundary whose commands are revalidated by the authoritative reducer
- DOM-free reproducible bot matches with invariants, caps, metrics, JSON reports, and focused traces
- An admin-authorized `/admin` operations dashboard with local structured verification reports in development
- Reinforcement, repeated attacks, deterministic dice combat, mandatory post-capture movement, one connected-path fortification, and turn advancement
- Phase-aware globe selection and numbered army markers with non-color source/target cues
- Brief globe and minimap action beacons plus an opt-in Follow Action camera mode that yields immediately to manual control
- Versioned setup URLs that reproduce the seed, territory count, continent count, player count, and assignment strategy
- A searchable, keyboard-operable territory navigator with owner, armies, continent, legal status, and sea-route cues
- Ownership and continent player views, plus development/debug terrain presentation, that do not affect rules state
- Zoom-dependent globe labels that switch from continent names to territory names, with territory names offset above army counts
- Camera-facing marker hiding and silhouette fading so back-side markers do not detach from the globe
- Non-playable visible oceans, emphasized coastlines, land borders, hover feedback, and persistent land selection
- Geographic land-border connections plus a minimal sea-route tree and 0–3 deterministic redundancy routes
- Smooth camera focus for selected territories and selected-route highlighting outside debug mode
- Serializable graph analysis for degrees, gateways, articulation points, bridges, landmass degrees, route redundancy, and continent cohesion
- A responsive HUD with selection details and a compact graph/debug panel
- Generator and graph tests covering neutral terrain, assignment, armies, compact continents, routes, bonuses, graph algorithms, validation, and serialization
- A deterministic Playwright world-quality matrix with land-connectivity, tendril, narrow-neck, spherical-spread, globe/minimap agreement, and canonical camera evidence

## Application routes

| Route                         | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `/`                           | Public home page, generated-world preview, and account controls            |
| `/local`                      | Local play against humans and/or deterministic heuristic bots              |
| `/multiplayer`                | Registered-only public game browser and private-room creation/joining      |
| `/multiplayer/room/:roomId`   | Multiplayer waiting room and seat selection                                |
| `/multiplayer/match/:matchId` | Canonical authoritative multiplayer match                                  |
| `/admin`                      | Admin-authorized operations plus local verification reports in development |

Legacy setup links at `/?v=1&...` remain supported and open local setup
directly.

## Run locally

Requires a current Node.js release and pnpm.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts both Vite on port 5173 and the localhost-only Node API. Vite
proxies `/api/*` to the API using `FUSTIFY_API_PORT` (default `8787`). Copy
`.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` for the account-gated application. Multiplayer
match start additionally requires the server-only
`SUPABASE_SERVICE_ROLE_KEY`. Never add a `VITE_` prefix to the service-role
key. Without that server credential, authenticated local play and
`GET /api/health` still work, while multiplayer match start fails closed with a
configuration error.

Common quality checks:

```bash
pnpm test
pnpm test:coverage
pnpm test:simulation
pnpm test:simulation:stress
pnpm test:bot
pnpm test:bot:stress
pnpm lint
pnpm build
pnpm bundle:analyze
pnpm bundle:check
pnpm format:check
pnpm verify:report
pnpm verify:report:full
pnpm study:balance --preset quick
pnpm test:e2e:multiplayer
pnpm test:visual:multiplayer
pnpm test:multiplayer:concurrency
pnpm test:multiplayer:authority
pnpm test:integration:dev-proxy
pnpm test:deployment
```

The report-enabled commands incrementally write ignored, validated schema-v1
artifacts under `.fustify/reports/`. While `pnpm dev` is running, open
`http://localhost:5173/admin` to inspect current progress, recent runs,
coverage, simulations, failures, and reproduction commands. The filesystem API
exists only in the local development server and is read-only. See
[verification runbook](./docs/operations/verification.md) for profiles,
retention, interruption, and security behavior.

The multiplayer route and hosted-database workflow are documented in the
[multiplayer guide](./docs/gameplay/multiplayer.md) and
[Supabase runbook](./docs/operations/supabase.md). Local play does not use the
service-role credential, but the current product shell requires a registered
Supabase account before entering either game mode. Multiplayer player draft is
currently rejected; local player draft is unchanged.

Production uses an immutable combined frontend/API release on an Ubuntu
droplet behind Caddy. See the
[deployment runbook](./docs/operations/deployment.md) for installation, private
configuration, verified deployment, rollback, retention, and recovery.
`pnpm build:release` creates the combined artifact; `pnpm deploy:droplet` is the
repository-level activation entry point used by the managed deployment
workflow.

For unattended multi-configuration bot research, preview with
`pnpm study:balance --preset thorough --dry-run`, run it from a second terminal,
and monitor Balance Studies on `/admin`. See
[balance-study runbook](./docs/gameplay/balance-studies.md) for checkpoint,
resume, compact summary, export, and interpretation details. Large studies are
not normal verification gates.

## Production bundle inspection

Run `pnpm bundle:analyze` to make a production-equivalent build with an HTML
treemap, raw module statistics, and a Vite manifest. It writes only under the
ignored `.fustify/reports/bundle/` directory and never opens a browser. Run
`pnpm bundle:check` to regenerate that analysis and enforce tolerant,
hash-independent budgets for the game route, admin route, largest JavaScript
chunk, and forbidden test/Node module imports.

The expected large shared application chunk is currently dominated by Three.js
and React Three Fiber. The public shell does not include it: the homepage globe
loads progressively after first paint on desktop and only after an explicit
action on mobile or data-saver connections. The same renderer code is reused by
the game routes. Vite's 500 kB warning is therefore understood and
intentionally remains visible. `/admin` is a separate dynamic graph and does
not load the globe. Source maps are not enabled in the current production
configuration; if they are enabled later, report their size separately because
map bytes are not shipped JavaScript. See the [bundle-analysis
runbook](./docs/operations/bundle-analysis.md) for the measured baseline,
budgets, route accounting, and investigation procedure.

## Playwright visual inspection

Fustify includes a Chromium-based visual and interaction harness for repeatable inspection of the real Vite application. Playwright starts Vite automatically on deterministic port `4173` and runs three projects: desktop at 1920×1080, laptop at 1366×768, and mobile at 390×844.

Install the matching browser after installing dependencies:

```bash
pnpm exec playwright install chromium
```

Run the suites with:

```bash
pnpm test:e2e
pnpm test:visual
pnpm test:visual:update
pnpm test:world-visual
WORLD_AUDIT_PHASE=my-review pnpm audit:world-visual
```

`test:e2e` covers neutral setup, controller selection, bot input locking and handoff, keyboard assignment selection, random rerolls, draft turn order and duplicate feedback, neutral/draft save-resume, minimap lifecycle styling and camera synchronization, reinforcement, combat, capture, elimination, fortification, turn completion, rematches, navigator behavior, event logs, and victory. `test:visual` compares stable UI-region screenshots with the committed baselines in `tests/e2e/visual.spec.ts-snapshots/`. Use `test:visual:update` only after reviewing intentional UI changes.

Every visual run also writes full-page human-review captures to `test-results/ui-review/<project>/`. Playwright failure screenshots, traces, and its HTML report remain under `test-results/`. Those generated results are ignored by Git.

`test:world-visual` is the focused procedural-world acceptance suite. It drives
seed entry through the real neutral-preview UI, captures the fixed 34-world
matrix at 1366×768, adds four responsive fixtures, and writes minimaps, four
canonical globe longitudes, component metrics, JSON summary, and an HTML index
under `.fustify/reports/world-generation/corrected/`. The non-blocking
`audit:world-visual` command uses `WORLD_AUDIT_PHASE` to retain named exploratory
runs without changing committed UI baselines. See
[world-generation guide](./docs/world-generation/README.md) for invariants,
thresholds, before/after procedure, and the 42/6 versus 42/5 findings.

The visual route uses the fixed `visual-review-atlas` world, reduced motion, a deterministic font and timezone, and no animated star field. Minimap scenarios additionally cover a deliberate land-and-route antimeridian fixture and representative camera orientations. Scenario state is built with the real generator, match setup, match constructor, and rules reducer. The scenario driver is loaded only when Vite is in development mode and `visual-review=1` is present; production builds do not include or expose it. Full-page images are for human inspection, while assertions target UI regions with a small pixel tolerance so animated WebGL details do not make the suite brittle.

## Automated gameplay verification

Gameplay verification has three complementary layers:

- Hand-authored rules fixtures cover adjacent territories, land borders, sea routes, owned and enemy-blocked chains, branched graphs, disconnected ownership, one and multiple continents, zero-territory players, pending capture, and near-victory states. These tests exercise reinforcement and continent bonuses, action legality, dice and ties, casualties, capture bounds, elimination and turn skipping, connected fortification, victory, deterministic events, invalid-action immutability, and serialization.
- Playwright drives the real store and UI at all three supported viewports. Its scenario and inspection API is development-only and remains gated by both `import.meta.env.DEV` and `visual-review=1`.
- The headless simulator constructs real generated worlds and starting positions, asks the rules helpers for legal actions, and dispatches every transition through `gameReducer`. The conservative policy makes at most two favorable attacks per turn and performs basic fortification; the aggressive policy attacks whenever a legal target remains and moves the maximum legal capture force.

The simulator validates the runtime match schema and invariants after every transition: immutable planet data, complete valid ownership, integer armies, elimination consistency, a live active player, non-negative reinforcement pools, phase/action compatibility, capture blocking, one fortification per turn, strategic adjacency, turn ownership, monotonic combat sequence, ordered event IDs, winner consistency, and JSON semantic round trips. The pending-capture destination is the one intentional temporary exception to the normal `armyCount >= 1` invariant: it has zero armies between ownership transfer and the mandatory capture move.

The fast matrix runs ten deterministic setup combinations across player counts 2–6 with both policies. The local stress matrix runs 135 world/setup combinations—territory counts 12, 18, and 24; continent counts 2, 3, and 4; player counts 2–6; and three ownership variants—with both policies and a 750-action bound per match. Some small generated worlds cannot satisfy the bounded balanced-connected ownership or starting-position candidate search for their first seed; simulation setup retries a documented deterministic seed suffix sequence and reports the actual successful world seed.

Complete heuristic-bot matches are a separate layer. `pnpm test:bot` runs
focused controller and quick match checks; `pnpm test:bot:stress` runs a
moderate all-bot matrix. `pnpm simulate:bots -- --games N` runs an explicit
sequential extended batch and writes a Fustify-prefixed structured report with
versioned project metadata under ignored `artifacts/bot-simulations/`. Exact
descriptors replay with `--reproduce '<json>' --trace`. See the
[controller guide](./docs/gameplay/controllers.md) for the command contract,
heuristic, RNG boundaries, invariants, metrics, cap semantics, and report
schema.

Every failure includes the actual world seed, generator version, territory and continent counts, player count, ownership variant, policy, turn, phase, last action, recent actions, and recent events. Replay a reported failure with:

```bash
SIMULATION_SEED='<seed>' \
SIMULATION_TERRITORIES=18 \
SIMULATION_CONTINENTS=3 \
SIMULATION_PLAYERS=4 \
SIMULATION_VARIANT=0 \
SIMULATION_POLICY=aggressive \
pnpm test:simulation:replay
```

The read-only `/admin` Balance Studies dashboard distinguishes all-match win
rate from decided-victory share and includes a paired six-seat diagnostic. See
[balance-study runbook](./docs/gameplay/balance-studies.md) for dry-run,
standard, thorough, resume, compact JSON export, and single-match reproduction
commands. Normal product creation defaults to 42 territories and 5 continents;
new worlds and tables are temporarily capped at 5 continents and 5 seats.
Existing valid 6-continent/6-seat data remains engine compatibility coverage.
Six-continent generation is a deferred investigation rather than a supported
normal configuration.

`pnpm test:coverage` writes text, HTML, and JSON-summary reports for the pure
game and save-validation modules. The HTML report is generated under
`coverage/`. Coverage is used to identify rule branches—not as a 100% target.
Browser-local storage exceptions, free-form globe dragging, multiplayer
recovery, and subjective play balance still require integration or manual
playtesting. Use generated verification and simulation reports for current
counts rather than treating historical README figures as a baseline.

## Branding

Runtime product metadata is centralized in `src/branding.ts`. Reusable logo
components and the chartreuse visual system live under `src/brand/`, while
the approved raster master, responsive logo assets, and browser icons live
under `public/brand/` and `public/`. The standalone globe-and-F is the primary
logo; spelled-out identity lockups use the Orbitron display face. The
board-level Fustify wordmark remains separate from the match HUD so the HUD
stays gameplay-focused.

## Shareable world setup URLs

World setup is plain serializable data kept separate from both immutable `PlanetDefinition` geography and mutable `MatchState` gameplay. Version 1 supports:

| Parameter     | Default                   | Valid values                               |
| ------------- | ------------------------- | ------------------------------------------ |
| `v`           | `1`                       | `1`                                        |
| `seed`        | generated on a fresh root | Any non-empty string                       |
| `territories` | `42`                      | Whole numbers from 12–48                   |
| `continents`  | `5`                       | New UI: 2–5; compatible existing URLs: 2–8 |
| `players`     | `4`                       | New UI: 2–5; compatible existing URLs: 2–6 |
| `assignment`  | `random`                  | `random` or `player-draft`                 |

Example:

```text
http://localhost:5173/local?v=1&seed=atlas-prime&territories=42&continents=5&players=4&assignment=random
```

The normal root route renders the mode-selection home page. Entering `/local`
creates a readable slug such as `amber-meridian-482`, generates that neutral
world once, and writes its complete setup into the URL. Refresh therefore
reconstructs the same world. An explicit seed or supported shared setup URL
takes precedence. Fixed seeds such as `atlas-prime` and
`visual-review-atlas` remain test/demo fixtures, not the production local
default. A requested local-save resume reconstructs the saved seed and is never
replaced by fresh-launch naming.

Missing parameters in an otherwise supported setup URL use defaults. Malformed counts fall back or clamp to supported ranges and show a concise setup warning; an unsupported `v` falls back to the complete default setup. Serialization has a stable parameter order. Unknown query parameters, including the historical `logo` selector, are preserved when applying or generating a setup.

**Generate World** creates a new curated readable seed, updates the seed field and URL with `history.pushState`, rebuilds one neutral `PlanetDefinition`, updates the globe and minimap, and remains on world selection without calculating ownership or starting Turn 1. Type a custom seed and press Enter to apply that deterministic seed and the visible geography counts while staying in the same neutral preview. **Start Game** is the only opening action that accepts the displayed world and reveals player profiles and assignment. Browser back and forward navigation rebuilds the selected neutral world. Assignment results, player profiles, draft picks, saves, and active turns never enter the URL.

Readable world-seed naming is independent of geography generation: a curated
descriptor, curated landmark, and short numeric suffix become the canonical
seed passed to the deterministic generator. Custom typed seeds remain
supported. Territory and continent display names use a separate versioned
seed stream and continent-specific phonetic families derived from a reviewed,
public-domain place-name corpus. These display names remain cosmetic: they do
not alter the canonical seed, topology, multiplayer fingerprint, or
persistence shape.

## World setup, pregame, and match flow

`WorldSetup` contains the versioned URL parameters listed above, including the assignment-strategy choice. `PlanetDefinition` remains immutable geography and topology; generated territories are neutral (`ownerId: null`, zero armies). A discriminated `MatchSetup` contains stable player IDs, names, palette colors, seat order, strategy, and one of three setup phases: `neutral-preview`, `assignment-in-progress`, or `ready`. Only `ready` contains a complete `StartingPosition`. `MatchState` is nullable before play and is created only from a ready setup; it contains mutable turns, ownership, armies, selections, pending captures, deterministic combat sequence, elimination, victory, and events. Camera, dialogs, hover, and display preferences remain view state.

Generating a world remains in world selection with geographical/continent colors, no army markers, no starting-balance claim, and no playable match. Editing seed or count fields does not mutate the displayed world until the user presses Enter in the seed field or clicks Generate World for a new readable seed. Start Game opens match setup with the recommended four seats: one Local Human and three Heuristic Bots. Add Seat creates a fifth bot-controlled seat with stable identity, palette color, and editable name. Normal creation is capped at five seats and five continents; advanced two- and three-seat tables remain supported, while existing valid six-seat/six-continent data still loads. Controller type, human count, seat count, identity, color, and world size remain independent; mixed human/bot, all-human, and all-bot tables are valid within that creation cap. The recommended world is 42 territories and 5 continents. Player names are normalized before assignment and blank or duplicate names are blocked. Colors come from six named, high-contrast choices and cannot be duplicated. The table then explicitly begins either random assignment or a player draft. A ready setup must be explicitly started with Begin Match before the first handoff. Gameplay commands are rejected until the application is in `playing` with a real match, and human commands are rejected while its active seat is bot-controlled.

Starting ownership evaluates 32 deterministic candidates derived from the world seed, generator version, stable player IDs, ownership variant, and candidate index. The default `distributed` strategy uses shuffled round-robin placement followed by bounded, count-preserving local swaps; it deliberately targets several useful ownership regions instead of growing one empire per player. Hard-invalid candidates are rejected before score comparison, and a failed bounded search reports its leading blocking conditions without changing the world seed.

The local player draft starts with an empty owner map. Pick `n` belongs to seat `n % playerCount`, so the order is deterministic round-robin; when territory totals are uneven, the earliest seats receive one extra territory. The active player may claim only an unowned territory using the globe or the keyboard-ready territory list. Cancel and restart clear picks without changing geography. After the final pick, fixed starting-army totals are distributed deterministically, balance is rebuilt, and the setup enters `ready` rather than starting immediately.

The visible 0–100 score is a weighted average of eight serialized 0–100 categories: territory parity (16%), army parity (12%), continent fairness (18%), connectivity distribution (18%), geographic spread (10%), border exposure (10%), sea-route access (8%), and gateway access (8%). Parity awards full credit for a spread of at most one. Continent fairness deducts for full, majority, and one-away shares plus potential-bonus disparity. Connectivity uses a scaled middle-range target (roughly the square root of a player's territory count, bounded to 2–5 regions), a preferred 25–60% largest-region share, and a scaled isolated-territory allowance. The remaining categories compare player ranges for pairwise world spread, borders, sea endpoints, and gateways. Ratings are Excellent (90+), Good (75+), Uneven (55+), or Poor.

Random hard-invalid conditions are: missing, unknown, or extra ownership; territory or army spread above one; a fully owned gameplay continent with at least two territories; at least 80% of a five-or-more-territory position in one region; no strategic adjacency; excessive sea-route or gateway ownership; majority control of three or more mixable continents; or a territory with no army. A technically valid Poor random layout requires explicit confirmation before play. Player drafts share structural checks—complete valid IDs and owners, count parity, equal starting armies, at least one territory per player, and positive armies—but clustered regions, full continents, gateway concentration, and Poor strategic scores are advisory because the players intentionally made those choices.

Starting armies use fixed equal totals inspired by classic Risk: 40 each for two players, 35 for three, 30 for four, 25 for five, and 20 for six. Every territory receives one army first; the remainder is distributed by a candidate-specific deterministic stream. Turn reinforcement calculation remains separate.

Starting a match opens a mandatory full-screen handoff before Turn 1. End Turn prepares the next non-eliminated player's reinforcement phase exactly once, clears stale selections, and then opens another handoff. The globe and active controls stay unavailable until that player chooses Begin turn. A later handoff can show a short public summary of captures, eliminations, fortification, or victory from the previous turn.

## Local save and resume

Fustify writes browser-local saves to `fustify.local-match`. Restore checks this key first, then validates and migrates the legacy `worldseed.local-match` value through the same v0–v4 pipeline. A valid legacy value is copied to the new key without deleting the original; invalid legacy data is never copied or overwritten. Match start and every semantic rules transition are autosaved; a manual Save match action is also available. Camera, minimap projection geometry, hover, animation, live Three.js objects, and open utility dialogs are never saved.

Save schema version 4 stores the world setup and generator version, assignment mode, explicit setup phase, player profiles including controller type, ownership variant, optional in-progress draft owner map and pick index, optional completed starting position, nullable match state, application mode, and timestamp. The Save setup control supports neutral, drafting, and ready states; match transitions continue to autosave. Parsed storage is runtime-validated with Zod. Versions 0–2 migrate to random/ready setup, and versions 0–3 default historical seats to `local-human`. Every load or migration reconstructs the planet and rebuilds balance analysis from ownership rather than trusting serialized derived metrics. Transient bot execution, pacing, promises, highlights, and reports are never persisted.

On load, the world-setup panel presents both the setup from the current URL and any local saved session. Resume restores neutral, drafting, and ready setup saves directly to pregame; active match saves enter handoff before revealing the current turn. Local saves are browser- and device-specific; setup URLs never contain draft picks or active matches.

Rematch choices are explicit: restart the same world and ownership, keep the world and reroll a random assignment (or restart a player draft), or return to world setup for different geography. These actions do not silently delete the local save.

## Local match rules

The generated `PlanetDefinition` is immutable geography and topology. A separate `MatchState` owns all mutable gameplay data: territory owners and armies, active player, turn and phase, reinforcement pool, source/target selection, pending capture, combat sequence, player elimination, winner, and event history. Both structures are serializable data without React or Three.js objects. Regenerating creates a new definition and match; Reset Match reconstructs the original deterministic setup for the current seed.

Each player turn follows these phases:

1. **Reinforce:** place all awarded armies on owned territories. The phase advances automatically when the pool is empty.
2. **Attack:** make zero or more attacks from an owned territory with at least two armies to a strategically adjacent enemy. Land borders and sea routes both count.
3. **Capture move:** after a capture, move at least the number of attacking dice into the territory and leave at least one army behind. No other action is accepted until this completes.
4. **Fortify:** move armies once between owned territories connected by any owned path, or skip.
5. **End turn:** explicitly hand off to the next non-eliminated local player, who begins in Reinforce.

End Attack is isolated in a separate phase-actions section. When any legal
attack remains it opens a keyboard-operable confirmation; Escape or Continue
Attacking returns focus to the phase action. When no attack is possible, the
phase ends directly. Capture and fortification show a noninteractive fixed
amount when their legal minimum and maximum are equal, and retain the range
control whenever a real choice exists.

Reinforcements use `max(3, floor(owned territories / 3))` plus the generated placeholder bonus for every fully owned gameplay continent. The HUD shows the base and continent portions separately.

The attacker may roll one die with two armies, two with three armies, and three with four or more armies. The defender rolls up to two dice based on its army count. Rolls are sorted high-to-low, compared in pairs, and the defender wins ties. Combat never calls `Math.random()`: each battle gets a deterministic RNG stream derived from the match seed and combat sequence, and the event log records both dice arrays and casualties.

Capturing transfers ownership immediately and checks elimination. A player with no territories is eliminated and skipped in turn order. When one player owns every playable territory, the required capture move completes first and then the match enters Game Over with a winner.

### Globe interaction

- Reinforce: dashed owned markers are valid targets; select one and place one or all remaining armies.
- Attack: dashed owned markers are valid sources, outlined enemy markers are valid targets, and `≈` identifies sea-route targets. Select source, target, dice, and Attack.
- Fortify: select a source with at least two armies, then any highlighted destination reachable through owned land-border or sea-route connections.
- Selected sources use a diamond cue; selected targets use an × cue. Invalid territories are dimmed, captures receive brief emphasis, and active-player land is subtly brightened.
- Ownership mode emphasizes player fill, Continents emphasizes gameplay regions while markers retain ownership, and Terrain emphasizes land/ocean geography. These modes are renderer preferences only.
- The event log is toggleable and locally scrollable. Debug graph overlays remain available.

### Accessible territory navigation

During active play, selected-territory information lives in a right-side rail directly above the minimap, leaving the left HUD for turn and phase controls. The collapsed rail preserves owner, armies, continent, connection, inspection, and Focus details; before selection it shows a compact globe-selection prompt. On screens wider than 900px, Browse expands the rail upward into a non-modal navigator without covering the minimap. At 900px and below, the left HUD uses a one-line selected-territory control and Browse opens a modal bottom sheet containing the full details and navigator.

The navigator is closed by default and can also be opened with Ctrl/Cmd+K. Search works within My territories or All territories filters, and result counts update in a polite live region. Every row is a keyboard-focusable button and exposes the territory name, owner, army count, continent, legal status, and sea-route status in its accessible name. Symbols and text identify valid sources (`◇`), valid targets (`◎`), selected sources (`◆`), selected targets (`×`), invalid territories (`—`), and sea-route targets (`≈`) without relying on color.

The navigator model reuses the same legal-action helpers as the renderer. Selection dispatches the same typed `SELECT_TERRITORY` action as globe picking and emits a request through the existing camera-focus system, including for repeated selections and back-side territories. The navigator stays open after selection; Escape or the explicit close action collapses it and returns focus to the active Browse trigger.

Visible focus rings apply to buttons, inputs, and selects. The modal traps focus, Escape closes it, and focus returns to its trigger. Phase changes, result counts, and selections use polite live regions; invalid actions use an alert; victory is assertive. Capture movement and all phase action controls remain keyboard operable. Reduced-motion preferences replace camera interpolation with an immediate safe focus.

### Strategic minimap

The compact flat map is a secondary overview; the 3D globe remains the
authoritative board and the only spatial gameplay surface. It renders the
current `PlanetDefinition.surfaceCells`, territory metadata, canonical
connections, setup ownership, and live `MatchState` ownership. It never
regenerates from the seed and dispatches no draft, reinforcement, combat, or
fortification commands. Territory paths are keyboard-operable focus controls:
activating one rotates the globe to that territory without selecting it as a
game action. The map has no independent zoom or pan.

Projection is equirectangular: longitude maps left-to-right and latitude maps north-to-south. Canonical icosphere cells become grouped SVG territory paths, shared cell edges become coast/territory/continent lines, and canonical sea routes become sampled great-circle polylines. Polygons are unwrapped and clipped into longitude bands at `-180°/+180°`; lines and routes are split at the crossing. Every fragment retains its canonical territory or route association, so a seam never creates another logical territory or a full-width false edge. Polar distortion is accepted, while near-polar cells remain visible.

The globe filters the same canonical `PlanetDefinition.connections` used by
the minimap. During world selection every sea route is rendered as a subtle,
decorative dotted great-circle path with no pointer handlers. Start Game removes
that global preview; active play keeps the existing selected/contextual route
highlighting, which remains visually stronger.

Projected geometry and SVG path data are cached by the canonical `PlanetDefinition`. A regenerated or loaded world rebuilds them; assignment and gameplay only update fills, and globe motion only updates the crosshair. The crosshair is derived one-way from the globe camera direction, uses both a ring and crosshair shape, and honors reduced-motion styling. The visualization is a single labeled, non-focusable overview rather than thousands of screen-reader polygons. On narrow screens the setup panel becomes shorter and independently scrollable so the minimap remains visible without covering its controls.

For historical implementation context, see the
[July 2026 handoff](./docs/history/handoff.md).

## Architecture Decisions

### A cell-owned icosphere instead of polygon meshes

The globe is a subdivision-level-4 icosphere (5,120 triangular surface cells). Every generated cell explicitly records `land` or `ocean` and either one territory ID or `null`. The renderer consumes that generated ownership directly, so the displayed terrain, pointer picking, geographic contiguity checks, and border graph all agree.

Rendering uses separate non-indexed land and ocean meshes. Only the land mesh has pointer handlers; raycast face indices map through a land-cell lookup to logical territories. Territory borders and coastlines are lightweight line-segment meshes, while debug mode adds subtle raised sea-route lines.

The minimap is a second renderer for this same data, not a second generator. Its data flow is `seed → canonical spherical generation → globe and flat projection`. Projection code is pure and renderer-independent; SVG owns only compact paths and presentation. Ownership colors come from the same player palette and shared territory-fill resolver used by the globe.

### Visual hierarchy and army markers

Before assignment, continent/geographical territory colors, dark territory borders, amber continent borders, and blue coastlines make the neutral globe readable without suggesting player control. During a draft, claimed territories switch to player colors while unclaimed territory remains geographical. After assignment, player ownership becomes the strongest normal land-fill signal, with selection and hover adding stronger lightening without replacing identity.

Army counts are visualization placeholders in the configured 2–9 range. One renderer component creates Three.js sprites directly and caches canvas textures/materials by owner and army value, avoiding a separate React subtree or unique material for every territory. Markers sit just above territory centers, use normal depth testing for globe occlusion, and enlarge when selected.

The faceted icosphere also hints at the intended voxel/low-poly direction without pretending to provide true voxel terrain.

### Deterministic generation

Generation uses a small seeded PRNG (`xmur3` feeding `sfc32`) and never calls `Math.random()`. Named seed streams isolate terrain candidates, continent partitions, geographic names, and cosmetic details. The seed, generator version, territory count, continent count, and requested land coverage fully determine the logical planet.

Generated definitions contain tuples, strings, numbers, `null`, and arrays only. Three.js objects remain entirely in the rendering layer.

### Coherent terrain and connected territory growth

Terrain begins as a deterministic scalar land-likelihood field built around spread continental anchors. Three neighboring-cell smoothing passes create coherent coasts. A rank threshold targets roughly 52% land, tiny fragments are removed, and several deterministic candidates are scored for 4–8 substantial landmasses without a dominant planet-wide surface.

Territory seeds are allocated proportionally across every retained landmass and selected by farthest graph distance. Balanced multi-source graph growth then claims only adjacent, unowned land cells. Every claim extends its territory from an existing owned cell, guaranteeing geographic contiguity and keeping territory sizes visually meaningful.

Geographic land borders are derived from differently owned land cells sharing an icosphere edge. If those borders form disconnected landmass graphs, a deterministic Kruskal spanning tree adds the minimal number of cross-landmass sea routes. A seed may add 0–3 short cross-landmass routes while limiting endpoint concentration. Strategic adjacency is derived from the explicit typed connections and stored symmetrically on territories.

### Connected continents

Gameplay continents are graph partitions, not physical landmasses. Continent origins are chosen far apart in strategic graph distance. Connected region growth strongly rewards multiple same-continent land neighbors and longer shared cell boundaries, while penalizing new external boundaries and sea-only claims. Multiple deterministic candidates are scored for balanced sizes, compactness, protrusions, dominated pockets, interleaving, sea-route dependence, and varied external gateway counts. A large landmass can still contain multiple geographically intentional gameplay continents.

Each continent records external gateways and neighboring continents. Its provisional reinforcement bonus is:

```text
max(2, round(territory count / 3 + neighboring continents / 2 - external gateways / 4))
```

The value is explicitly a visualization/setup placeholder, not a finalized reinforcement rule.

### Starting ownership generation

Two to six named local profiles use stable IDs, explicit seats, and palette color IDs. The assignment boundary exposes deterministic distributed random assignment and player-controlled round-robin draft as separate strategies. Random assignment gives every territory exactly one owner with count fairness, then bounded local swaps improve mixing, medium clusters, access, and exposure. Draft completion derives armies through an independent named stream. Additional strategies can be added without changing geography generation or match rules.

### Graph analysis and route readability

An independent Tarjan depth-first search calculates articulation points and graph bridges. Generated analysis also includes territory and landmass degree, gateway territories, external gateway counts, multi-route territories, sea-route bridge classification, and optional route redundancy. Geographic border weights produce per-continent internal/external edge counts, shared boundary lengths, cohesion scores, dominated pockets, protrusions, and pairwise interleaving metrics.

Selecting a territory shows its sea routes even outside debug mode and identifies land-border and sea-route neighbors separately in the HUD. Debug mode shows every route, endpoint, sea-route bridge, articulation point, bridge endpoint, gateway, and continent border, plus player and continent summaries.

### Camera focus

The selected-territory Focus action interpolates the camera direction toward the territory while preserving a clamped valid zoom distance. Orbit controls are briefly disabled during interpolation and resume automatically. A one-shot focus request lives in Zustand; React Three Fiber retains the camera itself. Orbit changes publish only a small wrapped longitude/latitude value for the minimap reticle, not camera objects or projected world geometry.

### Validation and warnings

Planet runtime validation checks the Zod data shape plus the requested territory/continent/player metadata, neutral territory state, ocean ownership, complete land assignment, cell and territory contiguity, physical landmass definitions, explicit connection uniqueness, sea-route validity, adjacency symmetry, global strategic connectivity, continent connectivity, memberships, bonuses, gateway analysis, and a full recomputation of serialized graph metrics. Assignment and match validation are separate layers.

Non-fatal warnings flag land coverage outside 45–60%, landmass counts outside 4–8, uneven territory sizes, excessive sea routes, disconnected player regions, gateway-heavy continents, missing defensibility, low continent cohesion, dominated color pockets, protrusions, excessive interleaving, and sea-route-dependent continents.

### State boundaries

Zustand owns the explicit application mode, current serializable world and match setups, planet, match, save status, and UI-only seed input, warnings, hover, display mode, event-log visibility, focus request, derived minimap focus coordinate, and debug mode. Pure setup and persistence helpers generate candidates, score balance, validate profiles and saves, and deterministically serialize without React or Three.js globals. Small browser adapters own `window.location`, History API, and localStorage access. Components dispatch typed commands through the pure rules reducer; they do not implement gameplay mutations. React Three Fiber owns scene objects and transient camera/horizon calculations; only the small minimap focus coordinate crosses that boundary during orbit changes.

## Current limitations

- Multiplayer is human-only and supports 2–5 players. It has no bots, bot takeover, mid-match joins, spectators, matchmaking, chat, timers, kicking, or host migration.
- Public rooms are discoverable only while waiting. Publishing is irreversible and locks the advertised setup; private rooms continue to use codes.
- Local save/resume is browser-specific. Multiplayer state is durable and authoritative, but local games do not have cloud saves.
- Multiplayer supports random assignment only. Player-controlled territory draft remains local-only.
- Boundaries and coastlines follow triangular surface-cell edges and are intentionally faceted; terrain is a binary strategic land/ocean mask without elevation modifiers.
- Sea routes are strategic graph edges, not navigable ocean territories.
- Starting-position balance is heuristic and can still produce strategically asymmetric but valid worlds.
- The fixed subdivision-level-4 surface is tuned most heavily around 42 territories; the supported 12–48 range does not adapt mesh resolution to count.
- Setup URLs reconstruct geography and setup choices, not profiles, assignments, active turns, or UI preferences.
- The minimap supports territory-to-globe focus but remains an overview rather than an independent gameplay surface.

## Near-term direction

The next useful milestone is structured multiplayer and mixed human/bot
playtesting across the recommended 42-territory, 5-continent, 4–5-seat
configuration. Results should drive balance weights, starting armies, lobby
clarity, reconnect behavior, and compact mobile polish before larger rules
systems are added.

Still deliberately deferred: cards and trading, alliances, spectators,
matchmaking, chat, true voxel/elevation terrain, structures, individual troop
models, remote-model controllers, and a replay viewer.
