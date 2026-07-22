import type { PlanetDefinition } from '../types/planet';
import type { StartingTerritoryState } from '../setup/startingPositions';

export interface StartingBoardMetrics {
  playerId: string;
  territoryIds: string[];
  territoryCount: number;
  armyCount: number;
  friendlyAdjacencyEdges: number;
  hostileFrontierEdges: number;
  frontierTerritoryCount: number;
  isolatedTerritoryCount: number;
  connectedComponentCount: number;
  largestConnectedComponent: number;
  meanFriendlyComponentSize: number;
  continentsRepresented: number;
  maximumTerritoriesInContinent: number;
  closestDistanceToCompletingContinent: number;
  fullyControlledContinents: number;
  seaRouteExposure: number;
  territoryDegreeMinimum: number;
  territoryDegreeMean: number;
  territoryDegreeMaximum: number;
  meanHostileNeighborsPerTerritory: number;
}

function componentSizes(
  ids: string[],
  adjacency: Map<string, string[]>,
): number[] {
  const remaining = new Set(ids);
  const sizes: number[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as string;
    remaining.delete(first);
    const queue = [first];
    for (let cursor = 0; cursor < queue.length; cursor += 1)
      for (const neighbor of adjacency.get(queue[cursor]!) ?? [])
        if (remaining.delete(neighbor)) queue.push(neighbor);
    sizes.push(queue.length);
  }
  return sizes.sort((a, b) => b - a);
}

/** Read-only, non-composite measurements of the board before turn one. */
export function measureStartingBoards(
  planet: PlanetDefinition,
  territories: Record<string, StartingTerritoryState>,
): StartingBoardMetrics[] {
  const adjacency = new Map(
    planet.territories.map((territory) => [
      territory.id,
      territory.adjacentTerritoryIds,
    ]),
  );
  const seaRoutes = planet.connections.filter(
    (connection) => connection.type === 'sea-route',
  );
  const playerIds = [
    ...new Set(Object.values(territories).map(({ ownerId }) => ownerId)),
  ].sort();
  return playerIds.map((playerId) => {
    const territoryIds = planet.territories
      .filter(({ id }) => territories[id]?.ownerId === playerId)
      .map(({ id }) => id)
      .sort();
    const owned = new Set(territoryIds);
    const degrees = territoryIds.map((id) => adjacency.get(id)?.length ?? 0);
    const hostileCounts = territoryIds.map(
      (id) =>
        (adjacency.get(id) ?? []).filter((neighbor) => !owned.has(neighbor))
          .length,
    );
    const friendlyAdjacencyEdges =
      territoryIds.reduce(
        (sum, id) =>
          sum +
          (adjacency.get(id) ?? []).filter((neighbor) => owned.has(neighbor))
            .length,
        0,
      ) / 2;
    const components = componentSizes(territoryIds, adjacency);
    const continentHoldings = planet.continents.map((continent) => {
      const held = continent.territoryIds.filter((id) => owned.has(id)).length;
      return { held, size: continent.territoryIds.length };
    });
    return {
      playerId,
      territoryIds,
      territoryCount: territoryIds.length,
      armyCount: territoryIds.reduce(
        (sum, id) => sum + (territories[id]?.armyCount ?? 0),
        0,
      ),
      friendlyAdjacencyEdges,
      hostileFrontierEdges: hostileCounts.reduce(
        (sum, count) => sum + count,
        0,
      ),
      frontierTerritoryCount: hostileCounts.filter(Boolean).length,
      isolatedTerritoryCount: territoryIds.filter(
        (id) =>
          !(adjacency.get(id) ?? []).some((neighbor) => owned.has(neighbor)),
      ).length,
      connectedComponentCount: components.length,
      largestConnectedComponent: components[0] ?? 0,
      meanFriendlyComponentSize: components.length
        ? territoryIds.length / components.length
        : 0,
      continentsRepresented: continentHoldings.filter(({ held }) => held > 0)
        .length,
      maximumTerritoriesInContinent: Math.max(
        0,
        ...continentHoldings.map(({ held }) => held),
      ),
      closestDistanceToCompletingContinent: Math.min(
        ...continentHoldings
          .filter(({ held }) => held > 0)
          .map(({ held, size }) => size - held),
        planet.territoryCount,
      ),
      fullyControlledContinents: continentHoldings.filter(
        ({ held, size }) => held === size,
      ).length,
      seaRouteExposure: seaRoutes.filter(
        ({ fromTerritoryId, toTerritoryId }) =>
          owned.has(fromTerritoryId) !== owned.has(toTerritoryId),
      ).length,
      territoryDegreeMinimum: degrees.length ? Math.min(...degrees) : 0,
      territoryDegreeMean:
        degrees.reduce((sum, degree) => sum + degree, 0) /
        Math.max(1, degrees.length),
      territoryDegreeMaximum: degrees.length ? Math.max(...degrees) : 0,
      meanHostileNeighborsPerTerritory:
        hostileCounts.reduce((sum, count) => sum + count, 0) /
        Math.max(1, territoryIds.length),
    };
  });
}
