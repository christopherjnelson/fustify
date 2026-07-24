import type {
  CSSProperties,
  MouseEvent,
  RefObject,
  UIEventHandler,
} from 'react';
import { formatMatchEventParts } from '../core/game/eventFormatter';
import { eventFocusTerritoryId } from '../core/game/eventFocus';
import type { MatchEvent } from '../core/game/types';
import type { PlanetDefinition } from '../core/types/planet';
import {
  playerColorValue,
  type LocalPlayerConfig,
} from '../core/setup/playerConfig';
import {
  isReactableMatchEvent,
  type ActivityReactionController,
} from '../multiplayer/matchEventReactions';
import { EventReactions } from './EventReactions';
import { MatchEventIcon } from './MatchEventIcon';
import {
  activityDisplayColor,
  activityEventPresentation,
} from './activityEventPresentation';

interface ActivityRowStyle extends CSSProperties {
  '--event-player-color'?: string;
}

interface EventLogEntryProps {
  event: MatchEvent;
  planet: PlanetDefinition;
  players: LocalPlayerConfig[];
  onFocusTerritory: (territoryId: string) => void;
  reactions?: ActivityReactionController;
}

export function EventLogEntry({
  event,
  planet,
  players,
  onFocusTerritory,
  reactions,
}: EventLogEntryProps) {
  const focusTerritoryId = eventFocusTerritoryId(event);
  const focusTerritory = focusTerritoryId
    ? planet.territories.find((territory) => territory.id === focusTerritoryId)
    : undefined;
  const presentation = activityEventPresentation(event, players);
  const formattedParts = formatMatchEventParts(event, { planet, players });
  const rowStyle: ActivityRowStyle | undefined = presentation.actor
    ? { '--event-player-color': presentation.actor.color }
    : undefined;

  const focus = (clickEvent: MouseEvent<HTMLButtonElement>) => {
    clickEvent.stopPropagation();
    if (focusTerritory) onFocusTerritory(focusTerritory.id);
  };

  return (
    <li
      className={presentation.actor ? 'has-event-actor' : undefined}
      style={rowStyle}
      data-actor-player-id={presentation.actor?.playerId}
    >
      <span className="event-icon-context">
        <MatchEventIcon event={event} />
        {presentation.participants.length > 0 && (
          <span className="event-participants" aria-hidden="true">
            {presentation.participants.map((participant) => (
              <span
                key={participant.playerId}
                className="event-participant-marker"
                data-player-id={participant.playerId}
                style={{ backgroundColor: participant.color }}
              />
            ))}
          </span>
        )}
      </span>
      <span className="event-copy">
        <span className="event-turn">T{event.turnNumber}</span>
        <span className="event-description">
          {formattedParts.map((part, index) => {
            if (part.type === 'player') {
              const player = players.find(
                (candidate) => candidate.id === part.playerId,
              );
              const color = player
                ? activityDisplayColor(playerColorValue(player.colorId))
                : undefined;
              return (
                <span
                  key={index}
                  className="event-player-name"
                  data-player-id={part.playerId || undefined}
                  style={color ? { color } : undefined}
                >
                  {part.value}
                </span>
              );
            }
            if (part.type === 'territory') {
              return (
                <span
                  key={index}
                  className="event-territory-name"
                  data-territory-id={part.territoryId || undefined}
                >
                  {part.value}
                </span>
              );
            }
            return part.value;
          })}
        </span>
        {reactions && isReactableMatchEvent(event) && (
          <EventReactions
            eventId={event.id}
            summary={reactions.summaries[event.id]}
            pending={reactions.pendingEventIds.has(event.id)}
            error={reactions.errors[event.id]}
            onSetReaction={(reaction) =>
              reactions.setReaction(event.id, reaction)
            }
          />
        )}
      </span>
      {focusTerritory && (
        <button
          type="button"
          className="event-focus-button"
          aria-label={`Focus ${focusTerritory.name || `territory ${focusTerritory.id}`}`}
          onClick={focus}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <circle cx="8.5" cy="8.5" r="5" />
            <path d="m12.2 12.2 4.1 4.1" />
          </svg>
        </button>
      )}
    </li>
  );
}

export function EventLog({
  events,
  planet,
  players,
  onFocusTerritory,
  listRef,
  onScroll,
  reactions,
}: {
  events: MatchEvent[];
  planet: PlanetDefinition;
  players: LocalPlayerConfig[];
  onFocusTerritory: (territoryId: string) => void;
  listRef?: RefObject<HTMLOListElement | null>;
  onScroll?: UIEventHandler<HTMLOListElement>;
  reactions?: ActivityReactionController;
}) {
  return (
    <section className="event-log" aria-label="Match activity">
      <ol ref={listRef} onScroll={onScroll} tabIndex={0}>
        {events.map((event, index) => (
          <EventLogEntry
            key={event.id || `legacy-event-${index}`}
            event={event}
            planet={planet}
            players={players}
            onFocusTerritory={onFocusTerritory}
            reactions={reactions}
          />
        ))}
      </ol>
    </section>
  );
}
