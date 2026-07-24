import type { LocalPlayerConfig } from '../core/setup/playerConfig';
import type { GamePhase } from '../core/game/types';

export function hasHeuristicBot(
  players: readonly Pick<LocalPlayerConfig, 'controllerType'>[],
): boolean {
  return players.some((player) => player.controllerType === 'heuristic-bot');
}

export function isBotPlaybackControlVisible({
  multiplayer,
  hasLocalBots,
  botControlled,
  phase,
}: {
  multiplayer: boolean;
  hasLocalBots: boolean;
  botControlled: boolean;
  phase: GamePhase;
}) {
  return !multiplayer && hasLocalBots && botControlled && phase !== 'game-over';
}
