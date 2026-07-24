import type { LocalPlayerConfig } from '../core/setup/playerConfig';

export function hasHeuristicBot(
  players: readonly Pick<LocalPlayerConfig, 'controllerType'>[],
): boolean {
  return players.some((player) => player.controllerType === 'heuristic-bot');
}
