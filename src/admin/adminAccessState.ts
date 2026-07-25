import type { ProtectedAccountState } from '../auth/accountState';

export type AdminAccessState =
  | { status: 'inactive' }
  | { status: 'checking'; userId: string }
  | { status: 'allowed'; userId: string }
  | { status: 'denied'; userId: string }
  | { status: 'error'; userId: string };

export function visibleAdminAccessState(
  account: ProtectedAccountState,
  checked: AdminAccessState,
): AdminAccessState {
  if (account.status !== 'registered-ready') return { status: 'inactive' };
  if ('userId' in checked && checked.userId === account.account.userId) {
    return checked;
  }
  return { status: 'checking', userId: account.account.userId };
}
