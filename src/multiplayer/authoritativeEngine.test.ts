import { describe, expect, it } from 'vitest';
import { createAuthoritativeMatch } from './authoritativeEngine';
import { sha256Fingerprint } from './gameProtocol';

const room = {
  id: '00000000-0000-4000-8000-000000000010',
  seed: 'authoritative-test',
  territory_count: 12,
  continent_count: 2,
  assignment_mode: 'random',
};
const seats = [
  {
    seatIndex: 0,
    userId: '00000000-0000-4000-8000-000000000001',
    displayName: 'Alpha',
    controllerType: 'human' as const,
  },
  {
    seatIndex: 3,
    userId: '00000000-0000-4000-8000-000000000002',
    displayName: 'Bravo',
    controllerType: 'human' as const,
  },
];

describe('authoritative multiplayer initialization', () => {
  it('persists a complete deterministic world, ownership, turn, and RNG state', async () => {
    const first = await createAuthoritativeMatch(
      '00000000-0000-4000-8000-000000000020',
      room,
      seats,
    );
    const second = await createAuthoritativeMatch(
      '00000000-0000-4000-8000-000000000020',
      room,
      seats,
    );
    expect(first).toEqual(second);
    expect(first.planet.territories).toHaveLength(12);
    expect(Object.keys(first.state.territories)).toHaveLength(12);
    expect(first.state.activePlayerId).toBe('player-01');
    expect(first.state.phase).toBe('reinforce');
    expect(first.state.combatSequence).toBe(0);
    expect(first.state.remainingReinforcements).toBeGreaterThan(0);
    expect(first.seatOrderSnapshot.map((seat) => seat.playerId)).toEqual([
      'player-01',
      'player-02',
    ]);
    await expect(sha256Fingerprint(first.state)).resolves.toBe(
      first.stateFingerprint,
    );
  });

  it('rejects player draft without changing local-play support', async () => {
    await expect(
      createAuthoritativeMatch(
        '00000000-0000-4000-8000-000000000020',
        { ...room, assignment_mode: 'player-draft' },
        seats,
      ),
    ).rejects.toThrow('multiplayer_draft_unsupported');
  });
});
