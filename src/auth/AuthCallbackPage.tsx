import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  getSupabaseClient,
  readMultiplayerConfiguration,
} from '../multiplayer/supabaseClient';
import {
  authFlowError,
  completeAuthCallback,
  completeGuestUpgrade,
  type AuthCallbackResult,
} from './authFlow';

function removeCallbackSecrets(href: string) {
  const url = new URL(href);
  for (const key of [
    'code',
    'error',
    'error_code',
    'error_description',
    'token',
    'token_hash',
    'intent',
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export function AuthCallbackPage() {
  const configured = readMultiplayerConfiguration() !== null;
  const client = useMemo(
    () => (configured ? getSupabaseClient() : null),
    [configured],
  );
  const [result, setResult] = useState<AuthCallbackResult | null>(null);
  const [error, setError] = useState<string | null>(
    client ? null : 'Account configuration is unavailable.',
  );
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!client) return;
    const href = window.location.href;
    void completeAuthCallback(client, href)
      .then((callbackResult) => {
        removeCallbackSecrets(href);
        if (callbackResult.kind === 'confirmed') {
          window.location.replace(callbackResult.returnPath);
          return;
        }
        setDisplayName(callbackResult.user.user_metadata.display_name ?? '');
        setResult(callbackResult);
      })
      .catch((callbackError) => {
        removeCallbackSecrets(href);
        setError(authFlowError(callbackError).message);
      });
  }, [client]);

  const finish = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !client ||
      !result ||
      result.kind !== 'guest-upgrade-completion' ||
      busy
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeGuestUpgrade(client, {
        expectedUserId: result.intent.expectedUserId,
        displayName,
        password,
        confirmPassword: confirmation,
      });
      setPassword('');
      setConfirmation('');
      window.location.replace(result.intent.returnPath);
    } catch (completionError) {
      setPassword('');
      setConfirmation('');
      setError(authFlowError(completionError).message);
      setBusy(false);
    }
  };

  return (
    <main className="auth-route-shell">
      <section className="auth-route-card" aria-live="polite">
        <span className="eyebrow">Fustify account</span>
        {result?.kind === 'guest-upgrade-completion' ? (
          <>
            <h1>Finish creating your account</h1>
            <p>
              Your verified email is attached to the same guest identity. Add a
              password and choose your display name.
            </p>
            <form
              className="auth-form"
              onSubmit={(event) => void finish(event)}
            >
              <label className="auth-field">
                <span>Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={40}
                  autoComplete="nickname"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
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
                {busy ? 'Finishing…' : 'Finish account'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>{error ? 'Email confirmation problem' : 'Confirming email'}</h1>
            {!error && <p>Verifying this account link…</p>}
          </>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <a href="/">Return home</a>
      </section>
    </main>
  );
}
