import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { getSupabaseClient } from '../multiplayer/supabaseClient';
import { accountCapabilities } from './accountCapabilities';
import {
  AuthFlowError,
  authFlowError,
  clearGuestUpgradeIntent,
  clearRecoveryState,
  hasDiscordIdentity,
  initiateGuestEmailUpgrade,
  linkDiscordIdentity,
  registerWithEmail,
  requestPasswordRecovery,
  signInWithEmail,
  signInWithDiscord,
  signOutRegisteredAccount,
} from './authFlow';
import {
  BACKEND_ACCOUNT_REQUIRED_MESSAGE,
  PROFILE_UNAVAILABLE_MESSAGE,
  type AccountState,
  type RegisteredAccount,
} from './accountState';
import { useAccount } from './accountContext';
import { profileInitials } from './guestName';
import { updateCurrentProfile } from './profileApi';
import type { UserProfile } from './profileModel';
import { currentSafeReturnPath, validatedReturnPath } from './returnPath';

export type DialogView =
  | 'sign-in'
  | 'register'
  | 'guest-upgrade'
  | 'guest-switch-warning'
  | 'forgot-password'
  | 'edit-profile';

export const OPEN_PROFILE_EDITOR_EVENT = 'fustify:open-profile-editor';

type FormStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; code?: AuthFlowError['code'] };

function accountIdentity(account: AccountState) {
  if (account.status === 'registered-ready') {
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

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  maxLength,
  required = true,
}: {
  label: string;
  type?: 'text' | 'email' | 'password' | 'url';
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required={required}
      />
    </label>
  );
}

export function AuthDialog({
  view,
  account,
  onClose,
  onView,
  onProfileUpdated,
  returnPath,
}: {
  view: DialogView;
  account: AccountState;
  onClose: () => void;
  onView: (view: DialogView) => void;
  onProfileUpdated: (profile: UserProfile) => void;
  returnPath: string;
}) {
  const client = useMemo(() => getSupabaseClient(), []);
  const identity = accountIdentity(account);
  const dialogRef = useRef<HTMLElement>(null);
  const [displayName, setDisplayName] = useState(
    identity?.profile.displayName ?? '',
  );
  const [avatarUrl, setAvatarUrl] = useState(identity?.profile.avatarUrl ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });

  useEffect(() => {
    const dialog = dialogRef.current;
    (
      dialog?.querySelector<HTMLElement>('input') ??
      dialog?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
    )?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    try {
      if (view === 'register') {
        await registerWithEmail(client, {
          displayName,
          email,
          password,
          confirmPassword,
          returnPath,
        });
        setPassword('');
        setConfirmPassword('');
        setStatus({
          kind: 'success',
          message:
            'Check your email for a verification link to finish creating your account.',
        });
        return;
      }
      if (view === 'sign-in') {
        await signInWithEmail(client, { email, password });
        setPassword('');
        window.location.assign(validatedReturnPath(returnPath));
        return;
      }
      if (view === 'guest-upgrade') {
        if (!identity?.isAnonymous) {
          throw new AuthFlowError(
            'account_required',
            'The guest session is no longer available.',
          );
        }
        await initiateGuestEmailUpgrade(client, {
          email,
          expectedUserId: identity.userId,
          returnPath,
        });
        setStatus({
          kind: 'success',
          message:
            'Check your email in this browser to verify it, then choose a password and display name.',
        });
        return;
      }
      if (view === 'forgot-password') {
        const result = await requestPasswordRecovery(client, {
          email,
          returnPath: '/',
        });
        setStatus({
          kind: 'success',
          message:
            result === 'rate-limited'
              ? 'If that account exists, a reset email will arrive after the request limit clears.'
              : 'If that account exists, a password-reset email is on its way.',
        });
        return;
      }
      if (view === 'edit-profile') {
        if (!identity || identity.isAnonymous) {
          throw new AuthFlowError(
            'account_required',
            'Create an account to customize your profile.',
          );
        }
        const updatedProfile = await updateCurrentProfile(client, {
          displayName,
          avatarUrl: avatarUrl.trim() || null,
        });
        onProfileUpdated(updatedProfile);
        setStatus({ kind: 'success', message: 'Profile updated.' });
      }
    } catch (error) {
      const safe = authFlowError(error);
      setPassword('');
      setConfirmPassword('');
      setStatus({ kind: 'error', message: safe.message, code: safe.code });
    }
  };

  const startDiscord = async () => {
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    try {
      if (view === 'guest-upgrade') {
        if (!identity?.isAnonymous) {
          throw new AuthFlowError(
            'account_required',
            'The guest session is no longer available.',
          );
        }
        await linkDiscordIdentity(client, {
          intent: 'legacy-discord-upgrade',
          expectedUserId: identity.userId,
          returnPath,
        });
        return;
      }
      await signInWithDiscord(client, returnPath);
    } catch (error) {
      const safe = authFlowError(error);
      setStatus({ kind: 'error', message: safe.message, code: safe.code });
    }
  };

  const title =
    view === 'register'
      ? 'Create account'
      : view === 'guest-upgrade'
        ? 'Finish creating your account'
        : view === 'guest-switch-warning'
          ? 'Sign in to another account'
          : view === 'forgot-password'
            ? 'Reset password'
            : view === 'edit-profile'
              ? 'Edit profile'
              : 'Sign in';

  const switchGuest = async () => {
    setStatus({ kind: 'busy' });
    try {
      clearGuestUpgradeIntent();
      clearRecoveryState();
      await client.auth.signOut();
      onView('sign-in');
      setStatus({ kind: 'idle' });
    } catch (error) {
      setStatus({ kind: 'error', message: authFlowError(error).message });
    }
  };

  return (
    <div className="auth-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <header>
          <div>
            <span className="eyebrow">Fustify account</span>
            <h2 id="auth-dialog-title">{title}</h2>
          </div>
          <button
            type="button"
            className="auth-dialog-close"
            aria-label="Close account dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {view === 'guest-switch-warning' ? (
          <div className="auth-warning">
            <p>
              This guest identity cannot be recovered after sign-out unless you
              finish creating an account. Guest-owned data will not
              automatically transfer to another account.
            </p>
            <button
              type="button"
              className="auth-danger-action"
              disabled={status.kind === 'busy'}
              onClick={() => void switchGuest()}
            >
              Sign out guest and continue
            </button>
            <button type="button" onClick={() => onView('guest-upgrade')}>
              Keep guest and create account
            </button>
          </div>
        ) : (
          <>
            {view === 'guest-upgrade' && (
              <span className="auth-method-label">Finish with email</span>
            )}
            <form
              className="auth-form"
              onSubmit={(event) => void submit(event)}
            >
              {(view === 'register' || view === 'edit-profile') && (
                <Field
                  label="Display name"
                  value={displayName}
                  onChange={setDisplayName}
                  autoComplete="nickname"
                  maxLength={40}
                />
              )}
              {view === 'edit-profile' && (
                <Field
                  label="Avatar URL (optional)"
                  type="url"
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                  autoComplete="url"
                  maxLength={2048}
                  required={false}
                />
              )}
              {view !== 'edit-profile' && (
                <Field
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete={view === 'sign-in' ? 'username' : 'email'}
                  maxLength={254}
                />
              )}
              {(view === 'register' || view === 'sign-in') && (
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={
                    view === 'register' ? 'new-password' : 'current-password'
                  }
                />
              )}
              {view === 'register' && (
                <Field
                  label="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
              )}
              <button type="submit" disabled={status.kind === 'busy'}>
                {status.kind === 'busy'
                  ? 'Working…'
                  : view === 'register'
                    ? 'Create account'
                    : view === 'guest-upgrade'
                      ? 'Send verification email'
                      : view === 'forgot-password'
                        ? 'Send reset email'
                        : view === 'edit-profile'
                          ? 'Save profile'
                          : 'Sign in'}
              </button>
            </form>
            {(view === 'sign-in' ||
              view === 'register' ||
              view === 'guest-upgrade') && (
              <div className="auth-oauth-option">
                <span aria-hidden="true">or</span>
                <button
                  type="button"
                  className="auth-discord-action"
                  disabled={status.kind === 'busy'}
                  onClick={() => void startDiscord()}
                >
                  {status.kind === 'busy'
                    ? 'Connecting…'
                    : 'Continue with Discord'}
                </button>
              </div>
            )}
          </>
        )}

        {status.kind === 'success' && (
          <p className="auth-success" role="status">
            {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <div className="auth-error" role="alert">
            <p>{status.message}</p>
            {status.code === 'email_conflict' && (
              <>
                <p>
                  Your guest rooms and other guest-owned data will not transfer
                  automatically if you sign in to that account.
                </p>
                <button
                  type="button"
                  onClick={() => onView('guest-switch-warning')}
                >
                  Sign in to the existing account
                </button>
              </>
            )}
            {status.code === 'identity_conflict' &&
              view === 'guest-upgrade' && (
                <p>
                  Switching to another account will not transfer legacy rooms,
                  profiles, reactions, matches, or other legacy-owned data.
                </p>
              )}
          </div>
        )}

        <nav className="auth-dialog-nav" aria-label="Account options">
          {view === 'sign-in' && (
            <>
              <button type="button" onClick={() => onView('forgot-password')}>
                Forgot password?
              </button>
              <button type="button" onClick={() => onView('register')}>
                Create account
              </button>
            </>
          )}
          {(view === 'register' || view === 'forgot-password') && (
            <button type="button" onClick={() => onView('sign-in')}>
              Back to sign in
            </button>
          )}
        </nav>
      </section>
    </div>
  );
}

export function AccountControl({ compact = false }: { compact?: boolean }) {
  const { client, controller, state: account } = useAccount();
  const identity = accountIdentity(account);
  const [dialog, setDialog] = useState<DialogView | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
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
    if (params.get('account') !== 'create') return;
    const timer = window.setTimeout(() => {
      setDialog(
        account.status === 'legacy-anonymous' ? 'guest-upgrade' : 'register',
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
            <span className="account-provider-status">Discord connected</span>
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
        <AuthDialog
          key={`${dialog}:${identity?.userId ?? 'signed-out'}`}
          view={dialog}
          account={account}
          onClose={() => setDialog(null)}
          onView={setDialog}
          onProfileUpdated={(profile) => controller?.updateProfile(profile)}
          returnPath={returnPath}
        />
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
      <div className="protected-route-shell">
        <AccountControl compact />
        {application.node}
      </div>
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
        <AuthDialog
          key={`${visibleDialog}:${identity?.userId ?? 'signed-out'}`}
          view={visibleDialog}
          account={account}
          onClose={() => setDialog(null)}
          onView={setDialog}
          onProfileUpdated={(profile) => controller?.updateProfile(profile)}
          returnPath={safeReturnPath}
        />
      )}
    </main>
  );
}
