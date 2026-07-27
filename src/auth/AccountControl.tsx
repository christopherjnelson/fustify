import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { accountCapabilities } from './accountCapabilities';
import {
  authFlowError,
  hasDiscordIdentity,
  linkDiscordIdentity,
  signOutRegisteredAccount,
} from './authFlow';
import {
  BACKEND_ACCOUNT_REQUIRED_MESSAGE,
  PROFILE_UNAVAILABLE_MESSAGE,
  type RegisteredAccount,
} from './accountState';
import { useAccount } from './accountContext';
import { accountIdentity } from './accountIdentity';
import { profileInitials } from './guestName';
import { currentSafeReturnPath, validatedReturnPath } from './returnPath';
import { BrandedAppShell } from '../brand/BrandedAppShell';
import { useAdminAccess } from '../admin/adminAccessContext';
import { DiscordIcon } from './DiscordIcon';

export type DialogView =
  | 'sign-in'
  | 'register'
  | 'guest-upgrade'
  | 'guest-switch-warning'
  | 'forgot-password'
  | 'edit-profile';

export const OPEN_PROFILE_EDITOR_EVENT = 'fustify:open-profile-editor';

function Avatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  return avatarUrl ? (
    <img className="account-avatar" src={avatarUrl} alt="" />
  ) : (
    <span className="account-avatar account-avatar-fallback" aria-hidden="true">
      {profileInitials(displayName)}
    </span>
  );
}

const AuthDialog = lazy(() => import('./AuthDialog'));

export function AccountControl({ compact = false }: { compact?: boolean }) {
  const { client, controller, state: account } = useAccount();
  const { state: adminAccess } = useAdminAccess();
  const identity = accountIdentity(account);
  const [dialog, setDialog] = useState<DialogView | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const [returnPath] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('returnPath');
    return requested ? validatedReturnPath(requested) : currentSafeReturnPath();
  });

  useEffect(() => {
    if (
      account.status !== 'registered-ready' &&
      account.status !== 'legacy-anonymous' &&
      account.status !== 'signed-out'
    ) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const requestedAccountAction = params.get('account');
    if (
      requestedAccountAction !== 'create' &&
      requestedAccountAction !== 'recovery'
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDialog(
        requestedAccountAction === 'recovery'
          ? 'forgot-password'
          : account.status === 'legacy-anonymous'
            ? 'guest-upgrade'
            : 'register',
      );
    }, 0);
    params.delete('account');
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
    );
    return () => window.clearTimeout(timer);
  }, [account]);

  useEffect(() => {
    const openProfileEditor = () => {
      if (account.status !== 'registered-ready') return;
      dialogTriggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setSignOutError(null);
      setDialog('edit-profile');
    };
    window.addEventListener(OPEN_PROFILE_EDITOR_EVENT, openProfileEditor);
    return () =>
      window.removeEventListener(OPEN_PROFILE_EDITOR_EVENT, openProfileEditor);
  }, [account.status]);

  if (!client) {
    return (
      <aside className="account-control" aria-label="Account">
        <span>Account service unavailable</span>
      </aside>
    );
  }

  const open = (view: DialogView) => {
    dialogTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSignOutError(null);
    setDialog(view);
  };

  const connectDiscord = async () => {
    if (
      discordBusy ||
      account.status !== 'registered-ready' ||
      hasDiscordIdentity(account.account.user)
    ) {
      return;
    }
    setDiscordBusy(true);
    setSignOutError(null);
    try {
      await linkDiscordIdentity(client, {
        intent: 'discord-link',
        expectedUserId: account.account.userId,
        returnPath,
      });
    } catch (error) {
      setDiscordBusy(false);
      setSignOutError(authFlowError(error).message);
    }
  };

  return (
    <aside
      className={`account-control${compact ? ' account-control-compact' : ''}`}
      aria-label="Account"
    >
      {account.status === 'checking' && <span>Checking account…</span>}
      {account.status === 'error' && (
        <div className="account-actions">
          <span role="alert">{account.message}</span>
          {controller && (
            <button type="button" onClick={() => void controller.retry()}>
              Retry
            </button>
          )}
        </div>
      )}
      {account.status === 'signed-out' && (
        <div className="account-actions">
          <button type="button" onClick={() => open('sign-in')}>
            Account
          </button>
        </div>
      )}
      {identity && (
        <div className="account-summary">
          {!identity.isAnonymous && (
            <Avatar
              displayName={identity.profile.displayName}
              avatarUrl={identity.profile.avatarUrl}
            />
          )}
          <div className="account-identity">
            <strong>
              {identity.isAnonymous
                ? 'Finish account setup'
                : identity.profile.displayName}
            </strong>
            <span>
              {identity.isAnonymous
                ? 'Required for gameplay'
                : (identity.email ?? 'Registered account')}
            </span>
          </div>
          {!identity.isAnonymous && hasDiscordIdentity(identity.user) && (
            <span className="account-provider-status">
              <DiscordIcon />
              Discord connected
            </span>
          )}
          {identity.isAnonymous ? (
            <div className="account-actions">
              <button type="button" onClick={() => open('guest-upgrade')}>
                Finish account setup
              </button>
              <button
                type="button"
                onClick={() => open('guest-switch-warning')}
              >
                Sign in to existing account
              </button>
            </div>
          ) : (
            <div className="account-actions">
              {adminAccess.status === 'allowed' && (
                <a className="admin-nav-link" href="/admin">
                  Admin
                </a>
              )}
              {!compact &&
                accountCapabilities(identity.isAnonymous)
                  .canCustomizeProfile && (
                  <button type="button" onClick={() => open('edit-profile')}>
                    Edit profile
                  </button>
                )}
              {!compact && !hasDiscordIdentity(identity.user) && (
                <button
                  type="button"
                  disabled={discordBusy}
                  onClick={() => void connectDiscord()}
                >
                  {discordBusy ? 'Connecting…' : 'Connect Discord'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSignOutError(null);
                  void signOutRegisteredAccount(client)
                    .then(() => window.location.assign('/'))
                    .catch((error) =>
                      setSignOutError(authFlowError(error).message),
                    );
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
      {signOutError && <span role="alert">{signOutError}</span>}
      {dialog && (
        <Suspense fallback={null}>
          <AuthDialog
            key={`${dialog}:${identity?.userId ?? 'signed-out'}`}
            view={dialog}
            account={account}
            onClose={() => {
              setDialog(null);
              window.setTimeout(() => dialogTriggerRef.current?.focus(), 0);
            }}
            onView={setDialog}
            onProfileUpdated={(profile) => controller?.updateProfile(profile)}
            returnPath={returnPath}
          />
        </Suspense>
      )}
    </aside>
  );
}

export function AccountRequiredGate({
  returnPath,
  load,
}: {
  returnPath: string;
  load: (account: RegisteredAccount) => Promise<ReactNode>;
}) {
  const { client, controller, state: account } = useAccount();
  const identity = accountIdentity(account);
  const [dialog, setDialog] = useState<DialogView | null | undefined>(
    undefined,
  );
  const [application, setApplication] = useState<{
    userId: string;
    node: ReactNode;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const safeReturnPath = useMemo(
    () => validatedReturnPath(returnPath),
    [returnPath],
  );

  useEffect(() => {
    if (account.status !== 'registered-ready') {
      return;
    }
    let active = true;
    void load(account.account)
      .then((loaded) => {
        if (active) {
          setApplication({ userId: account.account.userId, node: loaded });
        }
      })
      .catch(() => {
        if (active) {
          setLoadError('The game could not be loaded. Please try again.');
        }
      });
    return () => {
      active = false;
    };
  }, [account, load]);

  const visibleDialog =
    dialog === undefined
      ? client && account.status === 'signed-out'
        ? 'sign-in'
        : account.status === 'legacy-anonymous'
          ? 'guest-upgrade'
          : null
      : dialog;

  if (
    account.status === 'registered-ready' &&
    application?.userId === account.account.userId
  ) {
    return (
      <BrandedAppShell accountControl={<AccountControl compact />}>
        {application.node}
      </BrandedAppShell>
    );
  }

  let title: string;
  let message: string;
  switch (account.status) {
    case 'checking':
      title = 'Checking your account…';
      message = 'Verifying your registered session.';
      break;
    case 'signed-out':
      title = 'Account required';
      message = 'Sign in or create an account to continue.';
      break;
    case 'legacy-anonymous':
      title = 'Finish creating your account to continue';
      message =
        'Keep this identity by finishing with email or Discord before entering gameplay.';
      break;
    case 'registered-ready':
      title = loadError ? 'Game unavailable' : 'Loading game…';
      message =
        loadError ?? 'Your registered account is ready. Loading gameplay.';
      break;
    case 'error':
      title =
        account.message === PROFILE_UNAVAILABLE_MESSAGE
          ? 'Profile unavailable'
          : account.message === BACKEND_ACCOUNT_REQUIRED_MESSAGE
            ? 'Account session invalidated'
            : 'Account session problem';
      message = account.message;
      break;
    default:
      title = 'Account session problem';
      message = 'Your account state could not be verified. Please try again.';
  }

  return (
    <main className="auth-route-shell" data-account-state={account.status}>
      {account.status === 'registered-ready' && <AccountControl compact />}
      <section className="auth-route-card" aria-live="polite">
        <span className="eyebrow">Fustify account</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {client && account.status === 'signed-out' && (
          <div className="account-actions">
            <button type="button" onClick={() => setDialog('sign-in')}>
              Sign in
            </button>
            <button type="button" onClick={() => setDialog('register')}>
              Create account
            </button>
            <button type="button" onClick={() => setDialog('forgot-password')}>
              Forgot password
            </button>
          </div>
        )}
        {account.status === 'legacy-anonymous' && (
          <div className="account-actions">
            <button type="button" onClick={() => setDialog('guest-upgrade')}>
              Finish creating account
            </button>
            <button
              type="button"
              onClick={() => setDialog('guest-switch-warning')}
            >
              Sign in to existing account
            </button>
          </div>
        )}
        {account.status === 'error' && controller && (
          <div className="account-actions">
            <button type="button" onClick={() => void controller.retry()}>
              Retry session verification
            </button>
          </div>
        )}
        <a href="/">Return home</a>
      </section>
      {visibleDialog && (
        <Suspense fallback={null}>
          <AuthDialog
            key={`${visibleDialog}:${identity?.userId ?? 'signed-out'}`}
            view={visibleDialog}
            account={account}
            onClose={() => setDialog(null)}
            onView={setDialog}
            onProfileUpdated={(profile) => controller?.updateProfile(profile)}
            returnPath={safeReturnPath}
          />
        </Suspense>
      )}
    </main>
  );
}
