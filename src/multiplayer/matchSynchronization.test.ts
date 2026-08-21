import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationClient } from './applicationClient';
import type { MultiplayerMatch } from './multiplayerApi';
import { MatchSynchronization } from './matchSynchronization';

const canonical: MultiplayerMatch = {
  id: 'match-a',
  room_id: 'room-a',
  status: 'active',
  revision: 4,
  setup_snapshot: { assignmentMode: 'random' },
  seat_order_snapshot: [{ playerId: 'player-a' }],
  generator_metadata: { version: 1 },
  planet_snapshot: { seed: 'small-world' },
  state_snapshot: { turnNumber: 2 },
  state_fingerprint: 'fingerprint-4',
  last_command_type: 'END_TURN',
  winner_player_id: null,
  winner_user_id: null,
  created_at: '2026-08-20T00:00:00Z',
  updated_at: '2026-08-20T00:00:04Z',
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('match synchronization reads', () => {
  it('bootstraps canonical state through the application API', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response(JSON.stringify(canonical)));
    vi.stubGlobal('fetch', fetch);
    const installed: MultiplayerMatch[] = [];
    const synchronization = new MatchSynchronization({
      client: {} as ApplicationClient,
      matchId: canonical.id,
      install: (match) => installed.push(match),
      onError: vi.fn(),
    });

    await synchronization.bootstrap();
    expect(installed).toEqual([canonical]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/multiplayer/matches/match-a/bootstrap',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    synchronization.stop();
  });

  it('stops permanently after an access-denied bootstrap', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'room_access_denied' }), {
            status: 403,
          }),
      ),
    );
    const onError = vi.fn();
    const synchronization = new MatchSynchronization({
      client: {} as ApplicationClient,
      matchId: canonical.id,
      install: vi.fn(),
      onError,
    });

    await synchronization.bootstrap();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'This private room is unavailable to this player.',
      }),
    );
    synchronization.stop();
  });
});
