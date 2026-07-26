import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../multiplayer/database.types';
import {
  AuthFlowError,
  completeAuthCallback,
  completeGuestUpgrade,
  completeInvitationPassword,
  completePasswordRecovery,
  establishRecoverySession,
  initiateGuestEmailUpgrade,
  readGuestUpgradeIntent,
  registerWithEmail,
  requestPasswordRecovery,
  resendSignupVerification,
  signInWithEmail,
} from './authFlow';

const userId = '10000000-0000-4000-8000-000000000001';
const profileRow = {
  user_id: userId,
  display_name: 'MistyBadger-482',
  avatar_url: null,
  created_at: '2026-07-24T06:00:00.000Z',
  updated_at: '2026-07-24T06:00:00.000Z',
};

function browserStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://play.fustify.test' },
      sessionStorage: browserStorage(),
    },
  });
});

function asClient(value: unknown): SupabaseClient<Database> {
  return value as SupabaseClient<Database>;
}

describe('email/password authentication flows', () => {
  it('registers a signed-out account with safe metadata and no anonymous bootstrap', async () => {
    const signUp = vi.fn(async () => ({ data: {}, error: null }));
    const signInAnonymously = vi.fn();
    const client = asClient({ auth: { signUp, signInAnonymously } });

    await registerWithEmail(client, {
      displayName: '  Player One ',
      email: 'player@example.com',
      password: 'correct horse',
      confirmPassword: 'correct horse',
      returnPath: '/multiplayer',
    });

    expect(signUp).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'correct horse',
      options: {
        data: { display_name: 'Player One' },
        emailRedirectTo:
          'https://play.fustify.test/auth/callback?returnPath=%2Fmultiplayer',
      },
    });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('builds registration and recovery redirects from each active application origin', async () => {
    const signUp = vi.fn(async () => ({ data: {}, error: null }));
    const resetPasswordForEmail = vi.fn(async () => ({
      data: {},
      error: null,
    }));
    const client = asClient({
      auth: { signUp, resetPasswordForEmail },
    });

    for (const origin of [
      'http://127.0.0.1:4173',
      'http://localhost:5173',
      'https://dev.fustify.com',
    ]) {
      Object.defineProperty(window.location, 'origin', {
        configurable: true,
        value: origin,
      });
      await registerWithEmail(client, {
        displayName: 'Player One',
        email: 'player@example.com',
        password: 'correct horse',
        confirmPassword: 'correct horse',
        returnPath: '/local?seed=quiet#setup',
      });
      await requestPasswordRecovery(client, {
        email: 'player@example.com',
        returnPath: '/local',
      });
    }

    const signUpCalls = signUp.mock.calls as unknown as Array<
      [{ options: { emailRedirectTo: string } }]
    >;
    expect(signUpCalls.map(([input]) => input.options.emailRedirectTo)).toEqual(
      [
        'http://127.0.0.1:4173/auth/callback?returnPath=%2Flocal%3Fseed%3Dquiet%23setup',
        'http://localhost:5173/auth/callback?returnPath=%2Flocal%3Fseed%3Dquiet%23setup',
        'https://dev.fustify.com/auth/callback?returnPath=%2Flocal%3Fseed%3Dquiet%23setup',
      ],
    );
    expect(
      (
        resetPasswordForEmail.mock.calls as unknown as Array<
          [string, { redirectTo: string }]
        >
      ).map(([, options]) => options.redirectTo),
    ).toEqual([
      'http://127.0.0.1:4173/auth/reset-password?returnPath=%2Flocal',
      'http://localhost:5173/auth/reset-password?returnPath=%2Flocal',
      'https://dev.fustify.com/auth/reset-password?returnPath=%2Flocal',
    ]);
  });

  it('resends signup verification through the canonical confirmation callback', async () => {
    const resend = vi.fn(async () => ({ data: {}, error: null }));
    const client = asClient({ auth: { resend } });

    await resendSignupVerification(client, {
      email: ' player@example.com ',
      returnPath: '/multiplayer',
    });

    expect(resend).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'player@example.com',
      options: {
        emailRedirectTo:
          'https://play.fustify.test/auth/callback?returnPath=%2Fmultiplayer',
      },
    });
  });

  it('sanitizes resend rate-limit feedback', async () => {
    const client = asClient({
      auth: {
        resend: vi.fn(async () => ({
          data: {},
          error: {
            status: 429,
            message: 'private SMTP and account detail',
          },
        })),
      },
    });

    await expect(
      resendSignupVerification(client, {
        email: 'player@example.com',
        returnPath: '/',
      }),
    ).rejects.toMatchObject({
      code: 'request_failed',
      message: 'Too many requests. Please wait a little while and try again.',
    });
  });

  it('logs in, verifies the user, and fetches the profile', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: profileRow, error: null })),
    };
    const client = asClient({
      auth: {
        signInWithPassword: vi.fn(async () => ({ error: null })),
        getUser: vi.fn(async () => ({
          data: {
            user: { id: userId, is_anonymous: false },
          },
          error: null,
        })),
      },
      from: vi.fn(() => query),
    });

    await expect(
      signInWithEmail(client, {
        email: 'player@example.com',
        password: 'correct horse',
      }),
    ).resolves.toMatchObject({
      user: { id: userId },
      profile: { displayName: 'MistyBadger-482' },
    });
  });

  it('uses one generic login error for invalid credentials', async () => {
    const client = asClient({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          error: new Error('user does not exist in internal table'),
        })),
      },
    });
    await expect(
      signInWithEmail(client, {
        email: 'player@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_credentials',
      message: 'The email or password is incorrect.',
    });
  });

  it('uses safe confirmation wording for an unconfirmed email', async () => {
    const client = asClient({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          error: {
            code: 'email_not_confirmed',
            message: 'private Auth provider detail',
          },
        })),
      },
    });
    await expect(
      signInWithEmail(client, {
        email: 'player@example.com',
        password: 'correct horse',
      }),
    ).rejects.toMatchObject({
      code: 'email_not_confirmed',
      message: 'Confirm your email address before signing in.',
    });
  });

  it('starts a guest upgrade with updateUser and stores only safe callback context', async () => {
    const updateUser = vi.fn(async () => ({ error: null }));
    const client = asClient({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: userId, is_anonymous: true },
          },
          error: null,
        })),
        updateUser,
      },
    });

    await initiateGuestEmailUpgrade(client, {
      email: 'player@example.com',
      expectedUserId: userId,
      returnPath: '/multiplayer/room/room-id',
    });

    expect(updateUser).toHaveBeenCalledWith(
      { email: 'player@example.com' },
      {
        emailRedirectTo:
          'https://play.fustify.test/auth/callback?returnPath=%2Fmultiplayer%2Froom%2Froom-id&intent=guest-email-upgrade',
      },
    );
    expect(readGuestUpgradeIntent()).toEqual({
      intent: 'guest-email-upgrade',
      expectedUserId: userId,
      returnPath: '/multiplayer/room/room-id',
    });
    const serialized = JSON.stringify(readGuestUpgradeIntent());
    expect(serialized).not.toMatch(/password|token|otp/iu);
  });

  it('preserves the guest session and explains an email conflict', async () => {
    const signOut = vi.fn();
    const client = asClient({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, is_anonymous: true } },
          error: null,
        })),
        updateUser: vi.fn(async () => ({
          error: { code: 'email_exists', message: 'private detail' },
        })),
        signOut,
      },
    });

    await expect(
      initiateGuestEmailUpgrade(client, {
        email: 'player@example.com',
        expectedUserId: userId,
        returnPath: '/',
      }),
    ).rejects.toMatchObject({
      code: 'email_conflict',
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(readGuestUpgradeIntent()).toBeNull();
  });

  it('accepts an upgraded callback only for the expected same user ID', async () => {
    const client = asClient({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: userId,
              is_anonymous: true,
            },
          },
          error: null,
        })),
        updateUser: vi.fn(async () => ({ error: null })),
        exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      },
    });
    await initiateGuestEmailUpgrade(client, {
      email: 'player@example.com',
      expectedUserId: userId,
      returnPath: '/multiplayer',
    });
    client.auth.getUser = vi.fn(async () => ({
      data: {
        user: {
          id: userId,
          is_anonymous: false,
          email_confirmed_at: '2026-07-24T08:00:00.000Z',
        },
      },
      error: null,
    })) as unknown as typeof client.auth.getUser;

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback?code=secret-code&intent=guest-email-upgrade',
      ),
    ).resolves.toMatchObject({
      kind: 'guest-upgrade-completion',
      user: { id: userId },
    });
  });

  it('stops an upgraded callback if the user ID changes', async () => {
    const client = asClient({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValueOnce({
            data: { user: { id: userId, is_anonymous: true } },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              user: {
                id: '20000000-0000-4000-8000-000000000002',
                is_anonymous: false,
                email_confirmed_at: '2026-07-24T08:00:00.000Z',
              },
            },
            error: null,
          }),
        updateUser: vi.fn(async () => ({ error: null })),
        exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      },
    });
    await initiateGuestEmailUpgrade(client, {
      email: 'player@example.com',
      expectedUserId: userId,
      returnPath: '/',
    });

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback?code=secret-code&intent=guest-email-upgrade',
      ),
    ).rejects.toMatchObject({ code: 'identity_changed' });
  });

  it('explains that a guest upgrade must return to the original browser', async () => {
    const client = asClient({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          error: new Error('PKCE verifier missing'),
        })),
      },
    });

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback?code=secret-code&intent=guest-email-upgrade',
      ),
    ).rejects.toMatchObject({
      code: 'original_browser_required',
      message: expect.stringMatching(/original browser/i),
    });
  });

  it('verifies a signup token hash without PKCE storage and preserves a safe return path', async () => {
    const user = { id: userId, is_anonymous: false };
    const verifyOtp = vi.fn(async () => ({
      data: { user, session: { user } },
      error: null,
    }));
    const exchangeCodeForSession = vi.fn();
    const client = asClient({
      auth: {
        verifyOtp,
        exchangeCodeForSession,
        getUser: vi.fn(async () => ({ data: { user }, error: null })),
      },
    });

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback?token_hash=secret-hash&type=signup&returnPath=%2Fmultiplayer',
      ),
    ).resolves.toEqual({
      kind: 'confirmed',
      user,
      returnPath: '/multiplayer',
    });
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'secret-hash',
      type: 'signup',
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('keeps invitation verification distinct from ordinary signup confirmation', async () => {
    const user = { id: userId, is_anonymous: false };
    const client = asClient({
      auth: {
        verifyOtp: vi.fn(async () => ({
          data: { user, session: { user } },
          error: null,
        })),
        getUser: vi.fn(async () => ({ data: { user }, error: null })),
      },
    });

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback?token_hash=invite-hash&type=invite&returnPath=https%3A%2F%2Fevil.test',
      ),
    ).resolves.toEqual({
      kind: 'invitation',
      user,
      returnPath: '/',
    });
  });

  it.each([
    [
      'missing type',
      'https://play.fustify.test/auth/callback?token_hash=secret-hash',
    ],
    [
      'missing token hash',
      'https://play.fustify.test/auth/callback?type=signup',
    ],
    [
      'unsupported type',
      'https://play.fustify.test/auth/callback?token_hash=secret-hash&type=magiclink',
    ],
    [
      'recovery on the confirmation route',
      'https://play.fustify.test/auth/callback?token_hash=secret-hash&type=recovery',
    ],
    [
      'conflicting code and token hash',
      'https://play.fustify.test/auth/callback?code=secret-code&token_hash=secret-hash&type=signup',
    ],
  ])(
    'rejects a %s token-hash callback before verification',
    async (_, href) => {
      const verifyOtp = vi.fn();
      const client = asClient({ auth: { verifyOtp } });

      await expect(completeAuthCallback(client, href)).rejects.toMatchObject({
        code: 'invalid_email_link',
      });
      expect(verifyOtp).not.toHaveBeenCalled();
    },
  );

  it('distinguishes an expired token hash without exposing provider details', async () => {
    const client = asClient({
      auth: {
        verifyOtp: vi.fn(async () => ({
          data: { user: null, session: null },
          error: {
            code: 'otp_expired',
            message: 'private token and provider detail',
          },
        })),
      },
    });

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback?token_hash=secret-hash&type=signup',
      ),
    ).rejects.toMatchObject({
      code: 'expired_email_link',
      message: expect.not.stringContaining('private'),
    });
  });

  it('sanitizes callback errors returned in a URL fragment', async () => {
    const client = asClient({ auth: {} });

    await expect(
      completeAuthCallback(
        client,
        'https://play.fustify.test/auth/callback#error=access_denied&error_code=otp_expired&error_description=private-token-detail',
      ),
    ).rejects.toMatchObject({
      code: 'expired_email_link',
      message: expect.not.stringContaining('private-token-detail'),
    });
  });

  it('sets the password before updating the registered profile', async () => {
    const calls: string[] = [];
    const client = asClient({
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: {
              access_token: 'current-token',
              user: { id: userId, is_anonymous: false },
            },
          },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, is_anonymous: false } },
          error: null,
        })),
        getClaims: vi.fn(async () => ({
          data: {
            claims: { sub: userId, is_anonymous: false },
          },
          error: null,
        })),
        refreshSession: vi.fn(async () => {
          calls.push('refresh');
          return {
            data: {
              session: {
                access_token: 'refreshed-token',
                user: { id: userId, is_anonymous: false },
              },
              user: { id: userId, is_anonymous: false },
            },
            error: null,
          };
        }),
        updateUser: vi.fn(async () => {
          calls.push('password');
          return { error: null };
        }),
      },
      rpc: vi.fn(async () => {
        calls.push('profile');
        return {
          data: { ...profileRow, display_name: 'Player One' },
          error: null,
        };
      }),
    });

    await completeGuestUpgrade(client, {
      expectedUserId: userId,
      displayName: 'Player One',
      password: 'correct horse',
      confirmPassword: 'correct horse',
    });
    expect(calls).toEqual(['password', 'refresh', 'profile']);
  });

  it('returns generic forgot-password success and safe rate-limit wording', async () => {
    const client = asClient({
      auth: {
        resetPasswordForEmail: vi
          .fn()
          .mockResolvedValueOnce({ error: null })
          .mockResolvedValueOnce({
            error: { status: 429, message: 'private limiter detail' },
          }),
      },
    });
    await expect(
      requestPasswordRecovery(client, {
        email: 'player@example.com',
        returnPath: '/',
      }),
    ).resolves.toBe('sent');
    await expect(
      requestPasswordRecovery(client, {
        email: 'player@example.com',
        returnPath: '/',
      }),
    ).resolves.toBe('rate-limited');
  });

  it('reports a sanitized password-recovery network failure', async () => {
    const client = asClient({
      auth: {
        resetPasswordForEmail: vi.fn(async () => ({
          error: new Error('private SMTP or network detail'),
        })),
      },
    });
    await expect(
      requestPasswordRecovery(client, {
        email: 'player@example.com',
        returnPath: '/',
      }),
    ).rejects.toMatchObject({
      code: 'request_failed',
      message: 'The account request could not be completed. Please try again.',
    });
  });

  it('requires a recovery callback before changing a password', async () => {
    const updateUser = vi.fn(async () => ({ error: null }));
    const client = asClient({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { redirectType: 'recovery' },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, is_anonymous: false } },
          error: null,
        })),
        updateUser,
      },
    });

    await expect(
      completePasswordRecovery(client, 'correct horse', 'correct horse'),
    ).rejects.toBeInstanceOf(AuthFlowError);
    await establishRecoverySession(
      client,
      'https://play.fustify.test/auth/reset-password?code=recovery-code',
    );
    await completePasswordRecovery(client, 'correct horse', 'correct horse');
    expect(updateUser).toHaveBeenCalledWith({ password: 'correct horse' });
  });

  it('establishes recovery from a token hash and updates the password', async () => {
    const user = { id: userId, is_anonymous: false };
    const verifyOtp = vi.fn(async () => ({
      data: { user, session: { user } },
      error: null,
    }));
    const updateUser = vi.fn(async () => ({ error: null }));
    const client = asClient({
      auth: {
        verifyOtp,
        getUser: vi.fn(async () => ({ data: { user }, error: null })),
        updateUser,
      },
    });

    await establishRecoverySession(
      client,
      'https://play.fustify.test/auth/reset-password?token_hash=recovery-hash&type=recovery',
    );
    await completePasswordRecovery(client, 'correct horse', 'correct horse');

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'recovery-hash',
      type: 'recovery',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'correct horse' });
  });

  it.each([
    [
      'missing callback parameters',
      'https://play.fustify.test/auth/reset-password',
    ],
    [
      'unsupported token type',
      'https://play.fustify.test/auth/reset-password?token_hash=secret-hash&type=invite',
    ],
  ])('rejects recovery with %s', async (_, href) => {
    const verifyOtp = vi.fn();
    const client = asClient({ auth: { verifyOtp } });

    await expect(establishRecoverySession(client, href)).rejects.toBeInstanceOf(
      AuthFlowError,
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('sets an invited user password and refreshes the registered session', async () => {
    const user = { id: userId, is_anonymous: false };
    const updateUser = vi.fn(async () => ({ data: { user }, error: null }));
    const refreshSession = vi.fn(async () => ({
      data: {
        session: { access_token: 'refreshed-token', user },
        user,
      },
      error: null,
    }));
    const client = asClient({
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: { access_token: 'invitation-token', user },
          },
          error: null,
        })),
        getUser: vi.fn(async () => ({ data: { user }, error: null })),
        getClaims: vi.fn(async () => ({
          data: { claims: { sub: userId, is_anonymous: false } },
          error: null,
        })),
        refreshSession,
        updateUser,
      },
    });

    await expect(
      completeInvitationPassword(client, {
        expectedUserId: userId,
        password: 'correct horse',
        confirmation: 'correct horse',
      }),
    ).resolves.toEqual(user);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ password: 'correct horse' });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid non-recovery callback on the reset route', async () => {
    const client = asClient({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { redirectType: 'signup' },
          error: null,
        })),
      },
    });

    await expect(
      establishRecoverySession(
        client,
        'https://play.fustify.test/auth/reset-password?code=signup-code',
      ),
    ).rejects.toMatchObject({ code: 'recovery_session_required' });
  });
});
