import type { PlanetDefinition } from '../types/planet';
import type { MatchState } from './types';
import { createMatch } from './createMatch';

type Edge = readonly [string, string, 'land-border' | 'sea-route'];

interface FixtureOptions {
  ids: string[];
  edges: Edge[];
  owners?: string[];
  armies?: number[];
  continentGroups?: string[][];
  playerIds?: string[];
}

export function fixturePlanet({
  ids,
  edges,
  owners = ids.map((_, index) => (index === 0 ? 'p1' : 'p2')),
  armies = ids.map(() => 1),
  continentGroups = [ids],
  playerIds = [...new Set(owners)],
}: FixtureOptions): PlanetDefinition {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const [from, to] of edges) {
    adjacency.get(from)!.push(to);
    adjacency.get(to)!.push(from);
  }
  return {
    seed: 'hand-authored-fixture',
    generatorVersion: 3,
    territoryCount: ids.length,
    continentCount: continentGroups.length,
    playerCount: playerIds.length,
    players: playerIds.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: ['#e24f4f', '#3f91e8', '#55ad68'][index]!,
    })),
    territories: ids.map((id, index) => ({
      id,
      name: id.toUpperCase(),
      center: [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index > 1 ? 1 : 0],
      continentId: `c${continentGroups.findIndex((group) => group.includes(id)) + 1}`,
      displayColor: '#ffffff',
      adjacentTerritoryIds: adjacency.get(id)!,
      ownerId: owners[index]!,
      armyCount: armies[index]!,
      cellCount: 1,
      landmassId: 'land-1',
    })),
    continents: continentGroups.map((territoryIds, index) => ({
      id: `c${index + 1}`,
      name: `Continent ${index + 1}`,
      territoryIds,
      bonus: index + 2,
      externalGatewayTerritoryIds: [],
      neighboringContinentIds: [],
    })),
    surfaceCells: [],
    landmasses: [],
    connections: edges.map(([fromTerritoryId, toTerritoryId, type]) => ({
      fromTerritoryId,
      toTerritoryId,
      type,
    })),
    landCoverage: 0.5,
    analysis: {} as PlanetDefinition['analysis'],
  };
}

export function fixtureMatch(
  planet: PlanetDefinition,
  update: Partial<MatchState> = {},
): MatchState {
  return { ...createMatch(planet), ...update };
}

export const rulesFixtures = {
  adjacent: () =>
    fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'land-border']],
      owners: ['p1', 'p2'],
      armies: [4, 1],
    }),
  seaRoute: () =>
    fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'sea-route']],
      owners: ['p1', 'p2'],
      armies: [4, 1],
    }),
  chain: () =>
    fixturePlanet({
      ids: ['a', 'b', 'c'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
      ],
      owners: ['p1', 'p1', 'p1'],
      armies: [5, 1, 1],
      playerIds: ['p1', 'p2', 'p3'],
    }),
  zeroTerritoryPlayer: () =>
    fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'land-border']],
      owners: ['p1', 'p2'],
      armies: [2, 2],
      playerIds: ['p1', 'p2', 'p3'],
    }),
  blockedChain: () =>
    fixturePlanet({
      ids: ['a', 'b', 'c'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
      ],
      owners: ['p1', 'p2', 'p1'],
      armies: [5, 1, 1],
    }),
  branched: () =>
    fixturePlanet({
      ids: ['a', 'b', 'c', 'd'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
        ['b', 'd', 'sea-route'],
      ],
      owners: ['p1', 'p1', 'p1', 'p1'],
      armies: [5, 1, 1, 1],
    }),
  continents: () =>
    fixturePlanet({
      ids: ['a', 'b', 'c', 'd', 'e', 'f'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
        ['c', 'd', 'sea-route'],
        ['d', 'e', 'land-border'],
        ['e', 'f', 'land-border'],
      ],
      owners: ['p1', 'p1', 'p1', 'p1', 'p2', 'p3'],
      armies: [2, 2, 2, 2, 1, 1],
      continentGroups: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
    }),
  nearVictory: () =>
    fixturePlanet({
      ids: ['a', 'b', 'c'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
      ],
      owners: ['p1', 'p1', 'p2'],
      armies: [1, 6, 1],
    }),
};
