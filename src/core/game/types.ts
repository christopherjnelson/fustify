export type GamePhase =
  'reinforce' | 'attack' | 'capture' | 'fortify' | 'turn-end' | 'game-over';

export interface TerritoryMatchState {
  ownerId: string;
  armyCount: number;
}

export interface PlayerMatchState {
  playerId: string;
  eliminated: boolean;
}

export type MatchEventType =
  | 'turn-started'
  | 'reinforcements-received'
  | 'armies-placed'
  | 'combat'
  | 'territory-captured'
  | 'player-eliminated'
  | 'capture-move'
  | 'fortification-completed'
  | 'fortification-skipped'
  | 'turn-ended'
  | 'match-won';

export interface MatchEvent {
  id: string;
  turnNumber: number;
  type: MatchEventType;
  message: string;
  playerId?: string;
  territoryId?: string;
  attackerRolls?: number[];
  defenderRolls?: number[];
  attackerLosses?: number;
  defenderLosses?: number;
}

export interface PendingCapture {
  fromTerritoryId: string;
  toTerritoryId: string;
  minimumArmies: number;
}

export interface MatchState {
  matchId: string;
  seed: string;
  turnNumber: number;
  activePlayerId: string;
  phase: GamePhase;
  remainingReinforcements: number;
  territories: Record<string, TerritoryMatchState>;
  players: Record<string, PlayerMatchState>;
  selectedSourceTerritoryId: string | null;
  selectedTargetTerritoryId: string | null;
  pendingCapture: PendingCapture | null;
  combatSequence: number;
  fortifiedThisTurn: boolean;
  recentlyCapturedTerritoryId: string | null;
  winnerId: string | null;
  events: MatchEvent[];
}

export type GameAction =
  | { type: 'SELECT_TERRITORY'; territoryId: string | null }
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
  | { type: 'END_TURN' }
  | { type: 'RESET_MATCH' };

export type GameErrorCode =
  | 'WRONG_PHASE'
  | 'UNKNOWN_TERRITORY'
  | 'NOT_OWNER'
  | 'INVALID_AMOUNT'
  | 'REINFORCEMENTS_REMAIN'
  | 'INVALID_SOURCE'
  | 'INVALID_TARGET'
  | 'NOT_ADJACENT'
  | 'INVALID_DICE'
  | 'CAPTURE_MOVE_REQUIRED'
  | 'NO_OWNED_PATH'
  | 'FORTIFY_ALREADY_USED'
  | 'GAME_OVER';

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export interface GameTransition {
  state: MatchState;
  error: GameError | null;
}
