import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import { createRoom, multiplayerError } from './multiplayerApi';

describe('multiplayer room creation', () => {
  it('persists one freshly generated readable seed during room creation', async () => {
    const room = { id: 'room-id', seed: 'quiet-harbor-321' };
    const rpc = vi.fn(async () => ({ data: room, error: null }));
    const generateSeed = vi.fn(() => 'quiet-harbor-321');
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(createRoom(client, 'Host', { generateSeed })).resolves.toBe(
      room,
    );
    expect(generateSeed).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_room', {
      display_name: 'Host',
      seed: 'quiet-harbor-321',
      territory_count: 42,
      continent_count: 5,
      assignment_mode: 'random',
      max_seats: 5,
    });
  });

  it('passes validated explicit settings through the existing room RPC', async () => {
    const room = { id: 'replacement-room' };
    const rpc = vi.fn(async () => ({ data: room, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      createRoom(client, 'Host', {
        settings: {
          seed: 'same-world-123',
          territoryCount: 36,
          continentCount: 5,
          assignmentMode: 'random',
          maxSeats: 4,
        },
      }),
    ).resolves.toBe(room);
    expect(rpc).toHaveBeenCalledWith('create_room', {
      display_name: 'Host',
      seed: 'same-world-123',
      territory_count: 36,
      continent_count: 5,
      assignment_mode: 'random',
      max_seats: 4,
    });
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

    await expect(createRoom(client, 'Host')).rejects.toThrow(
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

    await expect(createRoom(client, 'Host')).rejects.toThrow(
      'This room is full.',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
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
  });
});
