import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../multiplayer/database.types';
import {
  ensureRegisteredSessionReady,
  invalidateRegisteredSessionPreparation,
} from './registeredSession';

const userId = '10000000-0000-4000-8000-000000000001';
const otherUserId = '20000000-0000-4000-8000-000000000002';

function asClient(value: unknown): SupabaseClient<Database> {
  return value as SupabaseClient<Database>;
}

function session(id = userId, isAnonymous = false, token = 'current-token') {
  return {
    access_token: token,
    user: { id, is_anonymous: isAnonymous },
  };
}

function claims(id = userId, isAnonymous: unknown = false) {
  return {
    data: {
      claims: { sub: id, is_anonymous: isAnonymous },
      header: {},
      signature: new Uint8Array(),
    },
    error: null,
  };
}

function registeredClient(options: {
  currentClaim?: unknown;
  refreshedClaim?: unknown;
  refreshedUserId?: string;
  refreshError?: unknown;
}) {
  const refreshedUserId = options.refreshedUserId ?? userId;
  const getSession = vi.fn(async () => ({
    data: { session: session(userId, false) },
    error: null,
  }));
  const getUser = vi.fn(async (token?: string) => ({
    data: {
      user: {
        id: token === 'refreshed-token' ? refreshedUserId : userId,
        is_anonymous: false,
      },
    },
    error: null,
  }));
  const getClaims = vi.fn(async (token?: string) =>
    claims(
      token === 'refreshed-token' ? refreshedUserId : userId,
      token === 'refreshed-token'
        ? (options.refreshedClaim ?? false)
        : (options.currentClaim ?? false),
    ),
  );
  const refreshSession = vi.fn(async () =>
    options.refreshError
      ? { data: { session: null, user: null }, error: options.refreshError }
      : {
          data: {
            session: session(refreshedUserId, false, 'refreshed-token'),
            user: { id: refreshedUserId, is_anonymous: false },
          },
          error: null,
        },
  );
  return {
    client: asClient({
      auth: { getSession, getUser, getClaims, refreshSession },
    }),
    getSession,
    getUser,
    getClaims,
    refreshSession,
  };
}

describe('registered backend session preparation', () => {
  it('accepts a verified permanent user with permanent claims without refreshing', async () => {
    const fixture = registeredClient({});
    await expect(
      ensureRegisteredSessionReady(fixture.client),
    ).resolves.toMatchObject({
      status: 'registered-ready',
      user: { id: userId },
    });
    expect(fixture.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes one stale anonymous claim and accepts permanent refreshed claims', async () => {
    const fixture = registeredClient({ currentClaim: true });
    await expect(
      ensureRegisteredSessionReady(fixture.client),
    ).resolves.toMatchObject({
      status: 'registered-ready',
      user: { id: userId },
    });
    expect(fixture.refreshSession).toHaveBeenCalledTimes(1);
    expect(fixture.getClaims).toHaveBeenLastCalledWith('refreshed-token');
  });

  it('rejects a refreshed user ID that differs from the verified user', async () => {
    const fixture = registeredClient({
      currentClaim: true,
      refreshedUserId: otherUserId,
    });
    await expect(
      ensureRegisteredSessionReady(fixture.client),
    ).resolves.toMatchObject({
      status: 'error',
      reason: 'identity-changed',
    });
  });

  it('shows conversion-required when refresh still reports anonymous claims', async () => {
    const fixture = registeredClient({
      currentClaim: true,
      refreshedClaim: true,
    });
    await expect(
      ensureRegisteredSessionReady(fixture.client),
    ).resolves.toMatchObject({
      status: 'legacy-anonymous',
    });
  });

  it('returns the normal signed-out state when no session exists', async () => {
    const getUser = vi.fn();
    const client = asClient({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null,
        })),
        getUser,
      },
    });
    await expect(ensureRegisteredSessionReady(client)).resolves.toEqual({
      status: 'signed-out',
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('uses the safe refresh error when a stale session cannot refresh', async () => {
    const fixture = registeredClient({
      currentClaim: true,
      refreshError: new Error('private refresh response'),
    });
    await expect(ensureRegisteredSessionReady(fixture.client)).resolves.toEqual(
      {
        status: 'error',
        reason: 'refresh-failed',
        message:
          'Your account session could not be refreshed. Please try again.',
      },
    );
  });

  it('fails closed on missing or contradictory verified claims', async () => {
    const missing = registeredClient({});
    missing.getClaims.mockImplementation(
      async () => ({ data: null, error: null }) as never,
    );
    await expect(
      ensureRegisteredSessionReady(missing.client),
    ).resolves.toMatchObject({
      status: 'error',
      reason: 'invalid-claims',
    });
    expect(missing.refreshSession).not.toHaveBeenCalled();

    const contradictory = registeredClient({});
    contradictory.getClaims.mockResolvedValue(claims(otherUserId, false));
    await expect(
      ensureRegisteredSessionReady(contradictory.client),
    ).resolves.toMatchObject({
      status: 'error',
      reason: 'invalid-claims',
    });
    expect(contradictory.refreshSession).not.toHaveBeenCalled();
  });

  it('reports a verified anonymous user as a legacy guest without refreshing', async () => {
    const refreshSession = vi.fn();
    const client = asClient({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: session(userId, true, 'anonymous-token') },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, is_anonymous: true } },
          error: null,
        })),
        getClaims: vi.fn(async () => claims(userId, true)),
        refreshSession,
      },
    });
    await expect(ensureRegisteredSessionReady(client)).resolves.toMatchObject({
      status: 'legacy-anonymous',
      user: { id: userId },
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('shares one refresh across concurrent protected-route checks', async () => {
    let resolveRefresh:
      | ((value: {
          data: {
            session: ReturnType<typeof session>;
            user: { id: string; is_anonymous: false };
          };
          error: null;
        }) => void)
      | undefined;
    const fixture = registeredClient({ currentClaim: true });
    fixture.refreshSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = ensureRegisteredSessionReady(fixture.client);
    const second = ensureRegisteredSessionReady(fixture.client);
    await vi.waitFor(() =>
      expect(fixture.refreshSession).toHaveBeenCalledTimes(1),
    );
    resolveRefresh?.({
      data: {
        session: session(userId, false, 'refreshed-token'),
        user: { id: userId, is_anonymous: false },
      },
      error: null,
    });
    const results = await Promise.all([first, second]);
    expect(results).toEqual([
      expect.objectContaining({ status: 'registered-ready' }),
      expect.objectContaining({ status: 'registered-ready' }),
    ]);
    expect(fixture.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('cannot restore a registered state after sign-out invalidates a refresh', async () => {
    let resolveRefresh:
      | ((value: {
          data: {
            session: ReturnType<typeof session>;
            user: { id: string; is_anonymous: false };
          };
          error: null;
        }) => void)
      | undefined;
    const fixture = registeredClient({ currentClaim: true });
    fixture.refreshSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const preparation = ensureRegisteredSessionReady(fixture.client);
    await vi.waitFor(() =>
      expect(fixture.refreshSession).toHaveBeenCalledTimes(1),
    );
    invalidateRegisteredSessionPreparation(fixture.client);
    resolveRefresh?.({
      data: {
        session: session(userId, false, 'refreshed-token'),
        user: { id: userId, is_anonymous: false },
      },
      error: null,
    });
    await expect(preparation).resolves.toEqual({ status: 'signed-out' });
  });
});
