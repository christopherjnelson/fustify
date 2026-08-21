import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  AuthoritativeMatchInitialization,
  ClaimedSeat,
} from '../src/multiplayer/authoritativeEngine.ts';
import type { Json, Tables } from '../src/multiplayer/database.types.ts';

export type MultiplayerMatch = Tables<'matches'>;

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

function bearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,512})$/);
  return match?.[1] ?? null;
}

function databaseRow<T>(row: unknown): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresStartMatchRepository implements StartMatchRepository {
  constructor(private readonly pool: Pool) {}

  async authorize(
    authorization: string | null,
  ): ReturnType<StartMatchRepository['authorize']> {
    const token = bearerToken(authorization);
    if (!token) {
      return {
        ok: false,
        status: 401,
        code: 'not_authenticated',
      } as const;
    }
    const result = await this.pool.query<{ user_id: string }>(
      `select sessions.user_id
       from auth_sessions as sessions
       join profiles on profiles.user_id = sessions.user_id
       where sessions.token = $1
         and sessions.expires_at > statement_timestamp()
         and profiles.onboarding_completed`,
      [token],
    );
    const actorUserId = result.rows[0]?.user_id;
    if (!actorUserId) {
      return {
        ok: false,
        status: 403,
        code: 'account_required',
      } as const;
    }
    return { ok: true, actorUserId };
  }

  async loadRoom(roomId: string): Promise<AuthoritativeRoom> {
    const result = await this.pool.query<AuthoritativeRoom>(
      `select id, host_user_id, seed, territory_count, continent_count,
              assignment_mode, generator_version
       from rooms where id = $1`,
      [roomId],
    );
    const room = result.rows[0];
    if (!room) throw new Error('room_access_denied');
    return room;
  }

  async loadExistingMatch(roomId: string): Promise<MultiplayerMatch | null> {
    const result = await this.pool.query(
      'select * from matches where room_id = $1',
      [roomId],
    );
    return result.rows[0]
      ? databaseRow<MultiplayerMatch>(result.rows[0])
      : null;
  }

  async loadClaimedSeats(roomId: string): Promise<ClaimedSeat[]> {
    const result = await this.pool.query<{
      seat_index: number;
      occupant_user_id: string;
      display_name: string;
    }>(
      `select seats.seat_index, seats.occupant_user_id, profiles.display_name
       from room_seats as seats
       join profiles on profiles.user_id = seats.occupant_user_id
       where seats.room_id = $1
         and seats.controller_type = 'human'
         and seats.occupant_user_id is not null
       order by seats.seat_index`,
      [roomId],
    );
    return result.rows.map((seat) => ({
      seatIndex: seat.seat_index,
      userId: seat.occupant_user_id,
      displayName: seat.display_name,
      controllerType: 'human',
    }));
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
    await transaction(this.pool, async (client) => {
      const roomResult = await client.query<{
        host_user_id: string;
        status: string;
        assignment_mode: string;
      }>(
        'select host_user_id, status, assignment_mode from rooms where id = $1 for update',
        [roomId],
      );
      const room = roomResult.rows[0];
      if (!room) throw new Error('room_access_denied');
      if (room.host_user_id !== actorUserId) throw new Error('host_only');
      if (room.assignment_mode !== 'random') {
        throw new Error('multiplayer_draft_unsupported');
      }
      const seats = await client.query<{ count: string }>(
        `select count(*)::text as count from room_seats
         where room_id = $1 and occupant_user_id is not null
           and controller_type = 'human'`,
        [roomId],
      );
      if (Number(seats.rows[0]?.count ?? 0) < 2) {
        throw new Error('not_enough_players');
      }
      const existing = await client.query(
        'select started_at from match_launches where room_id = $1 for update',
        [roomId],
      );
      if (room.status === 'active' && existing.rows[0]) {
        const startedAt = new Date(existing.rows[0].started_at as string);
        if (Date.now() - startedAt.getTime() <= 5 * 60_000) {
          throw new Error('room_not_waiting');
        }
        await client.query(
          `update match_launches
           set match_id = $2, started_at = statement_timestamp()
           where room_id = $1`,
          [roomId, matchId],
        );
      } else {
        if (room.status !== 'waiting') throw new Error('room_not_waiting');
        await client.query(
          'insert into match_launches (room_id, match_id) values ($1, $2)',
          [roomId, matchId],
        );
      }
      await client.query(
        `update rooms set status = 'active', revision = revision + 1
         where id = $1`,
        [roomId],
      );
    });
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
    await transaction(this.pool, async (client) => {
      const deleted = await client.query(
        'delete from match_launches where room_id = $1 and match_id = $2',
        [roomId, matchId],
      );
      if (deleted.rowCount === 1) {
        await client.query(
          `update rooms set status = 'waiting', revision = revision + 1
           where id = $1 and host_user_id = $2 and status = 'active'
             and not exists (select 1 from matches where room_id = $1)`,
          [roomId, actorUserId],
        );
      }
    });
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
    return transaction(this.pool, async (client) => {
      const roomResult = await client.query<{ host_user_id: string }>(
        'select host_user_id from rooms where id = $1 for update',
        [roomId],
      );
      if (roomResult.rows[0]?.host_user_id !== actorUserId) {
        throw new Error('host_only');
      }
      const launch = await client.query(
        'select 1 from match_launches where room_id = $1 and match_id = $2',
        [roomId, matchId],
      );
      if (!launch.rows[0]) throw new Error('room_not_waiting');
      const existing = await client.query(
        'select * from matches where room_id = $1 for update',
        [roomId],
      );
      if (existing.rows[0]?.state_snapshot) {
        return databaseRow<MultiplayerMatch>(existing.rows[0]);
      }
      if (existing.rows[0]) throw new Error('legacy_match_incomplete');
      const inserted = await client.query(
        `insert into matches (
           id, room_id, status, revision, setup_snapshot,
           seat_order_snapshot, generator_metadata, planet_snapshot,
           state_snapshot, state_fingerprint
         ) values ($1, $2, 'active', 0, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          matchId,
          roomId,
          JSON.stringify(initialized.setupSnapshot) as Json,
          JSON.stringify(initialized.seatOrderSnapshot) as Json,
          JSON.stringify(initialized.generatorMetadata) as Json,
          JSON.stringify(initialized.planet) as Json,
          JSON.stringify(initialized.state) as Json,
          initialized.stateFingerprint,
        ],
      );
      await client.query(
        'delete from match_launches where room_id = $1 and match_id = $2',
        [roomId, matchId],
      );
      return databaseRow<MultiplayerMatch>(inserted.rows[0]);
    });
  }
}
