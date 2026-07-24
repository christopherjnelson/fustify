import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/multiplayer/database.types';
import {
  closeRoom,
  createRoom,
  fetchRoomState,
} from '../src/multiplayer/multiplayerApi';
import {
  fetchCurrentProfile,
  updateCurrentProfile,
} from '../src/auth/profileApi';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const mailpitUrl = process.env.MAILPIT_URL;
if (!url || !publishableKey || !secretKey || !mailpitUrl) {
  throw new Error('local_auth_test_configuration_missing');
}

type MailpitMessage = {
  ID: string;
  To: Array<{ Address: string }>;
};

type MailpitList = {
  messages: MailpitMessage[];
};

type MailpitDetail = {
  HTML?: string;
  Text?: string;
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function authClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, publishableKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      storage: memoryStorage(),
    },
  });
}

async function latestMessageFor(
  address: string,
  ignoredIds: ReadonlySet<string>,
): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (!response.ok) throw new Error('mailpit_list_failed');
    const list = (await response.json()) as MailpitList;
    const message = list.messages.find(
      (candidate) =>
        !ignoredIds.has(candidate.ID) &&
        candidate.To.some((recipient) => recipient.Address === address),
    );
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('mailpit_message_missing');
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#x3D;', '=')
    .replaceAll('&#61;', '=');
}

async function confirmationCode(messageId: string): Promise<string> {
  const response = await fetch(`${mailpitUrl}/api/v1/message/${messageId}`);
  if (!response.ok) throw new Error('mailpit_message_failed');
  const detail = (await response.json()) as MailpitDetail;
  const body = decodeHtml(detail.HTML ?? detail.Text ?? '');
  const links = body.match(/https?:\/\/[^\s"'<>]+/gu) ?? [];
  const verificationLink = links.find((link) =>
    link.includes('/auth/v1/verify'),
  );
  if (!verificationLink) throw new Error('mailpit_verification_link_missing');

  const verification = await fetch(verificationLink, { redirect: 'manual' });
  const destination = verification.headers.get('location');
  if (!destination) throw new Error('auth_verification_redirect_missing');
  const code = new URL(destination).searchParams.get('code');
  if (!code) throw new Error('auth_verification_code_missing');
  return code;
}

async function exchangeNewestEmail(
  client: SupabaseClient<Database>,
  address: string,
  seenMessageIds: Set<string>,
) {
  const message = await latestMessageFor(address, seenMessageIds);
  seenMessageIds.add(message.ID);
  const code = await confirmationCode(message.ID);
  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.user) {
    throw new Error('auth_code_exchange_failed');
  }
}

async function run() {
  const admin = createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const userIds: string[] = [];
  const roomIds: string[] = [];
  const seenMessageIds = new Set<string>();

  try {
    const registration = authClient();
    const registrationEmail = `registration-${crypto.randomUUID()}@example.test`;
    const initialPassword = `Local-${crypto.randomUUID()}-A1`;
    const registered = await registration.auth.signUp({
      email: registrationEmail,
      password: initialPassword,
      options: {
        data: { display_name: 'Local Registered Player' },
        emailRedirectTo: 'http://127.0.0.1:4173/auth/callback',
      },
    });
    if (registered.error || !registered.data.user) {
      throw new Error('local_registration_failed');
    }
    userIds.push(registered.data.user.id);
    await exchangeNewestEmail(registration, registrationEmail, seenMessageIds);
    const registeredUser = await registration.auth.getUser();
    if (
      registeredUser.error ||
      !registeredUser.data.user ||
      registeredUser.data.user.id !== registered.data.user.id ||
      registeredUser.data.user.is_anonymous !== false
    ) {
      throw new Error('local_registration_identity_failed');
    }
    const registeredProfile = await fetchCurrentProfile(registration);
    if (registeredProfile.displayName !== 'Local Registered Player') {
      throw new Error('local_registration_profile_failed');
    }
    await registration.auth.signOut({ scope: 'local' });
    const signedBackIn = await registration.auth.signInWithPassword({
      email: registrationEmail,
      password: initialPassword,
    });
    if (
      signedBackIn.error ||
      signedBackIn.data.user?.id !== registered.data.user.id
    ) {
      throw new Error('local_registration_sign_in_failed');
    }

    const recovery = await registration.auth.resetPasswordForEmail(
      registrationEmail,
      {
        redirectTo: 'http://127.0.0.1:4173/auth/reset-password',
      },
    );
    if (recovery.error) throw new Error('local_recovery_request_failed');
    await exchangeNewestEmail(registration, registrationEmail, seenMessageIds);
    const recoveredPassword = `Recovered-${crypto.randomUUID()}-A1`;
    const recovered = await registration.auth.updateUser({
      password: recoveredPassword,
    });
    if (recovered.error) throw new Error('local_recovery_update_failed');
    await registration.auth.signOut({ scope: 'local' });
    const recoveredSignIn = await registration.auth.signInWithPassword({
      email: registrationEmail,
      password: recoveredPassword,
    });
    if (
      recoveredSignIn.error ||
      recoveredSignIn.data.user?.id !== registered.data.user.id
    ) {
      throw new Error('local_recovery_sign_in_failed');
    }

    const guest = authClient();
    const anonymous = await guest.auth.signInAnonymously();
    if (
      anonymous.error ||
      !anonymous.data.user ||
      anonymous.data.user.is_anonymous !== true
    ) {
      throw new Error('local_guest_creation_failed');
    }
    const guestUserId = anonymous.data.user.id;
    userIds.push(guestUserId);
    const guestProfile = await fetchCurrentProfile(guest);
    if (!/^[A-Z][a-z]+[A-Z][a-z]+-[0-9]{3}$/u.test(guestProfile.displayName)) {
      throw new Error('local_guest_name_failed');
    }
    const room = await createRoom(guest, guestProfile.displayName, {
      settings: {
        seed: 'email-upgrade-local',
        territoryCount: 12,
        continentCount: 2,
        assignmentMode: 'random',
        maxSeats: 2,
      },
    });
    roomIds.push(room.id);

    const upgradeEmail = `upgrade-${crypto.randomUUID()}@example.test`;
    const upgradeStarted = await guest.auth.updateUser(
      { email: upgradeEmail },
      {
        emailRedirectTo: 'http://127.0.0.1:4173/auth/callback',
      },
    );
    if (upgradeStarted.error) throw new Error('local_guest_upgrade_failed');
    await exchangeNewestEmail(guest, upgradeEmail, seenMessageIds);
    const upgraded = await guest.auth.getUser();
    if (
      upgraded.error ||
      !upgraded.data.user ||
      upgraded.data.user.id !== guestUserId ||
      upgraded.data.user.is_anonymous !== false
    ) {
      throw new Error('local_guest_upgrade_identity_failed');
    }
    const upgradePassword = `Upgrade-${crypto.randomUUID()}-A1`;
    const passwordSet = await guest.auth.updateUser({
      password: upgradePassword,
    });
    if (passwordSet.error) throw new Error('local_guest_password_failed');
    const upgradedProfile = await updateCurrentProfile(guest, {
      displayName: 'Local Upgraded Player',
      avatarUrl: null,
    });
    if (upgradedProfile.userId !== guestUserId) {
      throw new Error('local_guest_profile_identity_failed');
    }
    const preservedRoom = await fetchRoomState(guest, room.id);
    if (preservedRoom.room.host_user_id !== guestUserId) {
      throw new Error('local_guest_room_ownership_failed');
    }
    await closeRoom(guest, room.id);

    console.log(
      JSON.stringify({
        result: 'pass',
        registrationConfirmed: true,
        registeredSignInRestored: true,
        passwordRecoveryCompleted: true,
        generatedGuestNameVerified: true,
        guestUpgradePreservedUserId: true,
        guestUpgradePreservedRoomOwnership: true,
      }),
    );
  } finally {
    for (const roomId of roomIds) {
      await admin.from('rooms').delete().eq('id', roomId);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

run().catch((error: unknown) => {
  const code =
    error instanceof Error &&
    /^(?:local|mailpit|auth)_[a-z0-9_]+$/u.test(error.message)
      ? error.message
      : 'local_email_auth_acceptance_failed';
  console.error(code);
  process.exitCode = 1;
});
