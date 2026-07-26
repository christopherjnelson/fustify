import { describe, expect, it, vi } from 'vitest';
import type { AuthoritativeMatchInitialization } from '../src/multiplayer/authoritativeEngine.ts';
import {
  MatchStartService,
  type AuthoritativeRoom,
  type MultiplayerMatch,
  type StartMatchRepository,
} from './startMatchService.ts';

const roomId = '10000000-0000-4000-8000-000000000001';
const hostId = '20000000-0000-4000-8000-000000000002';
const room: AuthoritativeRoom = {
  id: roomId,
  host_user_id: hostId,
  seed: 'canonical-room-seed',
  territory_count: 42,
  continent_count: 5,
  assignment_mode: 'random',
  generator_version: 2,
};
const seats = [
  {
    seatIndex: 0,
    userId: hostId,
    displayName: 'Host',
    controllerType: 'human' as const,
  },
  {
    seatIndex: 1,
    userId: '30000000-0000-4000-8000-000000000003',
    displayName: 'Guest',
    controllerType: 'human' as const,
  },
];
const initialized = {
  setupSnapshot: {},
  seatOrderSnapshot: [],
  generatorMetadata: {},
  planet: {},
  state: {},
  stateFingerprint: 'a'.repeat(64),
} as unknown as AuthoritativeMatchInitialization;
const match = {
  id: '40000000-0000-4000-8000-000000000004',
  room_id: roomId,
  state_snapshot: { matchId: 'match' },
} as unknown as MultiplayerMatch;

function repository(
  overrides: Partial<StartMatchRepository> = {},
): StartMatchRepository {
  return {
    authorize: vi.fn(async () => ({
      ok: true as const,
      actorUserId: hostId,
    })),
    loadRoom: vi.fn(async () => room),
    loadExistingMatch: vi.fn(async () => null),
    loadClaimedSeats: vi.fn(async () => seats),
    commitInitialization: vi.fn(async () => match),
    ...overrides,
  };
}

describe('Node match start service', () => {
  it('rejects an unauthenticated request before loading room data', async () => {
    const repo = repository({
      authorize: vi.fn(async () => ({
        ok: false as const,
        status: 401 as const,
        code: 'not_authenticated' as const,
      })),
    });
    const initialize = vi.fn(async () => initialized);
    const service = new MatchStartService(repo, initialize);

    await expect(service.start(null, roomId)).rejects.toMatchObject({
      code: 'not_authenticated',
      status: 401,
    });
    expect(repo.loadRoom).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('verifies the canonical room host before loading players or initializing', async () => {
    const repo = repository({
      authorize: vi.fn(async () => ({
        ok: true as const,
        actorUserId: '50000000-0000-4000-8000-000000000005',
      })),
    });
    const initialize = vi.fn(async () => initialized);
    const service = new MatchStartService(repo, initialize);

    await expect(
      service.start('Bearer registered', roomId),
    ).rejects.toMatchObject({ code: 'host_only', status: 403 });
    expect(repo.loadExistingMatch).not.toHaveBeenCalled();
    expect(repo.loadClaimedSeats).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('loads canonical settings and players, initializes, then uses the existing commit RPC path', async () => {
    const repo = repository();
    const initialize = vi.fn(async () => initialized);
    const service = new MatchStartService(repo, initialize);

    await expect(service.start('Bearer registered', roomId)).resolves.toBe(
      match,
    );
    expect(repo.loadRoom).toHaveBeenCalledWith(roomId);
    expect(repo.loadClaimedSeats).toHaveBeenCalledWith(roomId);
    expect(initialize).toHaveBeenCalledWith(expect.any(String), room, seats);
    expect(repo.commitInitialization).toHaveBeenCalledWith({
      roomId,
      matchId: expect.any(String),
      actorUserId: hostId,
      initialized,
    });
  });

  it('returns an already initialized match without repeating CPU or database work', async () => {
    const repo = repository({
      loadExistingMatch: vi.fn(async () => match),
    });
    const initialize = vi.fn(async () => initialized);
    const service = new MatchStartService(repo, initialize);

    await expect(service.start('Bearer registered', roomId)).resolves.toBe(
      match,
    );
    expect(repo.loadClaimedSeats).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
    expect(repo.commitInitialization).not.toHaveBeenCalled();
  });

  it('coalesces concurrent starts while retaining database idempotency as the durable backstop', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const repo = repository();
    const initialize = vi.fn(async () => {
      await blocked;
      return initialized;
    });
    const service = new MatchStartService(repo, initialize);

    const first = service.start('Bearer registered', roomId);
    const second = service.start('Bearer registered', roomId);
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([match, match]);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(repo.commitInitialization).toHaveBeenCalledTimes(1);
  });

  it('clears failed in-flight work so a safe retry can initialize again', async () => {
    const repo = repository();
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error('multiplayer_request_failed'))
      .mockResolvedValueOnce(initialized);
    const service = new MatchStartService(repo, initialize);

    await expect(service.start('Bearer registered', roomId)).rejects.toThrow(
      'multiplayer_request_failed',
    );
    await expect(service.start('Bearer registered', roomId)).resolves.toBe(
      match,
    );
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});
