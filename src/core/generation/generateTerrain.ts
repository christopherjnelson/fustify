import type { IcosphereData } from '../geometry/icosphere.ts';
import { centroid, dot, normalize } from '../geometry/sphericalMath.ts';
import { generateSpherePoints } from '../geometry/spherePoints.ts';
import type { Vector3Tuple } from '../types/territory.ts';
import { createSeededRandom } from './seededRandom.ts';
import { connectedComponents } from './surfaceTopology.ts';

const MIN_FRAGMENT_CELLS = 12;
const CANDIDATE_COUNT = 18;

export type TerrainSilhouetteProfile = 'legacy' | 'varied' | 'compact-fallback';

export interface GeneratedTerrain {
  landCellIds: Set<number>;
  landComponents: number[][];
  likelihood: number[];
}

function cellCenters(sphere: IcosphereData): Vector3Tuple[] {
  return sphere.faces.map(([a, b, c]) =>
    centroid(sphere.vertices[a]!, sphere.vertices[b]!, sphere.vertices[c]!),
  );
}

function smoothed(values: readonly number[], adjacency: readonly number[][]) {
  let current = [...values];
  for (let pass = 0; pass < 3; pass += 1) {
    current = current.map((value, cellId) => {
      const neighbors = adjacency[cellId]!;
      const neighborMean =
        neighbors.reduce((sum, neighbor) => sum + current[neighbor]!, 0) /
        neighbors.length;
      return value * 0.62 + neighborMean * 0.38;
    });
  }
  return current;
}

function candidateScore(
  coverage: number,
  components: readonly number[][],
  targetCoverage: number,
  maximumLandmassCount: number,
  centers: readonly Vector3Tuple[],
  silhouetteProfile: TerrainSilhouetteProfile,
): number {
  const landCount = components.reduce((sum, item) => sum + item.length, 0);
  const largestShare = landCount === 0 ? 1 : components[0]!.length / landCount;
  const preferredMinimum = Math.min(4, maximumLandmassCount);
  const countPenalty =
    components.length < preferredMinimum
      ? (preferredMinimum - components.length) * 8
      : components.length > maximumLandmassCount
        ? (components.length - maximumLandmassCount) * 40
        : 0;
  const dominancePenalty = Math.max(0, largestShare - 0.48) * 24;
  const aspectRatios =
    silhouetteProfile !== 'legacy'
      ? components.map((component) =>
          componentAspectRatio(component.map((cellId) => centers[cellId]!)),
        )
      : [];
  const aspectMean =
    aspectRatios.reduce((sum, value) => sum + value, 0) /
    Math.max(1, aspectRatios.length);
  const aspectVariation =
    Math.sqrt(
      aspectRatios.reduce((sum, value) => sum + (value - aspectMean) ** 2, 0) /
        Math.max(1, aspectRatios.length),
    ) / Math.max(1e-12, aspectMean);
  const silhouettePenalty =
    silhouetteProfile === 'varied'
      ? Math.max(0, 1.28 - aspectMean) * 18 +
        Math.max(0, 0.18 - aspectVariation) * 28 +
        aspectRatios.reduce(
          (sum, aspect) => sum + Math.max(0, aspect - 2.65) * 18,
          0,
        )
      : silhouetteProfile === 'compact-fallback'
        ? components.reduce((sum, component) => {
            const points = component.map((cellId) => centers[cellId]!);
            return (
              sum +
              Math.max(0, componentMaximumRadius(points) - 1.05) * 120 +
              Math.max(0, componentAspectRatio(points) - 1.85) * 16
            );
          }, 0)
        : 0;
  return (
    countPenalty +
    dominancePenalty +
    Math.abs(coverage - targetCoverage) * 10 +
    silhouettePenalty
  );
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function tangentAxes(center: Vector3Tuple): [Vector3Tuple, Vector3Tuple] {
  const reference: Vector3Tuple =
    Math.abs(center[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const first = normalize(cross(reference, center));
  return [first, normalize(cross(center, first))];
}

function componentAspectRatio(points: readonly Vector3Tuple[]): number {
  if (points.length < 3) return 1;
  const center = normalize(
    points.reduce<Vector3Tuple>(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]],
      [0, 0, 0],
    ),
  );
  const [firstAxis, secondAxis] = tangentAxes(center);
  const projected = points.map((point) => ({
    x: dot(point, firstAxis),
    y: dot(point, secondAxis),
  }));
  const meanX =
    projected.reduce((sum, point) => sum + point.x, 0) / projected.length;
  const meanY =
    projected.reduce((sum, point) => sum + point.y, 0) / projected.length;
  const xx =
    projected.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) /
    projected.length;
  const yy =
    projected.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0) /
    projected.length;
  const xy =
    projected.reduce(
      (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
      0,
    ) / projected.length;
  const trace = xx + yy;
  const discriminant = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
  return Math.sqrt(
    Math.max(1e-12, (trace + discriminant) / 2) /
      Math.max(1e-12, (trace - discriminant) / 2),
  );
}

function componentMaximumRadius(points: readonly Vector3Tuple[]): number {
  const center = normalize(
    points.reduce<Vector3Tuple>(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]],
      [0, 0, 0],
    ),
  );
  return Math.max(
    ...points.map((point) =>
      Math.acos(Math.max(-1, Math.min(1, dot(center, point)))),
    ),
  );
}

/**
 * Builds several deterministic, smoothed scalar-field candidates and keeps the
 * one that best matches the requested coverage and landmass profile.
 */
export function generateTerrain(
  seed: string,
  sphere: IcosphereData,
  adjacency: readonly number[][],
  targetCoverage: number,
  maximumLandmassCount = 8,
  silhouetteProfile: TerrainSilhouetteProfile = 'legacy',
): GeneratedTerrain {
  const centers = cellCenters(sphere);
  let best: GeneratedTerrain | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < CANDIDATE_COUNT; attempt += 1) {
    const random = createSeededRandom(`${seed}|terrain|${attempt}`);
    const minimumAnchors = Math.max(2, Math.min(5, maximumLandmassCount));
    const maximumAnchors = Math.max(
      minimumAnchors,
      Math.min(7, maximumLandmassCount + 1),
    );
    const anchorCount = random.integer(minimumAnchors, maximumAnchors);
    const anchors = generateSpherePoints(anchorCount, random);
    const anchorBiases = anchors.map(() => (random.next() - 0.5) * 0.11);
    const aspectTargets =
      silhouetteProfile === 'varied'
        ? random
            .shuffle([1.05, 1.2, 1.4, 1.65, 1.9, 2.15, 1.3])
            .slice(0, anchorCount)
        : anchors.map(() => 1);
    const anchorProfiles =
      silhouetteProfile === 'varied'
        ? anchors.map((anchor, index) => {
            const [fallbackAxis] = tangentAxes(anchor);
            const randomDirection = normalize([
              random.next() * 2 - 1,
              random.next() * 2 - 1,
              random.next() * 2 - 1,
            ]);
            const projected: Vector3Tuple = [
              randomDirection[0] - anchor[0] * dot(randomDirection, anchor),
              randomDirection[1] - anchor[1] * dot(randomDirection, anchor),
              randomDirection[2] - anchor[2] * dot(randomDirection, anchor),
            ];
            const axis =
              Math.hypot(...projected) < 1e-8
                ? fallbackAxis
                : normalize(projected);
            return {
              axis,
              transverse: normalize(cross(anchor, axis)),
              elongation:
                0.5 * (1 - 1 / Math.max(1, aspectTargets[index]!) ** 2),
              skew: (random.next() - 0.5) * 0.46,
              bend: (random.next() - 0.5) * 0.34,
            };
          })
        : [];
    const detailDirections = generateSpherePoints(4, random);
    const phases = detailDirections.map(() => random.next() * Math.PI * 2);

    const raw = centers.map((point) => {
      const continental = Math.max(
        ...anchors.map((anchor, index) => {
          const radial = dot(point, anchor);
          if (silhouetteProfile !== 'varied') {
            return radial + anchorBiases[index]!;
          }
          const profile = anchorProfiles[index]!;
          const axial = dot(point, profile.axis);
          const transverse = dot(point, profile.transverse);
          return (
            radial +
            anchorBiases[index]! +
            profile.elongation * axial ** 2 +
            profile.skew * axial ** 3 +
            profile.bend * transverse * axial ** 2
          );
        }),
      );
      const detail = detailDirections.reduce((sum, direction, index) => {
        const wave = Math.sin(
          dot(point, direction) * Math.PI * (2.2 + index * 0.7) +
            phases[index]!,
        );
        return sum + wave * (0.025 - index * 0.003);
      }, 0);
      return continental + detail;
    });
    const likelihood = smoothed(raw, adjacency);
    const landTarget = Math.round(sphere.faces.length * targetCoverage);
    const ranked = likelihood
      .map((value, cellId) => ({ cellId, value }))
      .sort((a, b) => b.value - a.value || a.cellId - b.cellId);
    const initialLand = new Set(
      ranked.slice(0, landTarget).map((item) => item.cellId),
    );
    const initialComponents = connectedComponents(initialLand, adjacency);
    const retainedComponents = initialComponents
      .filter((component) => component.length >= MIN_FRAGMENT_CELLS)
      .slice(0, maximumLandmassCount);
    const landCellIds = new Set(retainedComponents.flat());
    const landComponents = connectedComponents(landCellIds, adjacency);
    const coverage = landCellIds.size / sphere.faces.length;
    const score = candidateScore(
      coverage,
      landComponents,
      targetCoverage,
      maximumLandmassCount,
      centers,
      silhouetteProfile,
    );

    if (score < bestScore) {
      bestScore = score;
      best = { landCellIds, landComponents, likelihood };
    }
  }

  if (!best || best.landCellIds.size === 0) {
    throw new Error('Unable to generate a usable deterministic land mask.');
  }
  return best;
}
