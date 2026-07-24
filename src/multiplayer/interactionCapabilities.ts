import type { MatchState } from '../core/game/types';
export interface MultiplayerInteractionCapabilities {
  canInspectTerritories: boolean;
  canIssueGameplayActions: boolean;
}

export type MultiplayerHudMode =
  'local' | 'interactive' | 'waiting' | 'completed';

export function multiplayerInteractionCapabilities(
  match: MatchState | null,
  session: { ownPlayerId: string | null } | null,
): MultiplayerInteractionCapabilities {
  if (session === null) {
    return {
      canInspectTerritories: true,
      canIssueGameplayActions: true,
    };
  }

  return {
    canInspectTerritories: match !== null,
    canIssueGameplayActions:
      match !== null &&
      session.ownPlayerId !== null &&
      match.activePlayerId === session.ownPlayerId,
  };
}

export function multiplayerHudMode(
  match: MatchState,
  session: { ownPlayerId: string | null } | null,
): MultiplayerHudMode {
  if (session === null) return 'local';
  if (match.phase === 'game-over') return 'completed';
  return multiplayerInteractionCapabilities(match, session)
    .canIssueGameplayActions
    ? 'interactive'
    : 'waiting';
}
