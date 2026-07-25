import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  createRoom,
  fetchPublicRooms,
  joinPublicRoom,
  joinRoom,
  multiplayerError,
  roomNameSchema,
} from './multiplayerApi';

describe('multiplayer room creation', () => {
  it('persists one freshly generated readable seed during room creation', async () => {
    const room = { id: 'room-id', seed: 'quiet-harbor-321' };
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
      room_visibility: 'public',
    });
  });

  it('passes validated explicit settings through the existing room RPC', async () => {
    const room = { id: 'replacement-room' };
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
        visibility: 'private',
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
      room_visibility: 'private',
    });
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
    const rpc = vi.fn(async () => ({ data: room, error: null }));
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
    ).toBe(
      'Your profile display name is invalid. Edit your profile and try again.',
    );
    expect(multiplayerError(new Error('public_room_unavailable')).message).toBe(
      'That public game is no longer available. Choose another game.',
    );
  });
});
