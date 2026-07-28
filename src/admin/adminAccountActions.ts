import type { AdminAccount } from './adminConsoleApi';

export type AdminAccountMutationAction =
  'ban' | 'unban' | 'revoke' | 'soft-delete';

export function accountMutationActions(
  status: AdminAccount['status'],
): AdminAccountMutationAction[] {
  if (status === 'admin' || status === 'deleted') return [];
  return status === 'banned' || status === 'revoked'
    ? ['unban', 'revoke', 'soft-delete']
    : ['ban', 'revoke', 'soft-delete'];
}
