import { z } from 'zod';
import { createIcosphere } from '../geometry/icosphere.ts';
import type { PlanetDefinition } from '../types/planet.ts';
import { analyzeStrategicGraph } from './analyzeGraph.ts';
import { buildTerritoryBorderWeights } from './buildConnections.ts';
import { calculateContinentBonus } from './generateContinents.ts';
import {
  DEFAULT_CONTINENT_COUNT,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_TERRITORY_COUNT,
  MAX_LAND_COVERAGE,
  MAX_SUBSTANTIAL_LANDMASSES,
  MIN_LAND_COVERAGE,
  MIN_SUBSTANTIAL_LANDMASSES,
  PLANET_SUBDIVISIONS,
} from './constants.ts';
import { buildCellAdjacency, connectedComponents } from './surfaceTopology.ts';

const vectorSchema = z.tuple([z.number(), z.number(), z.number()]);
const idList = z.array(z.string().min(1));

export const planetDefinitionSchema = z.object({
  seed: z.string().min(1),
  generatorVersion: z.number().int().positive(),
  territoryCount: z.number().int().positive(),
  continentCount: z.number().int().positive(),
  playerCount: z.number().int().positive(),
  players: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      color: z.string().min(1),
    }),
  ),
  territories: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      center: vectorSchema,
      continentId: z.string().min(1),
      displayColor: z.string().min(1),
      adjacentTerritoryIds: idList,
      ownerId: z.string().nullable(),
      armyCount: z.number().int().nonnegative(),
      cellCount: z.number().int().positive(),
      landmassId: z.string().min(1),
    }),
  ),
  continents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      territoryIds: idList,
      bonus: z.number().int().nonnegative(),
      externalGatewayTerritoryIds: idList,
      neighboringContinentIds: idList,
    }),
  ),
  surfaceCells: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      terrainType: z.enum(['land', 'ocean']),
      territoryId: z.string().nullable(),
    }),
  ),
  landmasses: z.array(
    z.object({ id: z.string().min(1), territoryIds: idList }),
  ),
  connections: z.array(
    z.object({
      fromTerritoryId: z.string().min(1),
      toTerritoryId: z.string().min(1),
      type: z.enum(['land-border', 'sea-route']),
    }),
  ),
  landCoverage: z.number().min(0).max(1),
  surfaceVertices: z.array(vectorSchema).optional(),
  generationDiagnostics: z.unknown().optional(),
  analysis: z.object({
    connected: z.boolean(),
    articulationTerritoryIds: idList,
    bridgeConnections: z.array(
      z.object({
        fromTerritoryId: z.string(),
        toTerritoryId: z.string(),
        type: z.enum(['land-border', 'sea-route']),
        isBridge: z.boolean(),
      }),
    ),
    seaRouteBridgeConnections: z.array(
      z.object({
        fromTerritoryId: z.string(),
        toTerritoryId: z.string(),
        type: z.enum(['land-border', 'sea-route']),
        isBridge: z.boolean(),
      }),
    ),
    gatewayTerritoryIds: idList,
    multiSeaRouteTerritoryIds: idList,
    territoryMetrics: z.array(
      z.object({
        territoryId: z.string(),
        degree: z.number().int().nonnegative(),
        seaRouteCount: z.number().int().nonnegative(),
        isGateway: z.boolean(),
        isArticulationPoint: z.boolean(),
      }),
    ),
    connectionMetrics: z.array(
      z.object({
        fromTerritoryId: z.string(),
        toTerritoryId: z.string(),
        type: z.enum(['land-border', 'sea-route']),
        isBridge: z.boolean(),
      }),
    ),
    landmassMetrics: z.array(
      z.object({
        landmassId: z.string(),
        degree: z.number().int().nonnegative(),
      }),
    ),
    continentCohesionMetrics: z.array(
      z.object({
        continentId: z.string(),
        internalEdgeCount: z.number().int().nonnegative(),
        externalEdgeCount: z.number().int().nonnegative(),
        internalBoundaryLength: z.number().int().nonnegative(),
        externalBoundaryLength: z.number().int().nonnegative(),
        internalSeaRouteCount: z.number().int().nonnegative(),
        cohesionScore: z.number().min(0).max(1),
        dominatedTerritoryIds: idList,
        protrusionTerritoryIds: idList,
      }),
    ),
    continentInterleavingMetrics: z.array(
      z.object({
        firstContinentId: z.string(),
        secondContinentId: z.string(),
        sharedTerritoryEdgeCount: z.number().int().positive(),
        sharedCellBoundaryLength: z.number().int().positive(),
      }),
    ),
    routeRedundancy: z.number().int().nonnegative(),
  }),
});

export interface PlanetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ValidationTargets {
  territoryCount?: number;
  continentCount?: number;
  playerCount?: number;
}

function visitGraph(
  start: string,
  allowed: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (visited.has(current) || !allowed.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (allowed.has(neighbor) && !visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function validatePlanet(
  planet: PlanetDefinition,
  targets: ValidationTargets = {},
): PlanetValidationResult {
  const parsed = planetDefinitionSchema.safeParse(planet);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
  const warnings: string[] = [];
  const expectedTerritories = targets.territoryCount ?? DEFAULT_TERRITORY_COUNT;
  const expectedContinents = targets.continentCount ?? DEFAULT_CONTINENT_COUNT;
  const expectedPlayers = targets.playerCount ?? DEFAULT_PLAYER_COUNT;

  if (planet.territoryCount !== expectedTerritories) {
    errors.push(
      `Planet must contain exactly ${expectedTerritories} territories.`,
    );
  }
  if (planet.continentCount !== expectedContinents) {
    errors.push(
      `Planet must contain exactly ${expectedContinents} continents.`,
    );
  }
  if (planet.territories.length !== planet.territoryCount) {
    errors.push('Territory count does not match the territory array.');
  }
  if (planet.continents.length !== planet.continentCount) {
    errors.push('Continent count does not match the continent array.');
  }
  if (
    planet.playerCount !== expectedPlayers ||
    planet.players.length !== planet.playerCount
  ) {
    errors.push(`Planet must contain exactly ${expectedPlayers} players.`);
  }
  const players = new Map(planet.players.map((player) => [player.id, player]));
  if (players.size !== planet.players.length)
    errors.push('Player IDs must be unique.');

  const territories = new Map(
    planet.territories.map((item) => [item.id, item]),
  );
  if (territories.size !== planet.territories.length) {
    errors.push('Territory IDs must be unique.');
  }
  const sphere = createIcosphere(PLANET_SUBDIVISIONS);
  if (
    planet.surfaceVertices &&
    planet.surfaceVertices.length !== sphere.vertices.length
  ) {
    errors.push('Canonical surface vertex count does not match the topology.');
  }
  if (
    planet.surfaceVertices?.some(
      (vertex) =>
        !vertex.every(Number.isFinite) ||
        Math.abs(Math.hypot(...vertex) - 1) > 1e-8,
    )
  ) {
    errors.push('Canonical surface vertices must be finite unit vectors.');
  }
  const cellAdjacency = buildCellAdjacency(sphere);
  if (planet.surfaceCells.length !== sphere.faces.length) {
    errors.push('Surface cell count does not match the configured icosphere.');
  }
  const cellIds = new Set(planet.surfaceCells.map((cell) => cell.id));
  if (cellIds.size !== planet.surfaceCells.length) {
    errors.push('Surface cell IDs must be unique.');
  }
  const territoryCells = new Map(
    planet.territories.map((territory) => [territory.id, [] as number[]]),
  );
  const landCells = new Set<number>();
  planet.surfaceCells.forEach((cell, index) => {
    if (cell.id !== index)
      errors.push(`Surface cell ${index} has an unstable ID.`);
    if (cell.terrainType === 'ocean') {
      if (cell.territoryId !== null) {
        errors.push(`Ocean cell ${cell.id} cannot have a territory ID.`);
      }
      return;
    }
    landCells.add(cell.id);
    if (cell.territoryId === null) {
      errors.push(`Land cell ${cell.id} is not assigned to a territory.`);
    } else if (!territories.has(cell.territoryId)) {
      errors.push(
        `Land cell ${cell.id} references missing territory ${cell.territoryId}.`,
      );
    } else {
      territoryCells.get(cell.territoryId)!.push(cell.id);
    }
  });

  for (const territory of planet.territories) {
    const cells = territoryCells.get(territory.id)!;
    if (cells.length === 0) errors.push(`${territory.id} contains zero cells.`);
    if (cells.length !== territory.cellCount) {
      errors.push(
        `${territory.id} cell count does not match its surface cells.`,
      );
    }
    if (cells.length > 0) {
      const connected = connectedComponents(new Set(cells), cellAdjacency);
      if (connected.length !== 1) {
        errors.push(`${territory.id} is not geographically contiguous.`);
      }
    }
    if (territory.ownerId !== null) {
      errors.push(`${territory.id} must be neutral in generated geography.`);
    }
    if (territory.armyCount !== 0) {
      errors.push(`${territory.id} cannot contain armies before assignment.`);
    }
  }

  const detectedLandmasses = connectedComponents(landCells, cellAdjacency);
  if (detectedLandmasses.length !== planet.landmasses.length) {
    errors.push(
      'Landmass definitions do not match detected physical landmasses.',
    );
  }
  const landmassById = new Map(
    planet.landmasses.map((item) => [item.id, item]),
  );
  if (landmassById.size !== planet.landmasses.length) {
    errors.push('Landmass IDs must be unique.');
  }
  for (const landmass of planet.landmasses) {
    if (landmass.territoryIds.length === 0) {
      errors.push(`${landmass.id} contains no territories.`);
    }
    for (const id of landmass.territoryIds) {
      const territory = territories.get(id);
      if (!territory || territory.landmassId !== landmass.id) {
        errors.push(`${landmass.id} has inconsistent territory ${id}.`);
      }
    }
  }
  for (const territory of planet.territories) {
    if (
      !landmassById
        .get(territory.landmassId)
        ?.territoryIds.includes(territory.id)
    ) {
      errors.push(`${territory.id} has an inconsistent landmass ID.`);
    }
  }
  detectedLandmasses.forEach((component) => {
    const ids = new Set(
      component
        .map((cellId) => planet.surfaceCells[cellId]?.territoryId)
        .filter((id): id is string => id !== null && id !== undefined),
    );
    const physicalIds = new Set(
      [...ids].map((id) => territories.get(id)?.landmassId).filter(Boolean),
    );
    if (physicalIds.size !== 1) {
      errors.push(
        'A detected physical landmass spans multiple landmass definitions.',
      );
    }
  });

  const strategicAdjacency = new Map(
    planet.territories.map((territory) => [territory.id, new Set<string>()]),
  );
  const landAdjacency = new Map(
    planet.territories.map((territory) => [territory.id, new Set<string>()]),
  );
  const seenConnections = new Set<string>();
  for (const connection of planet.connections) {
    const { fromTerritoryId: left, toTerritoryId: right } = connection;
    if (left === right)
      errors.push(`Connection ${left} cannot connect to itself.`);
    if (!territories.has(left) || !territories.has(right)) {
      errors.push(
        `Connection ${left} to ${right} references a missing territory.`,
      );
      continue;
    }
    const key = pairKey(left, right);
    if (seenConnections.has(key)) {
      errors.push(`Duplicate connection between ${left} and ${right}.`);
    }
    seenConnections.add(key);
    if (
      connection.type === 'sea-route' &&
      territories.get(left)!.landmassId === territories.get(right)!.landmassId
    ) {
      errors.push(`Sea route ${left} to ${right} must cross landmasses.`);
    }
    strategicAdjacency.get(left)!.add(right);
    strategicAdjacency.get(right)!.add(left);
    if (connection.type === 'land-border') {
      landAdjacency.get(left)!.add(right);
      landAdjacency.get(right)!.add(left);
    }
  }

  for (const territory of planet.territories) {
    const listed = territory.adjacentTerritoryIds;
    const unique = new Set(listed);
    if (unique.size !== listed.length) {
      errors.push(`${territory.id} has duplicate adjacency entries.`);
    }
    if (unique.has(territory.id))
      errors.push(`${territory.id} is adjacent to itself.`);
    if (unique.size === 0)
      errors.push(`${territory.id} has no strategic connection.`);
    for (const neighbor of unique) {
      if (
        !territories.get(neighbor)?.adjacentTerritoryIds.includes(territory.id)
      ) {
        errors.push(
          `${territory.id} adjacency with ${neighbor} is not symmetrical.`,
        );
      }
    }
    const derived = strategicAdjacency.get(territory.id)!;
    if (
      unique.size !== derived.size ||
      [...unique].some((neighbor) => !derived.has(neighbor))
    ) {
      errors.push(
        `${territory.id} adjacency does not match explicit connections.`,
      );
    }
  }

  if (planet.territories.length > 0) {
    const all = new Set(planet.territories.map((item) => item.id));
    if (
      visitGraph(planet.territories[0]!.id, all, strategicAdjacency).size !==
      all.size
    ) {
      errors.push('Full strategic territory graph is not connected.');
    }
  }
  const membership = new Map<string, number>();
  for (const continent of planet.continents) {
    const allowed = new Set(continent.territoryIds);
    if (allowed.size === 0)
      errors.push(`${continent.id} contains no territories.`);
    for (const id of allowed) membership.set(id, (membership.get(id) ?? 0) + 1);
    if (
      allowed.size > 0 &&
      visitGraph(continent.territoryIds[0]!, allowed, landAdjacency).size !==
        allowed.size
    ) {
      errors.push(
        `${continent.id} is not connected through land-territory adjacency.`,
      );
    }
    const detectedGateways = continent.territoryIds.filter((id) =>
      [...(strategicAdjacency.get(id) ?? [])].some(
        (neighbor) => !allowed.has(neighbor),
      ),
    );
    if (
      detectedGateways.length !==
        continent.externalGatewayTerritoryIds.length ||
      detectedGateways.some(
        (id) => !continent.externalGatewayTerritoryIds.includes(id),
      )
    ) {
      errors.push(
        `${continent.id} has inconsistent external gateway analysis.`,
      );
    }
    const detectedNeighboringContinents = [
      ...new Set(
        continent.territoryIds.flatMap((id) =>
          [...(strategicAdjacency.get(id) ?? [])]
            .map((neighbor) => territories.get(neighbor)!.continentId)
            .filter((continentId) => continentId !== continent.id),
        ),
      ),
    ].sort();
    if (
      detectedNeighboringContinents.length !==
        continent.neighboringContinentIds.length ||
      detectedNeighboringContinents.some(
        (id) => !continent.neighboringContinentIds.includes(id),
      )
    ) {
      errors.push(`${continent.id} has inconsistent neighboring continents.`);
    }
    const expectedBonus = calculateContinentBonus(
      continent.territoryIds.length,
      continent.externalGatewayTerritoryIds.length,
      continent.neighboringContinentIds.length,
    );
    if (continent.bonus !== expectedBonus) {
      errors.push(`${continent.id} has an inconsistent placeholder bonus.`);
    }
  }
  for (const territory of planet.territories) {
    if (membership.get(territory.id) !== 1) {
      errors.push(`${territory.id} must belong to exactly one continent.`);
    }
    if (
      !planet.continents
        .find((continent) => continent.id === territory.continentId)
        ?.territoryIds.includes(territory.id)
    ) {
      errors.push(`${territory.id} has an inconsistent continent ID.`);
    }
  }

  const computedCoverage =
    landCells.size / Math.max(1, planet.surfaceCells.length);
  if (Math.abs(computedCoverage - planet.landCoverage) > 1e-9) {
    errors.push('Land coverage does not match the surface mask.');
  }
  if (parsed.success) {
    const territoryIndex = new Map(
      planet.territories.map((territory, index) => [territory.id, index]),
    );
    const ownership = planet.surfaceCells.map((cell) =>
      cell.territoryId === null ? null : territoryIndex.get(cell.territoryId)!,
    );
    const borderWeights = buildTerritoryBorderWeights(ownership, cellAdjacency);
    const derivedLandBorders = new Set(
      borderWeights.map((border) =>
        pairKey(
          planet.territories[border.leftTerritoryIndex]!.id,
          planet.territories[border.rightTerritoryIndex]!.id,
        ),
      ),
    );
    const listedLandBorders = new Set(
      planet.connections
        .filter((connection) => connection.type === 'land-border')
        .map((connection) =>
          pairKey(connection.fromTerritoryId, connection.toTerritoryId),
        ),
    );
    if (
      derivedLandBorders.size !== listedLandBorders.size ||
      [...derivedLandBorders].some((border) => !listedLandBorders.has(border))
    ) {
      errors.push(
        'Land-border connections do not match geographically adjacent territories.',
      );
    }
    const expectedAnalysis = analyzeStrategicGraph(
      planet.territories,
      planet.connections,
      planet.continents,
      planet.landmasses,
      borderWeights,
    );
    if (JSON.stringify(expectedAnalysis) !== JSON.stringify(planet.analysis)) {
      errors.push('Serialized strategic graph analysis is inconsistent.');
    }
  }
  if (
    planet.landCoverage < MIN_LAND_COVERAGE ||
    planet.landCoverage > MAX_LAND_COVERAGE
  ) {
    warnings.push('Land coverage is outside the preferred 45–60% range.');
  }
  if (
    planet.landmasses.length < MIN_SUBSTANTIAL_LANDMASSES ||
    planet.landmasses.length > MAX_SUBSTANTIAL_LANDMASSES
  ) {
    warnings.push('Landmass count is outside the preferred 4–8 range.');
  }
  const sizes = planet.territories.map((territory) => territory.cellCount);
  if (
    sizes.length > 0 &&
    Math.max(...sizes) / Math.max(1, Math.min(...sizes)) > 2.5
  ) {
    warnings.push('Territory cell counts are very uneven.');
  }
  const seaRouteCount = planet.connections.filter(
    (item) => item.type === 'sea-route',
  ).length;
  if (seaRouteCount > planet.landmasses.length - 1 + 3) {
    warnings.push(
      'The strategic graph uses an excessive number of sea routes.',
    );
  }
  if (
    planet.continents.some(
      (item) => item.externalGatewayTerritoryIds.length > 5,
    )
  ) {
    warnings.push(
      'At least one continent has too many external gateway territories.',
    );
  }
  if (
    planet.analysis.continentCohesionMetrics.some(
      (metric) => metric.dominatedTerritoryIds.length > 0,
    )
  ) {
    warnings.push(
      'At least one territory has more neighbors from another continent than its own.',
    );
  }
  if (
    planet.analysis.continentCohesionMetrics.some(
      (metric) => metric.cohesionScore < 0.42,
    )
  ) {
    warnings.push(
      'At least one continent has unusually low internal-edge cohesion.',
    );
  }
  if (
    planet.analysis.continentCohesionMetrics.some(
      (metric) => metric.protrusionTerritoryIds.length > 0,
    )
  ) {
    warnings.push('At least one continent has an isolated-looking protrusion.');
  }
  if (
    planet.analysis.continentInterleavingMetrics.some(
      (metric) => metric.sharedTerritoryEdgeCount > 4,
    )
  ) {
    warnings.push(
      'A pair of continents has an excessively interleaved boundary.',
    );
  }
  if (
    planet.analysis.continentCohesionMetrics.some(
      (metric) => metric.internalSeaRouteCount > metric.internalEdgeCount,
    )
  ) {
    warnings.push(
      'A continent depends primarily on internal sea-route connections.',
    );
  }
  if (
    !planet.continents.some(
      (item) => item.externalGatewayTerritoryIds.length <= 3,
    )
  ) {
    warnings.push(
      'No continent has a meaningfully defensible gateway profile.',
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
