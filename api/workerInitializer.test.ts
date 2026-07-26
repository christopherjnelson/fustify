import { describe, expect, it } from 'vitest';
import { createAuthoritativeMatch } from '../src/multiplayer/authoritativeEngine.ts';
import {
  runAuthoritativeInitializer,
  runInitializerWorker,
} from './workerInitializer.ts';

const matchId = '00000000-0000-4000-8000-000000000020';
const room = {
  id: '00000000-0000-4000-8000-000000000010',
  host_user_id: '00000000-0000-4000-8000-000000000001',
  seed: 'worker-contract-regression',
  territory_count: 12,
  continent_count: 2,
  assignment_mode: 'random',
  generator_version: 2,
};
const claimedSeats = [
  {
    seatIndex: 0,
    userId: '00000000-0000-4000-8000-000000000001',
    displayName: 'Alpha',
    controllerType: 'human' as const,
  },
  {
    seatIndex: 1,
    userId: '00000000-0000-4000-8000-000000000002',
    displayName: 'Bravo',
    controllerType: 'human' as const,
  },
];

describe('Node initializer worker persistence contract', () => {
  it('produces the previous Edge payload and satisfies the initialization RPC guard', async () => {
    const previousEdgePayload = await createAuthoritativeMatch(
      matchId,
      room,
      claimedSeats,
    );
    const workerPayload = await runAuthoritativeInitializer(
      matchId,
      room,
      claimedSeats,
    );

    expect(workerPayload).toEqual(previousEdgePayload);
  });

  it('ignores parent-channel runtime traffic and accepts only the dedicated result channel', async () => {
    const initialized = await createAuthoritativeMatch(
      matchId,
      room,
      claimedSeats,
    );

    await expect(
      runInitializerWorker(
        new URL('./workerResultFixture.ts', import.meta.url),
        {
          matchId,
          room,
          claimedSeats,
          initialized,
        },
        ['--import', 'tsx'],
      ),
    ).resolves.toEqual(initialized);
  });
});
