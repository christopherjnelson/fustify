import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';
import { fetchOwnProfileForVerifiedUser, profileApiError } from './profileApi';
import type { UserProfile } from './profileModel';
import {
  ensureRegisteredSessionReady,
  invalidateRegisteredSessionPreparation,
} from './registeredSession';

export type AccountState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | {
      status: 'authenticated';
      userId: string;
      isAnonymous: boolean;
      email: string | null;
      profile: UserProfile;
    }
  | { status: 'error'; message: string };

export async function deriveAccountState(
  client: SupabaseClient<Database>,
): Promise<AccountState> {
  const prepared = await ensureRegisteredSessionReady(client);
  if (prepared.status === 'signed-out') return { status: 'unavailable' };
  if (prepared.status === 'unavailable' || prepared.status === 'error') {
    return { status: 'error', message: prepared.message };
  }
  const user = prepared.user;

  try {
    const profile = await fetchOwnProfileForVerifiedUser(client, user.id);
    return {
      status: 'authenticated',
      userId: user.id,
      isAnonymous: prepared.status === 'legacy-guest',
      email: user.email ?? null,
      profile,
    };
  } catch (profileError) {
    return {
      status: 'error',
      message: profileApiError(profileError).message,
    };
  }
}

export function observeAccountState(
  client: SupabaseClient<Database>,
  onChange: (state: AccountState) => void,
): () => void {
  let active = true;
  let initialRefreshPending = true;
  let refreshPending = false;
  let refreshQueued = false;
  let lastAuthenticatedUserId: string | null = null;
  let stateVersion = 0;

  const refresh = () => {
    if (!active) return;
    if (refreshPending) {
      refreshQueued = true;
      stateVersion += 1;
      return;
    }

    refreshPending = true;
    const refreshVersion = ++stateVersion;
    onChange({ status: 'loading' });
    void deriveAccountState(client)
      .then((state) => {
        if (!active || refreshVersion !== stateVersion) return;
        lastAuthenticatedUserId =
          state.status === 'authenticated' ? state.userId : null;
        onChange(state);
      })
      .finally(() => {
        initialRefreshPending = false;
        refreshPending = false;
        if (refreshQueued) {
          refreshQueued = false;
          refresh();
        }
      });
  };

  const handleAuthChange = (
    event: AuthChangeEvent,
    session: {
      user?: { id?: string } | null;
    } | null,
  ) => {
    if (!active) return;
    if (event === 'INITIAL_SESSION' && initialRefreshPending) return;
    if (event === 'SIGNED_OUT') {
      invalidateRegisteredSessionPreparation(client);
      stateVersion += 1;
      refreshQueued = false;
      lastAuthenticatedUserId = null;
      onChange({ status: 'unavailable' });
      return;
    }
    if (
      event === 'TOKEN_REFRESHED' &&
      session?.user?.id === lastAuthenticatedUserId
    ) {
      return;
    }
    refresh();
  };

  const { data } = client.auth.onAuthStateChange(handleAuthChange);
  refresh();

  return () => {
    active = false;
    stateVersion += 1;
    refreshQueued = false;
    data.subscription.unsubscribe();
  };
}
