import type { MouseEvent, RefObject, UIEventHandler } from 'react';
import { formatMatchEvent } from '../core/game/eventFormatter';
import { eventFocusTerritoryId } from '../core/game/eventFocus';
import type { MatchEvent } from '../core/game/types';
import type { PlanetDefinition } from '../core/types/planet';
import type { LocalPlayerConfig } from '../core/setup/playerConfig';
import { MatchEventIcon } from './MatchEventIcon';

interface EventLogEntryProps {
  event: MatchEvent;
  planet: PlanetDefinition;
  players: LocalPlayerConfig[];
  onFocusTerritory: (territoryId: string) => void;
}

export function EventLogEntry({
  event,
  planet,
  players,
  onFocusTerritory,
}: EventLogEntryProps) {
  const focusTerritoryId = eventFocusTerritoryId(event);
  const focusTerritory = focusTerritoryId
    ? planet.territories.find((territory) => territory.id === focusTerritoryId)
    : undefined;

  const focus = (clickEvent: MouseEvent<HTMLButtonElement>) => {
    clickEvent.stopPropagation();
    if (focusTerritory) onFocusTerritory(focusTerritory.id);
  };

  return (
    <li>
      <MatchEventIcon event={event} />
      <span className="event-copy">
        <span className="event-turn">T{event.turnNumber}</span>
        <span className="event-description">
          {formatMatchEvent(event, { planet, players })}
        </span>
      </span>
      {focusTerritory && (
        <button
          type="button"
          className="event-focus-button"
          aria-label={`Focus ${focusTerritory.name || `territory ${focusTerritory.id}`}`}
          onClick={focus}
        >
          Focus
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
}: {
  events: MatchEvent[];
  planet: PlanetDefinition;
  players: LocalPlayerConfig[];
  onFocusTerritory: (territoryId: string) => void;
  listRef?: RefObject<HTMLOListElement | null>;
  onScroll?: UIEventHandler<HTMLOListElement>;
}) {
  return (
    <section className="event-log" aria-label="Match activity">
      <ol ref={listRef} onScroll={onScroll} tabIndex={0}>
        {events.map((event) => (
          <EventLogEntry
            key={event.id}
            event={event}
            planet={planet}
            players={players}
            onFocusTerritory={onFocusTerritory}
          />
        ))}
      </ol>
    </section>
  );
}
