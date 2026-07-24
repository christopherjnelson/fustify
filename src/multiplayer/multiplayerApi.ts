import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { GameAction } from '../core/game/types';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import type { Database, Tables } from './database.types';
import type { AuthoritativeCommandResult } from './gameProtocol';

export type Room = Tables<'rooms'>;
export type RoomMember = Tables<'room_members'>;
export type RoomSeat = Tables<'room_seats'>;
export type MultiplayerMatch = Tables<'matches'>;
export type MatchVersion = Pick<
  MultiplayerMatch,
  'id' | 'status' | 'revision' | 'state_fingerprint' | 'updated_at'
>;
export type MatchMutableState = Pick<
  MultiplayerMatch,
  | 'status'
  | 'revision'
  | 'state_snapshot'
  | 'state_fingerprint'
  | 'last_command_type'
  | 'winner_player_id'
  | 'winner_user_id'
  | 'updated_at'
>;
export type RoomMatchSummary = Pick<
  MultiplayerMatch,
  'id' | 'room_id' | 'status' | 'revision'
>;

export interface RoomState {
  room: Room;
  members: RoomMember[];
  seats: RoomSeat[];
  match: RoomMatchSummary | null;
}

export const MATCH_BOOTSTRAP_COLUMNS =
  'id, room_id, status, revision, setup_snapshot, seat_order_snapshot, generator_metadata, planet_snapshot, state_snapshot, state_fingerprint, last_command_type, winner_player_id, winner_user_id, created_at, updated_at' as const;
export const MATCH_VERSION_COLUMNS =
  'id, status, revision, state_fingerprint, updated_at' as const;
export const MATCH_MUTABLE_COLUMNS =
  'status, revision, state_snapshot, state_fingerprint, last_command_type, winner_player_id, winner_user_id, updated_at' as const;
const ROOM_MATCH_COLUMNS = 'id, room_id, status, revision' as const;

export class PermanentMatchReadError extends Error {
  readonly permanent = true;
}

export function isPermanentMatchReadError(
  error: unknown,
): error is PermanentMatchReadError {
  return error instanceof PermanentMatchReadError;
}

export const multiplayerRoomSettingsSchema = z.object({
  seed: z.string().trim().min(1).max(64),
  territoryCount: z.number().int().min(12).max(48),
  continentCount: z.number().int().min(2).max(5),
  assignmentMode: z.literal('random'),
  maxSeats: z.number().int().min(2).max(5),
});

export type MultiplayerRoomSettings = z.infer<
  typeof multiplayerRoomSettingsSchema
>;

export interface CreateRoomOptions {
  settings?: MultiplayerRoomSettings;
  generateSeed?: () => string;
}

const DEFAULT_ROOM_SETTINGS = {
  territoryCount: 42,
  continentCount: 5,
  assignmentMode: 'random',
  maxSeats: 5,
} as const;

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
  invalid_action: 'That action is no longer legal. The match was refreshed.',
  invalid_authoritative_state:
    'The authoritative match state is unavailable. Reconnect and try again.',
  invalid_event_reaction: 'That Activity reaction is not available.',
  idempotency_conflict:
    'That request key was already used for a different action.',
  legacy_match_incomplete:
    'This earlier preview cannot become a playable match. Create a new room.',
  match_snapshot_immutable: 'The match setup snapshot cannot be changed.',
  match_completed: 'This match is complete. No more actions can be played.',
  match_event_not_found:
    'That Activity entry is no longer available for reactions.',
  match_not_active: 'This match is not active.',
  multiplayer_draft_unsupported:
    'Player draft is not available in multiplayer yet. Choose random assignment.',
  not_authenticated: 'Your anonymous session expired. Reconnect and try again.',
  not_enough_players: 'Claim at least two human seats before starting.',
  not_your_turn: 'It is another player’s turn.',
  revision_conflict: 'The match changed before that action was accepted.',
  room_access_denied: 'This private room is unavailable to this player.',
  room_active: 'This room has already started.',
  room_not_waiting: 'This action is available only while the room is waiting.',
  seat_conflict: 'Another player claimed that seat first.',
  seat_required: 'Claimed seat membership is required to play this match.',
  settings_conflict:
    'Release affected seats or members before reducing capacity.',
};

const pendingSessionByClient = new WeakMap<
  SupabaseClient<Database>,
  Promise<string>
>();
const pendingBootstrapByClient = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<MultiplayerMatch>>
>();
const pendingVersionByClient = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<MatchVersion>>
>();
const pendingMutableByClient = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<MatchMutableState>>
>();

function coalescedMatchRead<T>(
  pendingByClient: WeakMap<SupabaseClient<Database>, Map<string, Promise<T>>>,
  client: SupabaseClient<Database>,
  matchId: string,
  read: () => Promise<T>,
): Promise<T> {
  let pendingByMatch = pendingByClient.get(client);
  if (!pendingByMatch) {
    pendingByMatch = new Map();
    pendingByClient.set(client, pendingByMatch);
  }
  const existing = pendingByMatch.get(matchId);
  if (existing) return existing;
  const request = read().finally(() => {
    if (pendingByMatch.get(matchId) === request) pendingByMatch.delete(matchId);
  });
  pendingByMatch.set(matchId, request);
  return request;
}

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
  includeMatch = true,
): Promise<RoomState> {
  const matchRequest = includeMatch
    ? client
        .from('matches')
        .select(ROOM_MATCH_COLUMNS)
        .eq('room_id', roomId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
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
      matchRequest,
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

function permanentMatchReadFailure(
  error: unknown,
  responseStatus?: number,
): boolean {
  const errorStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : Number.NaN;
  const status = responseStatus ?? errorStatus;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 401 ||
    status === 403 ||
    /(?:jwt|token|api key).*(?:expired|invalid)|invalid api key|permission denied|not authenticated/i.test(
      message,
    )
  );
}

function matchReadError(
  error: unknown,
  missing = false,
  responseStatus?: number,
): Error {
  if (missing || permanentMatchReadFailure(error, responseStatus)) {
    return new PermanentMatchReadError(MULTIPLAYER_ERRORS.room_access_denied);
  }
  return multiplayerError(error);
}

export function fetchMatchBootstrap(
  client: SupabaseClient<Database>,
  matchId: string,
): Promise<MultiplayerMatch> {
  return coalescedMatchRead(
    pendingBootstrapByClient,
    client,
    matchId,
    async () => {
      const result = await client
        .from('matches')
        .select(MATCH_BOOTSTRAP_COLUMNS)
        .eq('id', matchId)
        .maybeSingle();
      if (result.error)
        throw matchReadError(result.error, false, result.status);
      if (!result.data) throw matchReadError('room_access_denied', true);
      return result.data;
    },
  );
}

export function fetchMatchVersion(
  client: SupabaseClient<Database>,
  matchId: string,
): Promise<MatchVersion> {
  return coalescedMatchRead(
    pendingVersionByClient,
    client,
    matchId,
    async () => {
      const result = await client
        .from('matches')
        .select(MATCH_VERSION_COLUMNS)
        .eq('id', matchId)
        .maybeSingle();
      if (result.error)
        throw matchReadError(result.error, false, result.status);
      if (!result.data) throw matchReadError('room_access_denied', true);
      return result.data;
    },
  );
}

export function fetchMatchMutableState(
  client: SupabaseClient<Database>,
  matchId: string,
): Promise<MatchMutableState> {
  return coalescedMatchRead(
    pendingMutableByClient,
    client,
    matchId,
    async () => {
      const result = await client
        .from('matches')
        .select(MATCH_MUTABLE_COLUMNS)
        .eq('id', matchId)
        .maybeSingle();
      if (result.error)
        throw matchReadError(result.error, false, result.status);
      if (!result.data) throw matchReadError('room_access_denied', true);
      return result.data;
    },
  );
}

export async function createRoom(
  client: SupabaseClient<Database>,
  displayName: string,
  options: CreateRoomOptions = {},
): Promise<Room> {
  const settings = multiplayerRoomSettingsSchema.parse(
    options.settings ?? {
      ...DEFAULT_ROOM_SETTINGS,
      seed: (options.generateSeed ?? generateReadableWorldSeed)(),
    },
  );
  const { data, error } = await client.rpc('create_room', {
    display_name: displayName,
    seed: settings.seed,
    territory_count: settings.territoryCount,
    continent_count: settings.continentCount,
    assignment_mode: settings.assignmentMode,
    max_seats: settings.maxSeats,
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

async function functionError(error: unknown): Promise<Error> {
  if (
    typeof error === 'object' &&
    error !== null &&
    'context' in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.clone().json()) as {
        code?: string;
        gameError?: { message?: string };
      };
      if (body.gameError?.message) return new Error(body.gameError.message);
      if (body.code) return multiplayerError(body.code);
    } catch {
      // Fall through to the generic mapper for non-JSON gateway errors.
    }
  }
  return multiplayerError(error);
}

export async function startMatch(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<MultiplayerMatch> {
  const { data, error } = await client.functions.invoke('multiplayer-game', {
    body: { operation: 'start', roomId },
  });
  if (error) throw await functionError(error);
  const match = (data as { match?: MultiplayerMatch } | null)?.match;
  if (!match) throw multiplayerError('invalid_authoritative_state');
  return match;
}

export async function submitGameplayCommand(
  client: SupabaseClient<Database>,
  matchId: string,
  expectedRevision: number,
  idempotencyKey: string,
  action: GameAction,
): Promise<AuthoritativeCommandResult> {
  const { data, error } = await client.functions.invoke('multiplayer-game', {
    body: {
      operation: 'command',
      matchId,
      expectedRevision,
      idempotencyKey,
      action,
    },
  });
  if (error) throw await functionError(error);
  const result = data as Partial<AuthoritativeCommandResult> | null;
  if (
    !result ||
    !Number.isSafeInteger(result.acceptedRevision) ||
    typeof result.stateFingerprint !== 'string' ||
    typeof result.duplicate !== 'boolean'
  ) {
    throw multiplayerError('invalid_authoritative_state');
  }
  return result as AuthoritativeCommandResult;
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

export function subscribeToMatch(
  client: SupabaseClient<Database>,
  matchId: string,
  onChange: (version: Pick<MatchVersion, 'revision' | 'status'>) => void,
  onStatus: (status: string) => void,
): RealtimeChannel {
  const channel = client.channel(`private-match:${matchId}`);
  channel
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      },
      (payload) => {
        const row = payload.new as {
          revision?: number;
          status?: string;
        } | null;
        const revision = Number(row?.revision ?? -1);
        if (Number.isSafeInteger(revision)) {
          onChange({ revision, status: row?.status ?? 'active' });
        }
      },
    )
    .subscribe(onStatus);
  return channel;
}

export function formatRoomCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
