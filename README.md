# Globe Risk — Technical Prototype

A browser-based foundation for a voxel-styled planetary strategy game. This iteration proves that a deterministic, interactive strategic globe can be generated, inspected, and regenerated from a seed without a backend.

The prototype currently provides:

- A rotatable and zoomable 3D globe with desktop and touch-compatible orbit controls
- 42 deterministic territories grouped into 6 connected continents
- Visible colored regions, territory borders, hover feedback, and persistent selection
- Serializable domain data with stable IDs, owners, armies, and adjacency lists
- A responsive HTML HUD with seed controls, validation status, and selected territory details
- Generator tests for determinism, connectivity, membership, and serialization

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
```

For continuation context and a ready-to-use next-task brief, see [`HANDOFF.md`](./HANDOFF.md).

## Architecture Decisions

### A classified icosphere instead of polygon meshes

The globe is a subdivision-level-4 icosphere (5,120 triangles). The generator creates approximately even seed points with a jittered Fibonacci lattice. Each triangle centroid is assigned to the territory seed with the greatest spherical dot product—the nearest seed on a unit sphere.

This produces recognizable regions rather than markers while staying robust and inexpensive. Rendering uses one non-indexed, vertex-colored globe mesh and one line-segment boundary mesh, keeping draw calls low. Pointer raycasting returns a triangle index, which maps directly to its logical territory.

The faceted icosphere also hints at the intended voxel/low-poly direction without pretending to provide true voxel terrain.

### Deterministic generation

Generation uses a small seeded PRNG (`xmur3` feeding `sfc32`) and never calls `Math.random()`. Independent seed streams for points, continents, and details prevent an unrelated random draw in one phase from silently changing later phases. The seed, generator version, territory count, and continent count fully determine the logical planet.

Generated definitions contain tuples, strings, numbers, `null`, and arrays only. Three.js objects remain entirely in the rendering layer.

### Adjacency from rendered borders

Adjacency is derived from shared icosphere edges: if the two triangles sharing an edge belong to different territories, those territories are neighbors. Edges are added symmetrically and deduplicated with sets. Validation checks non-empty neighbor lists, self-links, duplicates, symmetry, missing IDs, and whole-graph connectivity. A deterministic nearest-seed bridge is available as a defensive repair if coarse tessellation ever creates disconnected components.

### Connected continents

Continent origins are chosen far apart in graph distance. A deterministic multi-source breadth-first expansion then claims unassigned neighboring territories. Because every claim comes from a territory already in that continent, every continent remains connected and contains at least one territory.

### State boundaries

Zustand owns UI state and the current serializable planet: seed input, hover, selection, and debug mode. React Three Fiber owns scene objects and transient rendering concerns. Generation, geometry, validation, and types have no dependency on React or Three.js.

## Current limitations

- Triangle classification approximates spherical Voronoi borders; boundaries are intentionally faceted.
- Regions are strategic surface colors, not land/ocean or height-based terrain.
- Picking targets the strategic region surface and does not yet support units or structures.
- Territory and continent counts are configurable in code, not in the HUD.
- The prototype is tuned for roughly 42 territories; extreme counts may need adaptive tessellation.
- Seed controls are local to a browser session and do not create shareable match URLs yet.

## Most important next steps

1. Add a versioned match/setup model and encode seed settings in shareable URLs.
2. Introduce land/sea and elevation fields while retaining territory identity and picking.
3. Add a turn-state model for reinforcement, attack selection, and ownership changes.
4. Evaluate a GPU seed-classification shader or generated border geometry for higher territory counts.
5. Prototype zoom-dependent strategic markers, then voxel terrain/troop level-of-detail.
6. Add accessibility alternatives for territory selection and color differentiation.

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
