# Globe Risk — Technical Prototype

A browser-based foundation for a voxel-styled planetary strategy game. This iteration proves that a deterministic, interactive strategic globe can be generated, inspected, and regenerated from a seed without a backend.

The prototype currently provides:

- A rotatable and zoomable 3D globe with desktop and touch-compatible orbit controls
- A deterministic, smoothed land/ocean mask with multiple landmasses and islands
- Exactly 42 playable land territories grouped into 6 connected gameplay continents
- Four deterministic placeholder players with balanced, connected ownership regions
- Deterministic bounded placeholder armies shown through lightweight numbered markers
- Non-playable visible oceans, emphasized coastlines, land borders, hover feedback, and persistent land selection
- Geographic land-border connections plus a minimal sea-route tree and 0–3 deterministic redundancy routes
- Smooth camera focus for selected territories and selected-route highlighting outside debug mode
- Serializable graph analysis for degrees, gateways, articulation points, bridges, landmass degrees, route redundancy, and continent cohesion
- A responsive HUD with selection details and a compact graph/debug panel
- Generator and graph tests covering terrain, ownership, armies, compact continents, routes, bonuses, graph algorithms, validation, and serialization

## Run locally

Requires a current Node.js release and pnpm.

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm test
pnpm lint
pnpm build
pnpm format:check
```

For continuation context and a ready-to-use next-task brief, see [`HANDOFF.md`](./HANDOFF.md).

## Architecture Decisions

### A cell-owned icosphere instead of polygon meshes

The globe is a subdivision-level-4 icosphere (5,120 triangular surface cells). Every generated cell explicitly records `land` or `ocean` and either one territory ID or `null`. The renderer consumes that generated ownership directly, so the displayed terrain, pointer picking, geographic contiguity checks, and border graph all agree.

Rendering uses separate non-indexed land and ocean meshes. Only the land mesh has pointer handlers; raycast face indices map through a land-cell lookup to logical territories. Territory borders and coastlines are lightweight line-segment meshes, while debug mode adds subtle raised sea-route lines.

### Visual hierarchy and army markers

Player ownership is the strongest normal land-fill signal. A restrained blend with each territory's continent color, deterministic brightness variation, dark territory borders, amber continent borders, and blue coastlines keep individual territories, gameplay continents, physical landmasses, and oceans readable at the same time. Selection and hover add stronger lightening without replacing ownership identity.

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

### Ownership generation

Four named placeholder players use stable colors. Spread strategic seeds followed by balanced multi-source graph growth assigns every territory exactly once. Candidate seed layouts are tried deterministically until player totals differ by at most one territory; every claim extends an existing player region, keeping each starting distribution connected when the strategic graph permits it. Armies use an independent named random stream so unrelated visual changes do not perturb counts.

### Graph analysis and route readability

An independent Tarjan depth-first search calculates articulation points and graph bridges. Generated analysis also includes territory and landmass degree, gateway territories, external gateway counts, multi-route territories, sea-route bridge classification, and optional route redundancy. Geographic border weights produce per-continent internal/external edge counts, shared boundary lengths, cohesion scores, dominated pockets, protrusions, and pairwise interleaving metrics.

Selecting a territory shows its sea routes even outside debug mode and identifies land-border and sea-route neighbors separately in the HUD. Debug mode shows every route, endpoint, sea-route bridge, articulation point, bridge endpoint, gateway, and continent border, plus player and continent summaries.

### Camera focus

The selected-territory Focus action interpolates the camera direction toward the territory while preserving a clamped valid zoom distance. Orbit controls are briefly disabled during interpolation and resume automatically. Only a one-shot focus request lives in Zustand; per-frame camera state remains in React Three Fiber.

### Validation and warnings

Runtime validation checks the Zod data shape plus the fixed 42-territory / 6-continent / 4-player defaults, ownership validity and balance, army bounds, ocean ownership, complete land assignment, cell and territory contiguity, physical landmass definitions, explicit connection uniqueness, sea-route validity, adjacency symmetry, global strategic connectivity, continent connectivity, memberships, bonuses, gateway analysis, and a full recomputation of serialized graph metrics.

Non-fatal warnings flag land coverage outside 45–60%, landmass counts outside 4–8, uneven territory sizes, excessive sea routes, disconnected player regions, gateway-heavy continents, missing defensibility, low continent cohesion, dominated color pockets, protrusions, excessive interleaving, and sea-route-dependent continents.

### State boundaries

Zustand owns UI state and the current serializable planet: seed input, hover, selection, and debug mode. React Three Fiber owns scene objects and transient rendering concerns. Generation, geometry, validation, and types have no dependency on React or Three.js.

## Current limitations

- Boundaries and coastlines follow triangular surface-cell edges and are intentionally faceted.
- The scalar field currently produces a binary strategic land/ocean mask, not detailed elevation or terrain modifiers.
- Sea routes are strategic graph edges and debug lines, not navigable ocean territories.
- Ownership, army values, and continent bonuses are deterministic visualization placeholders; there are no turns, reinforcement rules, or combat resolution.
- Numbered markers are screen-facing sprites rather than troop models and do not aggregate at extreme zoom levels yet.
- Camera focus centers a territory but does not yet frame a multi-territory selection.
- Picking targets playable land territories and does not yet support structures.
- Territory and continent counts are configurable in code, not in the HUD.
- The prototype is tuned for roughly 42 territories; extreme counts may need adaptive tessellation.
- Seed controls are local to a browser session and do not create shareable match URLs yet.

## Most important next steps

1. Add accessible keyboard/list-based territory navigation and non-color ownership cues.
2. Add a versioned match/setup model and encode seed/player settings in shareable URLs.
3. Add generator diagnostics for comparing rejected compactness, gateway, and route candidates.
4. Add zoom-dependent marker aggregation and strategic labels without introducing troop models.
5. Prototype a setup-only ownership reroll/editor before adding any turn or combat system.

## Deliberately Deferred

- Multiplayer
- Backend persistence
- Authentication
- Combat rules
- Reinforcement rules
- Detailed terrain
- True voxel terrain
- Individual troop rendering
- Animations
- Sound
- AI opponents
