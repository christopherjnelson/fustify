import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import { eventFocusTerritoryId } from '../core/game/eventFocus';
import type { MatchEvent } from '../core/game/types';
import { EventLogEntry } from './EventLog';

const planet = generatePlanet('event-log-focus-test', {
  territoryCount: 12,
  continentCount: 3,
  playerCount: 2,
});
const [source, target] = planet.territories;
const players = [
  {
    id: 'player-1',
    name: 'Player 1',
    seatIndex: 0,
    colorId: 'ember' as const,
    controllerType: 'local-human' as const,
  },
];

function event(
  type: MatchEvent['type'],
  metadata: Partial<MatchEvent> = {},
): MatchEvent {
  return {
    id: `${type}-1`,
    turnNumber: 1,
    type,
    message: 'Legacy event message.',
    ...metadata,
  };
}

describe('event log territory focus', () => {
  it('renders a compact accessible control and activates the target territory', () => {
    const onFocusTerritory = vi.fn();
    const combat = event('combat', {
      sourceTerritoryId: source!.id,
      targetTerritoryId: target!.id,
    });
    const entry = EventLogEntry({
      event: combat,
      planet,
      players,
      onFocusTerritory,
    }) as ReactElement<{ children: ReactElement[] }>;
    const button = entry.props.children[2] as ReactElement<{
      'aria-label': string;
      onClick: (event: { stopPropagation: () => void }) => void;
    }>;
    const stopPropagation = vi.fn();

    expect(
      renderToStaticMarkup(
        createElement(EventLogEntry, {
          event: combat,
          planet,
          players,
          onFocusTerritory,
        }),
      ),
    ).toContain(`aria-label="Focus ${target!.name}"`);
    button.props.onClick({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onFocusTerritory).toHaveBeenCalledWith(target!.id);
  });

  it('uses the destination for combat, capture, and fortification events', () => {
    for (const type of [
      'combat',
      'territory-captured',
      'fortification-completed',
    ] satisfies MatchEvent['type'][]) {
      expect(
        eventFocusTerritoryId(
          event(type, {
            sourceTerritoryId: source!.id,
            targetTerritoryId: target!.id,
          }),
        ),
      ).toBe(target!.id);
    }
  });

  it('omits focus for legacy, location-free, and invalid references', () => {
    const onFocusTerritory = vi.fn();
    const locationFree = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: event('turn-ended'),
        planet,
        players,
        onFocusTerritory,
      }),
    );
    const invalid = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: event('armies-placed', { primaryTerritoryId: 'stale-id' }),
        planet,
        players,
        onFocusTerritory,
      }),
    );

    expect(locationFree).not.toContain('<button');
    expect(invalid).not.toContain('<button');
    expect(onFocusTerritory).not.toHaveBeenCalled();
  });
});
