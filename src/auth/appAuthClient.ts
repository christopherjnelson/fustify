import { createAuthClient } from 'better-auth/client';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';

const betterAuthClient = createAuthClient({ basePath: '/api/auth' });

type LegacyClient = SupabaseClient<Database>;
type LegacyAuth = LegacyClient['auth'];

function discordCompletionUrl(): string {
  return new URL('/auth/complete-profile', window.location.origin).toString();
}

function authError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error;
  const value = error as { code?: string; message?: string; status?: number };
  return Object.assign(new Error(value.message ?? 'Account request failed.'), {
    code: value.code,
    status: value.status,
  });
}

async function currentUser(): Promise<User | null> {
  const session = await betterAuthClient.getSession();
  if (session.error || !session.data?.user) return null;
  const sessionData = session.data;
  const accounts = await betterAuthClient.listAccounts();
  const identities = (accounts.data ?? []).map((account) => {
    const provider =
      account.providerId === 'credential' ? 'email' : account.providerId;
    return {
      id: account.id,
      identity_id: account.id,
      user_id: sessionData.user.id,
      identity_data: {},
      provider,
      created_at: sessionData.user.createdAt.toISOString(),
      updated_at: sessionData.user.updatedAt.toISOString(),
      last_sign_in_at: sessionData.session.updatedAt.toISOString(),
    };
  });
  return {
    id: sessionData.user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: sessionData.user.email,
    email_confirmed_at: sessionData.user.emailVerified
      ? sessionData.user.updatedAt.toISOString()
      : undefined,
    phone: '',
    confirmed_at: sessionData.user.emailVerified
      ? sessionData.user.updatedAt.toISOString()
      : undefined,
    last_sign_in_at: sessionData.session.updatedAt.toISOString(),
    app_metadata: {},
    user_metadata: {
      display_name: sessionData.user.name,
      avatar_url: sessionData.user.image,
    },
    identities,
    created_at: sessionData.user.createdAt.toISOString(),
    updated_at: sessionData.user.updatedAt.toISOString(),
    is_anonymous: false,
  };
}

async function legacySession() {
  const result = await betterAuthClient.getSession();
  if (result.error || !result.data) {
    return { data: { session: null }, error: authError(result.error) };
  }
  const user = await currentUser();
  if (!user) return { data: { session: null }, error: null };
  return {
    data: {
      session: {
        access_token: result.data.session.token,
        token_type: 'bearer' as const,
        expires_in: Math.max(
          0,
          Math.floor(
            (result.data.session.expiresAt.getTime() - Date.now()) / 1_000,
          ),
        ),
        expires_at: Math.floor(result.data.session.expiresAt.getTime() / 1_000),
        refresh_token: '',
        user,
      },
    },
    error: null,
  };
}

const auth = {
  async signUp(input: {
    email: string;
    password: string;
    options?: { data?: { display_name?: string }; emailRedirectTo?: string };
  }) {
    const result = await betterAuthClient.signUp.email({
      name: input.options?.data?.display_name?.trim() || input.email,
      email: input.email,
      password: input.password,
      callbackURL: input.options?.emailRedirectTo,
    });
    const user = result.data ? await currentUser() : null;
    const session = user ? (await legacySession()).data.session : null;
    return { data: { user, session }, error: authError(result.error) };
  },
  async signInWithPassword(input: { email: string; password: string }) {
    const result = await betterAuthClient.signIn.email(input);
    return { data: result.data, error: authError(result.error) };
  },
  async signInWithOAuth(input: {
    provider: 'discord';
    options?: { redirectTo?: string };
  }) {
    const result = await betterAuthClient.signIn.social({
      provider: input.provider,
      callbackURL: discordCompletionUrl(),
    });
    return { data: result.data, error: authError(result.error) };
  },
  async linkIdentity(input: {
    provider: 'discord';
    options?: { redirectTo?: string };
  }) {
    const result = await betterAuthClient.linkSocial({
      provider: input.provider,
      callbackURL: discordCompletionUrl(),
    });
    return { data: result.data, error: authError(result.error) };
  },
  async unlinkIdentity(identity: { id: string; provider: string }) {
    const result = await betterAuthClient.unlinkAccount({
      accountId: identity.id,
    });
    return { data: result.data, error: authError(result.error) };
  },
  async signOut() {
    const result = await betterAuthClient.signOut();
    return { error: authError(result.error) };
  },
  async getSession() {
    return legacySession();
  },
  async getUser() {
    try {
      return { data: { user: await currentUser() }, error: null };
    } catch (error) {
      return { data: { user: null }, error: authError(error) };
    }
  },
  async getClaims() {
    const user = await currentUser();
    return {
      data: user ? { claims: { sub: user.id, is_anonymous: false } } : null,
      error: null,
    };
  },
  async refreshSession() {
    const result = await legacySession();
    return {
      data: {
        session: result.data.session,
        user: result.data.session?.user ?? null,
      },
      error: result.error,
    };
  },
  onAuthStateChange(callback: Parameters<LegacyAuth['onAuthStateChange']>[0]) {
    let initial = true;
    const unsubscribe = betterAuthClient.$store.atoms.$sessionSignal.subscribe(
      () => {
        void legacySession().then(({ data }) => {
          callback(
            initial ? 'INITIAL_SESSION' : 'TOKEN_REFRESHED',
            data.session,
          );
          initial = false;
        });
      },
    );
    return {
      data: { subscription: { id: 'better-auth', callback, unsubscribe } },
    };
  },
  async resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string },
  ) {
    const result = await betterAuthClient.requestPasswordReset({
      email,
      redirectTo: options?.redirectTo,
    });
    return { data: result.data, error: authError(result.error) };
  },
  async resend() {
    return {
      data: null,
      error: Object.assign(new Error('Email verification is not enabled.'), {
        code: 'verification_unavailable',
      }),
    };
  },
} as unknown as LegacyAuth;

const client = { auth } as unknown as LegacyClient;

export function getAppAuthClient(): LegacyClient {
  if (import.meta.env.DEV && window.__FUSTIFY_AUTH_TEST_CLIENT__) {
    return window.__FUSTIFY_AUTH_TEST_CLIENT__;
  }
  return client;
}

export async function resetAppPassword(token: string, password: string) {
  const result = await betterAuthClient.resetPassword({
    token,
    newPassword: password,
  });
  if (result.error) throw authError(result.error);
}
