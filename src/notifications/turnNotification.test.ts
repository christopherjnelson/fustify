import { describe, expect, it } from 'vitest';
import type { LocalPlayerConfig } from '../core/setup/playerConfig';
import {
  detectTurnNotification,
  resolveTurnRecipientIds,
  type TurnBaseline,
  type TurnObservation,
} from './turnNotification';

const players: LocalPlayerConfig[] = [
  {
    id: 'human-a',
    name: 'Crimson League',
    colorId: 'color-1',
    seatIndex: 0,
    controllerType: 'local-human',
  },
  {
    id: 'bot',
    name: 'Azure Bot',
    colorId: 'color-2',
    seatIndex: 1,
    controllerType: 'heuristic-bot',
  },
  {
    id: 'human-b',
    name: 'Golden Union',
    colorId: 'color-3',
    seatIndex: 2,
    controllerType: 'local-human',
  },
];

function observation(update: Partial<TurnObservation> = {}): TurnObservation {
  return {
    sessionId: 'match-1',
    turnNumber: 1,
    activePlayerId: 'human-a',
    activePlayerName: 'Crimson League',
    phase: 'reinforce',
    recipientPlayerIds: ['human-a'],
    revision: 4,
    ...update,
  };
}

describe('turn notification detection', () => {
  it('baselines hydration and ignores duplicate or same-turn canonical updates', () => {
    const initial = detectTurnNotification(null, observation());
    expect(initial.notification).toBeNull();

    const duplicate = detectTurnNotification(initial.baseline, observation());
    expect(duplicate.notification).toBeNull();

    const phaseUpdate = detectTurnNotification(
      duplicate.baseline,
      observation({ phase: 'attack', revision: 7 }),
    );
    expect(phaseUpdate.notification).toBeNull();
    expect(phaseUpdate.baseline?.revision).toBe(7);
  });

  it('notifies once for a handoff to a local human and not for a bot', () => {
    const botBaseline = detectTurnNotification(
      null,
      observation({
        activePlayerId: 'bot',
        activePlayerName: 'Azure Bot',
        recipientPlayerIds: ['human-a', 'human-b'],
      }),
    ).baseline;
    const handoff = detectTurnNotification(
      botBaseline,
      observation({
        turnNumber: 2,
        recipientPlayerIds: ['human-a', 'human-b'],
        revision: 5,
      }),
    );
    expect(handoff.notification).toEqual({
      playerId: 'human-a',
      playerName: 'Crimson League',
      turnNumber: 2,
    });
    expect(
      detectTurnNotification(handoff.baseline, observation({ turnNumber: 2 }))
        .notification,
    ).toBeNull();

    const botTurn = detectTurnNotification(
      handoff.baseline,
      observation({
        turnNumber: 3,
        activePlayerId: 'bot',
        activePlayerName: 'Azure Bot',
        revision: 6,
      }),
    );
    expect(botTurn.notification).toBeNull();

    const completed = detectTurnNotification(
      botTurn.baseline,
      observation({ turnNumber: 4, phase: 'game-over', revision: 7 }),
    );
    expect(completed.notification).toBeNull();
  });

  it('retains the newest baseline across stale reconciliation and detects a later return', () => {
    const baseline: TurnBaseline = {
      sessionId: 'match-1',
      turnNumber: 8,
      activePlayerId: 'bot',
      revision: 20,
    };
    const stale = detectTurnNotification(
      baseline,
      observation({ turnNumber: 9, revision: 18 }),
    );
    expect(stale.baseline).toEqual(baseline);
    expect(stale.notification).toBeNull();

    const returned = detectTurnNotification(
      stale.baseline,
      observation({ turnNumber: 9, revision: 21 }),
    );
    expect(returned.notification?.playerName).toBe('Crimson League');

    const missedRound = detectTurnNotification(
      returned.baseline,
      observation({ turnNumber: 12, revision: 30 }),
    );
    expect(missedRound.notification?.turnNumber).toBe(12);
  });

  it('resolves local hot-seat humans and multiplayer only by claimed player ID', () => {
    expect(resolveTurnRecipientIds(players, null)).toEqual([
      'human-a',
      'human-b',
    ]);
    expect(resolveTurnRecipientIds(players, 'human-b')).toEqual(['human-b']);
    expect(resolveTurnRecipientIds(players, 'missing-seat')).toEqual([]);

    const hotSeat = detectTurnNotification(
      {
        sessionId: 'match-1',
        turnNumber: 3,
        activePlayerId: 'human-a',
      },
      observation({
        turnNumber: 4,
        activePlayerId: 'human-b',
        activePlayerName: 'Golden Union',
        recipientPlayerIds: resolveTurnRecipientIds(players, null),
      }),
    );
    expect(hotSeat.notification?.playerName).toBe('Golden Union');
  });
});
