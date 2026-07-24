import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';
import { fetchOwnProfileForVerifiedUser, profileApiError } from './profileApi';
import type { UserProfile } from './profileModel';

export type AccountState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | {
      status: 'authenticated';
      userId: string;
      isAnonymous: boolean;
      profile: UserProfile;
    }
  | { status: 'error'; message: string };

export async function deriveAccountState(
  client: SupabaseClient<Database>,
): Promise<AccountState> {
  let authResult: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    authResult = await client.auth.getUser();
  } catch (authError) {
    return {
      status: 'error',
      message: profileApiError(authError).message,
    };
  }
  const { data, error } = authResult;
  if (!data.user) {
    if (
      !error ||
      error.name === 'AuthSessionMissingError' ||
      /auth session missing/i.test(error.message)
    ) {
      return { status: 'unavailable' };
    }
    return {
      status: 'error',
      message: profileApiError(error).message,
    };
  }
  if (error) {
    return {
      status: 'error',
      message: profileApiError(error).message,
    };
  }

  try {
    const profile = await fetchOwnProfileForVerifiedUser(client, data.user.id);
    return {
      status: 'authenticated',
      userId: data.user.id,
      isAnonymous: data.user.is_anonymous === true,
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
