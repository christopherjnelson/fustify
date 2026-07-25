import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';
import {
  MULTIPLAYER_ERRORS,
  fetchRoomState,
  isRoomMembershipRequiredError,
  joinPublicRoom,
  multiplayerError,
  type RoomState,
} from './multiplayerApi';

const roomIdSchema = z.string().uuid();

export type DirectRoomEntryFailure =
  'invalid-link' | 'unavailable' | 'full' | 'account' | 'temporary';

export class InvalidDirectRoomIdError extends Error {}

interface DirectRoomEntryDependencies {
  fetch: (
    client: SupabaseClient<Database>,
    roomId: string,
  ) => Promise<RoomState>;
  join: (client: SupabaseClient<Database>, roomId: string) => Promise<unknown>;
}

const defaultDependencies: DirectRoomEntryDependencies = {
  fetch: fetchRoomState,
  join: joinPublicRoom,
};

const pendingEntryByClient = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<RoomState>>
>();

export function isValidDirectRoomId(roomId: string): boolean {
  return roomIdSchema.safeParse(roomId).success;
}

export function enterRoomFromDirectLink(
  client: SupabaseClient<Database>,
  userId: string,
  roomId: string,
  dependencies: DirectRoomEntryDependencies = defaultDependencies,
): Promise<RoomState> {
  if (!isValidDirectRoomId(roomId)) {
    return Promise.reject(
      new InvalidDirectRoomIdError('The room link is invalid.'),
    );
  }

  let pendingByEntry = pendingEntryByClient.get(client);
  if (!pendingByEntry) {
    pendingByEntry = new Map();
    pendingEntryByClient.set(client, pendingByEntry);
  }

  const entryKey = `${userId}:${roomId}`;
  const existing = pendingByEntry.get(entryKey);
  if (existing) return existing;

  const request = (async () => {
    try {
      return await dependencies.fetch(client, roomId);
    } catch (error) {
      if (!isRoomMembershipRequiredError(error)) throw error;
    }

    await dependencies.join(client, roomId);
    return dependencies.fetch(client, roomId);
  })().finally(() => {
    if (pendingByEntry.get(entryKey) === request) {
      pendingByEntry.delete(entryKey);
    }
  });
  pendingByEntry.set(entryKey, request);
  return request;
}

export function directRoomEntryFailure(error: unknown): DirectRoomEntryFailure {
  if (error instanceof InvalidDirectRoomIdError) return 'invalid-link';
  const message = multiplayerError(error).message;
  if (message === MULTIPLAYER_ERRORS.public_room_unavailable) {
    return 'unavailable';
  }
  if (message === MULTIPLAYER_ERRORS.full_room) {
    return 'full';
  }
  if (
    message === MULTIPLAYER_ERRORS.account_required ||
    message === MULTIPLAYER_ERRORS.not_authenticated ||
    message === MULTIPLAYER_ERRORS.profile_unavailable ||
    message === MULTIPLAYER_ERRORS.invalid_profile_display_name
  ) {
    return 'account';
  }
  return 'temporary';
}

export function directRoomEntryStatus(failure: DirectRoomEntryFailure | null): {
  title: string;
  message: string;
} {
  switch (failure) {
    case null:
      return {
        title: 'Loading room',
        message: 'Checking room access and restoring canonical room state…',
      };
    case 'invalid-link':
      return {
        title: 'Invalid room link',
        message: 'This room link is invalid.',
      };
    case 'unavailable':
      return {
        title: 'Room unavailable',
        message: 'This room is unavailable or no longer accepting players.',
      };
    case 'full':
      return {
        title: 'Room full',
        message: 'This room is full.',
      };
    case 'account':
      return {
        title: 'Account unavailable',
        message:
          'Your account or player profile could not be verified. Please try again.',
      };
    case 'temporary':
      return {
        title: 'Room temporarily unavailable',
        message:
          'The room could not be loaded right now. Check your connection and try again.',
      };
  }
}
