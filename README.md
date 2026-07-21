# Worldseed

**Generate a world. Conquer it.**

A browser-based solo and local hot-seat playtest for a voxel-styled planetary strategy game. Worldseed separates deterministic world generation, editable player/controller configuration, and the mutable Risk-style match on the interactive globe. It is not a secure multiplayer implementation and has no backend or online persistence.

The prototype currently provides:

- A rotatable and zoomable 3D globe with desktop and touch-compatible orbit controls
- A responsive, read-only equirectangular minimap derived from the same canonical globe geometry and ownership state
- A deterministic, smoothed land/ocean mask with multiple landmasses and islands
- Exactly 42 playable land territories grouped into 6 connected gameplay continents
- Two to six editable player seats, each controlled by a Local Human or deterministic Heuristic Bot
- A randomly named neutral world on fresh launch, before any player ownership exists
- Curated readable names that are also canonical deterministic world seeds
- Random distributed assignment or a complete local round-robin territory draft
- A deterministic 32-candidate random starting-position generator with balance preview and assignment rerolls
- Explicit neutral-preview, assignment-in-progress, ready, handoff, playing, and game-over lifecycle states
- Browser-local save, autosave, validation, migration, deletion, and exact resume
- A separate serializable match state containing live ownership, armies, phase, selections, events, elimination, and victory
- An asynchronous controller boundary whose commands are revalidated by the authoritative reducer
- DOM-free reproducible bot matches with invariants, caps, metrics, JSON reports, and focused traces
- Reinforcement, repeated attacks, deterministic dice combat, mandatory post-capture movement, one connected-path fortification, and turn advancement
- Phase-aware globe selection and numbered army markers with non-color source/target cues
- Versioned setup URLs that reproduce the seed, territory count, continent count, player count, and assignment strategy
- A searchable, keyboard-operable territory navigator with owner, armies, continent, legal status, and sea-route cues
- Ownership, continent, and terrain display modes that do not affect rules state
- Camera-facing marker hiding and silhouette fading so back-side markers do not detach from the globe
- Non-playable visible oceans, emphasized coastlines, land borders, hover feedback, and persistent land selection
- Geographic land-border connections plus a minimal sea-route tree and 0–3 deterministic redundancy routes
- Smooth camera focus for selected territories and selected-route highlighting outside debug mode
- Serializable graph analysis for degrees, gateways, articulation points, bridges, landmass degrees, route redundancy, and continent cohesion
- A responsive HUD with selection details and a compact graph/debug panel
- Generator and graph tests covering neutral terrain, assignment, armies, compact continents, routes, bonuses, graph algorithms, validation, and serialization

## Run locally

Requires a current Node.js release and pnpm.

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm test
pnpm test:coverage
pnpm test:simulation
pnpm test:simulation:stress
pnpm test:bot
pnpm test:bot:stress
pnpm lint
pnpm build
pnpm format:check
```

## Playwright visual inspection

Worldseed includes a Chromium-based visual and interaction harness for repeatable inspection of the real Vite application. Playwright starts Vite automatically on deterministic port `4173` and runs three projects: desktop at 1920×1080, laptop at 1366×768, and mobile at 390×844.

Install the matching browser after installing dependencies:

```bash
pnpm exec playwright install chromium
```

Run the suites with:

```bash
pnpm test:e2e
pnpm test:visual
pnpm test:visual:update
```

`test:e2e` covers neutral setup, controller selection, bot input locking and handoff, keyboard assignment selection, random rerolls, draft turn order and duplicate feedback, neutral/draft save-resume, minimap lifecycle styling and camera synchronization, reinforcement, combat, capture, elimination, fortification, turn completion, rematches, navigator behavior, event logs, and victory. `test:visual` compares stable UI-region screenshots with the committed baselines in `tests/e2e/visual.spec.ts-snapshots/`. Use `test:visual:update` only after reviewing intentional UI changes.

Every visual run also writes full-page human-review captures to `test-results/ui-review/<project>/`. Playwright failure screenshots, traces, and its HTML report remain under `test-results/`. Those generated results are ignored by Git.

The visual route uses the fixed `visual-review-atlas` world, reduced motion, a deterministic font and timezone, and no animated star field. Minimap scenarios additionally cover a deliberate land-and-route antimeridian fixture and representative camera orientations. Scenario state is built with the real generator, match setup, match constructor, and rules reducer. The scenario driver is loaded only when Vite is in development mode and `visual-review=1` is present; production builds do not include or expose it. Full-page images are for human inspection, while assertions target UI regions with a small pixel tolerance so animated WebGL details do not make the suite brittle.

## Automated gameplay verification

Gameplay verification has three complementary layers:

- Hand-authored rules fixtures cover adjacent territories, land borders, sea routes, owned and enemy-blocked chains, branched graphs, disconnected ownership, one and multiple continents, zero-territory players, pending capture, and near-victory states. These tests exercise reinforcement and continent bonuses, action legality, dice and ties, casualties, capture bounds, elimination and turn skipping, connected fortification, victory, deterministic events, invalid-action immutability, and serialization.
- Playwright drives the real store and UI at all three supported viewports. Its scenario and inspection API is development-only and remains gated by both `import.meta.env.DEV` and `visual-review=1`.
- The headless simulator constructs real generated worlds and starting positions, asks the rules helpers for legal actions, and dispatches every transition through `gameReducer`. The conservative policy makes at most two favorable attacks per turn and performs basic fortification; the aggressive policy attacks whenever a legal target remains and moves the maximum legal capture force.

The simulator validates the runtime match schema and invariants after every transition: immutable planet data, complete valid ownership, integer armies, elimination consistency, a live active player, non-negative reinforcement pools, phase/action compatibility, capture blocking, one fortification per turn, strategic adjacency, turn ownership, monotonic combat sequence, ordered event IDs, winner consistency, and JSON semantic round trips. The pending-capture destination is the one intentional temporary exception to the normal `armyCount >= 1` invariant: it has zero armies between ownership transfer and the mandatory capture move.

The fast matrix runs ten deterministic setup combinations across player counts 2–6 with both policies. The local stress matrix runs 135 world/setup combinations—territory counts 12, 18, and 24; continent counts 2, 3, and 4; player counts 2–6; and three ownership variants—with both policies and a 750-action bound per match. Some small generated worlds cannot satisfy the bounded balanced-connected ownership or starting-position candidate search for their first seed; simulation setup retries a documented deterministic seed suffix sequence and reports the actual successful world seed.

Complete heuristic-bot matches are a separate layer. `pnpm test:bot` runs focused controller and quick match checks; `pnpm test:bot:stress` runs a moderate all-bot matrix. `pnpm simulate:bots -- --games N` runs an explicit sequential extended batch and writes a structured report under ignored `artifacts/bot-simulations/`. Exact descriptors replay with `--reproduce '<json>' --trace`. See [CONTROLLERS.md](./CONTROLLERS.md) for the command contract, heuristic, RNG boundaries, invariants, metrics, cap semantics, and report schema.

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

`pnpm test:coverage` writes text, HTML, and JSON-summary reports for the pure game and save-validation modules. The HTML report is generated under `coverage/`. Coverage is used to identify rule branches—not as a 100% target. Remaining low-value branches are mainly malformed/unknown command variants and defensive lookup failures; browser-local storage exceptions, free-form globe dragging, and subjective play balance still require integration or manual playtesting.

The current focused report is 92% statements, 85.76% branches, 100% functions, and 93.05% lines. The change in scope includes the new schema-v3 lifecycle validation; the principal remaining gaps are defensive reducer command variants and malformed save/setup consistency branches.

In the current deterministic matrices, the smoke suite reached 7 victories in 20 bounded runs and exercised 7,767 state transitions. The stress suite reached 124 victories in 270 bounded runs and exercised 146,287 transitions; the remaining runs stopped cleanly at their configured action limit rather than failing an invariant.

## Branding and logo variants

The board-level Worldseed logo is intentionally separate from the match HUD so the HUD remains gameplay-focused. Two transparent PNG lockups are retained for visual A/B testing:

- `public/assets/worldseed-logo-a.png` — the original globe-and-network lockup
- `public/assets/worldseed-logo-b.png` — the glitch/data-fragment lockup and current default

Select a variant without rebuilding by adding a query parameter:

```text
http://localhost:5173/?logo=a
http://localhost:5173/?logo=b
```

Missing or unsupported values fall back to variant B. Both assets are trimmed RGBA images intended to sit directly over the dark gameboard without a surrounding panel.

## Shareable world setup URLs

World setup is plain serializable data kept separate from both immutable `PlanetDefinition` geography and mutable `MatchState` gameplay. Version 1 supports:

| Parameter     | Default                   | Valid values                                        |
| ------------- | ------------------------- | --------------------------------------------------- |
| `v`           | `1`                       | `1`                                                 |
| `seed`        | generated on a fresh root | Any non-empty string                                |
| `territories` | `42`                      | Whole numbers from 12–48                            |
| `continents`  | `6`                       | Whole numbers from 2–8, never more than territories |
| `players`     | `4`                       | Whole numbers from 2–6                              |
| `assignment`  | `random`                  | `random` or `player-draft`                          |
| `logo`        | `b`                       | `a` or `b`                                          |

Example:

```text
http://localhost:5173/?v=1&seed=atlas-prime&territories=42&continents=6&players=4&assignment=random&logo=b
```

On a normal root launch with no supported setup parameters, Worldseed creates a readable slug such as `amber-meridian-482`, generates that neutral world once, and replaces the current URL with its complete setup. Refresh therefore reconstructs the same world. An explicit seed or supported shared setup URL takes precedence. Fixed seeds such as `atlas-prime` and `visual-review-atlas` remain test/demo fixtures, not the production root default. A requested local-save resume reconstructs the saved seed and is never replaced by fresh-launch naming.

Missing parameters in an otherwise supported setup URL use defaults. Malformed counts fall back or clamp to supported ranges and show a concise setup warning; an unsupported `v` falls back to the complete default setup. Serialization has a stable parameter order. The current `logo` value and unknown query parameters are preserved when applying or generating a setup.

**Generate World** creates a new curated readable seed, updates the seed field and URL with `history.pushState`, rebuilds one neutral `PlanetDefinition`, updates the globe and minimap, and remains on world selection without calculating ownership or starting Turn 1. Type a custom seed and press Enter to apply that deterministic seed and the visible geography counts while staying in the same neutral preview. **Start Game** is the only opening action that accepts the displayed world and reveals player profiles and assignment. Browser back and forward navigation rebuilds the selected neutral world. Assignment results, player profiles, draft picks, saves, and active turns never enter the URL.

Readable naming is independent of geography generation: a curated descriptor, curated landmark, and short numeric suffix become the canonical seed passed to the existing deterministic generator. Custom typed seeds remain supported. A future version could separate a display name from its canonical seed, but no second field or persistence concept exists today.

## World setup, pregame, and match flow

`WorldSetup` contains the versioned URL parameters listed above, including the assignment-strategy choice. `PlanetDefinition` remains immutable geography and topology; generated territories are neutral (`ownerId: null`, zero armies). A discriminated `MatchSetup` contains stable player IDs, names, palette colors, seat order, strategy, and one of three setup phases: `neutral-preview`, `assignment-in-progress`, or `ready`. Only `ready` contains a complete `StartingPosition`. `MatchState` is nullable before play and is created only from a ready setup; it contains mutable turns, ownership, armies, selections, pending captures, deterministic combat sequence, elimination, victory, and events. Camera, dialogs, hover, and display preferences remain view state.

Generating a world remains in world selection with geographical/continent colors, no army markers, no starting-balance claim, and no playable match. Editing seed or count fields does not mutate the displayed world until the user presses Enter in the seed field or clicks Generate World for a new readable seed. Start Game opens match setup, where player count, names, colors, controllers, and assignment mode are configured. Controller type is independent from identity and color; mixed human/bot and all-bot tables are valid. Player names are normalized before assignment and blank or duplicate names are blocked. Colors come from six named, high-contrast choices and cannot be duplicated. The table then explicitly begins either random assignment or a player draft. A ready setup must be explicitly started with Begin Match before the first handoff. Gameplay commands are rejected until the application is in `playing` with a real match, and human commands are rejected while its active seat is bot-controlled.

Starting ownership evaluates 32 deterministic candidates derived from the world seed, generator version, stable player IDs, ownership variant, and candidate index. The default `distributed` strategy uses shuffled round-robin placement followed by bounded, count-preserving local swaps; it deliberately targets several useful ownership regions instead of growing one empire per player. Hard-invalid candidates are rejected before score comparison, and a failed bounded search reports its leading blocking conditions without changing the world seed.

The local player draft starts with an empty owner map. Pick `n` belongs to seat `n % playerCount`, so the order is deterministic round-robin; when territory totals are uneven, the earliest seats receive one extra territory. The active player may claim only an unowned territory using the globe or the keyboard-ready territory list. Cancel and restart clear picks without changing geography. After the final pick, fixed starting-army totals are distributed deterministically, balance is rebuilt, and the setup enters `ready` rather than starting immediately.

The visible 0–100 score is a weighted average of eight serialized 0–100 categories: territory parity (16%), army parity (12%), continent fairness (18%), connectivity distribution (18%), geographic spread (10%), border exposure (10%), sea-route access (8%), and gateway access (8%). Parity awards full credit for a spread of at most one. Continent fairness deducts for full, majority, and one-away shares plus potential-bonus disparity. Connectivity uses a scaled middle-range target (roughly the square root of a player's territory count, bounded to 2–5 regions), a preferred 25–60% largest-region share, and a scaled isolated-territory allowance. The remaining categories compare player ranges for pairwise world spread, borders, sea endpoints, and gateways. Ratings are Excellent (90+), Good (75+), Uneven (55+), or Poor.

Random hard-invalid conditions are: missing, unknown, or extra ownership; territory or army spread above one; a fully owned gameplay continent with at least two territories; at least 80% of a five-or-more-territory position in one region; no strategic adjacency; excessive sea-route or gateway ownership; majority control of three or more mixable continents; or a territory with no army. A technically valid Poor random layout requires explicit confirmation before play. Player drafts share structural checks—complete valid IDs and owners, count parity, equal starting armies, at least one territory per player, and positive armies—but clustered regions, full continents, gateway concentration, and Poor strategic scores are advisory because the players intentionally made those choices.

Starting armies use fixed equal totals inspired by classic Risk: 40 each for two players, 35 for three, 30 for four, 25 for five, and 20 for six. Every territory receives one army first; the remainder is distributed by a candidate-specific deterministic stream. Turn reinforcement calculation remains separate.

Starting a match opens a mandatory full-screen handoff before Turn 1. End Turn prepares the next non-eliminated player's reinforcement phase exactly once, clears stale selections, and then opens another handoff. The globe and active controls stay unavailable until that player chooses Begin turn. A later handoff can show a short public summary of captures, eliminations, fortification, or victory from the previous turn.

## Local save and resume

Worldseed uses one browser-local `localStorage` slot (`worldseed.local-match`). Match start and every semantic rules transition are autosaved; a manual Save match action is also available. Camera, minimap projection geometry, hover, animation, live Three.js objects, and open utility dialogs are never saved.

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

The compact Territory list utility opens a modal side drawer on wider screens and a bottom sheet on narrow screens. It is closed by default and can also be opened with Ctrl/Cmd+K. Search works within My territories or All territories filters, and result counts update in a polite live region. Every row is a keyboard-focusable button and exposes the territory name, owner, army count, continent, legal status, and sea-route status in its accessible name. Symbols and text identify valid sources (`◇`), valid targets (`◎`), selected sources (`◆`), selected targets (`×`), invalid territories (`—`), and sea-route targets (`≈`) without relying on color.

The navigator model reuses the same legal-action helpers as the renderer. Selection dispatches the same typed `SELECT_TERRITORY` action as globe picking and emits a request through the existing camera-focus system, including for repeated selections and back-side territories. The drawer stays open after desktop selection and includes Close and view globe.

Visible focus rings apply to buttons, inputs, and selects. The modal traps focus, Escape closes it, and focus returns to its trigger. Phase changes, result counts, and selections use polite live regions; invalid actions use an alert; victory is assertive. Capture movement and all phase action controls remain keyboard operable. Reduced-motion preferences replace camera interpolation with an immediate safe focus.

### Read-only strategic minimap

The compact flat map is a secondary overview; the 3D globe remains the authoritative board and the only spatial gameplay surface. It renders the current `PlanetDefinition.surfaceCells`, territory metadata, canonical connections, setup ownership, and live `MatchState` ownership. It never regenerates from the seed, owns no territory identifiers, dispatches no game commands, and provides no selection, draft, combat, zoom, pan, or camera-navigation controls.

Projection is equirectangular: longitude maps left-to-right and latitude maps north-to-south. Canonical icosphere cells become grouped SVG territory paths, shared cell edges become coast/territory/continent lines, and canonical sea routes become sampled great-circle polylines. Polygons are unwrapped and clipped into longitude bands at `-180°/+180°`; lines and routes are split at the crossing. Every fragment retains its canonical territory or route association, so a seam never creates another logical territory or a full-width false edge. Polar distortion is accepted, while near-polar cells remain visible.

Projected geometry and SVG path data are cached by the canonical `PlanetDefinition`. A regenerated or loaded world rebuilds them; assignment and gameplay only update fills, and globe motion only updates the crosshair. The crosshair is derived one-way from the globe camera direction, uses both a ring and crosshair shape, and honors reduced-motion styling. The visualization is a single labeled, non-focusable overview rather than thousands of screen-reader polygons. On narrow screens the setup panel becomes shorter and independently scrollable so the minimap remains visible without covering its controls.

For continuation context and a ready-to-use next-task brief, see [`HANDOFF.md`](./HANDOFF.md).

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

Generation uses a small seeded PRNG (`xmur3` feeding `sfc32`) and never calls `Math.random()`. Named seed streams isolate terrain candidates, continent partitions, and cosmetic details. The seed, generator version, territory count, continent count, and requested land coverage fully determine the logical planet.

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

- Boundaries and coastlines follow triangular surface-cell edges and are intentionally faceted.
- The scalar field currently produces a binary strategic land/ocean mask, not detailed elevation or terrain modifiers.
- Sea routes are strategic graph edges and debug lines, not navigable ocean territories.
- This is trusted local hot-seat play. There is no server authority, hidden information security, remote-client validation, or reconnect across devices.
- Starting-position balance is heuristic and may still produce strategically asymmetric but valid worlds.
- The single local save is browser-specific and tied to a compatible generator version; there are no cloud saves.
- Numbered markers are screen-facing sprites rather than troop models and do not aggregate at extreme zoom levels yet.
- Camera focus centers a territory but does not yet frame a multi-territory selection.
- Picking targets playable land territories and does not yet support structures.
- The fixed subdivision-level-4 surface is tuned most heavily around 42 territories; the supported 12–48 range does not yet adapt mesh resolution to count.
- URLs reconstruct world setup only, not player profiles, ownership variants, in-progress turns, or UI preferences.
- The minimap is intentionally read-only. Optional click-to-focus globe navigation is a possible future enhancement, but territory actions and independent minimap navigation remain out of scope.
- Browser history records applied setups, but there is no named setup library or durable server storage.

## Next recommended milestone

Run structured friend playtests, collect balance and usability observations, and tune the scoring weights, starting-army totals, and compact mobile layout before considering cards or any network-authority design.

## Deliberately Deferred

- Online multiplayer
- Networking and server authority
- Backend or cloud persistence
- Authentication
- Matchmaking, reconnects, and spectators
- Cards and trading
- Alliances
- Detailed terrain
- True voxel terrain
- Individual troop rendering
- Animations beyond simple feedback
- Sound
- Remote-model controllers, provider API keys, hidden model reasoning, and networking
- A spectator/admin dashboard or replay-viewer UI; structured bot reports are ready for later consumption
- Production mobile polish
