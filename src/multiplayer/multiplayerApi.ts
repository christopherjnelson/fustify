import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { GameAction } from '../core/game/types';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import type { Database, Tables } from './database.types';
import type { AuthoritativeCommandResult } from './gameProtocol';
import { MULTIPLAYER_ERRORS, multiplayerError } from './multiplayerError';

export { MULTIPLAYER_ERRORS, multiplayerError };

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

export class RoomMembershipRequiredError extends Error {
  readonly membershipRequired = true;
}

export function isRoomMembershipRequiredError(
  error: unknown,
): error is RoomMembershipRequiredError {
  return error instanceof RoomMembershipRequiredError;
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

export const roomNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a game name.')
  .max(60, 'Game names can be up to 60 characters.')
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return (
          codePoint !== undefined &&
          (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
        );
      }),
    'Game names cannot contain control characters.',
  );

export interface CreateRoomOptions {
  settings?: MultiplayerRoomSettings;
  generateSeed?: () => string;
  name?: string;
}

const DEFAULT_ROOM_SETTINGS = {
  territoryCount: 42,
  continentCount: 5,
  assignmentMode: 'random',
  maxSeats: 5,
} as const;

const publicRoomPlayerSchema = z.object({
  displayName: z.string().min(1).max(40),
  avatarUrl: z.string().url().nullable(),
});

const publicRoomSchema = z.object({
  room_id: z.string().uuid(),
  room_name: roomNameSchema,
  host_display_name: z.string().min(1).max(40),
  host_avatar_url: z.string().url().nullable(),
  current_players: z.number().int().min(0).max(5),
  maximum_players: z.number().int().min(2).max(5),
  room_state: z.enum(['waiting', 'full']),
  room_seed: z.string().trim().min(1).max(64),
  territory_count: z.number().int().min(12).max(48),
  continent_count: z.number().int().min(2).max(5),
  assignment_mode: z.enum(['random', 'player-draft']),
  thumbnail_path: z.string().nullable(),
  thumbnail_version: z.number().int().nonnegative(),
  players: z.array(publicRoomPlayerSchema).max(5),
  created_at: z.string(),
});

export type PublicRoom = z.infer<typeof publicRoomSchema>;
export type PublicRoomJoin = { id: string };

const publishRoomResultSchema = z.object({
  room_id: z.string().uuid(),
  room_visibility: z.literal('public'),
  room_revision: z.number().int().nonnegative(),
});

export type PublishRoomResult = z.infer<typeof publishRoomResultSchema>;

export const PUBLIC_MULTIPLAYER_ORIGIN = 'https://dev.fustify.com';

export function publicRoomUrl(roomId: string): string {
  return new URL(
    `/multiplayer/room/${encodeURIComponent(roomId)}`,
    PUBLIC_MULTIPLAYER_ORIGIN,
  ).toString();
}

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
const pendingHeartbeatByClient = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<boolean>>
>();
const pendingPublicationByClient = new WeakMap<
  SupabaseClient<Database>,
  Map<string, Promise<PublishRoomResult>>
>();

function coalescedRequest<T>(
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
  if (!roomResult.data) {
    throw new RoomMembershipRequiredError(
      MULTIPLAYER_ERRORS.room_access_denied,
    );
  }
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

export function isAccountRequiredError(error: unknown): boolean {
  if (
    error instanceof Error &&
    error.message === MULTIPLAYER_ERRORS.account_required
  ) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P0001' &&
    'message' in error &&
    error.message === 'account_required'
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
  return coalescedRequest(
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
  return coalescedRequest(pendingVersionByClient, client, matchId, async () => {
    const result = await client
      .from('matches')
      .select(MATCH_VERSION_COLUMNS)
      .eq('id', matchId)
      .maybeSingle();
    if (result.error) throw matchReadError(result.error, false, result.status);
    if (!result.data) throw matchReadError('room_access_denied', true);
    return result.data;
  });
}

export function fetchMatchMutableState(
  client: SupabaseClient<Database>,
  matchId: string,
): Promise<MatchMutableState> {
  return coalescedRequest(pendingMutableByClient, client, matchId, async () => {
    const result = await client
      .from('matches')
      .select(MATCH_MUTABLE_COLUMNS)
      .eq('id', matchId)
      .maybeSingle();
    if (result.error) throw matchReadError(result.error, false, result.status);
    if (!result.data) throw matchReadError('room_access_denied', true);
    return result.data;
  });
}

export async function createRoom(
  client: SupabaseClient<Database>,
  options: CreateRoomOptions = {},
): Promise<Room> {
  const settings = multiplayerRoomSettingsSchema.parse(
    options.settings ?? {
      ...DEFAULT_ROOM_SETTINGS,
      seed: (options.generateSeed ?? generateReadableWorldSeed)(),
    },
  );
  const args = {
    // Retained for the deployed RPC signature; the server ignores this value.
    display_name: '',
    seed: settings.seed,
    territory_count: settings.territoryCount,
    continent_count: settings.continentCount,
    assignment_mode: settings.assignmentMode,
    max_seats: settings.maxSeats,
    game_name: roomNameSchema.parse(options.name ?? 'New Game'),
  };
  const { data, error } = await client.rpc('create_room', args);
  if (error) throw multiplayerError(error);
  if (!data) throw multiplayerError('room_creation_failed');
  if (
    data.visibility !== 'private' ||
    data.status !== 'waiting' ||
    !data.join_code
  ) {
    throw multiplayerError('room_creation_failed');
  }
  return data;
}

export async function fetchPublicRooms(
  client: SupabaseClient<Database>,
): Promise<PublicRoom[]> {
  const { data, error } = await client.rpc('list_public_rooms');
  if (error) throw multiplayerError(error);
  return z.array(publicRoomSchema).parse(data ?? []);
}

export async function joinPublicRoom(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<PublicRoomJoin> {
  const { data, error } = await client.rpc('join_public_room', {
    p_room_id: roomId,
  });
  if (error) throw multiplayerError(error);
  const joined = data?.[0];
  if (!joined) throw multiplayerError('public_room_unavailable');
  return joined;
}

export async function joinRoom(
  client: SupabaseClient<Database>,
  joinCode: string,
): Promise<Room> {
  const { data, error } = await client.rpc('join_room', {
    join_code: joinCode,
    // Retained for the deployed RPC signature; the server ignores this value.
    display_name: '',
  });
  if (error) throw multiplayerError(error);
  return data;
}

export function heartbeatRoomMembership(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<boolean> {
  return coalescedRequest(
    pendingHeartbeatByClient,
    client,
    roomId,
    async () => {
      const { data, error } = await client.rpc('heartbeat_room_membership', {
        p_room_id: roomId,
      });
      if (error) throw error;
      return data;
    },
  );
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
): Promise<Room> {
  const { data, error } = await client.rpc('update_room_settings', {
    room_id: room.id,
    seed: room.seed,
    territory_count: room.territory_count,
    continent_count: room.continent_count,
    assignment_mode: room.assignment_mode,
    max_seats: room.max_seats,
    game_name: room.name,
  });
  if (error) throw multiplayerError(error);
  return data;
}

export function publishRoom(
  client: SupabaseClient<Database>,
  roomId: string,
): Promise<PublishRoomResult> {
  return coalescedRequest(
    pendingPublicationByClient,
    client,
    roomId,
    async () => {
      const { data, error } = await client.rpc('publish_room', {
        p_room_id: roomId,
      });
      if (error) throw multiplayerError(error);
      return publishRoomResultSchema.parse(data?.[0]);
    },
  );
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
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    throw multiplayerError('not_authenticated');
  }
  let response: Response;
  try {
    response = await fetch('/api/multiplayer/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId }),
    });
  } catch (error) {
    throw multiplayerError(error);
  }
  type StartMatchResponse = {
    match?: MultiplayerMatch;
    code?: string;
  };
  let data: StartMatchResponse;
  try {
    data = (await response.json()) as StartMatchResponse;
  } catch {
    throw multiplayerError('multiplayer_request_failed');
  }
  if (!response.ok) throw multiplayerError(data.code ?? response);
  const match = data.match;
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
