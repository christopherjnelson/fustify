import type { SupabaseClient, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../multiplayer/database.types';
import {
  completeAuthCallback,
  hasDiscordIdentity,
  linkDiscordIdentity,
  readDiscordAuthIntent,
  signInWithDiscord,
  signOutRegisteredAccount,
} from './authFlow';

const userId = '10000000-0000-4000-8000-000000000001';
const otherUserId = '20000000-0000-4000-8000-000000000002';
type ProfileRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

const profileRow: ProfileRow = {
  user_id: userId,
  display_name: 'Player One',
  avatar_url: 'https://cdn.example.test/player.png',
  onboarding_completed: true,
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

function user(input: {
  id?: string;
  anonymous?: boolean;
  providers?: string[];
  metadata?: Record<string, unknown>;
  discordIdentityMetadata?: Record<string, unknown>;
}): User {
  return {
    id: input.id ?? userId,
    is_anonymous: input.anonymous ?? false,
    identities: (input.providers ?? ['email']).map((provider, index) => ({
      id: `${provider}-${index}`,
      identity_id: `${provider}-${index}`,
      user_id: input.id ?? userId,
      identity_data:
        provider === 'discord' ? (input.discordIdentityMetadata ?? {}) : {},
      provider,
      created_at: '2026-07-24T06:00:00.000Z',
      updated_at: '2026-07-24T06:00:00.000Z',
      last_sign_in_at: '2026-07-24T06:00:00.000Z',
    })),
    user_metadata: input.metadata ?? {},
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-24T06:00:00.000Z',
  };
}

function asClient(value: unknown): SupabaseClient<Database> {
  return value as SupabaseClient<Database>;
}

function readyClient(
  verifiedUser: User,
  options: {
    currentClaimsAnonymous?: boolean;
    refreshedClaimsAnonymous?: boolean;
    row?: ProfileRow;
    rpcResult?: { data: unknown; error: unknown };
  } = {},
) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: options.row ?? profileRow,
      error: null,
    })),
  };
  const refreshSession = vi.fn(async () => ({
    data: {
      session: {
        access_token: 'refreshed-token',
        user: verifiedUser,
      },
      user: verifiedUser,
    },
    error: null,
  }));
  const getClaims = vi.fn(async (token: string) => ({
    data: {
      claims: {
        sub: verifiedUser.id,
        is_anonymous:
          token === 'refreshed-token'
            ? (options.refreshedClaimsAnonymous ?? false)
            : (options.currentClaimsAnonymous ?? false),
      },
    },
    error: null,
  }));
  const rpc = vi.fn(async () =>
    options.rpcResult
      ? options.rpcResult
      : { data: options.row ?? profileRow, error: null },
  );
  const client = asClient({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      getUser: vi.fn(async () => ({
        data: { user: verifiedUser },
        error: null,
      })),
      getSession: vi.fn(async () => ({
        data: {
          session: {
            access_token: 'current-token',
            user: verifiedUser,
          },
        },
        error: null,
      })),
      getClaims,
      refreshSession,
      linkIdentity: vi.fn(async () => ({ error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => query),
    rpc,
  });
  return { client, getClaims, query, refreshSession, rpc };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'http://127.0.0.1:4173' },
      sessionStorage: browserStorage(),
    },
  });
});

describe('Discord authentication flows', () => {
  it('detects Discord only from verified Auth identities', () => {
    expect(
      hasDiscordIdentity(
        user({
          providers: ['email'],
          metadata: { avatar_url: 'discord-looking-avatar' },
        }),
      ),
    ).toBe(false);
    expect(hasDiscordIdentity(user({ providers: ['discord'] }))).toBe(true);
    expect(hasDiscordIdentity(user({ providers: ['email', 'discord'] }))).toBe(
      true,
    );
  });

  it('starts signed-out Discord OAuth from the current origin with safe intent', async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    const client = asClient({ auth: { signInWithOAuth } });

    await signInWithDiscord(
      client,
      '/multiplayer/room/ABCD?view=roster#seat-2',
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: {
        redirectTo: 'http://127.0.0.1:4173/auth/callback',
      },
    });
    expect(readDiscordAuthIntent()).toEqual({
      intent: 'discord-sign-in',
      returnPath: '/multiplayer/room/ABCD?view=roster#seat-2',
    });
    expect(JSON.stringify(readDiscordAuthIntent())).not.toMatch(
      /token|code|email|secret/iu,
    );
  });

  it('rejects an unsafe signed-out return path before storing it', async () => {
    const client = asClient({
      auth: { signInWithOAuth: vi.fn(async () => ({ error: null })) },
    });
    await signInWithDiscord(client, 'https://attacker.example/steal');
    expect(readDiscordAuthIntent()).toEqual({
      intent: 'discord-sign-in',
      returnPath: '/',
    });
  });

  it('uses linkIdentity and stores the expected current user for manual linking', async () => {
    const linkIdentity = vi.fn(async () => ({ error: null }));
    const client = asClient({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: user({ providers: ['email'] }) },
          error: null,
        })),
        linkIdentity,
      },
    });

    await linkDiscordIdentity(client, {
      intent: 'discord-link',
      expectedUserId: userId,
      returnPath: '/local',
    });

    expect(linkIdentity).toHaveBeenCalledWith({
      provider: 'discord',
      options: {
        redirectTo: 'http://127.0.0.1:4173/auth/callback',
      },
    });
    expect(readDiscordAuthIntent()).toEqual({
      intent: 'discord-link',
      expectedUserId: userId,
      returnPath: '/local',
    });
  });

  it('fails a callback when the linked user ID changes', async () => {
    const initial = user({ providers: ['email'] });
    const client = asClient({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValueOnce({ data: { user: initial }, error: null })
          .mockResolvedValueOnce({
            data: {
              user: user({
                id: otherUserId,
                providers: ['email', 'discord'],
              }),
            },
            error: null,
          }),
        linkIdentity: vi.fn(async () => ({ error: null })),
        exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      },
    });
    await linkDiscordIdentity(client, {
      intent: 'discord-link',
      expectedUserId: userId,
      returnPath: '/',
    });

    await expect(
      completeAuthCallback(
        client,
        'http://127.0.0.1:4173/auth/callback?code=oauth-code',
      ),
    ).rejects.toMatchObject({ code: 'identity_changed' });
    expect(readDiscordAuthIntent()).toBeNull();
  });

  it('fails safely when the verified callback user lacks a Discord identity', async () => {
    const { client } = readyClient(user({ providers: ['email'] }));
    await signInWithDiscord(client, '/multiplayer');

    await expect(
      completeAuthCallback(
        client,
        'http://127.0.0.1:4173/auth/callback?code=oauth-code',
      ),
    ).rejects.toMatchObject({ code: 'discord_identity_missing' });
  });

  it('loads an existing profile for a new or returning Discord sign-in', async () => {
    const discordUser = user({ providers: ['discord'] });
    const { client, refreshSession, rpc } = readyClient(discordUser);
    await signInWithDiscord(client, '/multiplayer');

    await expect(
      completeAuthCallback(
        client,
        'http://127.0.0.1:4173/auth/callback?code=oauth-code',
      ),
    ).resolves.toMatchObject({
      kind: 'discord-completion',
      user: { id: userId, is_anonymous: false },
      profile: { displayName: 'Player One' },
      intent: { returnPath: '/multiplayer' },
    });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refreshes a stale anonymous JWT once during same-ID legacy conversion', async () => {
    const anonymousUser = user({ anonymous: true, providers: [] });
    const permanentUser = user({ providers: ['discord'] });
    const fixture = readyClient(permanentUser, {
      currentClaimsAnonymous: true,
      refreshedClaimsAnonymous: false,
    });
    fixture.client.auth.getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: anonymousUser },
        error: null,
      })
      .mockResolvedValue({
        data: { user: permanentUser },
        error: null,
      }) as unknown as typeof fixture.client.auth.getUser;

    await linkDiscordIdentity(fixture.client, {
      intent: 'legacy-discord-upgrade',
      expectedUserId: userId,
      returnPath: '/local',
    });
    await expect(
      completeAuthCallback(
        fixture.client,
        'http://127.0.0.1:4173/auth/callback?code=oauth-code',
      ),
    ).resolves.toMatchObject({
      kind: 'discord-completion',
      user: { id: userId, is_anonymous: false },
    });
    expect(fixture.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('keeps gameplay blocked when the refreshed legacy JWT remains anonymous', async () => {
    const anonymousUser = user({ anonymous: true, providers: [] });
    const permanentUser = user({ providers: ['discord'] });
    const fixture = readyClient(permanentUser, {
      currentClaimsAnonymous: true,
      refreshedClaimsAnonymous: true,
    });
    fixture.client.auth.getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: anonymousUser },
        error: null,
      })
      .mockResolvedValue({
        data: { user: permanentUser },
        error: null,
      }) as unknown as typeof fixture.client.auth.getUser;

    await linkDiscordIdentity(fixture.client, {
      intent: 'legacy-discord-upgrade',
      expectedUserId: userId,
      returnPath: '/local',
    });
    await expect(
      completeAuthCallback(
        fixture.client,
        'http://127.0.0.1:4173/auth/callback?code=oauth-code',
      ),
    ).rejects.toMatchObject({ code: 'legacy_conversion_failed' });
    expect(fixture.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing customized profile when Discord is linked', async () => {
    const linkedUser = user({ providers: ['email', 'discord'] });
    const fixture = readyClient(linkedUser);
    fixture.client.auth.getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: user({ providers: ['email'] }) },
        error: null,
      })
      .mockResolvedValue({
        data: { user: linkedUser },
        error: null,
      }) as unknown as typeof fixture.client.auth.getUser;

    await linkDiscordIdentity(fixture.client, {
      intent: 'discord-link',
      expectedUserId: userId,
      returnPath: '/',
    });
    await completeAuthCallback(
      fixture.client,
      'http://127.0.0.1:4173/auth/callback?code=oauth-code',
    );

    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('leaves a generated legacy profile unchanged for explicit confirmation', async () => {
    const anonymousUser = user({ anonymous: true, providers: [] });
    const permanentUser = user({
      providers: ['discord'],
      discordIdentityMetadata: {
        display_name: 'Discord Player',
        avatar_url: 'https://cdn.example.test/discord.png',
      },
    });
    const generatedRow = {
      ...profileRow,
      display_name: 'MistyBadger-482',
      avatar_url: null,
    };
    const enrichedRow = {
      ...generatedRow,
      display_name: 'Discord Player',
      avatar_url: 'https://cdn.example.test/discord.png',
    };
    const fixture = readyClient(permanentUser, {
      row: generatedRow,
      rpcResult: { data: enrichedRow, error: null },
    });
    fixture.client.auth.getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: anonymousUser },
        error: null,
      })
      .mockResolvedValue({
        data: { user: permanentUser },
        error: null,
      }) as unknown as typeof fixture.client.auth.getUser;

    await linkDiscordIdentity(fixture.client, {
      intent: 'legacy-discord-upgrade',
      expectedUserId: userId,
      returnPath: '/',
    });
    const result = await completeAuthCallback(
      fixture.client,
      'http://127.0.0.1:4173/auth/callback?code=oauth-code',
    );

    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      profile: {
        displayName: 'MistyBadger-482',
        avatarUrl: null,
      },
    });
  });

  it('does not undo a legacy Auth success when optional enrichment fails', async () => {
    const anonymousUser = user({ anonymous: true, providers: [] });
    const permanentUser = user({
      providers: ['discord'],
      metadata: { display_name: 'Discord Player' },
    });
    const generatedRow = {
      ...profileRow,
      display_name: 'MistyBadger-482',
      avatar_url: null,
    };
    const fixture = readyClient(permanentUser, {
      row: generatedRow,
      rpcResult: {
        data: null,
        error: new Error('private profile failure'),
      },
    });
    fixture.client.auth.getUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: { user: anonymousUser },
        error: null,
      })
      .mockResolvedValue({
        data: { user: permanentUser },
        error: null,
      }) as unknown as typeof fixture.client.auth.getUser;

    await linkDiscordIdentity(fixture.client, {
      intent: 'legacy-discord-upgrade',
      expectedUserId: userId,
      returnPath: '/',
    });
    await expect(
      completeAuthCallback(
        fixture.client,
        'http://127.0.0.1:4173/auth/callback?code=oauth-code',
      ),
    ).resolves.toMatchObject({
      profile: { displayName: 'MistyBadger-482', avatarUrl: null },
    });
  });

  it('preserves the current session when Discord is linked elsewhere', async () => {
    const signOut = vi.fn();
    const client = asClient({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: user({ providers: ['email'] }) },
          error: null,
        })),
        linkIdentity: vi.fn(async () => ({
          error: {
            code: 'identity_already_exists',
            message: 'private identity detail',
          },
        })),
        signOut,
      },
    });

    await expect(
      linkDiscordIdentity(client, {
        intent: 'discord-link',
        expectedUserId: userId,
        returnPath: '/',
      }),
    ).rejects.toMatchObject({
      code: 'identity_conflict',
      message:
        'This Discord account is already connected to another Fustify account. Sign out before using Discord to access that account.',
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(readDiscordAuthIntent()).toBeNull();
  });

  it('reports an unavailable Discord provider without leaking its error', async () => {
    const client = asClient({
      auth: {
        signInWithOAuth: vi.fn(async () => ({
          error: new Error('Discord provider is disabled: private detail'),
        })),
      },
    });

    await expect(signInWithDiscord(client, '/')).rejects.toMatchObject({
      code: 'discord_provider_unavailable',
      message:
        'Discord sign-in is temporarily unavailable. Please use email and password.',
    });
    expect(readDiscordAuthIntent()).toBeNull();
  });

  it('handles OAuth cancellation without exchanging a code or changing session', async () => {
    const signOut = vi.fn();
    const exchangeCodeForSession = vi.fn();
    const client = asClient({
      auth: {
        signInWithOAuth: vi.fn(async () => ({ error: null })),
        exchangeCodeForSession,
        signOut,
      },
    });
    await signInWithDiscord(client, '/multiplayer');

    await expect(
      completeAuthCallback(
        client,
        'http://127.0.0.1:4173/auth/callback?error=access_denied',
      ),
    ).rejects.toMatchObject({
      code: 'oauth_cancelled',
      message:
        'Discord authorization was cancelled. Your Fustify account was not changed.',
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(readDiscordAuthIntent()).toBeNull();
  });

  it('reports an expired Discord PKCE callback and clears stale intent', async () => {
    const client = asClient({
      auth: {
        signInWithOAuth: vi.fn(async () => ({ error: null })),
        exchangeCodeForSession: vi.fn(async () => ({
          error: new Error('private PKCE verifier failure'),
        })),
      },
    });
    await signInWithDiscord(client, '/multiplayer');

    await expect(
      completeAuthCallback(
        client,
        'http://127.0.0.1:4173/auth/callback?code=expired-code',
      ),
    ).rejects.toMatchObject({ code: 'oauth_callback_expired' });
    expect(readDiscordAuthIntent()).toBeNull();
  });

  it('exchanges a Discord PKCE code once and retains intent for profile confirmation', async () => {
    const discordUser = user({ providers: ['discord'] });
    const fixture = readyClient(discordUser);
    await signInWithDiscord(fixture.client, '/local');
    await completeAuthCallback(
      fixture.client,
      'http://127.0.0.1:4173/auth/callback?code=oauth-code',
    );
    expect(fixture.client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(readDiscordAuthIntent()).toEqual({
      intent: 'discord-sign-in',
      returnPath: '/local',
    });
  });

  it('clears temporary Discord intent during normal sign-out', async () => {
    const fixture = readyClient(user({ providers: ['discord'] }));
    await signInWithDiscord(fixture.client, '/multiplayer');
    expect(readDiscordAuthIntent()).not.toBeNull();

    await signOutRegisteredAccount(fixture.client);

    expect(readDiscordAuthIntent()).toBeNull();
    expect(fixture.client.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
