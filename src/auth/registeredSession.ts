import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';

const SESSION_REFRESH_MESSAGE =
  'Your account session could not be refreshed. Please try again.';
const SESSION_VERIFICATION_MESSAGE =
  'Your account session could not be verified. Please try again.';

export type RegisteredSessionResult =
  | { status: 'registered-ready'; user: User }
  | { status: 'signed-out' }
  | { status: 'legacy-anonymous'; user: User }
  | {
      status: 'error';
      reason:
        | 'refresh-failed'
        | 'identity-changed'
        | 'invalid-claims'
        | 'verification-failed';
      message: string;
    };

type Client = SupabaseClient<Database>;

const refreshes = new WeakMap<Client, Promise<RegisteredSessionResult>>();
const generations = new WeakMap<Client, number>();

function generation(client: Client): number {
  return generations.get(client) ?? 0;
}

export function invalidateRegisteredSessionPreparation(client: Client): void {
  generations.set(client, generation(client) + 1);
}

async function verifiedClaims(
  client: Client,
  accessToken: string,
): Promise<
  { ok: true; subject: string; isAnonymous: boolean } | { ok: false }
> {
  try {
    const result = await client.auth.getClaims(accessToken);
    const claims = result.data?.claims;
    if (
      result.error ||
      !claims ||
      typeof claims.sub !== 'string' ||
      typeof claims.is_anonymous !== 'boolean'
    ) {
      return { ok: false };
    }
    return {
      ok: true,
      subject: claims.sub,
      isAnonymous: claims.is_anonymous,
    };
  } catch {
    return { ok: false };
  }
}

async function refreshAndVerify(
  client: Client,
  expectedUserId: string,
  startedAtGeneration: number,
): Promise<RegisteredSessionResult> {
  let refreshed: Awaited<ReturnType<typeof client.auth.refreshSession>>;
  try {
    refreshed = await client.auth.refreshSession();
  } catch {
    return {
      status: 'error',
      reason: 'refresh-failed',
      message: SESSION_REFRESH_MESSAGE,
    };
  }
  if (generation(client) !== startedAtGeneration) {
    return { status: 'signed-out' };
  }
  if (refreshed.error || !refreshed.data.session) {
    return {
      status: 'error',
      reason: 'refresh-failed',
      message: SESSION_REFRESH_MESSAGE,
    };
  }

  let verified: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    verified = await client.auth.getUser(refreshed.data.session.access_token);
  } catch {
    return {
      status: 'error',
      reason: 'refresh-failed',
      message: SESSION_REFRESH_MESSAGE,
    };
  }
  if (generation(client) !== startedAtGeneration) {
    return { status: 'signed-out' };
  }
  const user = verified.data.user;
  if (verified.error || !user) {
    return {
      status: 'error',
      reason: 'refresh-failed',
      message: SESSION_REFRESH_MESSAGE,
    };
  }
  if (user.id !== expectedUserId) {
    return {
      status: 'error',
      reason: 'identity-changed',
      message: SESSION_REFRESH_MESSAGE,
    };
  }

  const claims = await verifiedClaims(
    client,
    refreshed.data.session.access_token,
  );
  if (generation(client) !== startedAtGeneration) {
    return { status: 'signed-out' };
  }
  if (!claims.ok || claims.subject !== expectedUserId) {
    return {
      status: 'error',
      reason: 'invalid-claims',
      message: SESSION_REFRESH_MESSAGE,
    };
  }
  if (claims.isAnonymous) {
    return { status: 'legacy-anonymous', user };
  }
  if (user.is_anonymous !== false) {
    return { status: 'legacy-anonymous', user };
  }
  return { status: 'registered-ready', user };
}

function sharedRefresh(
  client: Client,
  expectedUserId: string,
): Promise<RegisteredSessionResult> {
  const pending = refreshes.get(client);
  if (pending) return pending;

  const startedAtGeneration = generation(client);
  const refresh = refreshAndVerify(
    client,
    expectedUserId,
    startedAtGeneration,
  ).finally(() => {
    if (refreshes.get(client) === refresh) refreshes.delete(client);
  });
  refreshes.set(client, refresh);
  return refresh;
}

export async function ensureRegisteredSessionReady(
  client: Client,
  options: {
    forceRefresh?: boolean;
    expectedUserId?: string;
  } = {},
): Promise<RegisteredSessionResult> {
  let sessionResult: Awaited<ReturnType<typeof client.auth.getSession>>;
  try {
    sessionResult = await client.auth.getSession();
  } catch {
    return {
      status: 'error',
      reason: 'verification-failed',
      message: SESSION_VERIFICATION_MESSAGE,
    };
  }
  const session = sessionResult.data.session;
  if (sessionResult.error) {
    return {
      status: 'error',
      reason: 'verification-failed',
      message: SESSION_VERIFICATION_MESSAGE,
    };
  }
  if (!session) return { status: 'signed-out' };

  const startedAtGeneration = generation(client);
  let verified: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    verified = await client.auth.getUser(session.access_token);
  } catch {
    return {
      status: 'error',
      reason: 'verification-failed',
      message: SESSION_VERIFICATION_MESSAGE,
    };
  }
  if (generation(client) !== startedAtGeneration) {
    return { status: 'signed-out' };
  }
  const user = verified.data.user;
  if (verified.error || !user) {
    return verified.error?.name === 'AuthSessionMissingError' ||
      /auth session missing/i.test(verified.error?.message ?? '')
      ? { status: 'signed-out' }
      : {
          status: 'error',
          reason: 'verification-failed',
          message: SESSION_VERIFICATION_MESSAGE,
        };
  }
  if (options.expectedUserId && user.id !== options.expectedUserId) {
    return {
      status: 'error',
      reason: 'identity-changed',
      message: SESSION_REFRESH_MESSAGE,
    };
  }

  const claims = await verifiedClaims(client, session.access_token);
  if (generation(client) !== startedAtGeneration) {
    return { status: 'signed-out' };
  }
  if (!claims.ok || claims.subject !== user.id) {
    return {
      status: 'error',
      reason: 'invalid-claims',
      message: SESSION_VERIFICATION_MESSAGE,
    };
  }
  if (user.is_anonymous !== false) {
    return { status: 'legacy-anonymous', user };
  }
  if (options.forceRefresh) {
    return sharedRefresh(client, user.id);
  }
  if (claims.isAnonymous === false) {
    return { status: 'registered-ready', user };
  }
  return sharedRefresh(client, user.id);
}
