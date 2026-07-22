import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from './database.types';

export type Room = Tables<'rooms'>;
export type RoomMember = Tables<'room_members'>;
export type RoomSeat = Tables<'room_seats'>;
export type MultiplayerMatch = Tables<'matches'>;

export interface RoomState {
  room: Room;
  members: RoomMember[];
  seats: RoomSeat[];
  match: MultiplayerMatch | null;
}

export const MULTIPLAYER_ERRORS: Record<string, string> = {
  already_joined: 'You already belong to this room.',
  already_seated: 'Release your current seat before claiming another.',
  auth_rate_limited:
    'Anonymous sign-in is temporarily rate limited. Wait a moment and try again.',
  closed_room: 'This room is closed.',
  full_room: 'This room is full.',
  host_only: 'Only the room host can do that.',
  invalid_code: 'That room code is invalid.',
  invalid_display_name: 'Use a display name between 1 and 32 characters.',
  invalid_seat: 'That seat is not available.',
  invalid_settings: 'Those room settings are not supported.',
  match_snapshot_immutable: 'The match setup snapshot cannot be changed.',
  not_authenticated: 'Your anonymous session expired. Reconnect and try again.',
  not_enough_players: 'Claim at least two human seats before starting.',
  room_access_denied: 'This private room is unavailable to this player.',
  room_active: 'This room has already started.',
  room_not_waiting: 'This action is available only while the room is waiting.',
  seat_conflict: 'Another player claimed that seat first.',
  settings_conflict:
    'Release affected seats or members before reducing capacity.',
};

const pendingSessionByClient = new WeakMap<
  SupabaseClient<Database>,
  Promise<string>
>();

export function multiplayerError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : null;
  if (status === 429 || /request rate limit reached/i.test(message)) {
    return new Error(MULTIPLAYER_ERRORS.auth_rate_limited);
  }
  if (Object.values(MULTIPLAYER_ERRORS).includes(message)) {
    return error instanceof Error ? error : new Error(message);
  }
  const key = Object.keys(MULTIPLAYER_ERRORS).find((candidate) =>
    message.includes(candidate),
  );
  return new Error(
    key ? MULTIPLAYER_ERRORS[key] : 'Multiplayer request failed.',
  );
}

async function restoreOrCreateAnonymousSession(
  client: SupabaseClient<Database>,
): Promise<string> {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) {
    const { data, error } = await client.auth.getUser();
    if (!error && data.user) return data.user.id;
    await client.auth.signOut({ scope: 'local' });
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw multiplayerError(error ?? 'not_authenticated');
  return data.user.id;
}

export function ensureAnonymousSession(
  client: SupabaseClient<Database>,
): Promise<string> {
  const pending = pendingSessionByClient.get(client);
  if (pending) return pending;

  const request = restoreOrCreateAnonymousSession(client).finally(() => {
    if (pendingSessionByClient.get(client) === request) {
      pendingSessionByClient.delete(client);
    }
  });
  pendingSessionByClient.set(client, request);
  return request;
}

export async function fetchRoomState(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<RoomState> {
  const [roomResult, membersResult, seatsResult, matchResult] =
    await Promise.all([
      client.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      client
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at'),
      client
        .from('room_seats')
        .select('*')
        .eq('room_id', roomId)
        .order('seat_index'),
      client.from('matches').select('*').eq('room_id', roomId).maybeSingle(),
    ]);
  const error =
    roomResult.error ??
    membersResult.error ??
    seatsResult.error ??
    matchResult.error;
  if (error) throw multiplayerError(error);
  if (!roomResult.data) throw multiplayerError('room_access_denied');
  return {
    room: roomResult.data,
    members: membersResult.data ?? [],
    seats: seatsResult.data ?? [],
    match: matchResult.data,
  };
}

export async function fetchMatch(
  client: SupabaseClient<Database>,
  matchId: string,
): Promise<MultiplayerMatch> {
  const { data, error } = await client
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw multiplayerError(error);
  if (!data) throw multiplayerError('room_access_denied');
  return data;
}

export async function createRoom(
  client: SupabaseClient<Database>,
  displayName: string,
): Promise<Room> {
  const { data, error } = await client.rpc('create_room', {
    display_name: displayName,
  });
  if (error) throw multiplayerError(error);
  return data;
}

export async function joinRoom(
  client: SupabaseClient<Database>,
  joinCode: string,
  displayName: string,
): Promise<Room> {
  const { data, error } = await client.rpc('join_room', {
    join_code: joinCode,
    display_name: displayName,
  });
  if (error) throw multiplayerError(error);
  return data;
}

export async function claimSeat(
  client: SupabaseClient<Database>,
  roomId: string,
  seatIndex: number,
): Promise<void> {
  const { error } = await client.rpc('claim_room_seat', {
    room_id: roomId,
    seat_index: seatIndex,
  });
  if (error) throw multiplayerError(error);
}

export async function releaseSeat(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<void> {
  const { error } = await client.rpc('release_room_seat', { room_id: roomId });
  if (error) throw multiplayerError(error);
}

export async function updateRoomSettings(
  client: SupabaseClient<Database>,
  room: Room,
): Promise<void> {
  const { error } = await client.rpc('update_room_settings', {
    room_id: room.id,
    seed: room.seed,
    territory_count: room.territory_count,
    continent_count: room.continent_count,
    assignment_mode: room.assignment_mode,
    max_seats: room.max_seats,
  });
  if (error) throw multiplayerError(error);
}

export async function startMatch(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<MultiplayerMatch> {
  const { data, error } = await client.rpc('start_room_match', {
    room_id: roomId,
  });
  if (error) throw multiplayerError(error);
  return data;
}

export async function leaveRoom(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<void> {
  const { error } = await client.rpc('leave_room', { room_id: roomId });
  if (error) throw multiplayerError(error);
}

export async function closeRoom(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<void> {
  const { error } = await client.rpc('close_room', { room_id: roomId });
  if (error) throw multiplayerError(error);
}

export function subscribeToRoom(
  client: SupabaseClient<Database>,
  roomId: string,
  onChange: () => void,
  onStatus: (status: string) => void,
): RealtimeChannel {
  const channel = client.channel(`private-room:${roomId}`);
  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_members',
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_seats',
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .subscribe(onStatus);
  return channel;
}

export function formatRoomCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
