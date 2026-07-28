import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthoritativeMatchInitialization,
  ClaimedSeat,
} from '../src/multiplayer/authoritativeEngine.ts';
import type {
  Database,
  Json,
  Tables,
} from '../src/multiplayer/database.types.ts';
import { authorizeGameplayRequest } from '../src/multiplayer/requestAuthorization.ts';

export type MultiplayerMatch = Tables<'matches'>;
type Room = Tables<'rooms'>;

export interface AuthoritativeRoom {
  id: string;
  host_user_id: string;
  seed: string;
  territory_count: number;
  continent_count: number;
  assignment_mode: string;
  generator_version?: number | null;
}

export interface StartMatchRepository {
  authorize(authorization: string | null): Promise<
    | { ok: true; actorUserId: string }
    | {
        ok: false;
        status: 401 | 403;
        code: 'not_authenticated' | 'account_required';
      }
  >;
  loadRoom(roomId: string): Promise<AuthoritativeRoom>;
  loadExistingMatch(roomId: string): Promise<MultiplayerMatch | null>;
  loadClaimedSeats(roomId: string): Promise<ClaimedSeat[]>;
  beginInitialization(input: {
    roomId: string;
    matchId: string;
    actorUserId: string;
  }): Promise<void>;
  cancelInitialization(input: {
    roomId: string;
    matchId: string;
    actorUserId: string;
  }): Promise<void>;
  commitInitialization(input: {
    roomId: string;
    matchId: string;
    actorUserId: string;
    initialized: AuthoritativeMatchInitialization;
  }): Promise<MultiplayerMatch>;
}

export type AuthoritativeInitializer = (
  matchId: string,
  room: AuthoritativeRoom,
  claimedSeats: ClaimedSeat[],
) => Promise<AuthoritativeMatchInitialization>;

export class MatchStartError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  not_authenticated: 401,
  account_required: 403,
  room_access_denied: 403,
  host_only: 403,
  legacy_match_incomplete: 409,
  server_configuration_error: 503,
};

const KNOWN_CODES = [
  'not_authenticated',
  'account_required',
  'room_access_denied',
  'host_only',
  'not_enough_players',
  'multiplayer_draft_unsupported',
  'legacy_match_incomplete',
  'room_not_waiting',
  'profile_unavailable',
  'invalid_authoritative_state',
  'invalid_request',
  'request_too_large',
  'server_configuration_error',
  'multiplayer_request_failed',
] as const;

export function startMatchError(error: unknown): MatchStartError {
  if (error instanceof MatchStartError) return error;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : String(error);
  const code =
    KNOWN_CODES.find((candidate) => message.includes(candidate)) ??
    'multiplayer_request_failed';
  return new MatchStartError(code, STATUS_BY_CODE[code] ?? 400);
}

export class MatchStartService {
  private readonly pending = new Map<string, Promise<MultiplayerMatch>>();

  constructor(
    private readonly repository: StartMatchRepository,
    private readonly initialize: AuthoritativeInitializer,
  ) {}

  async start(
    authorization: string | null,
    roomId: string,
  ): Promise<MultiplayerMatch> {
    const authorized = await this.repository.authorize(authorization);
    if (!authorized.ok) {
      throw new MatchStartError(authorized.code, authorized.status);
    }

    const room = await this.repository.loadRoom(roomId);
    if (room.host_user_id !== authorized.actorUserId) {
      throw new MatchStartError('host_only', 403);
    }

    const existing = await this.repository.loadExistingMatch(roomId);
    if (existing?.state_snapshot) return existing;
    if (existing) throw new MatchStartError('legacy_match_incomplete', 409);

    const pending = this.pending.get(roomId);
    if (pending) return pending;

    const request = this.initializeAndCommit(
      room,
      authorized.actorUserId,
    ).finally(() => {
      if (this.pending.get(roomId) === request) this.pending.delete(roomId);
    });
    this.pending.set(roomId, request);
    return request;
  }

  private async initializeAndCommit(
    room: AuthoritativeRoom,
    actorUserId: string,
  ): Promise<MultiplayerMatch> {
    const matchId = randomUUID();
    await this.repository.beginInitialization({
      roomId: room.id,
      matchId,
      actorUserId,
    });
    try {
      const claimedSeats = await this.repository.loadClaimedSeats(room.id);
      const initialized = await this.initialize(matchId, room, claimedSeats);
      return await this.repository.commitInitialization({
        roomId: room.id,
        matchId,
        actorUserId,
        initialized,
      });
    } catch (error) {
      try {
        await this.repository.cancelInitialization({
          roomId: room.id,
          matchId,
          actorUserId,
        });
      } catch {
        // Preserve the initialization failure. A later launch can recover an
        // abandoned canonical launch lease after its database timeout.
      }
      throw error;
    }
  }
}

export interface SupabaseStartConfiguration {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
}

export class SupabaseStartMatchRepository implements StartMatchRepository {
  private readonly authClient: SupabaseClient<Database>;
  private readonly admin: SupabaseClient<Database>;

  constructor(configuration: SupabaseStartConfiguration) {
    const authOptions = {
      auth: { persistSession: false, autoRefreshToken: false },
    } as const;
    this.authClient = createClient<Database>(
      configuration.url,
      configuration.publishableKey,
      authOptions,
    );
    this.admin = createClient<Database>(
      configuration.url,
      configuration.serviceRoleKey,
      authOptions,
    );
  }

  async authorize(
    authorization: string | null,
  ): ReturnType<StartMatchRepository['authorize']> {
    const authorized = await authorizeGameplayRequest(
      authorization,
      async (token) => {
        const { data, error } = await this.authClient.auth.getUser(token);
        return { user: data.user, error };
      },
    );
    if (!authorized.ok) return authorized;
    const unrestrictedAdmin = this.admin as unknown as SupabaseClient;
    const { data: moderation, error } = await unrestrictedAdmin
      .from('account_moderation')
      .select('state,banned_until')
      .eq('user_id', authorized.actorUserId)
      .maybeSingle();
    if (error?.code !== 'PGRST205' && error) {
      throw new MatchStartError('server_configuration_error', 503);
    }
    if (
      moderation?.state === 'deleted' ||
      moderation?.state === 'revoked' ||
      (moderation?.state === 'banned' &&
        (!moderation.banned_until ||
          Date.parse(moderation.banned_until) > Date.now()))
    ) {
      return {
        ok: false,
        status: 403,
        code: 'account_required',
      } as const;
    }
    return authorized;
  }

  async loadRoom(roomId: string): Promise<AuthoritativeRoom> {
    const { data, error } = await this.admin
      .from('rooms')
      .select(
        'id, host_user_id, seed, territory_count, continent_count, assignment_mode, generator_version',
      )
      .eq('id', roomId)
      .maybeSingle();
    if (error || !data) throw new Error('room_access_denied');
    return data satisfies Pick<
      Room,
      | 'id'
      | 'host_user_id'
      | 'seed'
      | 'territory_count'
      | 'continent_count'
      | 'assignment_mode'
      | 'generator_version'
    >;
  }

  async loadExistingMatch(roomId: string): Promise<MultiplayerMatch | null> {
    const { data, error } = await this.admin
      .from('matches')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async loadClaimedSeats(roomId: string): Promise<ClaimedSeat[]> {
    const { data: seats, error: seatsError } = await this.admin
      .from('room_seats')
      .select('seat_index, occupant_user_id')
      .eq('room_id', roomId)
      .eq('controller_type', 'human')
      .not('occupant_user_id', 'is', null)
      .order('seat_index');
    if (seatsError) throw new Error('room_access_denied');

    const occupantUserIds = (seats ?? []).flatMap((seat) =>
      seat.occupant_user_id ? [seat.occupant_user_id] : [],
    );
    if (occupantUserIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await this.admin
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', occupantUserIds);
    if (profilesError) throw new Error('profile_unavailable');
    const names = new Map(
      (profiles ?? []).map((profile) => [
        profile.user_id,
        profile.display_name,
      ]),
    );
    return (seats ?? []).map((seat) => {
      const userId = seat.occupant_user_id;
      const displayName = userId ? names.get(userId) : null;
      if (!userId || !displayName) throw new Error('profile_unavailable');
      return {
        seatIndex: seat.seat_index,
        userId,
        displayName,
        controllerType: 'human',
      };
    });
  }

  async beginInitialization({
    roomId,
    matchId,
    actorUserId,
  }: {
    roomId: string;
    matchId: string;
    actorUserId: string;
  }): Promise<void> {
    const { error } = await this.admin.rpc(
      'authority_begin_room_match_initialization',
      {
        p_room_id: roomId,
        p_match_id: matchId,
        p_actor_user_id: actorUserId,
      },
    );
    if (error) throw error;
  }

  async cancelInitialization({
    roomId,
    matchId,
    actorUserId,
  }: {
    roomId: string;
    matchId: string;
    actorUserId: string;
  }): Promise<void> {
    const { error } = await this.admin.rpc(
      'authority_cancel_room_match_initialization',
      {
        p_room_id: roomId,
        p_match_id: matchId,
        p_actor_user_id: actorUserId,
      },
    );
    if (error) throw error;
  }

  async commitInitialization({
    roomId,
    matchId,
    actorUserId,
    initialized,
  }: {
    roomId: string;
    matchId: string;
    actorUserId: string;
    initialized: AuthoritativeMatchInitialization;
  }): Promise<MultiplayerMatch> {
    const { data, error } = await this.admin.rpc(
      'authority_initialize_room_match',
      {
        p_room_id: roomId,
        p_match_id: matchId,
        p_actor_user_id: actorUserId,
        p_setup_snapshot: initialized.setupSnapshot as Json,
        p_seat_order_snapshot: initialized.seatOrderSnapshot as unknown as Json,
        p_generator_metadata: initialized.generatorMetadata as Json,
        p_planet_snapshot: initialized.planet as unknown as Json,
        p_state_snapshot: initialized.state as unknown as Json,
        p_state_fingerprint: initialized.stateFingerprint,
      },
    );
    if (error) throw error;
    return data;
  }
}
