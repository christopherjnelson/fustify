import { createSeededRandom } from '../generation/seededRandom';
import type {
  ControllerContext,
  GameCommand,
  GameObservation,
  LegalGameAction,
  PlayerController,
} from './types';
import { HEURISTIC_CONTROLLER_VERSION } from './types';

export const HEURISTIC_WEIGHTS = {
  hostilePressure: 2.5,
  hostileBorders: 4,
  continentDefense: 9,
  continentCompletion: 18,
  continentBreak: 14,
  armyAdvantage: 5,
  exposedSource: 3,
  attackThreshold: 8,
  fortifyThreshold: 4,
} as const;

function hostileNeighbors(observation: GameObservation, territoryId: string) {
  const territory = observation.territories[territoryId]!;
  return territory.adjacentTerritoryIds
    .map((id) => observation.territories[id]!)
    .filter((neighbor) => neighbor.ownerId !== territory.ownerId);
}

function ownsContinentExcept(
  observation: GameObservation,
  playerId: string,
  continentId: string,
  exceptId?: string,
) {
  const continent = observation.continents.find(
    (item) => item.id === continentId,
  );
  return Boolean(
    continent?.territoryIds.every(
      (id) =>
        id === exceptId || observation.territories[id]!.ownerId === playerId,
    ),
  );
}

function reinforcementScore(
  observation: GameObservation,
  action: Extract<GameCommand, { type: 'PLACE_REINFORCEMENT' }>,
) {
  const territory = observation.territories[action.territoryId]!;
  const hostiles = hostileNeighbors(observation, territory.id);
  const pressure = hostiles.reduce(
    (sum, neighbor) => sum + neighbor.armyCount,
    0,
  );
  const defendingContinent = ownsContinentExcept(
    observation,
    observation.activePlayerId,
    territory.continentId,
  );
  return (
    pressure * HEURISTIC_WEIGHTS.hostilePressure +
    hostiles.length * HEURISTIC_WEIGHTS.hostileBorders +
    (defendingContinent ? HEURISTIC_WEIGHTS.continentDefense : 0) -
    (hostiles.length === 0 ? territory.armyCount : 0)
  );
}

function attackScore(
  observation: GameObservation,
  action: Extract<GameCommand, { type: 'ATTACK' }>,
) {
  const source = observation.territories[action.fromTerritoryId]!;
  const target = observation.territories[action.toTerritoryId]!;
  const targetOwner = target.ownerId;
  const sourceThreat = hostileNeighbors(observation, source.id).reduce(
    (sum, item) => sum + item.armyCount,
    0,
  );
  const completesContinent = ownsContinentExcept(
    observation,
    observation.activePlayerId,
    target.continentId,
    target.id,
  );
  const breaksContinent = ownsContinentExcept(
    observation,
    targetOwner,
    target.continentId,
  );
  const ownerTerritories = Object.values(observation.territories).filter(
    (item) => item.ownerId === targetOwner,
  ).length;
  return (
    (source.armyCount - target.armyCount) * HEURISTIC_WEIGHTS.armyAdvantage +
    action.attackDice * 1.5 +
    (completesContinent ? HEURISTIC_WEIGHTS.continentCompletion : 0) +
    (breaksContinent ? HEURISTIC_WEIGHTS.continentBreak : 0) +
    (ownerTerritories === 1 ? 16 : 0) -
    Math.max(0, sourceThreat - source.armyCount) *
      HEURISTIC_WEIGHTS.exposedSource -
    hostileNeighbors(observation, target.id).length * 1.5
  );
}

function captureScore(
  observation: GameObservation,
  action: Extract<GameCommand, { type: 'MOVE_AFTER_CAPTURE' }>,
) {
  const destinationThreat = hostileNeighbors(
    observation,
    action.toTerritoryId,
  ).reduce((sum, item) => sum + item.armyCount, 0);
  const sourceThreat = hostileNeighbors(observation, action.fromTerritoryId)
    .filter((item) => item.id !== action.toTerritoryId)
    .reduce((sum, item) => sum + item.armyCount, 0);
  return action.amount * (destinationThreat - sourceThreat);
}

function fortifyScore(
  observation: GameObservation,
  action: Extract<GameCommand, { type: 'FORTIFY' }>,
) {
  const sourceHostiles = hostileNeighbors(observation, action.fromTerritoryId);
  const targetHostiles = hostileNeighbors(observation, action.toTerritoryId);
  const targetPressure = targetHostiles.reduce(
    (sum, item) => sum + item.armyCount,
    0,
  );
  return (
    (sourceHostiles.length === 0 ? 8 : -sourceHostiles.length * 6) +
    targetHostiles.length * 5 +
    targetPressure * 1.5 +
    Math.min(action.amount, targetPressure) -
    (targetHostiles.length === 0 ? 10 : 0)
  );
}

function commandKey(action: GameCommand): string {
  return JSON.stringify(action);
}

function selectHighest(
  scored: { action: GameCommand; score: number }[],
  context: ControllerContext,
): GameCommand {
  const maximum = Math.max(...scored.map((item) => item.score));
  const tied = scored
    .filter((item) => item.score === maximum)
    .sort((left, right) =>
      commandKey(left.action).localeCompare(commandKey(right.action)),
    );
  return createSeededRandom(`${context.decisionSeed}|tie`).pick(tied).action;
}

export class HeuristicController implements PlayerController {
  readonly type = 'heuristic-bot' as const;
  readonly version = HEURISTIC_CONTROLLER_VERSION;

  async chooseAction(
    observation: GameObservation,
    legalActions: readonly LegalGameAction[],
    context: ControllerContext,
  ): Promise<GameCommand> {
    if (legalActions.length === 0) {
      throw new Error(
        `No legal command is available during ${observation.phase}.`,
      );
    }
    if (observation.phase === 'reinforce') {
      return selectHighest(
        legalActions
          .filter(
            (
              action,
            ): action is Extract<
              GameCommand,
              { type: 'PLACE_REINFORCEMENT' }
            > => action.type === 'PLACE_REINFORCEMENT',
          )
          .map((action) => ({
            action,
            score: reinforcementScore(observation, action),
          })),
        context,
      );
    }
    if (observation.phase === 'capture') {
      return selectHighest(
        legalActions
          .filter(
            (
              action,
            ): action is Extract<GameCommand, { type: 'MOVE_AFTER_CAPTURE' }> =>
              action.type === 'MOVE_AFTER_CAPTURE',
          )
          .map((action) => ({
            action,
            score: captureScore(observation, action),
          })),
        context,
      );
    }
    if (observation.phase === 'attack') {
      const scored = legalActions
        .filter(
          (action): action is Extract<GameCommand, { type: 'ATTACK' }> =>
            action.type === 'ATTACK',
        )
        .map((action) => ({ action, score: attackScore(observation, action) }));
      const best = scored.length
        ? Math.max(...scored.map((item) => item.score))
        : -Infinity;
      if (best < HEURISTIC_WEIGHTS.attackThreshold)
        return { type: 'END_ATTACK_PHASE' };
      return selectHighest(scored, context);
    }
    if (observation.phase === 'fortify') {
      const scored = legalActions
        .filter(
          (action): action is Extract<GameCommand, { type: 'FORTIFY' }> =>
            action.type === 'FORTIFY',
        )
        .map((action) => ({
          action,
          score: fortifyScore(observation, action),
        }));
      const best = scored.length
        ? Math.max(...scored.map((item) => item.score))
        : -Infinity;
      if (best < HEURISTIC_WEIGHTS.fortifyThreshold)
        return { type: 'SKIP_FORTIFY' };
      return selectHighest(scored, context);
    }
    return { type: 'END_TURN' };
  }
}

export const heuristicController = new HeuristicController();

export function controllerDecisionSeed(
  observation: GameObservation,
  decisionIndex: number,
): string {
  return `${observation.matchSeed}|controller|${HEURISTIC_CONTROLLER_VERSION}|${observation.activePlayerId}|${observation.turnNumber}|${observation.phase}|${decisionIndex}`;
}
