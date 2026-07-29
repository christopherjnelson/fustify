# World-generation quality

The version-4 normalized geometry prototype is documented separately in
[`normalized-generator-v2.md`](normalized-generator-v2.md).
It is opt-in and does not change the production generator described below.

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
10. Assign each gameplay continent a deterministic phonetic family and dialect,
    then generate its continent and territory display names through the
    isolated `geographic-names|v2` stream.

Validation requires unique territory and continent IDs; exact requested
counts; one non-empty continent membership per territory; valid symmetrical
connections; connected individual territory cells; and exactly one
land-border connected component per continent. Sea routes do not satisfy the
last invariant. The minimap projects `PlanetDefinition.surfaceCells` and reads
the same territory `continentId` values used by the globe.

A structurally valid candidate that fails any severe diagnostic criterion
throws before neutral preview. The error is exposed accessibly by the UI; no
malformed or severe candidate is silently substituted.

## Fictional geographic names

Names are cosmetic deterministic output. Both supported geography profiles use
the same naming module after continent membership is known, so naming consumes
no terrain, partition, connection, color, or gameplay random stream. The
multiplayer world fingerprint intentionally excludes names.

The reviewed phonetic families are based on a checked-in snapshot of Natural
Earth Admin 0 country names. Natural Earth publishes that source data in the
public domain. Run `pnpm names:generate` after editing the snapshot to rebuild
the normalized source-name keys used by the similarity filter.

Each world shuffles the family catalog deterministically, gives every continent
a distinct family, and generates all of that continent's territory names with
the same one-syllable dialect. The 50-dialect pool keeps the phonetic signature
short while retaining enough statistical variety across worlds. Candidates
must be unique within the world, 4–12 ASCII letters in title case, clear of the
project denylist, free of unusually long vowel, consonant, or repeated-syllable
runs, and neither exact nor near edit-distance matches for source names. Failed
candidates retry through a bounded deterministic stream.

Repeat avoidance is statistical and keeps no browser or account history. Run
`pnpm test:names` to evaluate 1,000 ten-game sequences at the standard
42-territory, 5-continent setup; the audit permits repeats in fewer than 25% of
those sequences. Names remain unique within each world. The ordinary unit suite
retains a 10-sequence smoke window.
A future algorithm or corpus change must increment
`GEOGRAPHIC_NAMING_VERSION`; previously rebuilt worlds are not promised to
retain cosmetic names across naming versions.

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
