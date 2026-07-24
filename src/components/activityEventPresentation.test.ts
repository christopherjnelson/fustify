import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../core/game/types';
import { createDefaultPlayerConfigs } from '../core/setup/playerConfig';
import {
  activityDisplayColor,
  activityEventPresentation,
} from './activityEventPresentation';

const players = createDefaultPlayerConfigs(4);

function event(
  type: MatchEvent['type'],
  details: Partial<MatchEvent> = {},
): MatchEvent {
  return {
    id: `event-${type}`,
    turnNumber: 2,
    type,
    message: 'Fallback.',
    ...details,
  };
}

describe('Activity event player presentation', () => {
  it('maps actor and opponent relationships without parsing event messages', () => {
    const combat = activityEventPresentation(
      event('combat', {
        actingPlayerId: players[0]!.id,
        defenderPlayerId: players[1]!.id,
      }),
      players,
    );
    const capture = activityEventPresentation(
      event('territory-captured', {
        actingPlayerId: players[1]!.id,
        previousOwnerId: players[2]!.id,
      }),
      players,
    );

    expect(combat.actor?.playerId).toBe(players[0]!.id);
    expect(combat.participants.map(({ playerId }) => playerId)).toEqual([
      players[0]!.id,
      players[1]!.id,
    ]);
    expect(capture.participants.map(({ playerId }) => playerId)).toEqual([
      players[1]!.id,
      players[2]!.id,
    ]);
  });

  it('deduplicates same-player movement and maps turn transitions', () => {
    expect(
      activityEventPresentation(
        event('fortification-completed', {
          actingPlayerId: players[0]!.id,
        }),
        players,
      ).participants,
    ).toHaveLength(1);
    expect(
      activityEventPresentation(
        event('turn-started', {
          previousPlayerId: players[2]!.id,
          nextPlayerId: players[3]!.id,
        }),
        players,
      ).participants.map(({ playerId }) => playerId),
    ).toEqual([players[2]!.id, players[3]!.id]);
  });

  it('adjusts only dark display colors and fails unresolved players safely', () => {
    expect(activityDisplayColor('#101820')).not.toBe('#101820');
    expect(activityDisplayColor('#e24f4f')).toBe('#e24f4f');
    expect(
      activityEventPresentation(
        event('combat', { actingPlayerId: 'legacy-player' }),
        players,
      ),
    ).toEqual({ actor: undefined, participants: [] });
  });
});
