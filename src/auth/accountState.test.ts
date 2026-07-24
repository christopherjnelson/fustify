import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../multiplayer/database.types';
import {
  deriveAccountState,
  observeAccountState,
  type AccountState,
} from './accountState';

const userId = '10000000-0000-4000-8000-000000000001';
const profileRow = {
  user_id: userId,
  display_name: 'Guest 1000',
  avatar_url: null,
  created_at: '2026-07-24T06:00:00.000Z',
  updated_at: '2026-07-24T06:00:00.000Z',
};

function accountClient(isAnonymous: boolean) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: profileRow, error: null })),
  };
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: userId } } },
        error: null,
      })),
      getUser: vi.fn(async () => ({
        data: { user: { id: userId, is_anonymous: isAnonymous } },
        error: null,
      })),
    },
    from: vi.fn(() => query),
  };
}

describe('account state', () => {
  it('distinguishes an authenticated anonymous user', async () => {
    const client = accountClient(true);
    await expect(
      deriveAccountState(client as unknown as SupabaseClient<Database>),
    ).resolves.toMatchObject({
      status: 'authenticated',
      userId,
      isAnonymous: true,
    });
  });

  it('distinguishes an authenticated permanent user', async () => {
    const client = accountClient(false);
    await expect(
      deriveAccountState(client as unknown as SupabaseClient<Database>),
    ).resolves.toMatchObject({
      status: 'authenticated',
      userId,
      isAnonymous: false,
    });
  });

  it('represents a missing Auth user as unavailable without signing out', async () => {
    const signOut = vi.fn();
    const getUser = vi.fn();
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null,
        })),
        getUser,
        signOut,
      },
    } as unknown as SupabaseClient<Database>;

    await expect(deriveAccountState(client)).resolves.toEqual({
      status: 'unavailable',
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('represents non-session Auth failures as sanitized errors', async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: userId } } },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: new Error('network endpoint and private response details'),
        })),
      },
    } as unknown as SupabaseClient<Database>;

    await expect(deriveAccountState(client)).resolves.toEqual({
      status: 'error',
      message: 'Profile request failed.',
    });
  });

  it('sanitizes profile load failures in account state', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: new Error('private database detail'),
      })),
    };
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: userId } } },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, is_anonymous: true } },
          error: null,
        })),
      },
      from: vi.fn(() => query),
    } as unknown as SupabaseClient<Database>;

    await expect(deriveAccountState(client)).resolves.toEqual({
      status: 'error',
      message: 'Profile request failed.',
    });
  });

  it('recovers a missing profile before publishing authenticated state', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const rpc = vi.fn(async () => ({ data: profileRow, error: null }));
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: userId } } },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, is_anonymous: true } },
          error: null,
        })),
      },
      from: vi.fn(() => query),
      rpc,
    } as unknown as SupabaseClient<Database>;

    await expect(deriveAccountState(client)).resolves.toMatchObject({
      status: 'authenticated',
      userId,
    });
    expect(rpc).toHaveBeenCalledWith('ensure_own_profile');
  });

  it('reacts to Auth changes, avoids duplicate initial loads, and cleans up', async () => {
    let authListener:
      | ((event: 'INITIAL_SESSION' | 'SIGNED_OUT', session: unknown) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const base = accountClient(true);
    const client = {
      ...base,
      auth: {
        ...base.auth,
        onAuthStateChange: vi.fn((listener) => {
          authListener = listener;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
    } as unknown as SupabaseClient<Database>;
    const states: AccountState[] = [];

    const cleanup = observeAccountState(client, (state) => states.push(state));
    authListener?.('INITIAL_SESSION', { user: { id: userId } });
    await vi.waitFor(() => {
      expect(states.at(-1)?.status).toBe('authenticated');
    });
    expect(base.auth.getUser).toHaveBeenCalledTimes(1);

    authListener?.('SIGNED_OUT', null);
    expect(states.at(-1)).toEqual({ status: 'unavailable' });
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not publish a stale authenticated state after sign-out', async () => {
    let resolveUser:
      | ((value: {
          data: {
            user: { id: string; is_anonymous: boolean };
          };
          error: null;
        }) => void)
      | undefined;
    const getUser = vi.fn(
      () =>
        new Promise<{
          data: {
            user: { id: string; is_anonymous: boolean };
          };
          error: null;
        }>((resolve) => {
          resolveUser = resolve;
        }),
    );
    let authListener:
      ((event: 'SIGNED_OUT', session: null) => void) | undefined;
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: userId } } },
          error: null,
        })),
        getUser,
        onAuthStateChange: vi.fn((listener) => {
          authListener = listener;
          return {
            data: { subscription: { unsubscribe: vi.fn() } },
          };
        }),
      },
    } as unknown as SupabaseClient<Database>;
    const states: AccountState[] = [];

    observeAccountState(client, (state) => states.push(state));
    authListener?.('SIGNED_OUT', null);
    resolveUser?.({
      data: { user: { id: userId, is_anonymous: true } },
      error: null,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(states.at(-1)).toEqual({ status: 'unavailable' });
  });
});
