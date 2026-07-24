import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import { eventFocusTerritoryId } from '../core/game/eventFocus';
import type { MatchEvent } from '../core/game/types';
import { EventLogEntry } from './EventLog';
import { MatchEventIcon } from './MatchEventIcon';
import { matchEventIconName } from './matchEventIconName';
import type { ActivityReactionController } from '../multiplayer/matchEventReactions';

const planet = generatePlanet('event-log-focus-test', {
  territoryCount: 12,
  continentCount: 3,
  playerCount: 2,
});
const [source, target] = planet.territories;
const players = [
  {
    id: 'player-1',
    name: 'Crimson League',
    seatIndex: 0,
    colorId: 'color-1',
    controllerType: 'local-human' as const,
  },
  {
    id: 'player-2',
    name: 'Azure Pact',
    seatIndex: 1,
    colorId: 'color-2',
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

    const markup = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: combat,
        planet,
        players,
        onFocusTerritory,
      }),
    );
    expect(markup).toContain(`aria-label="Focus ${target!.name}"`);
    expect(markup).toContain('<svg');
    expect(markup).not.toContain('>Focus</button>');
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

describe('match event icons', () => {
  it('maps structured event types and renders a generic legacy fallback', () => {
    const mappings = [
      ['reinforcements-received', 'reinforcement'],
      ['armies-placed', 'reinforcement'],
      ['combat', 'combat'],
      ['territory-captured', 'capture'],
      ['capture-move', 'movement'],
      ['fortification-completed', 'fortification'],
      ['fortification-skipped', 'fortification'],
      ['turn-started', 'turn'],
      ['attack-phase-ended', 'turn'],
      ['turn-ended', 'turn'],
      ['match-won', 'victory'],
      ['player-eliminated', 'elimination'],
    ] satisfies [MatchEvent['type'], ReturnType<typeof matchEventIconName>][];

    for (const [type, icon] of mappings) {
      const structured = event(type);
      expect(matchEventIconName(structured)).toBe(icon);
      expect(
        renderToStaticMarkup(
          createElement(MatchEventIcon, { event: structured }),
        ),
      ).toContain(`data-event-icon="${icon}"`);
    }

    const legacy = {
      ...event('turn-ended'),
      type: 'legacy-event',
    } as unknown as MatchEvent;
    expect(matchEventIconName(legacy)).toBe('generic');
    expect(
      renderToStaticMarkup(createElement(MatchEventIcon, { event: legacy })),
    ).toContain('data-event-icon="generic"');
  });
});

describe('multiplayer Activity reaction eligibility', () => {
  const reactions: ActivityReactionController = {
    summaries: {},
    pendingEventIds: new Set(),
    errors: {},
    setReaction: vi.fn(),
  };

  it('shows Add reaction only for canonical authoritative multiplayer events', () => {
    const canonical = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: event('turn-started', { id: 'event-1' }),
        planet,
        players,
        onFocusTerritory: vi.fn(),
        reactions,
      }),
    );
    const local = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: event('turn-started', { id: 'event-1' }),
        planet,
        players,
        onFocusTerritory: vi.fn(),
      }),
    );
    expect(canonical).toContain('aria-label="Add reaction"');
    expect(canonical).not.toContain('event-reaction-button');
    expect(canonical).not.toContain('class="event-turn"');
    expect(local).not.toContain('event-reactions');
  });

  it('keeps legacy events rendering without an enabled reaction interface', () => {
    const legacy = {
      ...event('turn-ended'),
      id: undefined,
      type: 'legacy-event',
    } as unknown as MatchEvent;
    const markup = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: legacy,
        planet,
        players,
        onFocusTerritory: vi.fn(),
        reactions,
      }),
    );
    expect(markup).toContain('Legacy event message.');
    expect(markup).not.toContain('event-reactions');
  });
});

describe('Activity player context', () => {
  it('adds actor accent, icon tint, and structured name colors without participant markers', () => {
    const markup = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: event('combat', {
          actingPlayerId: 'player-1',
          defenderPlayerId: 'player-2',
          sourceTerritoryId: source!.id,
          targetTerritoryId: target!.id,
          attackerLosses: 1,
          defenderLosses: 2,
        }),
        planet,
        players,
        onFocusTerritory: vi.fn(),
      }),
    );

    expect(markup).toContain('class="has-event-actor"');
    expect(markup).toContain('--event-player-color:#e24f4f');
    expect(markup).toContain('data-player-id="player-1"');
    expect(markup).toContain('data-player-id="player-2"');
    expect(markup).not.toContain('event-participant-marker');
    expect(markup).toContain(
      'class="event-player-name" data-player-id="player-1" style="color:#e24f4f"',
    );
    expect(markup).toContain(
      'class="event-player-name" data-player-id="player-2" style="color:#3f91e8"',
    );
    expect(markup).toContain('class="event-territory-name"');
  });

  it('does not render participant markers for reinforcement or movement', () => {
    for (const type of [
      'armies-placed',
      'fortification-completed',
      'capture-move',
    ] satisfies MatchEvent['type'][]) {
      const markup = renderToStaticMarkup(
        createElement(EventLogEntry, {
          event: event(type, {
            actingPlayerId: 'player-1',
            sourceTerritoryId: source!.id,
            targetTerritoryId: target!.id,
            primaryTerritoryId: target!.id,
            armyCount: 2,
          }),
          planet,
          players,
          onFocusTerritory: vi.fn(),
        }),
      );
      expect(markup).not.toContain('event-participant-marker');
      expect(markup).not.toContain('data-player-id="player-2"');
    }
  });

  it('keeps unresolved legacy player metadata neutral', () => {
    const legacy = {
      ...event('turn-ended'),
      type: 'legacy-event',
      actingPlayerId: 'missing-player',
    } as unknown as MatchEvent;
    const markup = renderToStaticMarkup(
      createElement(EventLogEntry, {
        event: legacy,
        planet,
        players,
        onFocusTerritory: vi.fn(),
      }),
    );
    expect(markup).not.toContain('has-event-actor');
    expect(markup).not.toContain('event-participant-marker');
    expect(markup).toContain('Legacy event message.');
  });
});
