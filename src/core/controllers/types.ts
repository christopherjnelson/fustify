import type { GamePhase, MatchEvent, TerritoryMatchState } from '../game/types';
import type { PlayerControllerType } from '../setup/playerConfig';

export const HEURISTIC_CONTROLLER_VERSION = 'balanced-v1';

export type GameCommand =
  | { type: 'PLACE_REINFORCEMENT'; territoryId: string; amount: number }
  | {
      type: 'ATTACK';
      fromTerritoryId: string;
      toTerritoryId: string;
      attackDice: number;
    }
  | {
      type: 'MOVE_AFTER_CAPTURE';
      fromTerritoryId: string;
      toTerritoryId: string;
      amount: number;
    }
  | { type: 'END_ATTACK_PHASE' }
  | {
      type: 'FORTIFY';
      fromTerritoryId: string;
      toTerritoryId: string;
      amount: number;
    }
  | { type: 'SKIP_FORTIFY' }
  | { type: 'END_TURN' };

export type LegalGameAction = GameCommand;

export interface ObservedTerritory {
  readonly id: string;
  readonly name: string;
  readonly continentId: string;
  readonly adjacentTerritoryIds: readonly string[];
  readonly ownerId: string;
  readonly armyCount: number;
}

export interface ObservedContinent {
  readonly id: string;
  readonly name: string;
  readonly territoryIds: readonly string[];
  readonly bonus: number;
}

export interface GameObservation {
  readonly matchId: string;
  readonly matchSeed: string;
  readonly turnNumber: number;
  readonly phase: GamePhase;
  readonly activePlayerId: string;
  readonly remainingReinforcements: number;
  readonly territories: Readonly<Record<string, ObservedTerritory>>;
  readonly continents: readonly ObservedContinent[];
  readonly players: Readonly<
    Record<string, { readonly playerId: string; readonly eliminated: boolean }>
  >;
  readonly pendingCapture: Readonly<{
    fromTerritoryId: string;
    toTerritoryId: string;
    minimumArmies: number;
  }> | null;
  readonly publicEvents: readonly Readonly<MatchEvent>[];
}

export interface ControllerContext {
  readonly controllerType: PlayerControllerType;
  readonly controllerVersion: string;
  readonly controllerStreamId: string;
  readonly decisionIndex: number;
  readonly decisionSeed: string;
}

export interface PlayerController {
  readonly type: PlayerControllerType;
  readonly version: string;
  chooseAction(
    observation: GameObservation,
    legalActions: readonly LegalGameAction[],
    context: ControllerContext,
  ): Promise<GameCommand>;
}

export interface CommandFingerprint {
  matchId: string;
  activePlayerId: string;
  turnNumber: number;
  phase: GamePhase;
  combatSequence: number;
  eventCount: number;
}

export type TerritoryStateSnapshot = Readonly<
  Record<string, Readonly<TerritoryMatchState>>
>;
