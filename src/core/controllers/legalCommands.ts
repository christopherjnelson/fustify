import {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getValidAttackDice,
} from '../game/legalActions';
import { getReinforcementTargets } from '../game/reinforcement';
import type { MatchState } from '../game/types';
import type { PlanetDefinition } from '../types/planet';
import type { GameCommand } from './types';

/** Enumerates controller commands from the same rule helpers used by the UI. */
export function getLegalGameCommands(
  planet: PlanetDefinition,
  state: MatchState,
): GameCommand[] {
  if (state.phase === 'game-over') return [];
  if (state.phase === 'reinforce') {
    return getReinforcementTargets(state)
      .slice()
      .sort()
      .map((territoryId) => ({
        type: 'PLACE_REINFORCEMENT' as const,
        territoryId,
        amount: state.remainingReinforcements,
      }));
  }
  if (state.phase === 'capture') {
    const pending = state.pendingCapture;
    if (!pending) return [];
    const maximum = state.territories[pending.fromTerritoryId]!.armyCount - 1;
    return Array.from(
      { length: maximum - pending.minimumArmies + 1 },
      (_, index) => ({
        type: 'MOVE_AFTER_CAPTURE' as const,
        fromTerritoryId: pending.fromTerritoryId,
        toTerritoryId: pending.toTerritoryId,
        amount: pending.minimumArmies + index,
      }),
    );
  }
  if (state.phase === 'attack') {
    const attacks = getAttackSources(state)
      .slice()
      .sort()
      .flatMap((fromTerritoryId) =>
        getAttackTargets(planet, state, fromTerritoryId)
          .slice()
          .sort()
          .flatMap((toTerritoryId) =>
            getValidAttackDice(state.territories[fromTerritoryId]!.armyCount)
              .slice()
              .sort((left, right) => right - left)
              .map((attackDice) => ({
                type: 'ATTACK' as const,
                fromTerritoryId,
                toTerritoryId,
                attackDice,
              })),
          ),
      );
    return [...attacks, { type: 'END_ATTACK_PHASE' }];
  }
  if (state.phase === 'fortify') {
    const moves: GameCommand[] = [];
    for (const fromTerritoryId of Object.keys(state.territories).sort()) {
      const source = state.territories[fromTerritoryId]!;
      for (const toTerritoryId of getFortifyTargets(
        planet,
        state,
        fromTerritoryId,
      ).sort()) {
        const maximum = source.armyCount - 1;
        moves.push({
          type: 'FORTIFY',
          fromTerritoryId,
          toTerritoryId,
          amount: maximum,
        });
        if (maximum > 1) {
          moves.push({
            type: 'FORTIFY',
            fromTerritoryId,
            toTerritoryId,
            amount: 1,
          });
        }
      }
    }
    return [...moves, { type: 'SKIP_FORTIFY' }];
  }
  return [{ type: 'END_TURN' }];
}

export function deterministicFallback(
  legalActions: readonly GameCommand[],
): GameCommand | null {
  return (
    legalActions.find((action) => action.type === 'END_ATTACK_PHASE') ??
    legalActions.find((action) => action.type === 'SKIP_FORTIFY') ??
    legalActions.find((action) => action.type === 'END_TURN') ??
    legalActions[0] ??
    null
  );
}
