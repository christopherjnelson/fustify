import { describe, expect, it } from 'vitest';
import type { PlanetDefinition } from '../types/planet';
import { measureStartingBoards } from './startingBoardMetrics';

const planet = {
  territoryCount: 4,
  territories: [
    { id: 'a', adjacentTerritoryIds: ['b'] },
    { id: 'b', adjacentTerritoryIds: ['a', 'c'] },
    { id: 'c', adjacentTerritoryIds: ['b', 'd'] },
    { id: 'd', adjacentTerritoryIds: ['c'] },
  ],
  continents: [
    { id: 'north', territoryIds: ['a', 'b'] },
    { id: 'south', territoryIds: ['c', 'd'] },
  ],
  connections: [
    { fromTerritoryId: 'b', toTerritoryId: 'c', type: 'sea-route' },
  ],
} as unknown as PlanetDefinition;

describe('starting-board metrics', () => {
  it('measures adjacency, frontier, components, continents, and sea exposure', () => {
    const [player] = measureStartingBoards(planet, {
      a: { ownerId: 'p1', armyCount: 3 },
      b: { ownerId: 'p1', armyCount: 2 },
      c: { ownerId: 'p2', armyCount: 4 },
      d: { ownerId: 'p1', armyCount: 1 },
    });
    expect(player).toMatchObject({
      playerId: 'p1',
      territoryCount: 3,
      armyCount: 6,
      friendlyAdjacencyEdges: 1,
      hostileFrontierEdges: 2,
      frontierTerritoryCount: 2,
      isolatedTerritoryCount: 1,
      connectedComponentCount: 2,
      largestConnectedComponent: 2,
      continentsRepresented: 2,
      maximumTerritoriesInContinent: 2,
      closestDistanceToCompletingContinent: 0,
      fullyControlledContinents: 1,
      seaRouteExposure: 1,
    });
  });
});
