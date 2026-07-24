import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  createRoom,
  ensureAnonymousSession,
  multiplayerError,
} from './multiplayerApi';

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
});

describe('multiplayer anonymous session', () => {
  it('deduplicates concurrent anonymous sign-in attempts for one client', async () => {
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInAnonymously: vi.fn(async () => {
        await Promise.resolve();
        return { data: { user: { id: 'anonymous-user' } }, error: null };
      }),
    };
    const client = { auth } as unknown as SupabaseClient<Database>;

    await expect(
      Promise.all([
        ensureAnonymousSession(client),
        ensureAnonymousSession(client),
      ]),
    ).resolves.toEqual(['anonymous-user', 'anonymous-user']);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('restores a valid persisted user before creating another identity', async () => {
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: {} } })),
      getUser: vi.fn(async () => ({
        data: { user: { id: 'restored-user' } },
        error: null,
      })),
      signInAnonymously: vi.fn(),
    };
    const client = { auth } as unknown as SupabaseClient<Database>;

    await expect(ensureAnonymousSession(client)).resolves.toBe('restored-user');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('replaces an invalid persisted session with a fresh anonymous identity', async () => {
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: {} } })),
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: new Error('expired'),
      })),
      signOut: vi.fn(async () => ({ error: null })),
      signInAnonymously: vi.fn(async () => ({
        data: { user: { id: 'replacement-user' } },
        error: null,
      })),
    };
    const client = { auth } as unknown as SupabaseClient<Database>;

    await expect(ensureAnonymousSession(client)).resolves.toBe(
      'replacement-user',
    );
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('multiplayer errors', () => {
  it('preserves stable room errors and explains Auth throttling', () => {
    expect(multiplayerError(new Error('seat_conflict')).message).toBe(
      'Another player claimed that seat first.',
    );
    expect(
      multiplayerError(new Error('Request rate limit reached')).message,
    ).toBe(
      'Anonymous sign-in is temporarily rate limited. Wait a moment and try again.',
    );
    expect(multiplayerError({ status: 429 }).message).toContain(
      'temporarily rate limited',
    );
    expect(multiplayerError(new Error('not_enough_players')).message).toBe(
      'Claim at least two human seats before starting.',
    );
    expect(multiplayerError(new Error('revision_conflict')).message).toBe(
      'The match changed before that action was accepted.',
    );
  });
});
