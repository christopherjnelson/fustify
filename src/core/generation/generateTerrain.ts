import type { IcosphereData } from '../geometry/icosphere.ts';
import { centroid, dot } from '../geometry/sphericalMath.ts';
import { generateSpherePoints } from '../geometry/spherePoints.ts';
import type { Vector3Tuple } from '../types/territory.ts';
import { createSeededRandom } from './seededRandom.ts';
import { connectedComponents } from './surfaceTopology.ts';

const MIN_FRAGMENT_CELLS = 12;
const CANDIDATE_COUNT = 18;

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
  return (
    countPenalty + dominancePenalty + Math.abs(coverage - targetCoverage) * 10
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
    const detailDirections = generateSpherePoints(4, random);
    const phases = detailDirections.map(() => random.next() * Math.PI * 2);

    const raw = centers.map((point) => {
      const continental = Math.max(
        ...anchors.map(
          (anchor, index) => dot(point, anchor) + anchorBiases[index]!,
        ),
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
