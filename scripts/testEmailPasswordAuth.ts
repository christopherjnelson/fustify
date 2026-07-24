import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import type { Database } from '../src/multiplayer/database.types';
import {
  closeRoom,
  createRoom,
  fetchRoomState,
  MULTIPLAYER_ERRORS,
} from '../src/multiplayer/multiplayerApi';
import {
  fetchCurrentProfile,
  updateCurrentProfile,
} from '../src/auth/profileApi';
import { ensureRegisteredSessionReady } from '../src/auth/registeredSession';

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

function localSql(statement: string) {
  if (statement.includes('"')) throw new Error('local_fixture_sql_invalid');
  execFileSync('sg', [
    'docker',
    '-c',
    `docker exec supabase_db_fustify psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${statement}"`,
  ]);
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
  const code = await confirmNewestEmail(address, seenMessageIds);
  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.user) {
    throw new Error('auth_code_exchange_failed');
  }
}

async function confirmNewestEmail(
  address: string,
  seenMessageIds: Set<string>,
): Promise<string> {
  const message = await latestMessageFor(address, seenMessageIds);
  seenMessageIds.add(message.ID);
  return confirmationCode(message.ID);
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
    const normalRoom = await createRoom(
      registration,
      'Local Registered Player',
      {
        settings: {
          seed: 'registered-login-local',
          territoryCount: 12,
          continentCount: 2,
          assignmentMode: 'random',
          maxSeats: 2,
        },
      },
    );
    roomIds.push(normalRoom.id);
    await closeRoom(registration, normalRoom.id);

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
    let anonymousCreateDenied = false;
    let anonymousCreateError = 'no_error';
    try {
      await createRoom(guest, guestProfile.displayName, {
        settings: {
          seed: 'email-upgrade-local',
          territoryCount: 12,
          continentCount: 2,
          assignmentMode: 'random',
          maxSeats: 2,
        },
      });
    } catch (error) {
      anonymousCreateError =
        error instanceof Error ? error.message : 'non_error_exception';
      anonymousCreateDenied =
        error instanceof Error &&
        error.message === MULTIPLAYER_ERRORS.account_required;
    }
    if (!anonymousCreateDenied) {
      const receivedError = Object.entries(MULTIPLAYER_ERRORS).find(
        ([, message]) => message === anonymousCreateError,
      )?.[0];
      throw new Error(
        anonymousCreateError === 'no_error'
          ? 'local_guest_multiplayer_was_not_denied'
          : `local_guest_multiplayer_wrong_error_${receivedError ?? 'unknown'}`,
      );
    }

    // Model a room that predates account-required gameplay. The service client
    // is used only by this isolated migration test to prove that upgrading the
    // owner preserves the existing foreign-key identity and room rows.
    const legacyRoomId = crypto.randomUUID();
    const legacyJoinCode = crypto
      .randomUUID()
      .replaceAll('-', '')
      .slice(0, 8)
      .toUpperCase();
    if (
      !/^[0-9a-f-]{36}$/iu.test(guestUserId) ||
      !/^[A-Za-z]+-[0-9]{3}$/u.test(guestProfile.displayName)
    ) {
      throw new Error('local_legacy_fixture_invalid');
    }
    localSql(`
      insert into public.rooms (
        id, join_code, host_user_id, seed, territory_count,
        continent_count, assignment_mode, max_seats
      ) values (
        '${legacyRoomId}', '${legacyJoinCode}', '${guestUserId}',
        'email-upgrade-local', 12, 2, 'random', 2
      );
      insert into public.room_members (
        room_id, user_id, display_name, role
      ) values (
        '${legacyRoomId}', '${guestUserId}',
        '${guestProfile.displayName}', 'host'
      );
      insert into public.room_seats (room_id, seat_index)
      values ('${legacyRoomId}', 0), ('${legacyRoomId}', 1);
    `);
    const room = { id: legacyRoomId };
    roomIds.push(room.id);

    const upgradeEmail = `upgrade-${crypto.randomUUID()}@example.test`;
    const upgradeStarted = await guest.auth.updateUser(
      { email: upgradeEmail },
      {
        emailRedirectTo: 'http://127.0.0.1:4173/auth/callback',
      },
    );
    if (upgradeStarted.error) throw new Error('local_guest_upgrade_failed');
    await confirmNewestEmail(upgradeEmail, seenMessageIds);
    const upgraded = await guest.auth.getUser();
    const staleSession = await guest.auth.getSession();
    const staleClaims = await guest.auth.getClaims(
      staleSession.data.session?.access_token,
    );
    if (
      upgraded.error ||
      !upgraded.data.user ||
      upgraded.data.user.id !== guestUserId ||
      upgraded.data.user.is_anonymous !== false ||
      staleSession.error ||
      !staleSession.data.session ||
      staleSession.data.session.user.is_anonymous !== true ||
      staleClaims.error ||
      staleClaims.data?.claims.is_anonymous !== true ||
      staleClaims.data?.claims.sub !== guestUserId
    ) {
      throw new Error('local_guest_upgrade_stale_state_not_reproduced');
    }
    const upgradePassword = `Upgrade-${crypto.randomUUID()}-A1`;
    const passwordSet = await guest.auth.updateUser({
      password: upgradePassword,
    });
    if (passwordSet.error) throw new Error('local_guest_password_failed');

    const staleCreate = await guest.rpc('create_room', {
      display_name: 'Local Upgraded Player',
      seed: 'stale-upgrade-direct-rpc',
      territory_count: 12,
      continent_count: 2,
      assignment_mode: 'random',
      max_seats: 2,
    });
    if (
      staleCreate.data ||
      !staleCreate.error ||
      staleCreate.error.message !== 'account_required'
    ) {
      throw new Error('local_stale_room_error_not_reproduced');
    }

    const recoveredRoom = await createRoom(guest, 'Local Upgraded Player', {
      settings: {
        seed: 'stale-upgrade-recovered',
        territoryCount: 12,
        continentCount: 2,
        assignmentMode: 'random',
        maxSeats: 2,
      },
    });
    roomIds.push(recoveredRoom.id);
    const ready = await ensureRegisteredSessionReady(guest);
    if (ready.status !== 'registered-ready' || ready.user.id !== guestUserId) {
      throw new Error('local_stale_session_refresh_failed');
    }
    const upgradedProfile = await updateCurrentProfile(guest, {
      displayName: 'Local Upgraded Player',
      avatarUrl: null,
    });
    if (upgradedProfile.userId !== guestUserId) {
      throw new Error('local_guest_profile_identity_failed');
    }
    await closeRoom(guest, recoveredRoom.id);

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
        anonymousMultiplayerDenied: true,
        guestUpgradePreservedUserId: true,
        guestUpgradePreservedRoomOwnership: true,
        staleUserPermanent: true,
        staleJwtAnonymous: true,
        staleCreateRoomAccountRequired: true,
        refreshedJwtPermanent: true,
        upgradedRoomCreated: true,
        normalRegisteredRoomCreated: true,
      }),
    );
  } finally {
    for (const roomId of roomIds) {
      if (/^[0-9a-f-]{36}$/iu.test(roomId)) {
        localSql(`delete from public.rooms where id = '${roomId}'`);
      }
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
