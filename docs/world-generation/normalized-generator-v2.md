# Normalized world generator v2

Status: canonical production generator. Version 3 remains available as the
explicit `v1-current` diagnostic profile.

## Current pipeline (`v1-current`, generator version 3)

1. `generatePlanet` trims the supplied seed and combines it with generator
   version 3.
2. `createIcosphere(4)` creates one fixed 2,562-vertex / 5,120-triangle sphere.
   Surface triangles, called cells by generation code, are the smallest unit of
   land and territory ownership.
3. `generateTerrain` evaluates 18 seeded scalar fields. Each field is the
   maximum influence of 2–7 sphere-distributed anchors plus four sine-wave
   details, followed by three graph-neighbor smoothing passes. A ranked
   threshold selects land; components below 12 cells and excess landmasses are
   removed. The lowest-scoring coverage/landmass candidate wins.
4. `generateTerritoryLayout` allocates territory counts to physical
   landmasses. It selects farthest graph-distance seed cells, then repeatedly
   gives the least-filled territory one frontier cell. The chosen frontier cell
   maximizes the number of still-unclaimed neighbors.
5. Differently owned cells sharing an icosphere edge define a land border.
   The number of shared micro-edges is its weight. Strategic adjacency is the
   land-border graph plus sea routes.
6. `buildSeaRoutes` chooses the nearest coastal territory pair for each
   landmass pair, builds a deterministic Kruskal tree, and adds 0–2 bounded
   routes subject to endpoint degree limits.
7. `chooseSpatialContinentAssignments` allocates continent seeds to physical
   landmasses and evaluates up to 96 deterministic connected graph-growth
   candidates. Shared land boundary and same-region neighbors are rewarded;
   exposed, interleaved, narrow, or badly imbalanced candidates are penalized
   or rejected.
8. Each territory center is the normalized sum of its triangle centroids.
   That one point drives camera focus, army markers, sea-route endpoints, and
   several label/analysis consumers.
9. `Planet` renders the owned triangles and raycasts the same triangle list.
   `TerritoryOverlay` independently rediscovers boundary micro-edges.
   `projectWorldGeometry` independently projects every owned triangle and
   rediscovers the same boundary micro-edges for the minimap. Continent labels
   choose a territory medoid from territory centers.
10. `PlanetDefinition` serializes the seed, numeric generator version,
    territory centers and metadata, cell ownership, connections, and graph
    analysis. Local saves store setup and match state and reconstruct geometry
    from the setup. Hosted match snapshots store the complete planet. The world
    fingerprint includes generator version, centers, adjacency, surface
    ownership, and connections.

## Proven defect sources

The current appearance is not caused by one polygon-smoothing omission:

- Needle points, very short edges, high-frequency zigzags, and large vertex
  counts arise at the **cell-boundary extraction stage**. A border is a
  staircase of subdivision-4 triangle edges, and both renderers emit every
  ownership transition without shared-chain simplification.
- Large area variance and long narrow territories arise mainly in
  **frontier growth**. Fill pressure uses cell count, not spherical area, and
  the next-cell rule rewards open frontier capacity rather than distance to a
  site, compactness, perimeter, or aspect ratio.
- Acute wedges can be introduced where independently growing frontiers meet.
  The fixed icosphere's twelve degree-5 vertices also provide unavoidable but
  limited topological exceptions.
- Coastline sawteeth come from thresholding a detailed scalar field onto the
  fixed cell lattice. Removing small islands does not remove alternating
  boundary steps or micro-bays on retained landmasses.
- One-territory tendrils, narrow necks, and wrapped/interleaved continents
  originate in **continent graph growth and scoring**. Existing scoring sees
  shared micro-edge counts and graph degrees, but not spherical area balance,
  geometric perimeter, geographic aspect, holes, or explicit leaf appendages.
- Poor army/label anchors originate after geometry construction. A normalized
  average of cell centroids is not guaranteed to be inside a concave union and
  is not optimized for clearance from narrow corners. Reusing that point also
  attaches sea routes to an arbitrary visual location.
- The globe and minimap agree on ownership today, but each rebuilds line work
  independently. Adding renderer-only smoothing would create disagreement
  between fill, outlines, raycasts, minimap, and route/label placement.

## Canonical v2 pipeline (`v2-normalized`, generator version 4)

1. Keep the fixed icosphere topology and deterministic terrain construction so
   cell ownership remains compact, serializable, and compatible with current
   rendering and validation.
2. Allocate stable site indices to physical landmasses, generate a bounded
   derived-seed variation of farthest-point sites, then run six fixed
   spherical Lloyd passes. Every pass assigns land cells to the nearest site
   within its landmass, computes an area-weighted spherical cell centroid, and
   moves the site a bounded fraction toward that centroid. Coordinates are
   normalized and quantized after every move. Empty-cell and exact-score ties
   use stable site/cell order.
3. Evaluate four fixed derived-seed candidates, each with its own deterministic
   terrain and site stream. For each candidate, build real land adjacency,
   choose a shape-aware continent assignment, and score explicit territory,
   continent, geographic-diameter, topology, and sea-route components. Lowest
   score wins; candidate index breaks exact ties.
4. Regularize the canonical shared surface once. Internal two-territory border
   vertices move conservatively toward the sites' spherical bisector. Junctions
   remain bounded. Coast vertices receive a separate, lighter low-pass
   treatment so coastlines retain broad bays and peninsulas. Quantized canonical
   vertices are stored on v2 planets and reused by globe fill, raycasts,
   outlines, minimap, diagnostics, and snapshot/fingerprint serialization.
5. Choose each territory's anchor from an owned triangle nearest its
   area-weighted spherical centroid. This guarantees that the anchor is inside
   canonical owned geometry. The same anchor drives camera focus, army/label
   placement, and sea-route attachment.
6. Attach a deterministic diagnostics record containing candidate selection,
   territory/continent/world metrics, and scoring components. Timing is emitted
   separately through a reporting-only observer so wall-clock measurements
   never enter serialized geometry or fingerprints. Development comparison
   tooling and the seed-sweep report consume both; normal gameplay does not.

The fixed iteration count is six. A 2/4/6-pass probe found four passes still
worsened mean area variance on the initial matrix, while six produced a mean
improvement without a material runtime step. Later passes increasingly erase
controlled seed variation. Lloyd movement is capped
at 45% of the site-to-centroid arc per pass and quantized to 12 decimal places.
Shared-vertex movement is capped below half a base micro-edge so triangle
topology and ownership cannot change.

## Compatibility strategy

- Numeric generator version 3 is named `v1-current`; version 4 is named
  `v2-normalized`.
- `generatePlanet` defaults to version 4. Explicit version 3 selection preserves
  the established v1 output and fingerprint.
- A setup URL without `generator` infers version 4. Canonical v2 serialization
  omits the parameter; explicit v1 URLs retain `generator=v1-current`.
- New save schema data records the generator version in `worldSetup` as well as
  the existing top-level field. Missing version metadata resolves to version 4.
- Hosted rooms persist generator version 4 by default. Lobby previews and
  authoritative match creation resolve that same room value, while match
  snapshots retain the complete generated planet across refresh and reconnect.
- The world fingerprint includes v2 canonical vertices and already includes the
  generator version. The version-3 canonical payload is deliberately unchanged,
  so version-3 fingerprints do not change.
- The development selector is compiled behind `import.meta.env.DEV` and keeps
  version 3 available as a diagnostic path. Production creation and multiplayer
  use version 4.

## Deterministic quality metrics

Territory metrics use canonical spherical triangles and ordered shared boundary
chains: spherical area and median ratio, geodesic perimeter, approximate
`4πA/P²` compactness, tangent-plane diameter aspect ratio, meaningful
simplified side count, shortest edge and short-edge count, minimum corner
angle, near-collinear and raw vertex counts, site-to-centroid distance, and
centroid-to-anchor distance.

Continent metrics aggregate the same canonical geometry: territory count,
spherical area, compactness, perimeter/coastline ratio, geographic diameter,
one-territory appendages, articulation/narrow-neck count, connected components,
enclave/hole count where detectable, and territory/area balance.

World metrics report territory-area coefficient of variation, median-ratio
outliers outside 0.60–1.60, side-count distribution, tiny edges, acute corners,
continent compactness distribution, land/ocean ratio, adjacency-degree
distribution, sea-route count/length distribution, candidate scores, and timing.

Initial prototype thresholds are intentionally diagnostic rather than validity
rules: a short edge is below 2.5% of territory perimeter, an acute corner is
below 35°, a near-collinear turn is below 8°, and a meaningful side must survive
an 24° turn / 7% perimeter-length simplification. These values target visible
micro-geometry at the current subdivision without forcing regular hexagons.
World acceptance still prioritizes connected ownership, positive area,
canonical shared topology, valid strategic adjacency, and visual review.

Run `pnpm audit:normalized-worlds` for the 250-seed × 2–5-continent aggregate
report under `.fustify/reports/world-generation/normalized-v2/`. In development,
the world setup's generator selector exposes the selected candidate and headline
metrics; version-3 controls are unchanged and the selector is absent from the
production bundle.

## Prototype evaluation

The final bounded sweep attempted 1,000 worlds per profile (250 seeds at each of
2, 3, 4, and 5 continents). Version 4 accepted all 1,000. Version 3 retained 43
existing continent-quality rejections, leaving 957 successful paired
comparisons. On those pairs, v2 reduced mean territory-area coefficient of
variation by 13.36%, tiny-edge count by 96.14%, and worst territory aspect ratio
by 40.12%. Mean territory compactness improved by 138.55%, and mean continent
compactness improved by 34.26%. V2 reported no disconnected continents,
one-territory appendages, detected enclaves, or outside anchors.

Across all 42,000 v2 territories, 74.04% had 5–7 meaningful sides and 97.92% had
4–7; the long-tail 3/8/9-side exceptions fell to 2.08%, from 6.37% outside 4–7
in the successful v1 sample. The corner-acuteness threshold found three v2
territories and no v1 territories, confirming that this particular angle metric
does not explain v1's visible staircase jaggedness; tiny-edge, near-collinear,
compactness, and aspect metrics are more discriminating for this mesh.

Worst remaining v2 territory measurements were a 0.5876 minimum and 1.666121
maximum area-to-median ratio, 0.307813 compactness, 0.03813-radian shortest
edge, and 2.178347 aspect ratio. These are review outliers, not validity
failures. Manual comparison at 1920×1080 and 1366×768 found broader readable
internal borders and substantially calmer coastlines without a tiled look.
Remaining visual weaknesses are low-frequency coastline steps and pre-existing
horizon-edge marker/label clipping. The 390×844 fixture remains usable but was
not treated as a mobile globe redesign.
