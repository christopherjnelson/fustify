import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationClient } from './applicationClient';
import {
  createRoom,
  fetchPublicRooms,
  formatRoomCode,
  heartbeatRoomMembership,
  publicRoomUrl,
} from './multiplayerApi';

const client = {} as ApplicationClient;

afterEach(() => vi.unstubAllGlobals());

describe('multiplayer HTTP client', () => {
  it('creates rooms through the same-origin application API', async () => {
    const room = { id: '10000000-0000-4000-8000-000000000001' };
    const fetch = vi.fn(async () => new Response(JSON.stringify(room)));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createRoom(client, {
        name: 'Atlas Prime',
        settings: {
          seed: 'atlas-prime',
          territoryCount: 12,
          continentCount: 2,
          assignmentMode: 'random',
          maxSeats: 2,
        },
      }),
    ).resolves.toEqual(room);
    expect(fetch).toHaveBeenCalledWith(
      '/api/multiplayer/rooms',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    );
  });

  it('validates public room responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]))),
    );
    await expect(fetchPublicRooms(client)).resolves.toEqual([]);
  });

  it('coalesces simultaneous room heartbeats', async () => {
    let resolveResponse!: (response: Response) => void;
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (resolveResponse = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const first = heartbeatRoomMembership(client, 'room-id');
    const second = heartbeatRoomMembership(client, 'room-id');
    expect(first).toBe(second);
    resolveResponse(new Response('true'));
    await expect(first).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('formats room codes and canonical public links', () => {
    expect(formatRoomCode('ABCD1234')).toBe('ABCD-1234');
    expect(publicRoomUrl('10000000-0000-4000-8000-000000000001')).toBe(
      'https://dev.fustify.com/multiplayer/room/10000000-0000-4000-8000-000000000001',
    );
  });
});
