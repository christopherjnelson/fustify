import { createAuthClient } from 'better-auth/client';
import type {
  AppAuthClient,
  AppSession,
  AppUser,
  AuthChangeEvent,
} from './authClientTypes';

const betterAuthClient = createAuthClient({ basePath: '/api/auth' });

function authError(error: unknown): Error | null {
  if (!error) return null;
  if (error instanceof Error) return error;
  const value = error as { code?: string; message?: string; status?: number };
  return Object.assign(new Error(value.message ?? 'Account request failed.'), {
    code: value.code,
    status: value.status,
  });
}

async function currentUser(): Promise<AppUser | null> {
  const result = await betterAuthClient.getSession();
  if (result.error || !result.data?.user) return null;
  return {
    id: result.data.user.id,
    email: result.data.user.email,
    user_metadata: {
      display_name: result.data.user.name,
      avatar_url: result.data.user.image,
    },
    created_at: result.data.user.createdAt.toISOString(),
    updated_at: result.data.user.updatedAt.toISOString(),
    is_anonymous: false,
  };
}

async function currentSession(): Promise<{
  data: { session: AppSession | null };
  error: Error | null;
}> {
  const result = await betterAuthClient.getSession();
  if (result.error || !result.data) {
    return {
      data: { session: null },
      error: import.meta.env.DEV ? null : authError(result.error),
    };
  }
  const user = await currentUser();
  return {
    data: {
      session: user
        ? {
            access_token: result.data.session.token,
            expires_at: Math.floor(
              result.data.session.expiresAt.getTime() / 1_000,
            ),
            user,
          }
        : null,
    },
    error: null,
  };
}

const client: AppAuthClient = {
  auth: {
    async signUp(input) {
      const result = await betterAuthClient.signUp.email({
        name: input.options?.data?.display_name?.trim() || input.email,
        email: input.email,
        password: input.password,
      });
      const user = result.data ? await currentUser() : null;
      const session = user ? (await currentSession()).data.session : null;
      return { data: { user, session }, error: authError(result.error) };
    },
    async signInWithPassword(input) {
      const result = await betterAuthClient.signIn.email(input);
      return { data: result.data, error: authError(result.error) };
    },
    async signOut() {
      const result = await betterAuthClient.signOut();
      return { error: authError(result.error) };
    },
    getSession: currentSession,
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
        data: user
          ? { claims: { sub: user.id, is_anonymous: false as const } }
          : null,
        error: null,
      };
    },
    async refreshSession() {
      const result = await currentSession();
      return {
        data: {
          session: result.data.session,
          user: result.data.session?.user ?? null,
        },
        error: result.error,
      };
    },
    onAuthStateChange(callback) {
      let initial = true;
      const unsubscribe =
        betterAuthClient.$store.atoms.$sessionSignal.subscribe(() => {
          void currentSession().then(({ data }) => {
            const event: AuthChangeEvent = initial
              ? 'INITIAL_SESSION'
              : data.session
                ? 'TOKEN_REFRESHED'
                : 'SIGNED_OUT';
            callback(event, data.session);
            initial = false;
          });
        });
      return { data: { subscription: { unsubscribe } } };
    },
  },
};

export function getAppAuthClient(): AppAuthClient {
  if (import.meta.env.DEV && window.__FUSTIFY_AUTH_TEST_CLIENT__) {
    return window.__FUSTIFY_AUTH_TEST_CLIENT__ as unknown as AppAuthClient;
  }
  return client;
}

export async function getAppSessionToken(): Promise<string | null> {
  const result = await betterAuthClient.getSession();
  return result.data?.session.token ?? null;
}
