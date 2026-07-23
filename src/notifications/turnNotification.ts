import type { GamePhase } from '../core/game/types';
import type { LocalPlayerConfig } from '../core/setup/playerConfig';

export interface TurnObservation {
  sessionId: string;
  turnNumber: number;
  activePlayerId: string;
  activePlayerName: string;
  phase: GamePhase;
  recipientPlayerIds: readonly string[];
  revision?: number;
}

export interface TurnBaseline {
  sessionId: string;
  turnNumber: number;
  activePlayerId: string;
  revision?: number;
}

export interface TurnNotification {
  playerId: string;
  playerName: string;
  turnNumber: number;
}

export interface TurnDetectionResult {
  baseline: TurnBaseline | null;
  notification: TurnNotification | null;
}

function toBaseline(observation: TurnObservation): TurnBaseline {
  return {
    sessionId: observation.sessionId,
    turnNumber: observation.turnNumber,
    activePlayerId: observation.activePlayerId,
    revision: observation.revision,
  };
}

export function detectTurnNotification(
  baseline: TurnBaseline | null,
  observation: TurnObservation | null,
): TurnDetectionResult {
  if (observation === null) {
    return { baseline: null, notification: null };
  }

  const nextBaseline = toBaseline(observation);
  if (baseline === null || baseline.sessionId !== observation.sessionId) {
    return { baseline: nextBaseline, notification: null };
  }

  if (observation.turnNumber < baseline.turnNumber) {
    return { baseline, notification: null };
  }

  if (observation.turnNumber === baseline.turnNumber) {
    if (observation.activePlayerId !== baseline.activePlayerId) {
      return { baseline, notification: null };
    }
    const revision =
      baseline.revision === undefined
        ? observation.revision
        : observation.revision === undefined
          ? baseline.revision
          : Math.max(baseline.revision, observation.revision);
    return {
      baseline: {
        ...baseline,
        revision,
      },
      notification: null,
    };
  }

  if (
    baseline.revision !== undefined &&
    observation.revision !== undefined &&
    observation.revision <= baseline.revision
  ) {
    return { baseline, notification: null };
  }

  const recipient = observation.recipientPlayerIds.includes(
    observation.activePlayerId,
  );
  return {
    baseline: nextBaseline,
    notification:
      recipient && observation.phase !== 'game-over'
        ? {
            playerId: observation.activePlayerId,
            playerName: observation.activePlayerName,
            turnNumber: observation.turnNumber,
          }
        : null,
  };
}

export function resolveTurnRecipientIds(
  players: readonly LocalPlayerConfig[],
  claimedMultiplayerPlayerId: string | null,
): string[] {
  if (claimedMultiplayerPlayerId !== null) {
    return players.some((player) => player.id === claimedMultiplayerPlayerId)
      ? [claimedMultiplayerPlayerId]
      : [];
  }
  return players
    .filter((player) => player.controllerType === 'local-human')
    .map((player) => player.id);
}
