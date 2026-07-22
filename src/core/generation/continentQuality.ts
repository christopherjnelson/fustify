import { dot, normalize } from '../geometry/sphericalMath.ts';
import type { PlanetDefinition } from '../types/planet.ts';
import type { Vector3Tuple } from '../types/territory.ts';
import { analyzeUndirectedGraph } from './analyzeGraph.ts';

export type WorldQualityCategory =
  'hard-invalid' | 'severe-visual-quality' | 'acceptable-diversity';

export interface ContinentShapeMetrics {
  continentId: string;
  territoryCount: number;
  approximateSurfaceAreaSteradians: number;
  landComponentCount: number;
  graphDiameter: number;
  meanInternalGraphDistance: number;
  internalAdjacencyEdgeCount: number;
  boundaryEdgeCount: number;
  boundaryToTerritoryRatio: number;
  articulationTerritoryCount: number;
  leafTerritoryCount: number;
  longestOneTerritoryWideChain: number;
  centroid: Vector3Tuple;
  maximumAngularDistanceDegrees: number;
  meanAngularDistanceDegrees: number;
  compactness: number;
  narrowNeckCount: number;
  neighboringContinentCount: number;
  seaRouteConnectionCount: number;
  internalSeaRouteCount: number;
  dominatedTerritoryCount: number;
  protrusionTerritoryCount: number;
}

export interface WorldContinentQualityReport {
  seed: string;
  territoryCount: number;
  continentCount: number;
  category: WorldQualityCategory;
  hardFailures: string[];
  severeFailures: string[];
  metrics: ContinentShapeMetrics[];
}

export function severeContinentQualityFailures(
  metrics: readonly ContinentShapeMetrics[],
): string[] {
  const failures: string[] = [];
  for (const metric of metrics) {
    if (
      metric.territoryCount >= 3 &&
      metric.longestOneTerritoryWideChain === metric.territoryCount &&
      metric.dominatedTerritoryCount > 0 &&
      metric.compactness < 0.3 &&
      metric.boundaryToTerritoryRatio > 1.5
    ) {
      failures.push(
        `${metric.continentId} is a fully narrow, exposed strip (${metric.compactness.toFixed(3)} compactness; ${metric.boundaryToTerritoryRatio.toFixed(2)} boundary edges per territory).`,
      );
    }
    if (
      metric.territoryCount >= 5 &&
      metric.longestOneTerritoryWideChain >=
        Math.max(4, Math.ceil(metric.territoryCount * 0.6))
    ) {
      failures.push(
        `${metric.continentId} has a ${metric.longestOneTerritoryWideChain}-territory narrow chain across ${metric.territoryCount} territories.`,
      );
    }
    if (
      metric.territoryCount >= 4 &&
      metric.maximumAngularDistanceDegrees > 72 &&
      metric.meanAngularDistanceDegrees > 38
    ) {
      failures.push(
        `${metric.continentId} has pathological geographic spread (${metric.maximumAngularDistanceDegrees.toFixed(1)}° maximum).`,
      );
    }
    if (
      metric.territoryCount >= 5 &&
      metric.compactness < 0.34 &&
      metric.boundaryToTerritoryRatio > 1.4
    ) {
      failures.push(
        `${metric.continentId} has an excessively exposed, fragmented-looking boundary.`,
      );
    }
    if (
      metric.territoryCount >= 5 &&
      metric.articulationTerritoryCount >= Math.ceil(metric.territoryCount / 2)
    ) {
      failures.push(
        `${metric.continentId} depends on ${metric.articulationTerritoryCount} narrow-neck territories.`,
      );
    }
  }
  return failures;
}

function components(
  ids: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const start of [...ids].sort()) {
    if (seen.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      if (seen.has(current) || !ids.has(current)) continue;
      seen.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (ids.has(neighbor) && !seen.has(neighbor)) queue.push(neighbor);
      }
    }
    result.push(component.sort());
  }
  return result;
}

function distancesFrom(
  start: string,
  ids: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const distances = new Map([[start, 0]]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!ids.has(neighbor) || distances.has(neighbor)) continue;
      distances.set(neighbor, distances.get(current)! + 1);
      queue.push(neighbor);
    }
  }
  return distances;
}

function longestNarrowChain(
  ids: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const narrow = new Set(
    [...ids].filter(
      (id) =>
        [...(adjacency.get(id) ?? [])].filter((neighbor) => ids.has(neighbor))
          .length <= 2,
    ),
  );
  let longest = 0;
  for (const component of components(narrow, adjacency)) {
    const allowed = new Set(component);
    for (const start of component) {
      const distances = distancesFrom(start, allowed, adjacency);
      longest = Math.max(longest, 1 + Math.max(0, ...distances.values()));
    }
  }
  return longest;
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function angularDistanceDegrees(left: Vector3Tuple, right: Vector3Tuple) {
  return (
    Math.acos(Math.max(-1, Math.min(1, dot(left, right)))) * (180 / Math.PI)
  );
}

export function analyzeContinentQuality(
  planet: PlanetDefinition,
): WorldContinentQualityReport {
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );
  const landAdjacency = new Map(
    planet.territories.map((territory) => [territory.id, new Set<string>()]),
  );
  const landConnections = planet.connections.filter(
    (connection) => connection.type === 'land-border',
  );
  for (const connection of landConnections) {
    landAdjacency
      .get(connection.fromTerritoryId)
      ?.add(connection.toTerritoryId);
    landAdjacency
      .get(connection.toTerritoryId)
      ?.add(connection.fromTerritoryId);
  }

  const hardFailures: string[] = [];
  const memberships = new Map<string, number>();
  for (const continent of planet.continents) {
    if (continent.territoryIds.length === 0) {
      hardFailures.push(`${continent.id} has no territories.`);
    }
    for (const id of continent.territoryIds) {
      memberships.set(id, (memberships.get(id) ?? 0) + 1);
      if (!territoryById.has(id)) {
        hardFailures.push(
          `${continent.id} references missing territory ${id}.`,
        );
      }
    }
  }
  for (const territory of planet.territories) {
    if (memberships.get(territory.id) !== 1) {
      hardFailures.push(
        `${territory.id} belongs to ${memberships.get(territory.id) ?? 0} continents.`,
      );
    }
    const canonical = planet.continents.find(
      (continent) => continent.id === territory.continentId,
    );
    if (!canonical?.territoryIds.includes(territory.id)) {
      hardFailures.push(
        `${territory.id} has inconsistent continent assignment.`,
      );
    }
  }
  if (
    planet.territories.length !== planet.territoryCount ||
    planet.continents.length !== planet.continentCount
  ) {
    hardFailures.push(
      'Requested territory or continent count does not match canonical data.',
    );
  }
  for (const connection of planet.connections) {
    if (
      !territoryById.has(connection.fromTerritoryId) ||
      !territoryById.has(connection.toTerritoryId)
    ) {
      hardFailures.push(
        `Connection ${connection.fromTerritoryId}–${connection.toTerritoryId} is invalid.`,
      );
    }
  }

  const cohesionById = new Map(
    planet.analysis.continentCohesionMetrics.map((metric) => [
      metric.continentId,
      metric,
    ]),
  );
  const metrics = planet.continents.map((continent) => {
    const ids = new Set(continent.territoryIds);
    const landComponents = components(ids, landAdjacency);
    if (landComponents.length !== 1) {
      hardFailures.push(
        `${continent.id} has ${landComponents.length} land-adjacency components; sea routes do not count.`,
      );
    }
    const internalEdges = landConnections.filter(
      (connection) =>
        ids.has(connection.fromTerritoryId) &&
        ids.has(connection.toTerritoryId),
    );
    const boundaryEdges = landConnections.filter(
      (connection) =>
        ids.has(connection.fromTerritoryId) !==
        ids.has(connection.toTerritoryId),
    );
    const pairDistances: number[] = [];
    let diameter = 0;
    for (const id of ids) {
      for (const [other, distance] of distancesFrom(id, ids, landAdjacency)) {
        if (id < other) pairDistances.push(distance);
        diameter = Math.max(diameter, distance);
      }
    }
    const graph = analyzeUndirectedGraph(
      [...ids],
      internalEdges.map((edge) => ({
        from: edge.fromTerritoryId,
        to: edge.toTerritoryId,
      })),
    );
    const leafCount = [...ids].filter(
      (id) =>
        [...(landAdjacency.get(id) ?? [])].filter((neighbor) =>
          ids.has(neighbor),
        ).length === 1,
    ).length;
    const centroidSum: Vector3Tuple = [0, 0, 0];
    let cellCount = 0;
    for (const id of ids) {
      const territory = territoryById.get(id);
      if (!territory) continue;
      cellCount += territory.cellCount;
      centroidSum[0] += territory.center[0] * territory.cellCount;
      centroidSum[1] += territory.center[1] * territory.cellCount;
      centroidSum[2] += territory.center[2] * territory.cellCount;
    }
    const centroid = normalize(centroidSum);
    const angularDistances = [...ids]
      .map((id) => territoryById.get(id))
      .filter((territory) => territory !== undefined)
      .map((territory) => angularDistanceDegrees(centroid, territory.center));
    const seaRoutes = planet.connections.filter(
      (connection) =>
        connection.type === 'sea-route' &&
        (ids.has(connection.fromTerritoryId) ||
          ids.has(connection.toTerritoryId)),
    );
    const internalSeaRoutes = seaRoutes.filter(
      (connection) =>
        ids.has(connection.fromTerritoryId) &&
        ids.has(connection.toTerritoryId),
    );
    const cohesion = cohesionById.get(continent.id);
    const compactness =
      internalEdges.length /
      Math.max(1, internalEdges.length + boundaryEdges.length);
    return {
      continentId: continent.id,
      territoryCount: ids.size,
      approximateSurfaceAreaSteradians: rounded(
        (cellCount / Math.max(1, planet.surfaceCells.length)) * 4 * Math.PI,
      ),
      landComponentCount: landComponents.length,
      graphDiameter: diameter,
      meanInternalGraphDistance: rounded(
        pairDistances.reduce((sum, value) => sum + value, 0) /
          Math.max(1, pairDistances.length),
      ),
      internalAdjacencyEdgeCount: internalEdges.length,
      boundaryEdgeCount: boundaryEdges.length,
      boundaryToTerritoryRatio: rounded(
        boundaryEdges.length / Math.max(1, ids.size),
      ),
      articulationTerritoryCount: graph.articulationNodeIds.length,
      leafTerritoryCount: leafCount,
      longestOneTerritoryWideChain: longestNarrowChain(ids, landAdjacency),
      centroid: centroid.map(rounded) as Vector3Tuple,
      maximumAngularDistanceDegrees: rounded(Math.max(0, ...angularDistances)),
      meanAngularDistanceDegrees: rounded(
        angularDistances.reduce((sum, value) => sum + value, 0) /
          Math.max(1, angularDistances.length),
      ),
      compactness: rounded(compactness),
      narrowNeckCount: graph.articulationNodeIds.length,
      neighboringContinentCount: continent.neighboringContinentIds.length,
      seaRouteConnectionCount: seaRoutes.length,
      internalSeaRouteCount: internalSeaRoutes.length,
      dominatedTerritoryCount: cohesion?.dominatedTerritoryIds.length ?? 0,
      protrusionTerritoryCount: cohesion?.protrusionTerritoryIds.length ?? 0,
    } satisfies ContinentShapeMetrics;
  });

  const severeFailures = severeContinentQualityFailures(metrics);

  return {
    seed: planet.seed,
    territoryCount: planet.territoryCount,
    continentCount: planet.continentCount,
    category:
      hardFailures.length > 0
        ? 'hard-invalid'
        : severeFailures.length > 0
          ? 'severe-visual-quality'
          : 'acceptable-diversity',
    hardFailures,
    severeFailures,
    metrics,
  };
}
