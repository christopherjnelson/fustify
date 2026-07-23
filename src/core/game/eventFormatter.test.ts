import { describe, expect, it } from 'vitest';
import type { MatchEvent } from './types';
import { formatMatchEvent } from './eventFormatter';

const context = {
  players: [
    { id: 'player-01', name: 'Alpha', seatIndex: 0 },
    { id: 'player-02', name: 'Bravo', seatIndex: 1 },
  ],
  planet: {
    territories: [
      { id: 'T14', name: 'Iron Coast' },
      { id: 'T20', name: 'Verdant Reach' },
    ],
  },
} satisfies Parameters<typeof formatMatchEvent>[1];

function event(
  type: MatchEvent['type'],
  details: Partial<MatchEvent>,
): MatchEvent {
  return {
    id: `event-${type}`,
    turnNumber: 3,
    type,
    message: 'Legacy event description.',
    ...details,
  };
}

describe('gameplay event descriptions', () => {
  it('names the player, territory, and army count for reinforcement placement', () => {
    expect(
      formatMatchEvent(
        event('armies-placed', {
          actingPlayerId: 'player-01',
          primaryTerritoryId: 'T14',
          armyCount: 3,
        }),
        context,
      ),
    ).toBe('Alpha reinforced Iron Coast (T14) with 3 armies.');
  });

  it('preserves attack direction, player names, losses, and capture ownership', () => {
    expect(
      formatMatchEvent(
        event('combat', {
          actingPlayerId: 'player-01',
          defenderPlayerId: 'player-02',
          sourceTerritoryId: 'T14',
          targetTerritoryId: 'T20',
          attackerLosses: 1,
          defenderLosses: 2,
        }),
        context,
      ),
    ).toBe(
      'Alpha attacked Verdant Reach (T20) from Iron Coast (T14): Alpha lost 1 army and Bravo lost 2 armies.',
    );
    expect(
      formatMatchEvent(
        event('territory-captured', {
          actingPlayerId: 'player-01',
          previousOwnerId: 'player-02',
          sourceTerritoryId: 'T14',
          targetTerritoryId: 'T20',
        }),
        context,
      ),
    ).toBe('Alpha captured Verdant Reach (T20) from Bravo.');
  });

  it('describes capture movement and fortification with both territories', () => {
    const shared = {
      actingPlayerId: 'player-01',
      sourceTerritoryId: 'T14',
      targetTerritoryId: 'T20',
      armyCount: 4,
    };
    expect(formatMatchEvent(event('capture-move', shared), context)).toBe(
      'Alpha moved 4 armies from Iron Coast (T14) into captured Verdant Reach (T20).',
    );
    expect(
      formatMatchEvent(event('fortification-completed', shared), context),
    ).toBe(
      'Alpha fortified Verdant Reach (T20) with 4 armies from Iron Coast (T14).',
    );
  });

  it('uses readable identifier fallbacks and preserves legacy descriptions', () => {
    expect(
      formatMatchEvent(
        event('armies-placed', {
          actingPlayerId: 'player-02',
          primaryTerritoryId: 'T99',
          armyCount: 1,
        }),
        { players: [], planet: { territories: [] } },
      ),
    ).toBe('Player 2 reinforced Territory T99 with 1 army.');
    expect(
      formatMatchEvent(
        event('combat', {
          playerId: 'player-01',
          territoryId: 'T20',
        }),
        context,
      ),
    ).toBe('Legacy event description.');
  });
});
