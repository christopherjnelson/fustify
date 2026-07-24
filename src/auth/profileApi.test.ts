import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../multiplayer/database.types';
import {
  fetchCurrentProfile,
  fetchProfilesByUserIds,
  profileApiError,
  updateCurrentProfile,
} from './profileApi';

const userId = '10000000-0000-4000-8000-000000000001';
const secondUserId = '10000000-0000-4000-8000-000000000002';
const profileRow = {
  user_id: userId,
  display_name: 'Guest 1000',
  avatar_url: null,
  created_at: '2026-07-24T06:00:00.000Z',
  updated_at: '2026-07-24T06:00:00.000Z',
};

function profileQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

describe('profile API', () => {
  it('fetches the verified current user profile', async () => {
    const query = profileQuery({ data: profileRow, error: null });
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: userId } },
          error: null,
        })),
      },
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    await expect(fetchCurrentProfile(client)).resolves.toMatchObject({
      userId,
      displayName: 'Guest 1000',
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', userId);
  });

  it('recovers a temporarily missing current profile through the own-user RPC', async () => {
    const query = profileQuery({ data: null, error: null });
    const rpc = vi.fn(async () => ({ data: profileRow, error: null }));
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: userId } },
          error: null,
        })),
      },
      from: vi.fn(() => query),
      rpc,
    } as unknown as SupabaseClient<Database>;

    await expect(fetchCurrentProfile(client)).resolves.toMatchObject({
      userId,
    });
    expect(rpc).toHaveBeenCalledWith('ensure_own_profile');
  });

  it('fetches deduplicated profiles by known user IDs', async () => {
    const secondRow = {
      ...profileRow,
      user_id: secondUserId,
      display_name: 'Second',
    };
    const query = profileQuery({
      data: [profileRow, secondRow],
      error: null,
    });
    const client = {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    await expect(
      fetchProfilesByUserIds(client, [userId, secondUserId, userId]),
    ).resolves.toHaveLength(2);
    expect(query.in).toHaveBeenCalledWith('user_id', [userId, secondUserId]);
  });

  it('updates only the profile RPC without replacing multiplayer names', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ...profileRow,
        display_name: 'Player One',
        avatar_url: 'https://cdn.example.com/avatar.png',
      },
      error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      updateCurrentProfile(client, {
        displayName: '  Player One  ',
        avatarUrl: ' https://cdn.example.com/avatar.png ',
      }),
    ).resolves.toMatchObject({
      displayName: 'Player One',
      avatarUrl: 'https://cdn.example.com/avatar.png',
    });
    expect(rpc).toHaveBeenCalledWith('update_own_profile', {
      p_display_name: 'Player One',
      p_avatar_url: 'https://cdn.example.com/avatar.png',
    });
  });

  it('sanitizes database and validation failures', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: new Error('postgres host and raw constraint details'),
    }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      updateCurrentProfile(client, {
        displayName: 'Player',
        avatarUrl: null,
      }),
    ).rejects.toThrow('Profile request failed.');
    await expect(
      updateCurrentProfile(client, {
        displayName: '',
        avatarUrl: null,
      }),
    ).rejects.toThrow('Use a display name between 1 and 40 characters');
    expect(
      profileApiError(new Error('invalid_profile_avatar_url')).message,
    ).toBe('Use a valid HTTPS avatar URL.');
  });

  it('sanitizes malformed profile rows and invalid lookup IDs', async () => {
    const query = profileQuery({
      data: { ...profileRow, user_id: 'malformed' },
      error: null,
    });
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: userId } },
          error: null,
        })),
      },
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    await expect(fetchCurrentProfile(client)).rejects.toThrow(
      'Profile request failed.',
    );
    await expect(
      fetchProfilesByUserIds(client, ['not-a-uuid']),
    ).rejects.toThrow('Profile request failed.');
  });

  it('sanitizes thrown client failures', async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => {
          throw new Error('network implementation detail');
        }),
      },
    } as unknown as SupabaseClient<Database>;

    await expect(fetchCurrentProfile(client)).rejects.toThrow(
      'Profile request failed.',
    );
  });
});
