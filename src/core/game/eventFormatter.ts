import type { LocalPlayerConfig } from '../setup/playerConfig.ts';
import type { TerritoryDefinition } from '../types/territory.ts';
import type { MatchEvent } from './types.ts';

export interface EventDisplayContext {
  planet: {
    territories: readonly Pick<TerritoryDefinition, 'id' | 'name'>[];
  };
  players: readonly Pick<LocalPlayerConfig, 'id' | 'name' | 'seatIndex'>[];
}

function playerName(
  playerId: string | undefined,
  players: EventDisplayContext['players'],
): string {
  const player = players.find((candidate) => candidate.id === playerId);
  const configuredName = player?.name.trim();
  if (configuredName) return configuredName;
  if (player) return `Player ${player.seatIndex + 1}`;

  const generatedPlayer = playerId?.match(/^player-0*(\d+)$/i);
  if (generatedPlayer) return `Player ${Number(generatedPlayer[1])}`;
  if (playerId && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(playerId)) {
    return playerId;
  }
  return 'Unknown player';
}

function territoryName(
  territoryId: string | undefined,
  planet: EventDisplayContext['planet'],
): string {
  if (!territoryId) return 'Unknown territory';
  const name = planet.territories
    .find((territory) => territory.id === territoryId)
    ?.name.trim();
  return name && name !== territoryId
    ? `${name} (${territoryId})`
    : `Territory ${territoryId}`;
}

function armies(count: number): string {
  return `${count} ${count === 1 ? 'army' : 'armies'}`;
}

export function formatMatchEvent(
  event: MatchEvent,
  { planet, players }: EventDisplayContext,
): string {
  const actorId = event.actingPlayerId ?? event.playerId;
  const actor = playerName(actorId, players);
  const source = territoryName(event.sourceTerritoryId, planet);
  const target = territoryName(
    event.targetTerritoryId ?? event.primaryTerritoryId ?? event.territoryId,
    planet,
  );

  switch (event.type) {
    case 'turn-started':
      if (event.previousPlayerId && event.nextPlayerId) {
        return `Turn passed from ${playerName(event.previousPlayerId, players)} to ${playerName(event.nextPlayerId, players)}.`;
      }
      return `${actor} began turn ${event.turnNumber}.`;
    case 'reinforcements-received':
      return event.armyCount !== undefined
        ? `${actor} received ${armies(event.armyCount)}.`
        : event.message;
    case 'armies-placed':
      return event.armyCount !== undefined
        ? `${actor} reinforced ${target} with ${armies(event.armyCount)}.`
        : event.message;
    case 'combat':
      if (
        event.sourceTerritoryId &&
        event.targetTerritoryId &&
        event.attackerLosses !== undefined &&
        event.defenderLosses !== undefined
      ) {
        const defender = playerName(event.defenderPlayerId, players);
        return `${actor} attacked ${target} from ${source}: ${actor} lost ${armies(event.attackerLosses)} and ${defender} lost ${armies(event.defenderLosses)}.`;
      }
      return event.message;
    case 'territory-captured':
      return event.targetTerritoryId && event.previousOwnerId
        ? `${actor} captured ${target} from ${playerName(event.previousOwnerId, players)}.`
        : event.message;
    case 'player-eliminated':
      return event.eliminatedPlayerId
        ? `${playerName(event.eliminatedPlayerId, players)} was eliminated by ${actor}.`
        : event.message;
    case 'capture-move':
      return event.sourceTerritoryId &&
        event.targetTerritoryId &&
        event.armyCount !== undefined
        ? `${actor} moved ${armies(event.armyCount)} from ${source} into captured ${target}.`
        : event.message;
    case 'attack-phase-ended':
      return `${actor} ended the attack phase.`;
    case 'fortification-completed':
      return event.sourceTerritoryId &&
        event.targetTerritoryId &&
        event.armyCount !== undefined
        ? `${actor} fortified ${target} with ${armies(event.armyCount)} from ${source}.`
        : event.message;
    case 'fortification-skipped':
      return `${actor} skipped fortification.`;
    case 'turn-ended':
      return `${actor} ended turn ${event.turnNumber}.`;
    case 'match-won':
      return `${actor} conquered the world.`;
    default:
      return event.message;
  }
}
