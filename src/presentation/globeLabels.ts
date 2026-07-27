import { normalize } from '../core/geometry/sphericalMath';
import type { PlanetDefinition } from '../core/types/planet';
import type { Vector3Tuple } from '../core/types/territory';

export const TERRITORY_LABEL_MAX_CAMERA_DISTANCE = 4.4;

export type GlobeLabelMode = 'continents' | 'territories';

export interface TerritoryLabelAnchor {
  territoryId: string;
  name: string;
  vector: Vector3Tuple;
}

export function globeLabelMode(cameraDistance: number): GlobeLabelMode {
  return cameraDistance <= TERRITORY_LABEL_MAX_CAMERA_DISTANCE
    ? 'territories'
    : 'continents';
}

export function getTerritoryLabelAnchors(
  planet: Pick<PlanetDefinition, 'territories'>,
): TerritoryLabelAnchor[] {
  return planet.territories.map((territory) => ({
    territoryId: territory.id,
    name: territory.name,
    vector: normalize(territory.center),
  }));
}
