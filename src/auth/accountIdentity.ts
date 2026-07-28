import type { AccountState } from './accountState';

export function accountIdentity(account: AccountState) {
  if (
    account.status === 'registered-ready' ||
    account.status === 'onboarding-required'
  ) {
    return {
      isAnonymous: false,
      user: account.account.user,
      userId: account.account.userId,
      email: account.account.email,
      profile: account.account.profile,
    };
  }
  if (account.status === 'legacy-anonymous') {
    return {
      isAnonymous: true,
      user: account.user,
      userId: account.user.id,
      email: account.user.email ?? null,
      profile: account.profile,
    };
  }
  return null;
}
