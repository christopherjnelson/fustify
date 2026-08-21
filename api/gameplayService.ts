import type { Pool, PoolClient } from 'pg';
import { gameReducer } from '../src/core/game/gameReducer.ts';
import type { MatchState } from '../src/core/game/types.ts';
import type { PlanetDefinition } from '../src/core/types/planet.ts';
import {
  isMatchState,
  parseGameAction,
  sha256Fingerprint,
  stableStringify,
  type AuthoritativeCommandResult,
} from '../src/multiplayer/gameProtocol.ts';

export interface GameplayCommandInput {
  matchId: string;
  expectedRevision: number;
  idempotencyKey: string;
  action: unknown;
}

export class GameplayCommandError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly gameError?: unknown,
  ) {
    super(code);
  }
}

type MatchRow = {
  id: string;
  room_id: string;
  status: string;
  revision: number;
  seat_order_snapshot: unknown;
  planet_snapshot: unknown;
  state_snapshot: unknown;
};

type SeatSnapshot = {
  seatIndex: number;
  playerId: string;
  userId: string;
};

function bearerToken(authorization: string | null): string | null {
  return authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,512})$/)?.[1] ?? null;
}

function statusFor(code: string): number {
  if (code === 'not_authenticated') return 401;
  if (
    [
      'account_required',
      'room_access_denied',
      'seat_required',
      'not_your_turn',
    ].includes(code)
  )
    return 403;
  if (code === 'match_not_found') return 404;
  if (['revision_conflict', 'idempotency_conflict'].includes(code)) return 409;
  if (code === 'invalid_action') return 422;
  return 400;
}

function gameplayError(error: unknown): GameplayCommandError {
  if (error instanceof GameplayCommandError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code = [
    'account_required',
    'room_access_denied',
    'match_not_found',
    'match_not_active',
    'match_completed',
    'revision_conflict',
    'idempotency_conflict',
    'seat_required',
    'not_your_turn',
    'invalid_action',
    'invalid_request',
    'invalid_authoritative_state',
  ].find((candidate) => message.includes(candidate));
  const normalized = code ?? 'multiplayer_request_failed';
  return new GameplayCommandError(normalized, statusFor(normalized));
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

function seatSnapshots(value: unknown): SeatSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (seat): seat is SeatSnapshot =>
      typeof seat === 'object' &&
      seat !== null &&
      Number.isSafeInteger((seat as SeatSnapshot).seatIndex) &&
      typeof (seat as SeatSnapshot).playerId === 'string' &&
      typeof (seat as SeatSnapshot).userId === 'string',
  );
}

export class PostgresGameplayService {
  constructor(private readonly pool: Pool) {}

  async command(
    authorization: string | null,
    input: GameplayCommandInput,
  ): Promise<AuthoritativeCommandResult> {
    const token = bearerToken(authorization);
    if (!token) throw new GameplayCommandError('not_authenticated', 401);
    const actor = await this.pool.query<{ user_id: string }>(
      `select sessions.user_id
       from auth_sessions as sessions
       join profiles on profiles.user_id = sessions.user_id
       where sessions.token = $1
         and sessions.expires_at > statement_timestamp()
         and profiles.onboarding_completed`,
      [token],
    );
    const actorUserId = actor.rows[0]?.user_id;
    if (!actorUserId) throw new GameplayCommandError('account_required', 403);

    try {
      const action = parseGameAction(input.action);
      const commandHash = await sha256Fingerprint({
        expectedRevision: input.expectedRevision,
        action,
      });
      return await transaction(this.pool, async (client) => {
        const matchResult = await client.query<MatchRow>(
          'select * from matches where id = $1 for update',
          [input.matchId],
        );
        const match = matchResult.rows[0];
        if (!match) throw new Error('match_not_found');

        const actorSeat = seatSnapshots(match.seat_order_snapshot).find(
          (seat) => seat.userId === actorUserId,
        );
        if (!actorSeat) throw new Error('seat_required');
        const currentSeat = await client.query<{ seat_index: number }>(
          `select seats.seat_index
           from room_seats as seats
           join room_members as members
             on members.room_id = seats.room_id and members.user_id = seats.occupant_user_id
           where seats.room_id = $1 and seats.occupant_user_id = $2
             and seats.controller_type = 'human'`,
          [match.room_id, actorUserId],
        );
        if (currentSeat.rows[0]?.seat_index !== actorSeat.seatIndex) {
          throw new Error('seat_required');
        }

        const accepted = await client.query<{
          actor_user_id: string;
          command_hash: string;
          command_payload: unknown;
          resulting_revision: number;
          resulting_state_fingerprint: string;
        }>(
          `select actor_user_id, command_hash, command_payload,
                  resulting_revision, resulting_state_fingerprint
           from match_commands
           where match_id = $1 and client_idempotency_key = $2`,
          [input.matchId, input.idempotencyKey],
        );
        const prior = accepted.rows[0];
        if (prior) {
          if (
            prior.actor_user_id !== actorUserId ||
            prior.command_hash !== commandHash ||
            stableStringify(prior.command_payload) !== stableStringify(action)
          ) {
            throw new Error('idempotency_conflict');
          }
          return {
            acceptedRevision: Number(prior.resulting_revision),
            stateFingerprint: prior.resulting_state_fingerprint,
            duplicate: true,
          };
        }

        if (match.status === 'completed') throw new Error('match_completed');
        if (match.status !== 'active') throw new Error('match_not_active');
        if (Number(match.revision) !== input.expectedRevision) {
          throw new Error('revision_conflict');
        }
        if (!isMatchState(match.state_snapshot) || !match.planet_snapshot) {
          throw new Error('invalid_authoritative_state');
        }
        if (actorSeat.playerId !== match.state_snapshot.activePlayerId) {
          throw new Error('not_your_turn');
        }
        const transition = gameReducer(
          match.planet_snapshot as PlanetDefinition,
          match.state_snapshot as MatchState,
          action,
        );
        if (transition.error) {
          throw new GameplayCommandError(
            'invalid_action',
            422,
            transition.error,
          );
        }
        const stateFingerprint = await sha256Fingerprint(transition.state);
        const winnerSeat = transition.state.winnerId
          ? seatSnapshots(match.seat_order_snapshot).find(
              (seat) => seat.playerId === transition.state.winnerId,
            )
          : undefined;
        if (
          Boolean(transition.state.winnerId) !== Boolean(winnerSeat?.userId)
        ) {
          throw new Error('invalid_authoritative_state');
        }
        const resultingRevision = input.expectedRevision + 1;
        await client.query(
          `insert into match_commands (
             match_id, sequence, actor_user_id, actor_seat_index, command_type,
             command_payload, command_hash, client_idempotency_key,
             previous_revision, resulting_revision, resulting_state_fingerprint
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2, $10)`,
          [
            input.matchId,
            resultingRevision,
            actorUserId,
            actorSeat.seatIndex,
            action.type,
            action,
            commandHash,
            input.idempotencyKey,
            input.expectedRevision,
            stateFingerprint,
          ],
        );
        await client.query(
          `update matches set state_snapshot = $2, state_fingerprint = $3,
             revision = $4, last_command_type = $5,
             status = case when $6::text is null then 'active' else 'completed' end,
             winner_player_id = $6, winner_user_id = $7
           where id = $1`,
          [
            input.matchId,
            transition.state,
            stateFingerprint,
            resultingRevision,
            action.type,
            transition.state.winnerId,
            winnerSeat?.userId ?? null,
          ],
        );
        return {
          acceptedRevision: resultingRevision,
          stateFingerprint,
          duplicate: false,
        };
      });
    } catch (error) {
      throw gameplayError(error);
    }
  }
}
