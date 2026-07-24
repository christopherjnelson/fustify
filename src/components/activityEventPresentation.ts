import {
  playerColorValue,
  type LocalPlayerConfig,
} from '../core/setup/playerConfig';
import type { MatchEvent } from '../core/game/types';

export interface ActivityParticipant {
  playerId: string;
  name: string;
  color: string;
}

export interface ActivityEventPresentation {
  actor?: ActivityParticipant;
  participants: ActivityParticipant[];
}

export function activityDisplayColor(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1]!, 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255];
  const luminance =
    0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  if (luminance >= 96) return color;
  const adjusted = channels.map((channel) =>
    Math.round(channel + (255 - channel) * 0.28),
  );
  return `#${adjusted
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function participant(
  playerId: string | undefined,
  players: readonly LocalPlayerConfig[],
): ActivityParticipant | undefined {
  if (!playerId) return undefined;
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) return undefined;
  return {
    playerId,
    name: player.name.trim() || `Player ${player.seatIndex + 1}`,
    color: activityDisplayColor(playerColorValue(player.colorId)),
  };
}

function participantIds(event: MatchEvent, actorId: string | undefined) {
  switch (event.type) {
    case 'combat':
      return [actorId, event.defenderPlayerId];
    case 'territory-captured':
      return [actorId, event.previousOwnerId];
    case 'player-eliminated':
      return [actorId, event.eliminatedPlayerId];
    case 'turn-started':
      return event.previousPlayerId && event.nextPlayerId
        ? [event.previousPlayerId, event.nextPlayerId]
        : [actorId];
    default:
      return [actorId];
  }
}

export function activityEventPresentation(
  event: MatchEvent,
  players: readonly LocalPlayerConfig[],
): ActivityEventPresentation {
  const actorId =
    event.actingPlayerId ??
    event.playerId ??
    (event.type === 'turn-started' ? event.nextPlayerId : undefined);
  const actor = participant(actorId, players);
  const seen = new Set<string>();
  const participants = participantIds(event, actorId).flatMap((playerId) => {
    const resolved = participant(playerId, players);
    if (!resolved || seen.has(resolved.playerId)) return [];
    seen.add(resolved.playerId);
    return [resolved];
  });
  return { actor, participants };
}
