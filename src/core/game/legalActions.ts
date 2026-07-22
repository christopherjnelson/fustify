import type { PlanetDefinition } from '../types/planet.ts';
import type { MatchState } from './types.ts';
import { getOwnedTerritories } from './reinforcement.ts';

function territoryAdjacency(planet: PlanetDefinition): Map<string, string[]> {
  return new Map(
    planet.territories.map((territory) => [
      territory.id,
      territory.adjacentTerritoryIds,
    ]),
  );
}

export function getAttackSources(state: MatchState): string[] {
  return getOwnedTerritories(state, state.activePlayerId).filter(
    (territoryId) => state.territories[territoryId]!.armyCount >= 2,
  );
}

export function getAttackTargets(
  planet: PlanetDefinition,
  state: MatchState,
  sourceTerritoryId: string,
): string[] {
  const source = state.territories[sourceTerritoryId];
  if (source?.ownerId !== state.activePlayerId || source.armyCount < 2) {
    return [];
  }
  return (
    planet.territories.find((territory) => territory.id === sourceTerritoryId)
      ?.adjacentTerritoryIds ?? []
  ).filter(
    (territoryId) =>
      state.territories[territoryId]?.ownerId !== state.activePlayerId,
  );
}

export function getValidAttackDice(armyCount: number): number[] {
  return Array.from(
    { length: Math.min(3, Math.max(0, armyCount - 1)) },
    (_, index) => index + 1,
  );
}

export function getOwnedConnectedComponent(
  planet: PlanetDefinition,
  state: MatchState,
  sourceTerritoryId: string,
): string[] {
  const ownerId = state.territories[sourceTerritoryId]?.ownerId;
  if (!ownerId) return [];
  const adjacency = territoryAdjacency(planet);
  const visited = new Set<string>();
  const queue = [sourceTerritoryId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (
        !visited.has(neighbor) &&
        state.territories[neighbor]?.ownerId === ownerId
      ) {
        queue.push(neighbor);
      }
    }
  }
  return [...visited];
}

export function getFortifyTargets(
  planet: PlanetDefinition,
  state: MatchState,
  sourceTerritoryId: string,
): string[] {
  const source = state.territories[sourceTerritoryId];
  if (source?.ownerId !== state.activePlayerId || source.armyCount < 2) {
    return [];
  }
  return getOwnedConnectedComponent(planet, state, sourceTerritoryId).filter(
    (territoryId) => territoryId !== sourceTerritoryId,
  );
}
