import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../multiplayer/supabaseClient';
import { DiscordIcon } from './DiscordIcon';
import {
  AuthFlowError,
  authFlowError,
  clearGuestUpgradeIntent,
  clearRecoveryState,
  initiateGuestEmailUpgrade,
  linkDiscordIdentity,
  registerWithEmail,
  requestPasswordRecovery,
  resendSignupVerification,
  signInWithDiscord,
  signInWithEmail,
} from './authFlow';
import type { AccountState } from './accountState';
import type { DialogView } from './AccountControl';
import { accountIdentity } from './accountIdentity';
import { updateCurrentProfile } from './profileApi';
import type { UserProfile } from './profileModel';
import { validatedReturnPath } from './returnPath';

type FormStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; code?: AuthFlowError['code'] };

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

export default function AuthDialog({
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
  const onCloseRef = useRef(onClose);
  const [displayName, setDisplayName] = useState(
    identity?.profile.displayName ?? '',
  );
  const [avatarUrl, setAvatarUrl] = useState(identity?.profile.avatarUrl ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });
  const [pendingSignupEmail, setPendingSignupEmail] = useState<string | null>(
    null,
  );
  const [resendStatus, setResendStatus] = useState<FormStatus>({
    kind: 'idle',
  });
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendPending = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (
      dialog?.querySelector<HTMLElement>('input') ??
      dialog?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
    )?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => {
      window.removeEventListener('keydown', handleKeyboard);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    try {
      if (view === 'register') {
        const registration = await registerWithEmail(client, {
          displayName,
          email,
          password,
          confirmPassword,
          returnPath,
        });
        setPendingSignupEmail(
          registration.confirmationRequired ? registration.email : null,
        );
        setResendStatus({ kind: 'idle' });
        setResendCooldown(registration.confirmationRequired ? 60 : 0);
        setPassword('');
        setConfirmPassword('');
        setStatus({
          kind: 'success',
          message: registration.confirmationRequired
            ? 'Check your email for a verification link to finish creating your account.'
            : 'Your account is ready.',
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

  const resendVerification = async () => {
    if (!pendingSignupEmail || resendPending.current || resendCooldown > 0) {
      return;
    }
    resendPending.current = true;
    setResendStatus({ kind: 'busy' });
    try {
      await resendSignupVerification(client, {
        email: pendingSignupEmail,
        returnPath,
      });
      setResendCooldown(60);
      setResendStatus({
        kind: 'success',
        message:
          'If that address has a pending signup, a new verification email is on its way.',
      });
    } catch (error) {
      const safe = authFlowError(error);
      setResendStatus({
        kind: 'error',
        message: safe.message,
        code: safe.code,
      });
    } finally {
      resendPending.current = false;
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
              <button
                type="submit"
                disabled={
                  status.kind === 'busy' ||
                  (view === 'register' && status.kind === 'success')
                }
              >
                {status.kind === 'busy'
                  ? 'Working…'
                  : view === 'register' && status.kind === 'success'
                    ? 'Verification sent'
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
            {view === 'register' && pendingSignupEmail && (
              <div className="account-actions">
                <button
                  type="button"
                  disabled={resendStatus.kind === 'busy' || resendCooldown > 0}
                  onClick={() => void resendVerification()}
                >
                  {resendStatus.kind === 'busy'
                    ? 'Resending…'
                    : resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : 'Resend verification'}
                </button>
              </div>
            )}
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
                  <DiscordIcon />
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
        {resendStatus.kind === 'success' && (
          <p className="auth-success" role="status">
            {resendStatus.message}
          </p>
        )}
        {resendStatus.kind === 'error' && (
          <p className="auth-error" role="alert">
            {resendStatus.message}
          </p>
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
