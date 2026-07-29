import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../core/game/types';
import {
  actionCueFromEvent,
  angularDistanceDegrees,
  reconcileActionEvents,
  shouldRecenterAction,
  transitionFollowAction,
} from './actionTracking';

function event(
  id: string,
  type: MatchEvent['type'],
  fields: Partial<MatchEvent> = {},
): MatchEvent {
  return {
    id,
    turnNumber: 1,
    type,
    message: `${type} fixture`,
    ...fields,
  };
}

describe('action event tracking', () => {
  it('baselines restored history without presenting or replaying a cue', () => {
    const events = [
      event('event-1', 'armies-placed', {
        primaryTerritoryId: 'territory-a',
      }),
    ];
    const initial = reconcileActionEvents(null, 'match-a', events);

    expect(initial.cue).toBeNull();
    expect(initial.beamCue).toBeNull();
    expect(initial.tracking.eventIds).toEqual(['event-1']);

    const replacement = reconcileActionEvents(
      initial.tracking,
      'match-a',
      events.map((item) => ({ ...item })),
    );
    expect(replacement.cue).toBeNull();
    expect(replacement.beamCue).toBeNull();
    expect(replacement.tracking.sequence).toBe(0);
  });

  it('coalesces an appended command batch to its latest focusable map action', () => {
    const initial = reconcileActionEvents(null, 'match-a', []);
    const events = [
      event('combat', 'combat', {
        actingPlayerId: 'player-a',
        sourceTerritoryId: 'territory-a',
        targetTerritoryId: 'territory-b',
        primaryTerritoryId: 'territory-b',
      }),
      event('captured', 'territory-captured', {
        actingPlayerId: 'player-a',
        sourceTerritoryId: 'territory-a',
        targetTerritoryId: 'territory-b',
        primaryTerritoryId: 'territory-b',
      }),
      event('eliminated', 'player-eliminated'),
    ];
    const appended = reconcileActionEvents(initial.tracking, 'match-a', events);

    expect(appended.cue).toMatchObject({
      eventId: 'captured',
      actingPlayerId: 'player-a',
      kind: 'capture',
      sourceTerritoryId: 'territory-a',
      targetTerritoryId: 'territory-b',
      sequence: 1,
    });
    expect(appended.beamCue).toMatchObject({
      eventId: 'combat',
      actingPlayerId: 'player-a',
      kind: 'combat',
      sourceTerritoryId: 'territory-a',
      targetTerritoryId: 'territory-b',
      sequence: 1,
    });
  });

  it('does not treat non-append replacements or non-map events as actions', () => {
    const initial = reconcileActionEvents(null, 'match-a', [
      event('old', 'turn-started'),
    ]);
    const replacement = reconcileActionEvents(initial.tracking, 'match-a', [
      event('different', 'turn-started'),
    ]);
    expect(replacement.cue).toBeNull();
    expect(replacement.beamCue).toBeNull();

    const appended = reconcileActionEvents(replacement.tracking, 'match-a', [
      event('different', 'turn-started'),
      event('phase', 'attack-phase-ended'),
    ]);
    expect(appended.cue).toBeNull();
    expect(appended.beamCue).toBeNull();
    expect(appended.tracking.sequence).toBe(0);
  });

  it('retriggers repeated actions at the same territory with a new sequence', () => {
    const initial = reconcileActionEvents(null, 'match-a', []);
    const firstEvents = [
      event('first', 'armies-placed', {
        primaryTerritoryId: 'territory-a',
      }),
    ];
    const first = reconcileActionEvents(
      initial.tracking,
      'match-a',
      firstEvents,
    );
    const second = reconcileActionEvents(first.tracking, 'match-a', [
      ...firstEvents,
      event('second', 'armies-placed', {
        primaryTerritoryId: 'territory-a',
      }),
    ]);

    expect(first.cue?.sequence).toBe(1);
    expect(first.beamCue).toBeNull();
    expect(second.cue).toMatchObject({
      targetTerritoryId: 'territory-a',
      sequence: 2,
    });
    expect(second.beamCue).toBeNull();
  });

  it('resets its baseline when the match changes', () => {
    const first = reconcileActionEvents(null, 'match-a', []);
    const changed = reconcileActionEvents(first.tracking, 'match-b', [
      event('existing', 'fortification-completed', {
        primaryTerritoryId: 'territory-b',
      }),
    ]);

    expect(changed.cue).toBeNull();
    expect(changed.beamCue).toBeNull();
    expect(changed.tracking).toMatchObject({
      matchId: 'match-b',
      sequence: 0,
    });
  });

  it.each([
    ['armies-placed', 'territory-a'],
    ['capture-move', 'territory-b'],
    ['fortification-completed', 'territory-b'],
  ] as const)(
    'keeps %s as a general cue without creating a beam cue',
    (type, targetTerritoryId) => {
      const initial = reconcileActionEvents(null, 'match-a', []);
      const appended = reconcileActionEvents(initial.tracking, 'match-a', [
        event(type, type, {
          actingPlayerId: 'player-a',
          sourceTerritoryId: 'territory-a',
          targetTerritoryId,
          primaryTerritoryId: targetTerritoryId,
        }),
      ]);

      expect(appended.cue?.kind).not.toBe('combat');
      expect(appended.beamCue).toBeNull();
    },
  );

  it('creates a new combat beam cue for repeated attacks', () => {
    const initial = reconcileActionEvents(null, 'match-a', []);
    const firstEvents = [
      event('combat-1', 'combat', {
        primaryTerritoryId: 'territory-b',
      }),
    ];
    const first = reconcileActionEvents(
      initial.tracking,
      'match-a',
      firstEvents,
    );
    const second = reconcileActionEvents(first.tracking, 'match-a', [
      ...firstEvents,
      event('combat-2', 'combat', {
        primaryTerritoryId: 'territory-b',
      }),
    ]);

    expect(first.beamCue).toMatchObject({ eventId: 'combat-1', sequence: 1 });
    expect(second.beamCue).toMatchObject({ eventId: 'combat-2', sequence: 2 });
  });

  it('maps reinforcement to a target-only cyan cue', () => {
    expect(
      actionCueFromEvent(
        'match-a',
        event('placed', 'armies-placed', {
          playerId: 'legacy-player',
          sourceTerritoryId: 'legacy-source',
          primaryTerritoryId: 'territory-a',
        }),
        3,
      ),
    ).toEqual({
      matchId: 'match-a',
      eventId: 'placed',
      actingPlayerId: 'legacy-player',
      sourceTerritoryId: null,
      targetTerritoryId: 'territory-a',
      kind: 'reinforcement',
      sequence: 3,
    });
  });

  it('prefers acting player identity and safely handles missing legacy identity', () => {
    expect(
      actionCueFromEvent(
        'match-a',
        event('modern', 'armies-placed', {
          actingPlayerId: 'acting-player',
          playerId: 'legacy-player',
          primaryTerritoryId: 'territory-a',
        }),
        1,
      )?.actingPlayerId,
    ).toBe('acting-player');
    expect(
      actionCueFromEvent(
        'match-a',
        event('legacy', 'armies-placed', {
          primaryTerritoryId: 'territory-a',
        }),
        2,
      )?.actingPlayerId,
    ).toBeNull();
  });

  it.each([
    ['combat', 'combat'],
    ['territory-captured', 'capture'],
    ['capture-move', 'movement'],
    ['fortification-completed', 'fortification'],
  ] as const)('maps %s to a source and destination cue', (type, kind) => {
    expect(
      actionCueFromEvent(
        'match-a',
        event(type, type, {
          sourceTerritoryId: 'territory-a',
          targetTerritoryId: 'territory-b',
        }),
        1,
      ),
    ).toMatchObject({
      kind,
      sourceTerritoryId: 'territory-a',
      targetTerritoryId: 'territory-b',
    });
  });
});

describe('follow action presentation rules', () => {
  it('moves only outside the 25 degree central safe area', () => {
    const current = { longitude: 0, latitude: 0 };
    expect(angularDistanceDegrees(current, current)).toBeCloseTo(0);
    expect(
      shouldRecenterAction(current, { longitude: 24.9, latitude: 0 }),
    ).toBe(false);
    expect(
      shouldRecenterAction(current, { longitude: 25.1, latitude: 0 }),
    ).toBe(true);
  });

  it('pauses only active following and requires an explicit enable to resume', () => {
    expect(transitionFollowAction('off', 'pause')).toBe('off');
    expect(transitionFollowAction('off', 'enable')).toBe('following');
    expect(transitionFollowAction('following', 'pause')).toBe('paused');
    expect(transitionFollowAction('paused', 'pause')).toBe('paused');
    expect(transitionFollowAction('paused', 'enable')).toBe('following');
    expect(transitionFollowAction('following', 'disable')).toBe('off');
    expect(transitionFollowAction('following', 'reset')).toBe('off');
  });
});
