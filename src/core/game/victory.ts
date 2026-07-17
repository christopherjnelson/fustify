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
  planet: PlanetDefinition,
  state: MatchState,
): string {
  const currentIndex = planet.players.findIndex(
    (player) => player.id === state.activePlayerId,
  );
  for (let offset = 1; offset <= planet.players.length; offset += 1) {
    const candidate =
      planet.players[(currentIndex + offset) % planet.players.length]!;
    if (!state.players[candidate.id]?.eliminated) return candidate.id;
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
