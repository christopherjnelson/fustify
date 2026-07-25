import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAccount } from '../auth/accountContext';
import type { Database } from '../multiplayer/database.types';
import { checkCurrentUserIsAdmin } from './adminApi';
import { AdminAccessContext } from './adminAccessContext';
import {
  visibleAdminAccessState,
  type AdminAccessState,
} from './adminAccessState';
const pendingChecks = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<boolean>>
>();

function coalescedAdminCheck(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  let byUser = pendingChecks.get(client);
  if (!byUser) {
    byUser = new Map();
    pendingChecks.set(client, byUser);
  }
  const pending = byUser.get(userId);
  if (pending) return pending;
  const check = checkCurrentUserIsAdmin(client).finally(() => {
    if (byUser.get(userId) === check) byUser.delete(userId);
  });
  byUser.set(userId, check);
  return check;
}

export function AdminAccessProvider({ children }: { children: ReactNode }) {
  const { client, state: account } = useAccount();
  const [checked, setChecked] = useState<AdminAccessState>({
    status: 'inactive',
  });
  const [retryVersion, setRetryVersion] = useState(0);
  const userId =
    account.status === 'registered-ready' ? account.account.userId : null;
  const retry = useCallback(() => {
    if (userId) setChecked({ status: 'checking', userId });
    setRetryVersion((version) => version + 1);
  }, [userId]);

  useEffect(() => {
    if (!client || !userId) {
      let active = true;
      queueMicrotask(() => {
        if (active) setChecked({ status: 'inactive' });
      });
      return () => {
        active = false;
      };
    }
    let active = true;
    void coalescedAdminCheck(client, userId)
      .then((allowed) => {
        if (active) {
          setChecked({ status: allowed ? 'allowed' : 'denied', userId });
        }
      })
      .catch(() => {
        if (active) {
          console.warn('Admin access verification failed.');
          setChecked({ status: 'error', userId });
        }
      });
    return () => {
      active = false;
    };
  }, [client, retryVersion, userId]);

  useEffect(() => {
    if (!userId) return;
    window.addEventListener('focus', retry);
    return () => window.removeEventListener('focus', retry);
  }, [retry, userId]);
  const state = visibleAdminAccessState(account, checked);
  const value = useMemo(() => ({ state, retry }), [retry, state]);

  return (
    <AdminAccessContext.Provider value={value}>
      {children}
    </AdminAccessContext.Provider>
  );
}
