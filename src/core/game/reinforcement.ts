import type { PlanetDefinition } from '../types/planet.ts';
import type { MatchState } from './types.ts';

export function getOwnedTerritories(
  state: MatchState,
  playerId: string,
): string[] {
  return Object.entries(state.territories)
    .filter(([, territory]) => territory.ownerId === playerId)
    .map(([territoryId]) => territoryId);
}

export function getFullyOwnedContinents(
  planet: PlanetDefinition,
  state: MatchState,
  playerId: string,
) {
  return planet.continents.filter((continent) =>
    continent.territoryIds.every(
      (territoryId) => state.territories[territoryId]?.ownerId === playerId,
    ),
  );
}

export interface ReinforcementCalculation {
  ownedTerritoryCount: number;
  territoryBase: number;
  continentBonus: number;
  total: number;
}

export function calculateReinforcements(
  planet: PlanetDefinition,
  state: MatchState,
  playerId: string,
): ReinforcementCalculation {
  const ownedTerritoryCount = getOwnedTerritories(state, playerId).length;
  const territoryBase = Math.max(3, Math.floor(ownedTerritoryCount / 3));
  const continentBonus = getFullyOwnedContinents(
    planet,
    state,
    playerId,
  ).reduce((sum, continent) => sum + continent.bonus, 0);
  return {
    ownedTerritoryCount,
    territoryBase,
    continentBonus,
    total: territoryBase + continentBonus,
  };
}

export function getReinforcementTargets(state: MatchState): string[] {
  return getOwnedTerritories(state, state.activePlayerId);
}
