import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { accountIdentity } from './accountIdentity';
import type { AccountState } from './accountState';
import type { DialogView } from './AccountControl';
import { getAppAuthClient } from './appAuthClient';
import {
  AuthFlowError,
  authFlowError,
  registerWithEmail,
  signInWithEmail,
} from './authFlow';
import { updateCurrentProfile } from './profileHttpApi';
import type { UserProfile } from './profileModel';
import { validatedReturnPath } from './returnPath';
import { UsernameField, type UsernameAvailability } from './UsernameField';

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
  const client = useMemo(() => getAppAuthClient(), []);
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
  const [usernameAvailability, setUsernameAvailability] =
    useState<UsernameAvailability>('unchecked');

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
    dialog
      ?.querySelector<HTMLElement>('input, button:not([disabled])')
      ?.focus();

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    try {
      if (
        (view === 'register' || view === 'edit-profile') &&
        usernameAvailability === 'unavailable'
      ) {
        throw new AuthFlowError(
          'invalid_form',
          'Choose an available username.',
        );
      }
      if (view === 'register') {
        await registerWithEmail(client, {
          displayName,
          email,
          password,
          confirmPassword,
        });
        window.location.assign(validatedReturnPath(returnPath));
        return;
      }
      if (view === 'sign-in') {
        await signInWithEmail(client, { email, password });
        window.location.assign(validatedReturnPath(returnPath));
        return;
      }
      if (!identity || identity.isAnonymous) {
        throw new AuthFlowError(
          'account_required',
          'Sign in to customize your profile.',
        );
      }
      const updatedProfile = await updateCurrentProfile(client, {
        displayName,
        avatarUrl: avatarUrl.trim() || null,
      });
      onProfileUpdated(updatedProfile);
      setStatus({ kind: 'success', message: 'Profile updated.' });
    } catch (error) {
      const safe = authFlowError(error);
      setPassword('');
      setConfirmPassword('');
      setStatus({ kind: 'error', message: safe.message, code: safe.code });
    }
  };

  const title =
    view === 'register'
      ? 'Create account'
      : view === 'edit-profile'
        ? 'Edit profile'
        : 'Sign in';

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

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {(view === 'register' || view === 'edit-profile') && (
            <UsernameField
              client={client}
              value={displayName}
              onChange={setDisplayName}
              onAvailabilityChange={setUsernameAvailability}
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
          {view !== 'edit-profile' && (
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
                : view === 'edit-profile'
                  ? 'Save profile'
                  : 'Sign in'}
          </button>
        </form>

        {status.kind === 'success' && (
          <p className="auth-success" role="status">
            {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <p className="auth-error" role="alert">
            {status.message}
          </p>
        )}

        {view !== 'edit-profile' && (
          <nav className="auth-dialog-nav" aria-label="Account options">
            <button
              type="button"
              onClick={() =>
                onView(view === 'sign-in' ? 'register' : 'sign-in')
              }
            >
              {view === 'sign-in' ? 'Create account' : 'Back to sign in'}
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
