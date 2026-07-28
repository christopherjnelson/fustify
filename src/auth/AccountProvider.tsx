import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getSupabaseClient,
  readMultiplayerConfiguration,
} from '../multiplayer/supabaseClient';
import {
  getAccountController,
  type ProtectedAccountState,
} from './accountState';
import { AccountContext } from './accountContext';

const configurationError: ProtectedAccountState = {
  status: 'error',
  message: 'Account configuration is unavailable.',
};

export function AccountProvider({ children }: { children: ReactNode }) {
  const configured = readMultiplayerConfiguration() !== null;
  const client = useMemo(
    () => (configured ? getSupabaseClient() : null),
    [configured],
  );
  const controller = useMemo(
    () => (client ? getAccountController(client) : null),
    [client],
  );
  const [state, setState] = useState<ProtectedAccountState>(
    controller?.getState() ?? configurationError,
  );

  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(setState);
  }, [controller]);

  useEffect(() => {
    if (
      state.status === 'onboarding-required' &&
      !window.location.pathname.startsWith('/auth/complete-profile')
    ) {
      window.location.replace('/auth/complete-profile');
    }
  }, [state.status]);

  const value = useMemo(
    () => ({ client, controller, state }),
    [client, controller, state],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}
