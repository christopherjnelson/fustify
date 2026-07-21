import type { MatchState } from '../game/types';
import type { PlanetDefinition } from '../types/planet';
import type { CommandFingerprint, GameObservation } from './types';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((nested) => deepFreeze(nested));
    Object.freeze(value);
  }
  return value;
}

/** Creates a detached, immutable public-information snapshot. */
export function createGameObservation(
  planet: PlanetDefinition,
  state: MatchState,
): GameObservation {
  const observation: GameObservation = {
    matchId: state.matchId,
    matchSeed: state.seed,
    turnNumber: state.turnNumber,
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    remainingReinforcements: state.remainingReinforcements,
    territories: Object.fromEntries(
      planet.territories.map((definition) => {
        const current = state.territories[definition.id]!;
        return [
          definition.id,
          {
            id: definition.id,
            name: definition.name,
            continentId: definition.continentId,
            adjacentTerritoryIds: [...definition.adjacentTerritoryIds],
            ownerId: current.ownerId,
            armyCount: current.armyCount,
          },
        ];
      }),
    ),
    continents: planet.continents.map((continent) => ({
      id: continent.id,
      name: continent.name,
      territoryIds: [...continent.territoryIds],
      bonus: continent.bonus,
    })),
    players: structuredClone(state.players),
    pendingCapture: state.pendingCapture ? { ...state.pendingCapture } : null,
    // Controllers receive bounded recent public history; bulk simulation must not
    // clone an ever-growing log on every decision.
    publicEvents: structuredClone(state.events.slice(-50)),
  };
  return deepFreeze(observation);
}

export function commandFingerprint(state: MatchState): CommandFingerprint {
  return {
    matchId: state.matchId,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phase: state.phase,
    combatSequence: state.combatSequence,
    eventCount: state.events.length,
  };
}

export function fingerprintsEqual(
  left: CommandFingerprint,
  right: CommandFingerprint,
): boolean {
  return Object.keys(left).every(
    (key) =>
      left[key as keyof CommandFingerprint] ===
      right[key as keyof CommandFingerprint],
  );
}
