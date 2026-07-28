import { useCallback, useMemo } from 'react';
import { AccountProvider } from '../auth/AccountProvider';
import { AccountRequiredGate } from '../auth/AccountControl';
import { useAccount } from '../auth/accountContext';
import type { AdminDashboardSource } from './adminApi';
import type { AdminConsoleSource } from './adminConsoleApi';
import { supabaseAdminDashboardSource } from './adminApi';
import { serverAdminConsoleSource } from './adminConsoleApi';
import { AdminAccessProvider } from './adminAccess';
import { useAdminAccess } from './adminAccessContext';
import { AdminDashboard } from './AdminDashboard';
import type { AdminReportSource } from './reportSource';

function AdminState({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <main className="admin-shell admin-gate">
      <section className="admin-state-card" aria-live="polite">
        <p className="admin-eyebrow">Fustify administration</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="admin-gate-actions">
          {retry && (
            <button type="button" onClick={retry}>
              Try Again
            </button>
          )}
          <a href="/">Return to Fustify</a>
        </div>
      </section>
    </main>
  );
}

function AuthorizedAdmin({
  verificationSource,
  verificationDataAvailable,
}: {
  verificationSource: AdminReportSource;
  verificationDataAvailable: boolean;
}) {
  const { client, state: account } = useAccount();
  const { state: access, retry } = useAdminAccess();
  const source = useMemo(
    () => (client ? supabaseAdminDashboardSource(client) : null),
    [client],
  );
  const consoleSource = useMemo(
    () => (client ? serverAdminConsoleSource(client) : null),
    [client],
  );

  if (access.status === 'checking') {
    return (
      <AdminState
        title="Checking admin access…"
        message="The dashboard remains hidden while Supabase verifies your role."
      />
    );
  }
  if (access.status === 'denied') {
    return (
      <AdminState
        title="Admin access required"
        message="This area is restricted to authorized Fustify administrators."
      />
    );
  }
  if (access.status === 'error') {
    return (
      <AdminState
        title="Unable to verify admin access"
        message="The authorization service could not be reached. Try again before accessing the dashboard."
        retry={retry}
      />
    );
  }
  if (
    access.status !== 'allowed' ||
    account.status !== 'registered-ready' ||
    !source ||
    !consoleSource
  ) {
    return (
      <AdminState
        title="Unable to verify admin access"
        message="The account session is not ready for authorization."
        retry={retry}
      />
    );
  }

  return (
    <AdminDashboard
      operationsSource={source}
      consoleSource={consoleSource}
      source={verificationSource}
      dataAvailable={verificationDataAvailable}
    />
  );
}

function AdminAccountGate({
  verificationSource,
  verificationDataAvailable,
}: {
  verificationSource: AdminReportSource;
  verificationDataAvailable: boolean;
}) {
  const load = useCallback(
    async () => (
      <AuthorizedAdmin
        verificationSource={verificationSource}
        verificationDataAvailable={verificationDataAvailable}
      />
    ),
    [verificationDataAvailable, verificationSource],
  );

  return <AccountRequiredGate returnPath="/admin" load={load} />;
}

export function AdminApp({
  verificationSource,
  verificationDataAvailable,
}: {
  verificationSource: AdminReportSource;
  verificationDataAvailable: boolean;
}) {
  return (
    <AccountProvider>
      <AdminAccessProvider>
        <AdminAccountGate
          verificationSource={verificationSource}
          verificationDataAvailable={verificationDataAvailable}
        />
      </AdminAccessProvider>
    </AccountProvider>
  );
}

export function AdminFixtureApp({
  operationsSource,
  consoleSource,
  verificationSource,
}: {
  operationsSource: AdminDashboardSource;
  consoleSource?: AdminConsoleSource;
  verificationSource: AdminReportSource;
}) {
  return (
    <AdminDashboard
      operationsSource={operationsSource}
      consoleSource={consoleSource}
      source={verificationSource}
      fixture
    />
  );
}

export function AdminFixtureGate({
  state,
}: {
  state: 'checking' | 'denied' | 'error';
}) {
  if (state === 'checking') {
    return (
      <AdminState
        title="Checking admin access…"
        message="The dashboard remains hidden while Supabase verifies your role."
      />
    );
  }
  if (state === 'denied') {
    return (
      <AdminState
        title="Admin access required"
        message="This area is restricted to authorized Fustify administrators."
      />
    );
  }
  return (
    <AdminState
      title="Unable to verify admin access"
      message="The authorization service could not be reached. Try again before accessing the dashboard."
      retry={() => undefined}
    />
  );
}
