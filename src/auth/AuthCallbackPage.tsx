import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  getSupabaseClient,
  readMultiplayerConfiguration,
} from '../multiplayer/supabaseClient';
import {
  AuthFlowError,
  authFlowError,
  completeAuthCallback,
  completeGuestUpgrade,
  completeInvitationPassword,
  readDiscordAuthIntent,
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
    'type',
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
  const [discordIntent] = useState(() => readDiscordAuthIntent());
  const [result, setResult] = useState<AuthCallbackResult | null>(null);
  const [error, setError] = useState<AuthFlowError | null>(
    client
      ? null
      : new AuthFlowError(
          'request_failed',
          'Account configuration is unavailable.',
        ),
  );
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [invitationComplete, setInvitationComplete] = useState(false);
  const started = useRef(false);
  const returnPath =
    result?.kind === 'invitation'
      ? result.returnPath
      : (discordIntent?.returnPath ?? '/');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const href = window.location.href;
    removeCallbackSecrets(href);
    if (!client) return;
    void completeAuthCallback(client, href)
      .then((callbackResult) => {
        if (callbackResult.kind === 'confirmed') {
          window.location.replace(callbackResult.returnPath);
          return;
        }
        if (callbackResult.kind === 'discord-completion') {
          window.location.replace(callbackResult.intent.returnPath);
          return;
        }
        setDisplayName(callbackResult.user.user_metadata.display_name ?? '');
        setResult(callbackResult);
      })
      .catch((callbackError) => {
        setError(authFlowError(callbackError));
      });
  }, [client]);

  const finish = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !client ||
      !result ||
      (result.kind !== 'guest-upgrade-completion' &&
        result.kind !== 'invitation') ||
      busy
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (result.kind === 'guest-upgrade-completion') {
        await completeGuestUpgrade(client, {
          expectedUserId: result.intent.expectedUserId,
          displayName,
          password,
          confirmPassword: confirmation,
        });
        setPassword('');
        setConfirmation('');
        window.location.replace(result.intent.returnPath);
        return;
      }
      if (result.kind !== 'invitation') return;
      await completeInvitationPassword(client, {
        expectedUserId: result.user.id,
        password,
        confirmation,
      });
      setPassword('');
      setConfirmation('');
      setInvitationComplete(true);
      setBusy(false);
    } catch (completionError) {
      setPassword('');
      setConfirmation('');
      setError(authFlowError(completionError));
      setBusy(false);
    }
  };

  return (
    <main className="auth-route-shell">
      <section className="auth-route-card" aria-live="polite">
        <span className="eyebrow">Fustify account</span>
        {invitationComplete ? (
          <>
            <h1>Invitation accepted</h1>
            <p>
              Your password is set and your Fustify account is ready to use.
            </p>
          </>
        ) : result?.kind === 'guest-upgrade-completion' ? (
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
        ) : result?.kind === 'invitation' ? (
          <>
            <h1>Finish accepting your invitation</h1>
            <p>Choose an initial password for your Fustify account.</p>
            <form
              className="auth-form"
              onSubmit={(event) => void finish(event)}
            >
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
                {busy ? 'Finishing…' : 'Set password'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>
              {error
                ? discordIntent
                  ? 'Discord connection problem'
                  : error.code === 'expired_email_link'
                    ? 'Email link expired'
                    : 'Email confirmation problem'
                : 'Confirming account'}
            </h1>
            {!error && <p>Verifying this account callback…</p>}
          </>
        )}
        {error && (
          <div className="auth-error" role="alert">
            <p>{error.message}</p>
            {error.code === 'identity_conflict' &&
              discordIntent?.intent === 'legacy-discord-upgrade' && (
                <p>
                  Switching accounts will not transfer legacy rooms, profiles,
                  reactions, matches, or other legacy-owned data.
                </p>
              )}
          </div>
        )}
        <a href={returnPath}>
          {returnPath === '/' ? 'Return home' : 'Return to your account'}
        </a>
      </section>
    </main>
  );
}
