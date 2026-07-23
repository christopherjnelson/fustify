import {
  projectGeographicPoint,
  vectorToGeographicPoint,
  type GeographicPoint,
  type ProjectedPoint,
} from '../core/minimap/projection';
import { dot, normalize } from '../core/geometry/sphericalMath';
import type { PlanetDefinition } from '../core/types/planet';
import type { Vector3Tuple } from '../core/types/territory';

const DEGENERATE_CENTROID_RATIO = 0.15;
const MINIMAP_LABEL_HEIGHT = 8;
const MINIMAP_LABEL_GAP = 2;

export interface ContinentLabelAnchor {
  continentId: string;
  name: string;
  territoryId: string;
  vector: Vector3Tuple;
  geographic: GeographicPoint;
  strategy: 'centroid-medoid' | 'largest-territory-fallback';
}

export interface MinimapContinentLabel extends ContinentLabelAnchor {
  point: ProjectedPoint;
  fontSize: number;
  width: number;
}

function largestTerritory<T extends { cellCount: number }>(
  territories: readonly T[],
): T {
  return territories.reduce((largest, territory) =>
    territory.cellCount > largest.cellCount ? territory : largest,
  );
}

/**
 * Finds one stable land-based anchor per continent. Cell count approximates
 * territory area; vector addition makes the centroid safe across ±180°.
 */
export function getContinentLabelAnchors(
  planet: Pick<PlanetDefinition, 'continents' | 'territories'>,
): ContinentLabelAnchor[] {
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );

  return planet.continents.map((continent) => {
    const territories = continent.territoryIds.map((territoryId) => {
      const territory = territoryById.get(territoryId);
      if (!territory) {
        throw new Error(
          `Continent ${continent.id} references missing territory ${territoryId}.`,
        );
      }
      return territory;
    });
    if (territories.length === 0) {
      throw new Error(`Continent ${continent.id} has no territories.`);
    }

    const weightedSum: Vector3Tuple = [0, 0, 0];
    let totalWeight = 0;
    for (const territory of territories) {
      const center = normalize(territory.center);
      const weight = Math.max(1, territory.cellCount);
      weightedSum[0] += center[0] * weight;
      weightedSum[1] += center[1] * weight;
      weightedSum[2] += center[2] * weight;
      totalWeight += weight;
    }

    const centroidRatio = Math.hypot(...weightedSum) / totalWeight;
    const degenerate = centroidRatio < DEGENERATE_CENTROID_RATIO;
    const selected = degenerate
      ? largestTerritory(territories)
      : territories.reduce((nearest, territory) =>
          dot(normalize(territory.center), normalize(weightedSum)) >
          dot(normalize(nearest.center), normalize(weightedSum))
            ? territory
            : nearest,
        );
    const vector = normalize(selected.center);

    return {
      continentId: continent.id,
      name: continent.name,
      territoryId: selected.id,
      vector,
      geographic: vectorToGeographicPoint(vector),
      strategy: degenerate ? 'largest-territory-fallback' : 'centroid-medoid',
    };
  });
}

function labelFontSize(name: string): number {
  if (name.length >= 24) return 5.5;
  if (name.length >= 18) return 6.25;
  return 7;
}

function boxesOverlap(
  first: MinimapContinentLabel,
  second: MinimapContinentLabel,
): boolean {
  return (
    Math.abs(first.point.x - second.point.x) <
      (first.width + second.width) / 2 + MINIMAP_LABEL_GAP &&
    Math.abs(first.point.y - second.point.y) <
      MINIMAP_LABEL_HEIGHT + MINIMAP_LABEL_GAP
  );
}

/**
 * Uses a small, ordered candidate set because supported worlds have 2–5
 * continents. Input order is the deterministic collision priority.
 */
export function layoutMinimapContinentLabels(
  anchors: readonly ContinentLabelAnchor[],
): MinimapContinentLabel[] {
  const placed: MinimapContinentLabel[] = [];
  const candidates: readonly ProjectedPoint[] = [
    { x: 0, y: 0 },
    { x: 0, y: -9 },
    { x: 0, y: 9 },
    { x: -10, y: 0 },
    { x: 10, y: 0 },
    { x: -8, y: -7 },
    { x: 8, y: 7 },
  ];

  for (const anchor of anchors) {
    const projected = projectGeographicPoint(anchor.geographic);
    const fontSize = labelFontSize(anchor.name);
    const width = Math.min(
      70,
      Math.max(18, anchor.name.length * fontSize * 0.58),
    );
    let label: MinimapContinentLabel | undefined;

    for (const offset of candidates) {
      const halfWidth = width / 2;
      const candidate: MinimapContinentLabel = {
        ...anchor,
        fontSize,
        width,
        point: {
          x: Math.max(
            halfWidth + 2,
            Math.min(358 - halfWidth, projected.x + offset.x),
          ),
          y: Math.max(7, Math.min(173, projected.y + offset.y)),
        },
      };
      if (!placed.some((prior) => boxesOverlap(candidate, prior))) {
        label = candidate;
        break;
      }
    }

    placed.push(
      label ?? {
        ...anchor,
        fontSize,
        width,
        point: {
          x: Math.max(width / 2 + 2, Math.min(358 - width / 2, projected.x)),
          y: Math.max(7, Math.min(173, projected.y)),
        },
      },
    );
  }

  return placed;
}

/** Pure horizon visibility used by renderer-local animation updates. */
export function globeLabelVisibility(facing: number): number {
  if (facing <= -0.08) return 0;
  if (facing >= 0.18) return 1;
  const amount = (facing + 0.08) / 0.26;
  return amount * amount * (3 - 2 * amount);
}
