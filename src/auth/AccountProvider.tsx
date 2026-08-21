import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAppAuthClient } from './appAuthClient';
import {
  getAccountController,
  type ProtectedAccountState,
} from './accountState';
import { AccountContext } from './accountContext';
import { completeCurrentProfile } from './profileHttpApi';

const configurationError: ProtectedAccountState = {
  status: 'error',
  message: 'Account configuration is unavailable.',
};

export function AccountProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getAppAuthClient(), []);
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
    if (state.status !== 'onboarding-required') return;
    void completeCurrentProfile(client, {
      displayName: state.account.profile.displayName,
      avatarUrl: state.account.profile.avatarUrl,
    })
      .then((profile) => controller?.updateProfile(profile))
      .catch(() => undefined);
  }, [client, controller, state]);

  const value = useMemo(
    () => ({ client, controller, state }),
    [client, controller, state],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}
