import { getPlanetSurfaceSphere } from '../geometry/planetSurface.ts';
import { dot, normalize } from '../geometry/sphericalMath.ts';
import type { PlanetDefinition } from '../types/planet.ts';
import type { Vector3Tuple } from '../types/territory.ts';

export const MINIMAP_WIDTH = 360;
export const MINIMAP_HEIGHT = 180;

const DEGREES = 180 / Math.PI;
const EPSILON = 1e-7;

export interface GeographicPoint {
  longitude: number;
  latitude: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ProjectedPolygonFragment {
  territoryId: string;
  points: ProjectedPoint[];
}

export interface ProjectedTerritory {
  territoryId: string;
  continentId: string;
  fragments: ProjectedPolygonFragment[];
}

export type ProjectedBoundaryKind = 'coastline' | 'territory' | 'continent';

export interface ProjectedBoundaryFragment {
  kind: ProjectedBoundaryKind;
  territoryIds: string[];
  points: ProjectedPoint[];
}

export interface ProjectedRoute {
  routeId: string;
  fromTerritoryId: string;
  toTerritoryId: string;
  fragments: ProjectedPoint[][];
}

export interface ProjectedWorldGeometry {
  width: number;
  height: number;
  territories: ProjectedTerritory[];
  boundaries: ProjectedBoundaryFragment[];
  routes: ProjectedRoute[];
}

export function wrapLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function vectorToGeographicPoint(vector: Vector3Tuple): GeographicPoint {
  const point = normalize(vector);
  return {
    longitude: Math.atan2(point[2], point[0]) * DEGREES,
    latitude: Math.asin(Math.max(-1, Math.min(1, point[1]))) * DEGREES,
  };
}

export function projectGeographicPoint({
  longitude,
  latitude,
}: GeographicPoint): ProjectedPoint {
  return {
    x: longitude + 180,
    y: 90 - Math.max(-90, Math.min(90, latitude)),
  };
}

function interpolateAtLongitude(
  first: GeographicPoint,
  second: GeographicPoint,
  longitude: number,
): GeographicPoint {
  const span = second.longitude - first.longitude;
  const amount =
    Math.abs(span) < EPSILON ? 0 : (longitude - first.longitude) / span;
  return {
    longitude,
    latitude: first.latitude + (second.latitude - first.latitude) * amount,
  };
}

function clipPolygonAtLongitude(
  polygon: GeographicPoint[],
  longitude: number,
  keepGreater: boolean,
): GeographicPoint[] {
  if (polygon.length === 0) return [];
  const result: GeographicPoint[] = [];
  let previous = polygon.at(-1)!;
  let previousInside = keepGreater
    ? previous.longitude >= longitude - EPSILON
    : previous.longitude <= longitude + EPSILON;

  for (const current of polygon) {
    const currentInside = keepGreater
      ? current.longitude >= longitude - EPSILON
      : current.longitude <= longitude + EPSILON;
    if (currentInside !== previousInside) {
      result.push(interpolateAtLongitude(previous, current, longitude));
    }
    if (currentInside) result.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return result;
}

function polygonArea(points: readonly GeographicPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area +=
      current.longitude * next.latitude - next.longitude * current.latitude;
  }
  return Math.abs(area / 2);
}

function unwrapPolygon(points: readonly GeographicPoint[]): GeographicPoint[] {
  if (points.length === 0) return [];
  const result = [
    { ...points[0]!, longitude: wrapLongitude(points[0]!.longitude) },
  ];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    let longitude = wrapLongitude(point.longitude);
    const previous = result.at(-1)!.longitude;
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    result.push({ longitude, latitude: point.latitude });
  }
  return result;
}

/** Splits one canonical spherical polygon into equirectangular seam-safe pieces. */
export function splitPolygonAtAntimeridian(
  points: readonly GeographicPoint[],
  territoryId: string,
): ProjectedPolygonFragment[] {
  const unwrapped = unwrapPolygon(points);
  if (unwrapped.length < 3) return [];
  const longitudes = unwrapped.map((point) => point.longitude);
  const minimumBand = Math.floor((Math.min(...longitudes) + 180) / 360);
  const maximumBand = Math.floor((Math.max(...longitudes) + 180) / 360);
  const fragments: ProjectedPolygonFragment[] = [];

  for (let band = minimumBand; band <= maximumBand; band += 1) {
    const minimum = -180 + band * 360;
    const maximum = 180 + band * 360;
    const clipped = clipPolygonAtLongitude(
      clipPolygonAtLongitude(unwrapped, minimum, true),
      maximum,
      false,
    );
    if (clipped.length < 3 || polygonArea(clipped) < EPSILON) continue;
    fragments.push({
      territoryId,
      points: clipped.map((point) =>
        projectGeographicPoint({
          longitude: Math.max(
            -180,
            Math.min(180, point.longitude - band * 360),
          ),
          latitude: point.latitude,
        }),
      ),
    });
  }
  return fragments;
}

/** Splits projected line work without ever joining opposite map edges. */
export function splitPolylineAtAntimeridian(
  points: readonly GeographicPoint[],
): ProjectedPoint[][] {
  if (points.length < 2) return [];
  const normalized = points.map((point) => ({
    longitude: wrapLongitude(point.longitude),
    latitude: point.latitude,
  }));
  const fragments: GeographicPoint[][] = [[normalized[0]!]];

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]!;
    const current = normalized[index]!;
    const active = fragments.at(-1)!;
    if (Math.abs(current.longitude - previous.longitude) <= 180) {
      active.push(current);
      continue;
    }
    const crossesEast = previous.longitude > 0;
    const unwrappedCurrent = {
      longitude: current.longitude + (crossesEast ? 360 : -360),
      latitude: current.latitude,
    };
    const seam = crossesEast ? 180 : -180;
    const crossing = interpolateAtLongitude(previous, unwrappedCurrent, seam);
    active.push(crossing);
    fragments.push([
      { longitude: -seam, latitude: crossing.latitude },
      current,
    ]);
  }

  return fragments
    .filter((fragment) => fragment.length >= 2)
    .map((fragment) => fragment.map(projectGeographicPoint));
}

function greatCirclePoints(
  first: Vector3Tuple,
  second: Vector3Tuple,
  segmentCount = 32,
): GeographicPoint[] {
  const from = normalize(first);
  const to = normalize(second);
  const cosine = Math.max(-1, Math.min(1, dot(from, to)));
  const angle = Math.acos(cosine);
  if (angle < EPSILON) {
    const point = vectorToGeographicPoint(from);
    return [point, point];
  }
  const sine = Math.sin(angle);
  if (Math.abs(sine) < EPSILON) {
    const orthogonal = normalize(
      Math.abs(from[1]) < 0.9 ? [-from[2], 0, from[0]] : [0, from[2], -from[1]],
    );
    return Array.from({ length: segmentCount + 1 }, (_, index) => {
      const amount = index / segmentCount;
      return vectorToGeographicPoint([
        from[0] * Math.cos(Math.PI * amount) +
          orthogonal[0] * Math.sin(Math.PI * amount),
        from[1] * Math.cos(Math.PI * amount) +
          orthogonal[1] * Math.sin(Math.PI * amount),
        from[2] * Math.cos(Math.PI * amount) +
          orthogonal[2] * Math.sin(Math.PI * amount),
      ]);
    });
  }
  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const amount = index / segmentCount;
    const fromWeight = Math.sin((1 - amount) * angle) / sine;
    const toWeight = Math.sin(amount * angle) / sine;
    return vectorToGeographicPoint([
      from[0] * fromWeight + to[0] * toWeight,
      from[1] * fromWeight + to[1] * toWeight,
      from[2] * fromWeight + to[2] * toWeight,
    ]);
  });
}

export function projectWorldGeometry(
  planet: PlanetDefinition,
): ProjectedWorldGeometry {
  const sphere = getPlanetSurfaceSphere(planet);
  if (planet.surfaceCells.length !== sphere.faces.length) {
    throw new Error(
      'Canonical surface cells do not match the minimap topology.',
    );
  }
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );
  const fragmentsByTerritory = new Map<string, ProjectedPolygonFragment[]>();
  const priorFaceByEdge = new Map<string, number>();
  const boundaries: ProjectedBoundaryFragment[] = [];

  sphere.faces.forEach(([a, b, c], faceIndex) => {
    const cell = planet.surfaceCells[faceIndex]!;
    if (cell.territoryId) {
      const geographic = [a, b, c].map((vertexIndex) =>
        vectorToGeographicPoint(sphere.vertices[vertexIndex]!),
      );
      const fragments = splitPolygonAtAntimeridian(
        geographic,
        cell.territoryId,
      );
      const existing = fragmentsByTerritory.get(cell.territoryId) ?? [];
      existing.push(...fragments);
      fragmentsByTerritory.set(cell.territoryId, existing);
    }

    for (const [first, second] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const priorFace = priorFaceByEdge.get(key);
      if (priorFace === undefined) {
        priorFaceByEdge.set(key, faceIndex);
        continue;
      }
      const priorCell = planet.surfaceCells[priorFace]!;
      const territoryIds = [priorCell.territoryId, cell.territoryId].filter(
        (id): id is string => id !== null,
      );
      const coastline = priorCell.terrainType !== cell.terrainType;
      const territoryBorder =
        priorCell.terrainType === 'land' &&
        cell.terrainType === 'land' &&
        priorCell.territoryId !== cell.territoryId;
      const continentBorder =
        territoryBorder &&
        territoryById.get(priorCell.territoryId!)!.continentId !==
          territoryById.get(cell.territoryId!)!.continentId;
      const kinds: ProjectedBoundaryKind[] = [];
      if (coastline) kinds.push('coastline');
      if (territoryBorder) kinds.push('territory');
      if (continentBorder) kinds.push('continent');
      if (kinds.length === 0) continue;
      const line = splitPolylineAtAntimeridian([
        vectorToGeographicPoint(sphere.vertices[first]!),
        vectorToGeographicPoint(sphere.vertices[second]!),
      ]);
      for (const kind of kinds) {
        for (const points of line) {
          boundaries.push({ kind, territoryIds, points });
        }
      }
    }
  });

  const routes = planet.connections
    .filter((connection) => connection.type === 'sea-route')
    .map((connection, index): ProjectedRoute => {
      const from = territoryById.get(connection.fromTerritoryId)!;
      const to = territoryById.get(connection.toTerritoryId)!;
      return {
        routeId: `sea-route-${String(index + 1).padStart(2, '0')}`,
        fromTerritoryId: from.id,
        toTerritoryId: to.id,
        fragments: splitPolylineAtAntimeridian(
          greatCirclePoints(from.center, to.center),
        ),
      };
    });

  return {
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
    territories: planet.territories.map((territory) => ({
      territoryId: territory.id,
      continentId: territory.continentId,
      fragments: fragmentsByTerritory.get(territory.id) ?? [],
    })),
    boundaries,
    routes,
  };
}

const projectedWorldCache = new WeakMap<
  PlanetDefinition,
  ProjectedWorldGeometry
>();

export function getProjectedWorldGeometry(
  planet: PlanetDefinition,
): ProjectedWorldGeometry {
  const cached = projectedWorldCache.get(planet);
  if (cached) return cached;
  const projected = projectWorldGeometry(planet);
  projectedWorldCache.set(planet, projected);
  return projected;
}
