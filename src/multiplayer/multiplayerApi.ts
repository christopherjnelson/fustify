import { z } from 'zod';
import { getAppSessionToken } from '../auth/appAuthClient';
import type { GameAction } from '../core/game/types';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import {
  DEFAULT_NEW_CONTINENT_COUNT,
  DEFAULT_WORLD_SETUP,
  MAX_NEW_PLAYER_COUNT,
} from '../core/setup/worldSetup';
import type {
  ApplicationClient,
  RealtimeSubscription,
} from './applicationClient';
import type { Tables } from './database.types';
import type { AuthoritativeCommandResult } from './gameProtocol';
import { MULTIPLAYER_ERRORS, multiplayerError } from './multiplayerError';

export { MULTIPLAYER_ERRORS, multiplayerError };

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    T | { code?: string } | null;
  if (!response.ok) {
    throw multiplayerError(
      body && typeof body === 'object' && 'code' in body
        ? (body.code ?? 'multiplayer_request_failed')
        : 'multiplayer_request_failed',
    );
  }
  return body as T;
}

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

// Kept as stable identifiers for synchronization diagnostics and tests. The
// Node API owns its SQL projection; browser code never sends these strings.
export const MATCH_BOOTSTRAP_COLUMNS = 'match-bootstrap' as const;
export const MATCH_VERSION_COLUMNS = 'match-version' as const;
export const MATCH_MUTABLE_COLUMNS = 'match-mutable-state' as const;

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
  continentCount: z.number().int().min(2).max(6),
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
  territoryCount: DEFAULT_WORLD_SETUP.territoryCount,
  continentCount: DEFAULT_NEW_CONTINENT_COUNT,
  assignmentMode: 'random',
  maxSeats: MAX_NEW_PLAYER_COUNT,
} as const;

export function defaultMultiplayerRoomSettings(
  seed: string,
  maxSeats: number = DEFAULT_ROOM_SETTINGS.maxSeats,
): MultiplayerRoomSettings {
  return multiplayerRoomSettingsSchema.parse({
    ...DEFAULT_ROOM_SETTINGS,
    seed,
    maxSeats,
  });
}

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
  continent_count: z.number().int().min(2).max(6),
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
  ApplicationClient,
  Map<string, Promise<MultiplayerMatch>>
>();
const pendingVersionByClient = new WeakMap<
  ApplicationClient,
  Map<string, Promise<MatchVersion>>
>();
const pendingMutableByClient = new WeakMap<
  ApplicationClient,
  Map<string, Promise<MatchMutableState>>
>();
const pendingHeartbeatByClient = new WeakMap<
  ApplicationClient,
  Map<string, Promise<boolean>>
>();
const pendingPublicationByClient = new WeakMap<
  ApplicationClient,
  Map<string, Promise<PublishRoomResult>>
>();

function coalescedRequest<T>(
  pendingByClient: WeakMap<ApplicationClient, Map<string, Promise<T>>>,
  client: ApplicationClient,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  let pendingByKey = pendingByClient.get(client);
  if (!pendingByKey) {
    pendingByKey = new Map();
    pendingByClient.set(client, pendingByKey);
  }
  const existing = pendingByKey.get(key);
  if (existing) return existing;
  const request = read().finally(() => {
    if (pendingByKey.get(key) === request) pendingByKey.delete(key);
  });
  pendingByKey.set(key, request);
  return request;
}

function isAccessDenied(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === MULTIPLAYER_ERRORS.room_access_denied ||
      error.message === MULTIPLAYER_ERRORS.not_authenticated ||
      error.message === MULTIPLAYER_ERRORS.account_required)
  );
}

export async function fetchRoomState(
  _client: ApplicationClient,
  roomId: string,
  includeMatch = true,
): Promise<RoomState> {
  try {
    return await apiRequest<RoomState>(
      `/api/multiplayer/rooms/${encodeURIComponent(roomId)}?includeMatch=${includeMatch}`,
    );
  } catch (error) {
    if (isAccessDenied(error)) {
      throw new RoomMembershipRequiredError(
        MULTIPLAYER_ERRORS.room_access_denied,
      );
    }
    throw error;
  }
}

export function isAccountRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === MULTIPLAYER_ERRORS.account_required
  );
}

async function matchRequest<T>(path: string): Promise<T> {
  try {
    return await apiRequest<T>(path);
  } catch (error) {
    if (isAccessDenied(error)) {
      throw new PermanentMatchReadError(MULTIPLAYER_ERRORS.room_access_denied);
    }
    throw error;
  }
}

export function fetchMatchBootstrap(
  client: ApplicationClient,
  matchId: string,
): Promise<MultiplayerMatch> {
  return coalescedRequest(pendingBootstrapByClient, client, matchId, () =>
    matchRequest(
      `/api/multiplayer/matches/${encodeURIComponent(matchId)}/bootstrap`,
    ),
  );
}

export function fetchMatchVersion(
  client: ApplicationClient,
  matchId: string,
): Promise<MatchVersion> {
  return coalescedRequest(pendingVersionByClient, client, matchId, () =>
    matchRequest(
      `/api/multiplayer/matches/${encodeURIComponent(matchId)}/version`,
    ),
  );
}

export function fetchMatchMutableState(
  client: ApplicationClient,
  matchId: string,
): Promise<MatchMutableState> {
  return coalescedRequest(pendingMutableByClient, client, matchId, () =>
    matchRequest(
      `/api/multiplayer/matches/${encodeURIComponent(matchId)}/state`,
    ),
  );
}

export async function createRoom(
  _client: ApplicationClient,
  options: CreateRoomOptions = {},
): Promise<Room> {
  const settings = options.settings
    ? multiplayerRoomSettingsSchema.parse(options.settings)
    : defaultMultiplayerRoomSettings(
        (options.generateSeed ?? generateReadableWorldSeed)(),
      );
  return apiRequest<Room>('/api/multiplayer/rooms', {
    method: 'POST',
    body: JSON.stringify({
      seed: settings.seed,
      territoryCount: settings.territoryCount,
      continentCount: settings.continentCount,
      assignmentMode: settings.assignmentMode,
      maxSeats: settings.maxSeats,
      name: roomNameSchema.parse(options.name ?? 'New Game'),
    }),
  });
}

export async function fetchPublicRooms(
  _client: ApplicationClient,
): Promise<PublicRoom[]> {
  void _client;
  return z
    .array(publicRoomSchema)
    .parse(await apiRequest('/api/multiplayer/rooms/public'));
}

export async function joinPublicRoom(
  _client: ApplicationClient,
  roomId: string,
): Promise<PublicRoomJoin> {
  const room = await apiRequest<Room>(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/join`,
    { method: 'POST' },
  );
  return { id: room.id };
}

export function joinRoom(
  _client: ApplicationClient,
  joinCode: string,
): Promise<Room> {
  return apiRequest('/api/multiplayer/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ joinCode }),
  });
}

export function heartbeatRoomMembership(
  client: ApplicationClient,
  roomId: string,
): Promise<boolean> {
  return coalescedRequest(pendingHeartbeatByClient, client, roomId, () =>
    apiRequest(
      `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/heartbeat`,
      { method: 'POST' },
    ),
  );
}

export async function claimSeat(
  _client: ApplicationClient,
  roomId: string,
  seatIndex: number,
): Promise<void> {
  await apiRequest(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/seats/claim`,
    { method: 'POST', body: JSON.stringify({ seatIndex }) },
  );
}

export async function releaseSeat(
  _client: ApplicationClient,
  roomId: string,
): Promise<void> {
  await apiRequest(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/seats/release`,
    { method: 'POST' },
  );
}

export function updateRoomSettings(
  _client: ApplicationClient,
  room: Room,
): Promise<Room> {
  return apiRequest(
    `/api/multiplayer/rooms/${encodeURIComponent(room.id)}/settings`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        seed: room.seed,
        territoryCount: room.territory_count,
        continentCount: room.continent_count,
        assignmentMode: room.assignment_mode,
        maxSeats: room.max_seats,
        name: room.name,
      }),
    },
  );
}

export function publishRoom(
  client: ApplicationClient,
  roomId: string,
): Promise<PublishRoomResult> {
  return coalescedRequest(
    pendingPublicationByClient,
    client,
    roomId,
    async () =>
      publishRoomResultSchema.parse(
        await apiRequest(
          `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/publish`,
          { method: 'POST' },
        ),
      ),
  );
}

export async function startMatch(
  _client: ApplicationClient,
  roomId: string,
): Promise<MultiplayerMatch> {
  const accessToken = await getAppSessionToken();
  if (!accessToken) throw multiplayerError('not_authenticated');
  const response = await fetch('/api/multiplayer/start', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ roomId }),
  }).catch((error: unknown) => {
    throw multiplayerError(error);
  });
  const data = (await response.json().catch(() => null)) as {
    match?: MultiplayerMatch;
    code?: string;
  } | null;
  if (!response.ok) throw multiplayerError(data?.code ?? response);
  if (!data?.match) throw multiplayerError('invalid_authoritative_state');
  return data.match;
}

export async function submitGameplayCommand(
  _client: ApplicationClient,
  matchId: string,
  expectedRevision: number,
  idempotencyKey: string,
  action: GameAction,
): Promise<AuthoritativeCommandResult> {
  const accessToken = await getAppSessionToken();
  if (!accessToken) throw multiplayerError('not_authenticated');
  const result = await apiRequest<Partial<AuthoritativeCommandResult>>(
    '/api/multiplayer/command',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        operation: 'command',
        matchId,
        expectedRevision,
        idempotencyKey,
        action,
      }),
    },
  );
  if (
    !Number.isSafeInteger(result.acceptedRevision) ||
    typeof result.stateFingerprint !== 'string' ||
    typeof result.duplicate !== 'boolean'
  ) {
    throw multiplayerError('invalid_authoritative_state');
  }
  return result as AuthoritativeCommandResult;
}

export async function leaveRoom(
  _client: ApplicationClient,
  roomId: string,
): Promise<void> {
  await apiRequest(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/leave`,
    {
      method: 'POST',
    },
  );
}

export async function closeRoom(
  _client: ApplicationClient,
  roomId: string,
): Promise<void> {
  await apiRequest(
    `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/close`,
    {
      method: 'POST',
    },
  );
}

export function subscribeToRoom(
  _client: ApplicationClient,
  _roomId: string,
  onChange: () => void,
  onStatus: (status: string) => void,
): RealtimeSubscription {
  onStatus('SUBSCRIBED');
  const timer = window.setInterval(onChange, 1_500);
  return {
    unsubscribe() {
      window.clearInterval(timer);
    },
  };
}

export function subscribeToMatch(
  client: ApplicationClient,
  matchId: string,
  onChange: (version: Pick<MatchVersion, 'revision' | 'status'>) => void,
  onStatus: (status: string) => void,
): RealtimeSubscription {
  let revision = -1;
  onStatus('SUBSCRIBED');
  const poll = () => {
    void fetchMatchVersion(client, matchId)
      .then((version) => {
        if (version.revision !== revision) {
          revision = version.revision;
          onChange({ revision: version.revision, status: version.status });
        }
      })
      .catch(() => undefined);
  };
  const timer = window.setInterval(poll, 1_000);
  return {
    unsubscribe() {
      window.clearInterval(timer);
    },
  };
}

export function formatRoomCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
