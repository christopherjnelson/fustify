import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminConsoleNavigation,
  AdminConsolePanel,
} from './AdminConsolePanels';
import { accountMutationActions } from './adminAccountActions';
import { adminAccountSchema, type AdminConsoleSource } from './adminConsoleApi';

function source(): AdminConsoleSource {
  return {
    overview: vi.fn(async () => {
      throw new Error('not loaded during server render');
    }),
    accounts: vi.fn(async () => ({ accounts: [], hasMore: false })),
    rooms: vi.fn(async () => ({ rooms: [], hasMore: false })),
    logs: vi.fn(async () => ({ configured: false, entries: [] })),
    maintenance: vi.fn(async () => {
      throw new Error('not loaded during server render');
    }),
    audit: vi.fn(async () => []),
    metrics: vi.fn(async () => ({
      generatedAt: new Date(0).toISOString(),
      aggregates: {},
    })),
    revealAccount: vi.fn(async () => ({})),
    accountAction: vi.fn(async () => undefined),
    roomAction: vi.fn(async () => undefined),
    maintenanceAction: vi.fn(async () => undefined),
  };
}

describe('expanded administration console', () => {
  it('renders all lazy sections as keyboard-reachable tabs', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminConsoleNavigation, {
        activeTab: 'accounts',
        onChange: vi.fn(),
      }),
    );

    expect(markup.match(/role="tab"/g)).toHaveLength(8);
    expect(markup).toContain('aria-selected="true">Accounts');
    expect(markup).toContain('Balance Studies');
  });

  it('renders account filters while leaving unselected sections unloaded', () => {
    const consoleSource = source();
    const markup = renderToStaticMarkup(
      createElement(AdminConsolePanel, {
        activeTab: 'accounts',
        source: consoleSource,
      }),
    );

    expect(markup).toContain('Search accounts');
    expect(markup).toContain('Confirmation');
    expect(markup).not.toContain('Supabase logs');
    expect(consoleSource.logs).not.toHaveBeenCalled();
  });

  it('protects administrators and exposes state-appropriate account actions', () => {
    expect(accountMutationActions('admin')).toEqual([]);
    expect(accountMutationActions('deleted')).toEqual([]);
    expect(accountMutationActions('active')).toEqual([
      'ban',
      'revoke',
      'soft-delete',
    ]);
    expect(accountMutationActions('banned')).toEqual([
      'unban',
      'revoke',
      'soft-delete',
    ]);
  });

  it('rejects stale or malformed account snapshots at the browser boundary', () => {
    expect(() =>
      adminAccountSchema.parse({
        accountRef: 'too-short',
        maskedUserId: 'not-a-uuid',
        maskedEmail: 'a•••@example.invalid',
        displayName: 'Malformed',
        avatarUrl: null,
        providers: ['email'],
        createdAt: new Date(0).toISOString(),
        lastSignInAt: null,
        confirmedAt: null,
        status: 'superadmin',
        hostedRooms: -1,
        roomMemberships: 0,
        matchesPlayed: 0,
        gameplayCommands: 0,
      }),
    ).toThrow();
  });
});
