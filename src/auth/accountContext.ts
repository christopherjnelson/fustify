import { createContext, useContext } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';
import type { AccountController, ProtectedAccountState } from './accountState';

export interface AccountContextValue {
  client: SupabaseClient<Database> | null;
  controller: AccountController | null;
  state: ProtectedAccountState;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error('AccountProvider is required for account consumers.');
  }
  return value;
}
