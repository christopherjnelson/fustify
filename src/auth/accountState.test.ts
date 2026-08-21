import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppAuthClient,
  AppSession,
  AuthChangeEvent,
} from './authClientTypes';
import {
  AccountController,
  deriveAccountState,
  safeProtectedAccountState,
  type ProtectedAccountState,
} from './accountState';

const userId = '10000000-0000-4000-8000-000000000001';
const otherUserId = '20000000-0000-4000-8000-000000000002';
const profileRow = {
  user_id: userId,
  display_name: 'Player One',
  avatar_url: null,
  onboarding_completed: true,
  created_at: '2026-07-24T06:00:00.000Z',
  updated_at: '2026-07-24T06:00:00.000Z',
};

function accountClient(options: {
  anonymous?: boolean;
  onboardingCompleted?: boolean;
  userId?: string;
  session?: boolean;
  verificationError?: Error;
  profileUnavailable?: boolean;
}) {
  const id = options.userId ?? userId;
  const anonymous = options.anonymous ?? false;
  let currentUser: {
    id: string;
    is_anonymous: boolean;
    email?: string;
  } | null =
    options.session === false
      ? null
      : {
          id,
          is_anonymous: anonymous,
          email: anonymous ? undefined : 'player@example.test',
        };
  let listener:
    ((event: AuthChangeEvent, session: AppSession | null) => void) | undefined;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: currentUser
        ? {
            ...profileRow,
            user_id: currentUser.id,
            onboarding_completed: options.onboardingCompleted ?? true,
          }
        : null,
      error: null,
    })),
  };
  const auth = {
    getSession: vi.fn(async () => ({
      data: {
        session: currentUser
          ? {
              access_token: 'current-token',
              user: currentUser,
            }
          : null,
      },
      error: null,
    })),
    getUser: vi.fn(async () =>
      options.verificationError
        ? { data: { user: null }, error: options.verificationError }
        : { data: { user: currentUser }, error: null },
    ),
    getClaims: vi.fn(async () => ({
      data: currentUser
        ? {
            claims: {
              sub: currentUser.id,
              is_anonymous: currentUser.is_anonymous,
            },
          }
        : null,
      error: null,
    })),
    refreshSession: vi.fn(),
    onAuthStateChange: vi.fn(
      (next: (event: AuthChangeEvent, session: AppSession | null) => void) => {
        listener = next;
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      },
    ),
  };
  const client = {
    auth,
    from: vi.fn(() => query),
  } as unknown as AppAuthClient;
  const fetch = vi.fn(async () =>
    options.profileUnavailable
      ? new Response(JSON.stringify({ code: 'profile_unavailable' }), {
          status: 503,
        })
      : new Response(
          JSON.stringify({
            ...profileRow,
            user_id: currentUser?.id ?? id,
            onboarding_completed: options.onboardingCompleted ?? true,
          }),
        ),
  );
  vi.stubGlobal('fetch', fetch);
  return {
    auth,
    client,
    fetch,
    emit(event: AuthChangeEvent) {
      listener?.(
        event,
        currentUser
          ? ({
              access_token: 'current-token',
              user: currentUser,
            } as AppSession)
          : null,
      );
    },
    setUser(
      next: { id: string; is_anonymous: boolean; email?: string } | null,
    ) {
      currentUser = next;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('protected account state', () => {
  it('publishes registered-ready only after user, session, claims, and profile agree', async () => {
    const fixture = accountClient({});
    await expect(deriveAccountState(fixture.client)).resolves.toMatchObject({
      status: 'registered-ready',
      account: {
        userId,
        email: 'player@example.test',
        profile: { displayName: 'Player One' },
      },
    });
  });

  it('keeps signed-out and legacy anonymous states explicit', async () => {
    const signedOut = accountClient({ session: false });
    await expect(deriveAccountState(signedOut.client)).resolves.toEqual({
      status: 'signed-out',
    });
    expect(signedOut.auth.getUser).not.toHaveBeenCalled();

    const anonymous = accountClient({ anonymous: true });
    await expect(deriveAccountState(anonymous.client)).resolves.toMatchObject({
      status: 'legacy-anonymous',
      user: { id: userId, is_anonymous: true },
    });
  });

  it('keeps a permanent account blocked until profile onboarding is complete', async () => {
    const fixture = accountClient({ onboardingCompleted: false });
    await expect(deriveAccountState(fixture.client)).resolves.toMatchObject({
      status: 'onboarding-required',
      account: {
        userId,
        profile: { onboardingCompleted: false },
      },
    });
  });

  it('uses a retryable error for verification failures, never signed-out', async () => {
    const fixture = accountClient({
      verificationError: new Error('private network detail'),
    });
    await expect(deriveAccountState(fixture.client)).resolves.toEqual({
      status: 'error',
      message: 'Your account session could not be verified. Please try again.',
    });
  });

  it('accepts a profile recovered by the server before publishing readiness', async () => {
    const fixture = accountClient({});

    await expect(deriveAccountState(fixture.client)).resolves.toMatchObject({
      status: 'registered-ready',
      account: { profile: { displayName: 'Player One' } },
    });
    expect(fixture.fetch).toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('fails closed with a safe message when the profile API fails', async () => {
    const fixture = accountClient({ profileUnavailable: true });

    await expect(deriveAccountState(fixture.client)).resolves.toEqual({
      status: 'error',
      message: 'Your player profile could not be loaded. Please try again.',
    });
  });

  it('publishes signed-out immediately and cannot restore stale readiness', async () => {
    const fixture = accountClient({});
    const controller = new AccountController(fixture.client);
    const states: ProtectedAccountState[] = [];
    controller.subscribe((state) => states.push(state));
    await vi.waitFor(() =>
      expect(states.at(-1)?.status).toBe('registered-ready'),
    );

    fixture.setUser(null);
    fixture.emit('SIGNED_OUT');
    expect(states.at(-1)).toEqual({ status: 'signed-out' });
  });

  it('preserves registered readiness during same-user background verification', async () => {
    const fixture = accountClient({});
    const controller = new AccountController(fixture.client);
    const states: ProtectedAccountState[] = [];
    controller.subscribe((state) => states.push(state));
    await vi.waitFor(() =>
      expect(states.at(-1)?.status).toBe('registered-ready'),
    );

    const transitionCount = states.length;
    fixture.emit('TOKEN_REFRESHED');
    expect(states.at(-1)?.status).toBe('registered-ready');
    await vi.waitFor(() =>
      expect(fixture.auth.getUser).toHaveBeenCalledTimes(2),
    );
    expect(states.slice(transitionCount)).not.toContainEqual({
      status: 'checking',
    });
    expect(states).toHaveLength(transitionCount);
  });

  it('invalidates a different-user transition before publishing the new account', async () => {
    const fixture = accountClient({});
    const controller = new AccountController(fixture.client);
    const states: ProtectedAccountState[] = [];
    controller.subscribe((state) => states.push(state));
    await vi.waitFor(() =>
      expect(states.at(-1)?.status).toBe('registered-ready'),
    );

    fixture.setUser({
      id: otherUserId,
      is_anonymous: false,
      email: 'other@example.test',
    });
    fixture.emit('SIGNED_IN');
    expect(states.at(-1)).toEqual({ status: 'checking' });
    await vi.waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        status: 'registered-ready',
        account: { userId: otherUserId },
      }),
    );
  });

  it('fails closed for unknown account states', () => {
    expect(safeProtectedAccountState({ status: 'future-ready' })).toEqual({
      status: 'error',
      message: 'Your account state could not be verified. Please try again.',
    });
  });
});
