import type { PlanetDefinition } from '../types/planet';
import { makeEvent } from './events';
import { calculateReinforcements } from './reinforcement';
import type { MatchState } from './types';
import type { ReadyMatchSetup } from '../setup/startingPositions';

export function createMatch(
  planet: PlanetDefinition,
  setup?: ReadyMatchSetup,
): MatchState {
  if (
    !setup &&
    planet.territories.some(
      (territory) => territory.ownerId === null || territory.armyCount < 1,
    )
  ) {
    throw new Error(
      'A complete territory assignment is required to create a match.',
    );
  }
  const orderedPlayers = setup
    ? setup.players.slice().sort((a, b) => a.seatIndex - b.seatIndex)
    : planet.players;
  const activePlayerId = orderedPlayers[0]!.id;
  const state: MatchState = {
    matchId: `${planet.seed}:local-hot-seat`,
    seed: planet.seed,
    turnNumber: 1,
    activePlayerId,
    phase: 'reinforce',
    remainingReinforcements: 0,
    territories: Object.fromEntries(
      planet.territories.map((territory) => [
        territory.id,
        setup?.startingPosition.territories[territory.id] ?? {
          ownerId: territory.ownerId!,
          armyCount: territory.armyCount,
        },
      ]),
    ),
    players: Object.fromEntries(
      orderedPlayers.map((player) => [
        player.id,
        { playerId: player.id, eliminated: false },
      ]),
    ),
    selectedSourceTerritoryId: null,
    selectedTargetTerritoryId: null,
    pendingCapture: null,
    combatSequence: 0,
    fortifiedThisTurn: false,
    recentlyCapturedTerritoryId: null,
    winnerId: null,
    events: [],
  };
  const reinforcement = calculateReinforcements(planet, state, activePlayerId);
  state.remainingReinforcements = reinforcement.total;
  state.events = [
    makeEvent(state, 'turn-started', 'Turn 1 started.', {
      playerId: activePlayerId,
    }),
  ];
  state.events.push(
    makeEvent(
      state,
      'reinforcements-received',
      `Received ${reinforcement.total} reinforcements (${reinforcement.territoryBase} base + ${reinforcement.continentBonus} continents).`,
      { playerId: activePlayerId },
    ),
  );
  return state;
}
