import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { FustifyAuth } from './auth.ts';
import { sendJson } from './httpServer.ts';

const MATCH_BOOTSTRAP_COLUMNS = `matches.id, matches.room_id, matches.status,
  matches.revision, matches.setup_snapshot, matches.seat_order_snapshot,
  matches.generator_metadata, matches.planet_snapshot, matches.state_snapshot,
  matches.state_fingerprint, matches.last_command_type,
  matches.winner_player_id, matches.winner_user_id,
  matches.created_at, matches.updated_at`;
const MATCH_VERSION_COLUMNS = `matches.id, matches.status, matches.revision,
  matches.state_fingerprint, matches.updated_at`;
const MATCH_MUTABLE_COLUMNS = `matches.status, matches.revision,
  matches.state_snapshot, matches.state_fingerprint, matches.last_command_type,
  matches.winner_player_id, matches.winner_user_id, matches.updated_at`;

export class MatchApi {
  constructor(
    private readonly pool: Pool,
    private readonly auth: FustifyAuth,
  ) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const matched = url.pathname.match(
      /^\/api\/multiplayer\/matches\/([0-9a-f-]+)\/(bootstrap|version|state)$/i,
    );
    if (!matched) return false;
    if (request.method !== 'GET') {
      sendJson(response, 405, { code: 'method_not_allowed' });
      return true;
    }
    const id = z.string().uuid().safeParse(matched[1]);
    if (!id.success) {
      sendJson(response, 400, { code: 'invalid_request' });
      return true;
    }
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      sendJson(response, 401, { code: 'not_authenticated' });
      return true;
    }
    const columns =
      matched[2] === 'bootstrap'
        ? MATCH_BOOTSTRAP_COLUMNS
        : matched[2] === 'version'
          ? MATCH_VERSION_COLUMNS
          : MATCH_MUTABLE_COLUMNS;
    const result = await this.pool.query(
      `select ${columns}
       from matches
       join room_members on room_members.room_id = matches.room_id
       where matches.id = $1 and room_members.user_id = $2`,
      [id.data, session.user.id],
    );
    if (!result.rows[0]) {
      sendJson(response, 403, { code: 'room_access_denied' });
      return true;
    }
    sendJson(response, 200, result.rows[0]);
    return true;
  }
}
