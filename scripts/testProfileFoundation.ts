import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/multiplayer/database.types';
import {
  closeRoom,
  createRoom,
  ensureAnonymousSession,
  fetchRoomState,
} from '../src/multiplayer/multiplayerApi';
import {
  fetchCurrentProfile,
  updateCurrentProfile,
} from '../src/auth/profileApi';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

const unauthenticated = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const client = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function requireDenied(error: unknown, operation: string) {
  if (!error) throw new Error(`${operation}_unexpectedly_allowed`);
}

async function run() {
  const publicRead = await unauthenticated
    .from('profiles')
    .select('user_id')
    .limit(1);
  requireDenied(publicRead.error, 'unauthenticated_profile_read');

  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error || !signedIn.data.user) {
    throw signedIn.error ?? new Error('anonymous_sign_in_failed');
  }
  const userId = signedIn.data.user.id;
  if (signedIn.data.user.is_anonymous !== true) {
    throw new Error('anonymous_user_not_recognized');
  }

  const verified = await client.auth.getUser();
  if (verified.error || verified.data.user?.id !== userId) {
    throw verified.error ?? new Error('verified_user_id_changed');
  }

  const initialProfile = await fetchCurrentProfile(client);
  if (initialProfile.userId !== userId) {
    throw new Error('triggered_profile_user_id_mismatch');
  }

  const directInsert = await client.from('profiles').insert({
    user_id: crypto.randomUUID(),
    display_name: 'Fabricated',
  });
  requireDenied(directInsert.error, 'direct_profile_insert');

  const directUpdate = await client
    .from('profiles')
    .update({ display_name: 'Fabricated' })
    .eq('user_id', userId);
  requireDenied(directUpdate.error, 'direct_profile_update');

  const directDelete = await client
    .from('profiles')
    .delete()
    .eq('user_id', userId);
  requireDenied(directDelete.error, 'direct_profile_delete');

  const updatedProfile = await updateCurrentProfile(client, {
    displayName: '  Profile Foundation Smoke  ',
    avatarUrl: 'https://cdn.example.com/fustify/profile-smoke.png',
  });
  if (
    updatedProfile.userId !== userId ||
    updatedProfile.displayName !== 'Profile Foundation Smoke'
  ) {
    throw new Error('controlled_profile_update_failed');
  }

  const restoredUserId = await ensureAnonymousSession(client);
  if (restoredUserId !== userId) {
    throw new Error('anonymous_session_identity_changed');
  }

  const roomAlias = 'Room Alias Smoke';
  const room = await createRoom(client, roomAlias, {
    settings: {
      seed: 'profile-foundation-smoke',
      territoryCount: 12,
      continentCount: 2,
      assignmentMode: 'random',
      maxSeats: 2,
    },
  });
  const roomState = await fetchRoomState(client, room.id);
  const callerMember = roomState.members.find(
    (member) => member.user_id === userId,
  );
  if (callerMember?.display_name !== roomAlias) {
    throw new Error('multiplayer_display_name_changed');
  }
  await closeRoom(client, room.id);

  await client.auth.signOut({ scope: 'local' });
  console.log(
    JSON.stringify({
      result: 'pass',
      anonymousProfileCreated: true,
      directProfileWritesDenied: true,
      restoredSameUserId: true,
      multiplayerNameUnchanged: true,
      roomClosed: true,
    }),
  );
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'profile_smoke_failed',
  );
  process.exitCode = 1;
});
