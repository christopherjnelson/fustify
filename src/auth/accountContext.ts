import { createContext, useContext } from 'react';
import type { AppAuthClient } from './authClientTypes';
import type { AccountController, ProtectedAccountState } from './accountState';

export interface AccountContextValue {
  client: AppAuthClient | null;
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
