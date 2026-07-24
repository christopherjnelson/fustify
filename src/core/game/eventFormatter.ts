import type { LocalPlayerConfig } from '../setup/playerConfig.ts';
import type { TerritoryDefinition } from '../types/territory.ts';
import type { MatchEvent } from './types.ts';

export interface EventDisplayContext {
  planet: {
    territories: readonly Pick<TerritoryDefinition, 'id' | 'name'>[];
  };
  players: readonly Pick<LocalPlayerConfig, 'id' | 'name' | 'seatIndex'>[];
}

export type FormattedEventPart =
  | { type: 'text'; value: string }
  | { type: 'player'; playerId: string; value: string }
  | { type: 'territory'; territoryId: string; value: string };

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

function text(value: string): FormattedEventPart {
  return { type: 'text', value };
}

function player(
  playerId: string | undefined,
  players: EventDisplayContext['players'],
): FormattedEventPart {
  return {
    type: 'player',
    playerId: playerId ?? '',
    value: playerName(playerId, players),
  };
}

function territory(
  territoryId: string | undefined,
  planet: EventDisplayContext['planet'],
): FormattedEventPart {
  return {
    type: 'territory',
    territoryId: territoryId ?? '',
    value: territoryName(territoryId, planet),
  };
}

export function formatMatchEventParts(
  event: MatchEvent,
  { planet, players }: EventDisplayContext,
): FormattedEventPart[] {
  const actorId = event.actingPlayerId ?? event.playerId;
  const actor = () => player(actorId, players);
  const source = () => territory(event.sourceTerritoryId, planet);
  const targetId =
    event.targetTerritoryId ?? event.primaryTerritoryId ?? event.territoryId;
  const target = () => territory(targetId, planet);
  const fallback = () => [text(event.message)];

  switch (event.type) {
    case 'turn-started':
      if (event.previousPlayerId && event.nextPlayerId) {
        return [
          text('Turn passed from '),
          player(event.previousPlayerId, players),
          text(' to '),
          player(event.nextPlayerId, players),
          text('.'),
        ];
      }
      return [actor(), text(` began turn ${event.turnNumber}.`)];
    case 'reinforcements-received':
      return event.armyCount !== undefined
        ? [actor(), text(` received ${armies(event.armyCount)}.`)]
        : fallback();
    case 'armies-placed':
      return event.armyCount !== undefined
        ? [
            actor(),
            text(' reinforced '),
            target(),
            text(` with ${armies(event.armyCount)}.`),
          ]
        : fallback();
    case 'combat':
      if (
        event.sourceTerritoryId &&
        event.targetTerritoryId &&
        event.attackerLosses !== undefined &&
        event.defenderLosses !== undefined
      ) {
        return [
          actor(),
          text(' attacked '),
          target(),
          text(' from '),
          source(),
          text(': '),
          actor(),
          text(` lost ${armies(event.attackerLosses)} and `),
          player(event.defenderPlayerId, players),
          text(` lost ${armies(event.defenderLosses)}.`),
        ];
      }
      return fallback();
    case 'territory-captured':
      return event.targetTerritoryId && event.previousOwnerId
        ? [
            actor(),
            text(' captured '),
            target(),
            text(' from '),
            player(event.previousOwnerId, players),
            text('.'),
          ]
        : fallback();
    case 'player-eliminated':
      return event.eliminatedPlayerId
        ? [
            player(event.eliminatedPlayerId, players),
            text(' was eliminated by '),
            actor(),
            text('.'),
          ]
        : fallback();
    case 'capture-move':
      return event.sourceTerritoryId &&
        event.targetTerritoryId &&
        event.armyCount !== undefined
        ? [
            actor(),
            text(` moved ${armies(event.armyCount)} from `),
            source(),
            text(' into captured '),
            target(),
            text('.'),
          ]
        : fallback();
    case 'attack-phase-ended':
      return [actor(), text(' ended the attack phase.')];
    case 'fortification-completed':
      return event.sourceTerritoryId &&
        event.targetTerritoryId &&
        event.armyCount !== undefined
        ? [
            actor(),
            text(' fortified '),
            target(),
            text(` with ${armies(event.armyCount)} from `),
            source(),
            text('.'),
          ]
        : fallback();
    case 'fortification-skipped':
      return [actor(), text(' skipped fortification.')];
    case 'turn-ended':
      return [actor(), text(` ended turn ${event.turnNumber}.`)];
    case 'match-won':
      return [actor(), text(' conquered the world.')];
    default:
      return fallback();
  }
}

export function formatMatchEvent(
  event: MatchEvent,
  context: EventDisplayContext,
): string {
  return formatMatchEventParts(event, context)
    .map((part) => part.value)
    .join('');
}
