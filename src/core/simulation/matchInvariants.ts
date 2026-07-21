import type { GameCommand } from '../controllers';
import { getFortifyTargets } from '../game/legalActions';
import type { MatchState } from '../game/types';
import type { PlanetDefinition } from '../types/planet';

export interface SimulationViolation {
  code: string;
  message: string;
  turnNumber: number;
  commandIndex: number;
}

function violation(
  code: string,
  message: string,
  state: MatchState,
  commandIndex: number,
): SimulationViolation {
  return { code, message, turnNumber: state.turnNumber, commandIndex };
}

export function inspectMatchInvariants(
  planet: PlanetDefinition,
  previous: MatchState | null,
  state: MatchState,
  command: GameCommand | null,
  commandIndex: number,
): SimulationViolation[] {
  const issues: SimulationViolation[] = [];
  if (!Object.isFrozen(planet)) {
    issues.push(
      violation(
        'MUTABLE_WORLD',
        'Canonical world geometry is not protected from mutation.',
        state,
        commandIndex,
      ),
    );
  }
  const validPlayers = new Set(Object.keys(state.players));
  if (Object.keys(state.territories).length !== planet.territories.length) {
    issues.push(
      violation(
        'TERRITORY_COUNT',
        'Mutable territory count differs from the canonical world.',
        state,
        commandIndex,
      ),
    );
  }
  for (const definition of planet.territories) {
    const territory = state.territories[definition.id];
    const pendingDestination =
      state.phase === 'capture' &&
      state.pendingCapture?.toTerritoryId === definition.id;
    if (!territory || !validPlayers.has(territory.ownerId)) {
      issues.push(
        violation(
          'INVALID_OWNER',
          `${definition.id} has no valid owner.`,
          state,
          commandIndex,
        ),
      );
      continue;
    }
    if (
      !Number.isFinite(territory.armyCount) ||
      !Number.isInteger(territory.armyCount) ||
      (territory.armyCount < 1 &&
        !(pendingDestination && territory.armyCount === 0))
    ) {
      issues.push(
        violation(
          'INVALID_ARMIES',
          `${definition.id} has invalid army count ${territory.armyCount}.`,
          state,
          commandIndex,
        ),
      );
    }
  }
  for (const player of Object.values(state.players)) {
    const owned = Object.values(state.territories).filter(
      (territory) => territory.ownerId === player.playerId,
    ).length;
    if (
      (player.eliminated && owned !== 0) ||
      (!player.eliminated && owned < 1)
    ) {
      issues.push(
        violation(
          'ELIMINATION_MISMATCH',
          `${player.playerId} elimination does not match ownership.`,
          state,
          commandIndex,
        ),
      );
    }
  }
  if (
    !state.players[state.activePlayerId] ||
    state.players[state.activePlayerId]!.eliminated
  ) {
    issues.push(
      violation(
        'INVALID_ACTIVE_PLAYER',
        'The active player is missing or eliminated.',
        state,
        commandIndex,
      ),
    );
  }
  if (
    !Number.isInteger(state.remainingReinforcements) ||
    state.remainingReinforcements < 0 ||
    (state.phase !== 'reinforce' && state.remainingReinforcements !== 0)
  ) {
    issues.push(
      violation(
        'REINFORCEMENT_POOL',
        'The reinforcement pool is inconsistent with the phase.',
        state,
        commandIndex,
      ),
    );
  }
  if (
    (state.phase === 'capture') !== Boolean(state.pendingCapture) ||
    (state.winnerId !== null &&
      state.phase !== 'capture' &&
      state.phase !== 'game-over')
  ) {
    issues.push(
      violation(
        'PHASE_STATE',
        'Capture or victory state is inconsistent with the current phase.',
        state,
        commandIndex,
      ),
    );
  }
  const living = Object.values(state.players).filter(
    (player) => !player.eliminated,
  );
  if (
    state.phase === 'game-over' &&
    (living.length !== 1 || living[0]?.playerId !== state.winnerId)
  ) {
    issues.push(
      violation(
        'INVALID_VICTORY',
        'Game over does not have exactly one living winner.',
        state,
        commandIndex,
      ),
    );
  }
  if (previous && command) {
    if (previous.phase === 'game-over') {
      issues.push(
        violation(
          'ACTION_AFTER_COMPLETION',
          'A command was applied after match completion.',
          state,
          commandIndex,
        ),
      );
    }
    if (command.type === 'ATTACK') {
      const source = planet.territories.find(
        (territory) => territory.id === command.fromTerritoryId,
      );
      if (
        !source?.adjacentTerritoryIds.includes(command.toTerritoryId) ||
        previous.territories[command.fromTerritoryId]?.armyCount < 2 ||
        previous.territories[command.toTerritoryId]?.ownerId ===
          previous.activePlayerId
      ) {
        issues.push(
          violation(
            'INVALID_ATTACK',
            'An applied attack violated adjacency, ownership, or army rules.',
            state,
            commandIndex,
          ),
        );
      }
    }
    if (
      command.type === 'FORTIFY' &&
      !getFortifyTargets(planet, previous, command.fromTerritoryId).includes(
        command.toTerritoryId,
      )
    ) {
      issues.push(
        violation(
          'INVALID_FORTIFICATION',
          'An applied fortification lacked an owned path.',
          state,
          commandIndex,
        ),
      );
    }
  }
  return issues;
}
