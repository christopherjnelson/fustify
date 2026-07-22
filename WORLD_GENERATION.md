# World-generation quality

Fustify's default world remains 42 territories, 6 gameplay continents, and 4
seats. Territory and rendered-area equality are not generation goals. A valid
world may contain a one-territory island continent beside a much larger region,
provided each reads as coherent geography.

## Pipeline and structural invariants

Generation is deterministic for a seed, setup, and code version:

1. Build the fixed subdivision-4 icosphere.
2. Evaluate 18 deterministic smoothed terrain candidates. The selected mask is
   limited to no more physical landmasses than requested continents.
3. Allocate the requested territory count across retained landmasses, then grow
   contiguous cell territories from farthest-point cell seeds.
4. Derive land-border adjacency and shared cell-edge weights.
5. Add a deterministic coastal sea-route spanning tree plus 0–2 bounded extra
   routes. Routes connect the strategic graph but never make a continent
   geographically contiguous.
6. Allocate at least one gameplay continent seed to each physical landmass.
   Additional seeds go to landmasses with the greatest remaining capacity.
7. Evaluate up to 96 deterministic, land-border-only multi-source growth
   candidates. Growth favors shared physical boundary and same-continent land
   neighbors, penalizes foreign boundary exposure, and uses territory targets
   only as a soft fill pressure.
8. Reject candidates with disconnected land regions, an exposed fully narrow
   strip, or an extreme one-territory-wide chain; choose the best accepted
   candidate by the existing transparent cohesion components. If none pass,
   generation throws a stable error instead of presenting malformed output.
9. Build the canonical `PlanetDefinition`, derive graph analysis, and validate
   it before the UI receives it. Apply the full published severe-quality
   criteria as a final safety gate.

Validation requires unique territory and continent IDs; exact requested
counts; one non-empty continent membership per territory; valid symmetrical
connections; connected individual territory cells; and exactly one
land-border connected component per continent. Sea routes do not satisfy the
last invariant. The minimap projects `PlanetDefinition.surfaceCells` and reads
the same territory `continentId` values used by the globe.

A structurally valid candidate that fails any severe diagnostic criterion
throws before neutral preview. The error is exposed accessibly by the UI; no
malformed or severe candidate is silently substituted.

## Shape diagnostics

`analyzeContinentQuality` reports components rather than hiding them behind a
single score:

- territory count and approximate spherical surface area;
- land-component count, graph diameter, and mean graph distance;
- internal and boundary edge counts plus boundary/territory ratio;
- articulation territories, leaves, longest narrow chain, and narrow necks;
- weighted spherical centroid, mean/maximum angular spread, and compactness;
- neighboring continents, route connections, internal sea routes, dominated
  territories, and protrusions.

Hard invalidity covers disconnectedness, missing/duplicate membership, broken
canonical references, and count disagreement. Severe visual-quality rejection
targets combinations that describe an exposed strip or disproportionate
tendril. A small compact continent, large coherent continent, irregular coast,
unequal area, or unequal territory count remains acceptable.

The reported `golden-citadel-587` baseline strip supplies a concrete threshold:
all three territories formed one narrow chain, one was dominated by another
continent, compactness was 0.286, and it had 1.67 boundary edges per territory.
No individual small-size threshold exists.

## Deterministic visual audit

The checked-in matrix in
`src/core/generation/worldGenerationAuditFixtures.ts` contains the two known
regressions, twenty additional 42/6 seeds, eight 42/5 seeds, and four nearby
supported configurations. Run:

```bash
pnpm test:world-visual
WORLD_AUDIT_PHASE=my-review pnpm audit:world-visual
```

The acceptance command rejects hard or severe findings. The audit command is
non-blocking so a developer can preserve an investigation phase. Both use the
real UI, neutral preview, 1366×768 full matrix, selected responsive fixtures at
1920×1080 and 390×844, one minimap, and exact globe orientations at longitudes
0°, 90°, 180°, and 270° with 12° latitude and distance 5.2. Results are ignored
under `.fustify/reports/world-generation/<phase>/`; `index.html` links every
capture and `summary.json` records categories.

For a before/after study, run the audit with `WORLD_AUDIT_PHASE=baseline`
before generator edits and `WORLD_AUDIT_PHASE=corrected` after them. Never
replace committed general UI screenshot baselines to retain a bad world.

## July 2026 findings and compatibility

The pre-fix matrix had 15 hard-invalid worlds and one severe strip among 34.
The combined 42/6 sample failed 10/22 (9 disconnected and 1 severe); 42/5
failed 4/8, all disconnected. Thus 42/5 was not healthier in this sample, and
repository history shows 42/6 was the default from the initial prototype. The
physical-landmass implementation later allowed continent growth over strategic
adjacency, including sea routes, so the defect predates recent setup/default
work rather than being caused by six continents.

Corrected seed geography intentionally differs in this pre-release project.
The generator remains deterministic, setup URL version 1 and save schema 4 are
unchanged, and explicit URLs reproduce corrected geography after refresh.
Saves store setup and territory-ID state rather than serialized geometry; their
existing migration and reconstruction path is unchanged. No gameplay rule,
bonus, combat, controller, or sea-route semantics changed.

On the 34-world matrix, three warm local Node rounds averaged 142.1 ms/world at
the starting commit and 152.3 ms/world after correction: approximately
+10.3 ms or +7.2%. The UI already yields to paint before generation, and the
bounded search remains comfortably below its visible busy-state interval on
the measured development machine.
