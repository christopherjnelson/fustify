import type { PlanetDefinition } from '../types/planet';
import type { MatchState } from './types';
import { getOwnedTerritories } from './reinforcement';

export function checkPlayerEliminated(
  state: MatchState,
  playerId: string,
): boolean {
  return getOwnedTerritories(state, playerId).length === 0;
}

export function getNextActivePlayer(
  _planet: PlanetDefinition,
  state: MatchState,
): string {
  const turnOrder = Object.keys(state.players);
  const currentIndex = turnOrder.indexOf(state.activePlayerId);
  for (let offset = 1; offset <= turnOrder.length; offset += 1) {
    const candidate = turnOrder[(currentIndex + offset) % turnOrder.length]!;
    if (!state.players[candidate]?.eliminated) return candidate;
  }
  return state.activePlayerId;
}

export function checkVictory(
  planet: PlanetDefinition,
  state: MatchState,
): string | null {
  const ownerIds = new Set(
    planet.territories.map(
      (territory) => state.territories[territory.id]?.ownerId,
    ),
  );
  if (ownerIds.size !== 1) return null;
  const winnerId = [...ownerIds][0];
  return winnerId && state.players[winnerId] ? winnerId : null;
}
