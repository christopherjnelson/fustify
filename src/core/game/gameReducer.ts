import { createSeededRandom } from '../generation/seededRandom.ts';
import type { PlanetDefinition } from '../types/planet.ts';
import { resolveCombat, type DiceRng } from './combat.ts';
import { makeEvent } from './events.ts';
import {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getValidAttackDice,
} from './legalActions.ts';
import { calculateReinforcements } from './reinforcement.ts';
import type {
  GameAction,
  GameErrorCode,
  GameTransition,
  MatchEvent,
  MatchState,
} from './types.ts';
import {
  checkPlayerEliminated,
  checkVictory,
  getNextActivePlayer,
} from './victory.ts';

export interface GameReducerOptions {
  createCombatRng?: (seed: string, sequence: number) => DiceRng;
}

function invalid(
  state: MatchState,
  code: GameErrorCode,
  message: string,
): GameTransition {
  return { state, error: { code, message } };
}

function success(state: MatchState): GameTransition {
  return { state, error: null };
}

function appendEvent(
  state: MatchState,
  event: Omit<MatchEvent, 'id' | 'turnNumber'>,
): MatchState {
  return {
    ...state,
    events: [
      ...state.events,
      makeEvent(state, event.type, event.message, event),
    ],
  };
}

function selectTerritory(
  planet: PlanetDefinition,
  state: MatchState,
  territoryId: string | null,
): GameTransition {
  if (territoryId === null) {
    return success({
      ...state,
      selectedSourceTerritoryId: null,
      selectedTargetTerritoryId: null,
    });
  }
  const territory = state.territories[territoryId];
  if (!territory) {
    return invalid(
      state,
      'UNKNOWN_TERRITORY',
      'That territory does not exist.',
    );
  }
  if (state.phase === 'reinforce') {
    if (territory.ownerId !== state.activePlayerId) {
      return invalid(
        state,
        'NOT_OWNER',
        'Reinforcements can only be placed on your own territory.',
      );
    }
    return success({
      ...state,
      selectedSourceTerritoryId: territoryId,
      selectedTargetTerritoryId: null,
    });
  }
  if (state.phase === 'attack') {
    if (territory.ownerId === state.activePlayerId) {
      if (state.selectedSourceTerritoryId === territoryId) {
        return success({
          ...state,
          selectedSourceTerritoryId: null,
          selectedTargetTerritoryId: null,
        });
      }
      if (!getAttackSources(state).includes(territoryId)) {
        return invalid(
          state,
          'INVALID_SOURCE',
          'An attack source needs at least two armies.',
        );
      }
      return success({
        ...state,
        selectedSourceTerritoryId: territoryId,
        selectedTargetTerritoryId: null,
      });
    }
    if (
      state.selectedSourceTerritoryId &&
      getAttackTargets(planet, state, state.selectedSourceTerritoryId).includes(
        territoryId,
      )
    ) {
      return success({
        ...state,
        selectedTargetTerritoryId: territoryId,
      });
    }
    return invalid(
      state,
      'INVALID_TARGET',
      'Choose an enemy adjacent to the selected source.',
    );
  }
  if (state.phase === 'fortify') {
    if (territory.ownerId !== state.activePlayerId) {
      return invalid(
        state,
        'NOT_OWNER',
        'Both fortification territories must be yours.',
      );
    }
    if (state.selectedSourceTerritoryId === territoryId) {
      return success({
        ...state,
        selectedSourceTerritoryId: null,
        selectedTargetTerritoryId: null,
      });
    }
    if (
      state.selectedSourceTerritoryId &&
      getFortifyTargets(
        planet,
        state,
        state.selectedSourceTerritoryId,
      ).includes(territoryId)
    ) {
      return success({ ...state, selectedTargetTerritoryId: territoryId });
    }
    if (territory.armyCount < 2) {
      return invalid(
        state,
        'INVALID_SOURCE',
        'A fortification source needs at least two armies.',
      );
    }
    return success({
      ...state,
      selectedSourceTerritoryId: territoryId,
      selectedTargetTerritoryId: null,
    });
  }
  return invalid(
    state,
    'WRONG_PHASE',
    'Territory selection is unavailable in the current phase.',
  );
}

function endTurn(planet: PlanetDefinition, state: MatchState): MatchState {
  let next = appendEvent(state, {
    type: 'turn-ended',
    message: `Turn ${state.turnNumber} ended.`,
    playerId: state.activePlayerId,
    actingPlayerId: state.activePlayerId,
  });
  const previousPlayerId = state.activePlayerId;
  const activePlayerId = getNextActivePlayer(planet, next);
  const turnNumber = next.turnNumber + 1;
  next = {
    ...next,
    turnNumber,
    activePlayerId,
    phase: 'reinforce',
    remainingReinforcements: 0,
    selectedSourceTerritoryId: null,
    selectedTargetTerritoryId: null,
    pendingCapture: null,
    fortifiedThisTurn: false,
    recentlyCapturedTerritoryId: null,
  };
  const reinforcement = calculateReinforcements(planet, next, activePlayerId);
  next.remainingReinforcements = reinforcement.total;
  next = appendEvent(next, {
    type: 'turn-started',
    message: `Turn ${turnNumber} started.`,
    playerId: activePlayerId,
    actingPlayerId: activePlayerId,
    previousPlayerId,
    nextPlayerId: activePlayerId,
  });
  return appendEvent(next, {
    type: 'reinforcements-received',
    message: `Received ${reinforcement.total} reinforcements (${reinforcement.territoryBase} base + ${reinforcement.continentBonus} continents).`,
    playerId: activePlayerId,
    actingPlayerId: activePlayerId,
    armyCount: reinforcement.total,
  });
}

export function gameReducer(
  planet: PlanetDefinition,
  state: MatchState,
  action: GameAction,
  options: GameReducerOptions = {},
): GameTransition {
  if (state.phase === 'game-over') {
    return invalid(state, 'GAME_OVER', 'The match is already over.');
  }
  if (state.pendingCapture && action.type !== 'MOVE_AFTER_CAPTURE') {
    return invalid(
      state,
      'CAPTURE_MOVE_REQUIRED',
      'Complete the required post-capture move first.',
    );
  }
  if (action.type === 'SELECT_TERRITORY') {
    return selectTerritory(planet, state, action.territoryId);
  }
  if (action.type === 'PLACE_REINFORCEMENT') {
    if (state.phase !== 'reinforce') {
      return invalid(
        state,
        'WRONG_PHASE',
        'It is not the reinforcement phase.',
      );
    }
    const territory = state.territories[action.territoryId];
    if (!territory) {
      return invalid(
        state,
        'UNKNOWN_TERRITORY',
        'That territory does not exist.',
      );
    }
    if (territory.ownerId !== state.activePlayerId) {
      return invalid(
        state,
        'NOT_OWNER',
        'Reinforcements can only be placed on your own territory.',
      );
    }
    if (
      !Number.isInteger(action.amount) ||
      action.amount < 1 ||
      action.amount > state.remainingReinforcements
    ) {
      return invalid(
        state,
        'INVALID_AMOUNT',
        'Place a positive whole number no larger than the remaining pool.',
      );
    }
    let next: MatchState = {
      ...state,
      territories: {
        ...state.territories,
        [action.territoryId]: {
          ...territory,
          armyCount: territory.armyCount + action.amount,
        },
      },
      remainingReinforcements: state.remainingReinforcements - action.amount,
    };
    next = appendEvent(next, {
      type: 'armies-placed',
      message: `Placed ${action.amount} ${action.amount === 1 ? 'army' : 'armies'}.`,
      playerId: state.activePlayerId,
      actingPlayerId: state.activePlayerId,
      territoryId: action.territoryId,
      primaryTerritoryId: action.territoryId,
      armyCount: action.amount,
    });
    if (next.remainingReinforcements === 0) {
      next = {
        ...next,
        phase: 'attack',
        selectedSourceTerritoryId: null,
        selectedTargetTerritoryId: null,
      };
    }
    return success(next);
  }
  if (action.type === 'ATTACK') {
    if (state.phase !== 'attack') {
      return invalid(state, 'WRONG_PHASE', 'It is not the attack phase.');
    }
    const source = state.territories[action.fromTerritoryId];
    const target = state.territories[action.toTerritoryId];
    if (!source || !target) {
      return invalid(
        state,
        'UNKNOWN_TERRITORY',
        'That territory does not exist.',
      );
    }
    if (!getAttackSources(state).includes(action.fromTerritoryId)) {
      return invalid(
        state,
        'INVALID_SOURCE',
        'The source must be yours and have at least two armies.',
      );
    }
    if (
      !getAttackTargets(planet, state, action.fromTerritoryId).includes(
        action.toTerritoryId,
      )
    ) {
      return invalid(
        state,
        'NOT_ADJACENT',
        'The target must be an adjacent enemy territory.',
      );
    }
    if (!getValidAttackDice(source.armyCount).includes(action.attackDice)) {
      return invalid(
        state,
        'INVALID_DICE',
        'The selected number of attack dice is not legal.',
      );
    }
    const rng = options.createCombatRng
      ? options.createCombatRng(state.seed, state.combatSequence)
      : createSeededRandom(`${state.seed}|combat|${state.combatSequence}`);
    const combat = resolveCombat(action.attackDice, target.armyCount, rng);
    const updatedSource = {
      ...source,
      armyCount: source.armyCount - combat.attackerLosses,
    };
    const updatedTarget = {
      ...target,
      armyCount: target.armyCount - combat.defenderLosses,
    };
    let next: MatchState = {
      ...state,
      combatSequence: state.combatSequence + 1,
      territories: {
        ...state.territories,
        [action.fromTerritoryId]: updatedSource,
        [action.toTerritoryId]: updatedTarget,
      },
    };
    next = appendEvent(next, {
      type: 'combat',
      message: `Attack rolled ${combat.attackerRolls.join(', ')} vs ${combat.defenderRolls.join(', ')}; losses ${combat.attackerLosses}-${combat.defenderLosses}.`,
      playerId: state.activePlayerId,
      actingPlayerId: state.activePlayerId,
      defenderPlayerId: target.ownerId,
      territoryId: action.toTerritoryId,
      sourceTerritoryId: action.fromTerritoryId,
      targetTerritoryId: action.toTerritoryId,
      primaryTerritoryId: action.toTerritoryId,
      ...combat,
    });
    if (updatedTarget.armyCount > 0) return success(next);

    const defeatedPlayerId = target.ownerId;
    next = {
      ...next,
      phase: 'capture',
      territories: {
        ...next.territories,
        [action.toTerritoryId]: {
          ownerId: state.activePlayerId,
          armyCount: 0,
        },
      },
      selectedSourceTerritoryId: action.fromTerritoryId,
      selectedTargetTerritoryId: action.toTerritoryId,
      pendingCapture: {
        fromTerritoryId: action.fromTerritoryId,
        toTerritoryId: action.toTerritoryId,
        minimumArmies: action.attackDice,
      },
      recentlyCapturedTerritoryId: action.toTerritoryId,
    };
    next = appendEvent(next, {
      type: 'territory-captured',
      message: 'Territory captured; move armies in.',
      playerId: state.activePlayerId,
      actingPlayerId: state.activePlayerId,
      previousOwnerId: defeatedPlayerId,
      territoryId: action.toTerritoryId,
      sourceTerritoryId: action.fromTerritoryId,
      targetTerritoryId: action.toTerritoryId,
      primaryTerritoryId: action.toTerritoryId,
    });
    if (checkPlayerEliminated(next, defeatedPlayerId)) {
      next = {
        ...next,
        players: {
          ...next.players,
          [defeatedPlayerId]: {
            ...next.players[defeatedPlayerId]!,
            eliminated: true,
          },
        },
      };
      next = appendEvent(next, {
        type: 'player-eliminated',
        message: 'A player was eliminated.',
        playerId: defeatedPlayerId,
        actingPlayerId: state.activePlayerId,
        eliminatedPlayerId: defeatedPlayerId,
      });
    }
    return success({ ...next, winnerId: checkVictory(planet, next) });
  }
  if (action.type === 'MOVE_AFTER_CAPTURE') {
    if (state.phase !== 'capture' || !state.pendingCapture) {
      return invalid(state, 'WRONG_PHASE', 'There is no pending capture move.');
    }
    const pending = state.pendingCapture;
    if (
      action.fromTerritoryId !== pending.fromTerritoryId ||
      action.toTerritoryId !== pending.toTerritoryId
    ) {
      return invalid(
        state,
        'INVALID_TARGET',
        'The move must use the territories from the capture.',
      );
    }
    const source = state.territories[action.fromTerritoryId]!;
    const target = state.territories[action.toTerritoryId]!;
    if (
      !Number.isInteger(action.amount) ||
      action.amount < pending.minimumArmies ||
      action.amount > source.armyCount - 1
    ) {
      return invalid(
        state,
        'INVALID_AMOUNT',
        `Move at least ${pending.minimumArmies} armies while leaving one behind.`,
      );
    }
    let next: MatchState = {
      ...state,
      phase: state.winnerId ? 'game-over' : 'attack',
      territories: {
        ...state.territories,
        [action.fromTerritoryId]: {
          ...source,
          armyCount: source.armyCount - action.amount,
        },
        [action.toTerritoryId]: { ...target, armyCount: action.amount },
      },
      pendingCapture: null,
      selectedSourceTerritoryId: null,
      selectedTargetTerritoryId: null,
    };
    next = appendEvent(next, {
      type: 'capture-move',
      message: `Moved ${action.amount} armies into the captured territory.`,
      playerId: state.activePlayerId,
      actingPlayerId: state.activePlayerId,
      territoryId: action.toTerritoryId,
      sourceTerritoryId: action.fromTerritoryId,
      targetTerritoryId: action.toTerritoryId,
      primaryTerritoryId: action.toTerritoryId,
      armyCount: action.amount,
    });
    if (next.winnerId) {
      next = appendEvent(next, {
        type: 'match-won',
        message: 'The match was won.',
        playerId: next.winnerId,
        actingPlayerId: next.winnerId,
      });
    }
    return success(next);
  }
  if (action.type === 'END_ATTACK_PHASE') {
    if (state.phase !== 'attack') {
      if (state.phase === 'reinforce' && state.remainingReinforcements > 0) {
        return invalid(
          state,
          'REINFORCEMENTS_REMAIN',
          'Place every reinforcement before ending the phase.',
        );
      }
      return invalid(state, 'WRONG_PHASE', 'It is not the attack phase.');
    }
    return success(
      appendEvent(
        {
          ...state,
          phase: 'fortify',
          selectedSourceTerritoryId: null,
          selectedTargetTerritoryId: null,
        },
        {
          type: 'attack-phase-ended',
          message: 'Attack phase ended.',
          playerId: state.activePlayerId,
          actingPlayerId: state.activePlayerId,
        },
      ),
    );
  }
  if (action.type === 'FORTIFY') {
    if (state.phase !== 'fortify') {
      return invalid(state, 'WRONG_PHASE', 'It is not the fortify phase.');
    }
    if (state.fortifiedThisTurn) {
      return invalid(
        state,
        'FORTIFY_ALREADY_USED',
        'Only one fortification is allowed per turn.',
      );
    }
    const source = state.territories[action.fromTerritoryId];
    const target = state.territories[action.toTerritoryId];
    if (
      !source ||
      !target ||
      source.ownerId !== state.activePlayerId ||
      target.ownerId !== state.activePlayerId
    ) {
      return invalid(
        state,
        'NOT_OWNER',
        'Both fortification territories must belong to the active player.',
      );
    }
    if (
      !getFortifyTargets(planet, state, action.fromTerritoryId).includes(
        action.toTerritoryId,
      )
    ) {
      return invalid(
        state,
        'NO_OWNED_PATH',
        'No connected path of owned territories reaches that target.',
      );
    }
    if (
      !Number.isInteger(action.amount) ||
      action.amount < 1 ||
      action.amount > source.armyCount - 1
    ) {
      return invalid(
        state,
        'INVALID_AMOUNT',
        'Move a positive whole number while leaving one army behind.',
      );
    }
    let next: MatchState = {
      ...state,
      phase: 'turn-end',
      fortifiedThisTurn: true,
      territories: {
        ...state.territories,
        [action.fromTerritoryId]: {
          ...source,
          armyCount: source.armyCount - action.amount,
        },
        [action.toTerritoryId]: {
          ...target,
          armyCount: target.armyCount + action.amount,
        },
      },
      selectedSourceTerritoryId: null,
      selectedTargetTerritoryId: null,
    };
    next = appendEvent(next, {
      type: 'fortification-completed',
      message: `Fortified with ${action.amount} armies.`,
      playerId: state.activePlayerId,
      actingPlayerId: state.activePlayerId,
      territoryId: action.toTerritoryId,
      sourceTerritoryId: action.fromTerritoryId,
      targetTerritoryId: action.toTerritoryId,
      primaryTerritoryId: action.toTerritoryId,
      armyCount: action.amount,
    });
    return success(next);
  }
  if (action.type === 'SKIP_FORTIFY') {
    if (state.phase !== 'fortify') {
      return invalid(state, 'WRONG_PHASE', 'It is not the fortify phase.');
    }
    return success(
      appendEvent(
        {
          ...state,
          phase: 'turn-end',
          selectedSourceTerritoryId: null,
          selectedTargetTerritoryId: null,
        },
        {
          type: 'fortification-skipped',
          message: 'Fortification skipped.',
          playerId: state.activePlayerId,
          actingPlayerId: state.activePlayerId,
        },
      ),
    );
  }
  if (action.type === 'END_TURN') {
    if (state.phase !== 'turn-end') {
      return invalid(
        state,
        'WRONG_PHASE',
        'Finish or skip fortification before ending the turn.',
      );
    }
    return success(endTurn(planet, state));
  }
  return invalid(state, 'WRONG_PHASE', 'That action is unavailable.');
}
