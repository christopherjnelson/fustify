import { useEffect, useState, type FormEvent } from 'react';
import { resetAppPassword } from './appAuthClient';
import { AuthFlowError, authFlowError } from './authFlow';
import { validatedReturnPath } from './returnPath';

function removeRecoverySecrets(href: string) {
  const url = new URL(href);
  for (const key of [
    'code',
    'token',
    'token_hash',
    'type',
    'error',
    'error_code',
    'error_description',
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export function ResetPasswordPage() {
  const [token] = useState(
    () => new URL(window.location.href).searchParams.get('token') ?? '',
  );
  const ready = token.length > 0;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<AuthFlowError | null>(
    ready
      ? null
      : new AuthFlowError(
          'expired_email_link',
          'This password-reset link is invalid or has expired.',
        ),
  );
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [returnPath] = useState(() =>
    validatedReturnPath(
      new URL(window.location.href).searchParams.get('returnPath'),
    ),
  );

  useEffect(() => {
    removeRecoverySecrets(window.location.href);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (password.length < 8 || password !== confirmation) {
        throw new AuthFlowError(
          'invalid_form',
          password.length < 8
            ? 'Use at least 8 characters for your password.'
            : 'The passwords do not match.',
        );
      }
      await resetAppPassword(token, password);
      setPassword('');
      setConfirmation('');
      setComplete(true);
    } catch (recoveryError) {
      setPassword('');
      setConfirmation('');
      setError(authFlowError(recoveryError));
      setBusy(false);
    }
  };

  return (
    <main className="auth-route-shell">
      <section className="auth-route-card" aria-live="polite">
        <span className="eyebrow">Fustify account</span>
        <h1>
          {complete
            ? 'Password updated'
            : error?.code === 'expired_email_link'
              ? 'Password-reset link expired'
              : 'Choose a new password'}
        </h1>
        {ready && !complete && (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label className="auth-field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="auth-field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
        {!ready && !error && !complete && <p>Checking the reset link…</p>}
        {complete && (
          <p>Your password has been changed. You can return to your account.</p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error.message}
          </p>
        )}
        {error && <a href="/?account=recovery">Request another reset email</a>}
        <a href={complete ? returnPath : '/'}>Return to account</a>
      </section>
    </main>
  );
}
