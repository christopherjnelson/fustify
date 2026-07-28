import { describe, expect, it } from 'vitest';
import type { ProtectedAccountState } from '../auth/accountState';
import { visibleAdminAccessState } from './adminAccessState';

function registered(userId: string): ProtectedAccountState {
  return {
    status: 'registered-ready',
    account: {
      userId,
      email: null,
      user: { id: userId } as never,
      profile: {
        userId,
        displayName: userId,
        avatarUrl: null,
        onboardingCompleted: true,
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
      },
    },
  };
}

describe('admin access state', () => {
  it('hides authorization while normal account resolution is incomplete', () => {
    expect(
      visibleAdminAccessState(
        { status: 'checking' },
        { status: 'allowed', userId: 'first' },
      ),
    ).toEqual({ status: 'inactive' });
  });

  it('never reuses a prior account authorization after account switching', () => {
    expect(
      visibleAdminAccessState(registered('second'), {
        status: 'allowed',
        userId: 'first',
      }),
    ).toEqual({ status: 'checking', userId: 'second' });
  });

  it('exposes only a result for the currently registered account', () => {
    expect(
      visibleAdminAccessState(registered('current'), {
        status: 'allowed',
        userId: 'current',
      }),
    ).toEqual({ status: 'allowed', userId: 'current' });
  });
});
