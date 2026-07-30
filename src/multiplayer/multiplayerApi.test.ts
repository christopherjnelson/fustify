import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  createRoom,
  fetchPublicRooms,
  joinPublicRoom,
  joinRoom,
  multiplayerError,
  publicRoomUrl,
  publishRoom,
  roomNameSchema,
  startMatch,
  submitGameplayCommand,
  updateRoomSettings,
  type Room,
} from './multiplayerApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('multiplayer room creation', () => {
  it('persists one freshly generated readable seed during room creation', async () => {
    const room = {
      id: 'room-id',
      seed: 'quiet-harbor-321',
      visibility: 'private',
      status: 'waiting',
      join_code: 'ABCD1234',
    };
    const rpc = vi.fn(async () => ({ data: room, error: null }));
    const generateSeed = vi.fn(() => 'quiet-harbor-321');
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(createRoom(client, { generateSeed })).resolves.toBe(room);
    expect(generateSeed).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_room', {
      display_name: '',
      seed: 'quiet-harbor-321',
      territory_count: 42,
      continent_count: 5,
      assignment_mode: 'random',
      max_seats: 5,
      game_name: 'New Game',
    });
  });

  it('passes validated explicit settings through the existing room RPC', async () => {
    const room = {
      id: 'replacement-room',
      visibility: 'private',
      status: 'waiting',
      join_code: 'ABCD1234',
    };
    const rpc = vi.fn(async () => ({ data: room, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      createRoom(client, {
        settings: {
          seed: 'same-world-123',
          territoryCount: 36,
          continentCount: 5,
          assignmentMode: 'random',
          maxSeats: 4,
        },
        name: '  Night Orbit  ',
      }),
    ).resolves.toBe(room);
    expect(rpc).toHaveBeenCalledWith('create_room', {
      display_name: '',
      seed: 'same-world-123',
      territory_count: 36,
      continent_count: 5,
      assignment_mode: 'random',
      max_seats: 4,
      game_name: 'Night Orbit',
    });
  });

  it('rejects a creation result that is not authoritative private waiting state', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: 'unexpected-public-room',
        visibility: 'public',
        status: 'waiting',
        join_code: 'ABCD1234',
      },
      error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(createRoom(client)).rejects.toThrow(
      'Multiplayer request failed.',
    );
  });

  it('normalizes names and rejects empty or oversized room names', () => {
    expect(roomNameSchema.parse('  Atlas Prime  ')).toBe('Atlas Prime');
    expect(() => roomNameSchema.parse('   ')).toThrow();
    expect(() => roomNameSchema.parse('x'.repeat(61))).toThrow();
  });

  it('surfaces account_required without retrying the room RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'P0001', message: 'account_required' },
    }));
    const client = {
      rpc,
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: {
              access_token: 'permanent-token',
              user: { id: 'registered-user', is_anonymous: false },
            },
          },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: {
            user: { id: 'registered-user', is_anonymous: false },
          },
          error: null,
        })),
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: 'registered-user',
              is_anonymous: false,
            },
          },
          error: null,
        })),
      },
    } as unknown as SupabaseClient<Database>;

    await expect(createRoom(client)).rejects.toThrow(
      'A registered account is required for multiplayer.',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('never retries non-auth room errors', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'P0001', message: 'full_room' },
    }));
    const client = { rpc, auth: {} } as unknown as SupabaseClient<Database>;

    await expect(createRoom(client)).rejects.toThrow('This room is full.');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('multiplayer room joining', () => {
  it('passes only the room code plus the deprecated empty RPC argument', async () => {
    const room = { id: 'joined-room' };
    const rpc = vi.fn(async () => ({ data: room, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(joinRoom(client, 'ABCD-1234')).resolves.toBe(room);
    expect(rpc).toHaveBeenCalledWith('join_room', {
      join_code: 'ABCD-1234',
      display_name: '',
    });
  });

  it('joins an advertised room through the public-room RPC', async () => {
    const room = { id: 'joined-public-room' };
    const rpc = vi.fn(async () => ({ data: [room], error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      joinPublicRoom(client, '10000000-0000-4000-8000-000000000001'),
    ).resolves.toBe(room);
    expect(rpc).toHaveBeenCalledWith('join_public_room', {
      p_room_id: '10000000-0000-4000-8000-000000000001',
    });
  });
});

describe('public multiplayer discovery', () => {
  it('parses only the safe public-room card payload', async () => {
    const data = [
      {
        room_id: '10000000-0000-4000-8000-000000000001',
        room_name: 'Atlas Prime',
        host_display_name: 'NovaCommander',
        host_avatar_url: null,
        current_players: 2,
        maximum_players: 5,
        room_state: 'waiting',
        room_seed: 'atlas-prime-271',
        territory_count: 42,
        continent_count: 6,
        assignment_mode: 'random',
        thumbnail_path: '10000000-0000-4000-8000-000000000001/world.webp',
        thumbnail_version: 3,
        players: [
          { displayName: 'NovaCommander', avatarUrl: null },
          { displayName: 'MistyRaven-214', avatarUrl: null },
        ],
        created_at: '2026-07-25T12:00:00.000Z',
      },
    ];
    const rpc = vi.fn(async () => ({ data, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(fetchPublicRooms(client)).resolves.toEqual(data);
    expect(rpc).toHaveBeenCalledWith('list_public_rooms');
    expect(JSON.stringify(await fetchPublicRooms(client))).not.toContain(
      'join_code',
    );
  });
});

describe('public room publication', () => {
  it('persists the room name with the rest of the private settings', async () => {
    const room = {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Final Atlas',
      seed: 'final-atlas-271',
      territory_count: 42,
      continent_count: 5,
      assignment_mode: 'random',
      max_seats: 4,
      created_at: '2026-07-25T12:00:00.000Z',
      generator_version: 4,
      host_user_id: '20000000-0000-4000-8000-000000000002',
      join_code: 'ABCD1234',
      revision: 2,
      status: 'waiting',
      thumbnail_path: null,
      thumbnail_version: 0,
      updated_at: '2026-07-25T12:00:00.000Z',
      visibility: 'private',
    } satisfies Room;
    const rpc = vi.fn(async () => ({ data: room, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(updateRoomSettings(client, room)).resolves.toBe(room);
    expect(rpc).toHaveBeenCalledWith('update_room_settings', {
      room_id: room.id,
      game_name: 'Final Atlas',
      seed: 'final-atlas-271',
      territory_count: 42,
      continent_count: 5,
      assignment_mode: 'random',
      max_seats: 4,
    });
  });

  it('coalesces concurrent publication calls and returns the authoritative transition', async () => {
    const publication = {
      room_id: '10000000-0000-4000-8000-000000000001',
      room_visibility: 'public',
      room_revision: 4,
    };
    let resolveRequest!: (value: {
      data: (typeof publication)[];
      error: null;
    }) => void;
    const request = new Promise<{
      data: (typeof publication)[];
      error: null;
    }>((resolve) => {
      resolveRequest = resolve;
    });
    const rpc = vi.fn(() => request);
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const first = publishRoom(client, publication.room_id);
    const duplicate = publishRoom(client, publication.room_id);
    expect(duplicate).toBe(first);
    expect(rpc).toHaveBeenCalledTimes(1);
    resolveRequest({ data: [publication], error: null });

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      publication,
      publication,
    ]);
    expect(rpc).toHaveBeenCalledWith('publish_room', {
      p_room_id: publication.room_id,
    });
  });

  it('builds the canonical encoded direct room URL', () => {
    expect(publicRoomUrl('10000000-0000-4000-8000-000000000001')).toBe(
      'https://dev.fustify.com/multiplayer/room/10000000-0000-4000-8000-000000000001',
    );
  });
});

describe('multiplayer errors', () => {
  it('preserves stable room errors and explains Auth throttling', () => {
    expect(multiplayerError(new Error('seat_conflict')).message).toBe(
      'Another player claimed that seat first.',
    );
    expect(
      multiplayerError(new Error('Request rate limit reached')).message,
    ).toBe('Too many account requests. Wait a moment and try again.');
    expect(multiplayerError({ status: 429 }).message).toContain(
      'Too many account requests',
    );
    expect(
      multiplayerError({ code: 'P0001', message: 'account_required' }).message,
    ).toBe('A registered account is required for multiplayer.');
    expect(multiplayerError(new Error('not_enough_players')).message).toBe(
      'Claim at least two human seats before starting.',
    );
    expect(multiplayerError(new Error('revision_conflict')).message).toBe(
      'The match changed before that action was accepted.',
    );
    expect(multiplayerError(new Error('profile_unavailable')).message).toBe(
      'Your player profile could not be loaded. Please try again.',
    );
    expect(
      multiplayerError(new Error('invalid_profile_display_name')).message,
    ).toBe('Your username is invalid. Edit your profile and try again.');
    expect(multiplayerError(new Error('public_room_unavailable')).message).toBe(
      'That public game is no longer available. Choose another game.',
    );
    expect(
      multiplayerError(new Error('published_room_settings_locked')).message,
    ).toBe('Public lobby settings are permanently locked.');
  });
});

describe('multiplayer match launch transport', () => {
  it('starts through the same-origin Node API with only the caller bearer token and room ID', async () => {
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: 'registered-access-token' } },
      error: null,
    }));
    const match = {
      id: '40000000-0000-4000-8000-000000000004',
      room_id: '10000000-0000-4000-8000-000000000001',
    };
    const fetchRequest = vi.fn(async () =>
      Response.json({ match }, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchRequest);
    const client = {
      auth: { getSession },
      functions: { invoke: vi.fn() },
    } as unknown as SupabaseClient<Database>;

    await expect(startMatch(client, match.room_id)).resolves.toMatchObject(
      match,
    );
    expect(fetchRequest).toHaveBeenCalledWith('/api/multiplayer/start', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer registered-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId: match.room_id }),
    });
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('maps API failures and missing sessions into existing polished errors', async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({ code: 'host_only' }, { status: 403 }),
    );
    vi.stubGlobal('fetch', fetchRequest);
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: 'registered-access-token' } },
          error: null,
        })),
      },
    } as unknown as SupabaseClient<Database>;

    await expect(
      startMatch(client, '10000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow('Only the room host can do that.');

    const signedOut = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null,
        })),
      },
    } as unknown as SupabaseClient<Database>;
    await expect(
      startMatch(signedOut, '10000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow('Your account session expired.');
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps normal gameplay commands on the multiplayer-game function', async () => {
    const invoke = vi.fn(async () => ({
      data: {
        acceptedRevision: 3,
        stateFingerprint: 'a'.repeat(64),
        duplicate: false,
      },
      error: null,
    }));
    const client = {
      functions: { invoke },
    } as unknown as SupabaseClient<Database>;

    await expect(
      submitGameplayCommand(client, 'match-id', 2, 'command-key', {
        type: 'END_ATTACK_PHASE',
      }),
    ).resolves.toMatchObject({ acceptedRevision: 3, duplicate: false });
    expect(invoke).toHaveBeenCalledWith('multiplayer-game', {
      body: {
        operation: 'command',
        matchId: 'match-id',
        expectedRevision: 2,
        idempotencyKey: 'command-key',
        action: { type: 'END_ATTACK_PHASE' },
      },
    });
  });
});
