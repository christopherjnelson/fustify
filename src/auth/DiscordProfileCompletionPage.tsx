import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  getSupabaseClient,
  readMultiplayerConfiguration,
} from '../multiplayer/supabaseClient';
import {
  clearDiscordAuthIntent,
  hasEmailIdentity,
  readDiscordAuthIntent,
} from './authFlow';
import {
  discordIdentityEmail,
  discordProfileAvatarUrl,
  discordProfileUsername,
} from './discordProfileMetadata';
import {
  completeDiscordProfile,
  type DiscordAvatarChoice,
} from './discordProfileApi';
import { fetchCurrentProfile } from './profileApi';
import { UsernameField, type UsernameAvailability } from './UsernameField';

type CompletionData = Awaited<ReturnType<typeof loadCompletionData>>;

async function loadCompletionData(
  client: ReturnType<typeof getSupabaseClient>,
) {
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) {
    throw new Error('Your Discord account session is unavailable.');
  }
  const user = verified.data.user;
  const profile = await fetchCurrentProfile(client);
  if (!user.identities?.some(({ provider }) => provider === 'discord')) {
    throw new Error('A connected Discord identity is required.');
  }
  return { user, profile };
}

function DiscordProfileCompletionFixture() {
  return (
    <main className="auth-route-shell">
      <section className="auth-route-card auth-profile-completion-card">
        <span className="eyebrow">Fustify account</span>
        <h1>Confirm your Discord profile</h1>
        <p>
          Choose the username and avatar other players will see before
          continuing.
        </p>
        <form className="auth-form">
          <label className="auth-field">
            <span>Username</span>
            <input value="redwurm" readOnly />
          </label>
          <p className="auth-username-status auth-username-status-available">
            Username available.
          </p>
          <label className="auth-field auth-readonly-field">
            <span>Email</span>
            <input value="redwurm@example.test" readOnly />
          </label>
          <fieldset className="auth-avatar-options">
            <legend>Avatar</legend>
            <label>
              <input type="radio" name="fixture-avatar" defaultChecked />
              <span
                className="auth-avatar-preview-placeholder"
                aria-hidden="true"
              >
                RW
              </span>
              Use Discord avatar
            </label>
            <label>
              <input type="radio" name="fixture-avatar" />
              Use a custom URL
            </label>
            <label>
              <input type="radio" name="fixture-avatar" />
              No avatar
            </label>
          </fieldset>
          <button type="button">Confirm profile</button>
        </form>
        <button type="button" className="auth-secondary-action">
          Sign out
        </button>
      </section>
    </main>
  );
}

function LiveDiscordProfileCompletionPage() {
  const configured = readMultiplayerConfiguration() !== null;
  const client = useMemo(
    () => (configured ? getSupabaseClient() : null),
    [configured],
  );
  const [intent] = useState(() => readDiscordAuthIntent());
  const [data, setData] = useState<CompletionData | null>(null);
  const [username, setUsername] = useState('');
  const [avatarChoice, setAvatarChoice] = useState<DiscordAvatarChoice>('none');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [availability, setAvailability] =
    useState<UsernameAvailability>('unchecked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    client ? null : 'Account configuration is unavailable.',
  );

  const returnPath = intent?.returnPath ?? '/';
  const canDisconnect =
    intent?.intent === 'discord-link' &&
    data !== null &&
    hasEmailIdentity(data.user);

  useEffect(() => {
    if (!client) return;
    void loadCompletionData(client)
      .then((loaded) => {
        const newDiscordProfile =
          !loaded.profile.onboardingCompleted ||
          intent?.intent === 'legacy-discord-upgrade';
        setData(loaded);
        setUsername(
          newDiscordProfile
            ? (discordProfileUsername(loaded.user) ??
                loaded.profile.displayName)
            : loaded.profile.displayName,
        );
        setAvatarChoice(
          newDiscordProfile && discordProfileAvatarUrl(loaded.user)
            ? 'discord'
            : loaded.profile.avatarUrl
              ? 'current'
              : 'none',
        );
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Your Discord profile could not be loaded.',
        ),
      );
  }, [client, intent?.intent]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !data || busy) return;
    if (availability === 'unavailable') {
      setError('Choose an available username.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeDiscordProfile(client, {
        username,
        avatarChoice,
        ...(avatarChoice === 'custom' ? { customAvatarUrl } : {}),
      });
      clearDiscordAuthIntent();
      window.location.replace(returnPath);
    } catch (completionError) {
      setError(
        completionError instanceof Error
          ? completionError.message
          : 'Your Discord profile could not be completed.',
      );
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!client || !data || !canDisconnect || busy) return;
    const identity = data.user.identities?.find(
      ({ provider }) => provider === 'discord',
    );
    if (!identity) return;
    setBusy(true);
    setError(null);
    const { error: unlinkError } = await client.auth.unlinkIdentity(identity);
    if (unlinkError) {
      setError('Discord could not be disconnected. Please try again.');
      setBusy(false);
      return;
    }
    clearDiscordAuthIntent();
    window.location.replace(returnPath);
  };

  const signOut = async () => {
    if (!client || busy) return;
    setBusy(true);
    await client.auth.signOut();
    clearDiscordAuthIntent();
    window.location.replace('/');
  };

  const discordAvatar = data ? discordProfileAvatarUrl(data.user) : null;
  const providerEmail = data ? discordIdentityEmail(data.user) : null;
  const primaryEmail = data?.user.email ?? null;

  return (
    <main className="auth-route-shell">
      <section className="auth-route-card auth-profile-completion-card">
        <span className="eyebrow">Fustify account</span>
        <h1>Confirm your Discord profile</h1>
        <p>
          Choose the username and avatar other players will see before
          continuing.
        </p>
        {data && client ? (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <UsernameField
              client={client}
              value={username}
              onChange={setUsername}
              onAvailabilityChange={setAvailability}
              autoFocus
            />
            <label className="auth-field auth-readonly-field">
              <span>Email</span>
              <input
                type="email"
                value={primaryEmail ?? 'Not provided by Discord'}
                readOnly
                aria-readonly="true"
              />
            </label>
            {providerEmail &&
              primaryEmail &&
              providerEmail.toLowerCase() !== primaryEmail.toLowerCase() && (
                <p className="auth-field-note">
                  Discord supplied {providerEmail}; your Fustify account keeps
                  {` ${primaryEmail}`}.
                </p>
              )}
            <fieldset className="auth-avatar-options">
              <legend>Avatar</legend>
              {data.profile.avatarUrl && (
                <label>
                  <input
                    type="radio"
                    name="avatar-choice"
                    value="current"
                    checked={avatarChoice === 'current'}
                    onChange={() => setAvatarChoice('current')}
                  />
                  <img src={data.profile.avatarUrl} alt="" />
                  Keep current
                </label>
              )}
              {discordAvatar && (
                <label>
                  <input
                    type="radio"
                    name="avatar-choice"
                    value="discord"
                    checked={avatarChoice === 'discord'}
                    onChange={() => setAvatarChoice('discord')}
                  />
                  <img src={discordAvatar} alt="" />
                  Use Discord avatar
                </label>
              )}
              <label>
                <input
                  type="radio"
                  name="avatar-choice"
                  value="custom"
                  checked={avatarChoice === 'custom'}
                  onChange={() => setAvatarChoice('custom')}
                />
                Use a custom URL
              </label>
              {avatarChoice === 'custom' && (
                <label className="auth-field">
                  <span>Avatar URL</span>
                  <input
                    type="url"
                    value={customAvatarUrl}
                    onChange={(event) => setCustomAvatarUrl(event.target.value)}
                    maxLength={2048}
                    required
                  />
                </label>
              )}
              <label>
                <input
                  type="radio"
                  name="avatar-choice"
                  value="none"
                  checked={avatarChoice === 'none'}
                  onChange={() => setAvatarChoice('none')}
                />
                No avatar
              </label>
            </fieldset>
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Confirm profile'}
            </button>
          </form>
        ) : (
          !error && <p>Loading your Discord details…</p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {canDisconnect ? (
          <button
            type="button"
            className="auth-secondary-action"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            Cancel and disconnect Discord
          </button>
        ) : (
          <button
            type="button"
            className="auth-secondary-action"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        )}
      </section>
    </main>
  );
}

export function DiscordProfileCompletionPage() {
  const visualFixture =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('visual-review') === '1';
  return visualFixture ? (
    <DiscordProfileCompletionFixture />
  ) : (
    <LiveDiscordProfileCompletionPage />
  );
}
