import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { FustifyAuth } from './auth.ts';
import { readJson, sendJson } from './httpServer.ts';

const reactionSchema = z
  .object({
    eventId: z.string().regex(/^event-[1-9][0-9]*$/),
    reaction: z.enum(['fire', 'laugh', 'heart', 'angry']).nullable(),
  })
  .strict();

export class ReactionApi {
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
      /^\/api\/multiplayer\/matches\/([0-9a-f-]+)\/reactions$/i,
    );
    if (!matched) return false;
    const matchId = z.string().uuid().safeParse(matched[1]);
    if (!matchId.success) {
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
    const membership = await this.pool.query(
      `select 1 from matches
       join room_members on room_members.room_id = matches.room_id
       where matches.id = $1 and room_members.user_id = $2`,
      [matchId.data, session.user.id],
    );
    if (!membership.rows[0]) {
      sendJson(response, 403, { code: 'room_access_denied' });
      return true;
    }
    if (request.method === 'GET') {
      const result = await this.pool.query(
        `select event_id, user_id, reaction, updated_at
         from match_event_reactions where match_id = $1
         order by event_id, user_id`,
        [matchId.data],
      );
      sendJson(response, 200, result.rows);
      return true;
    }
    if (request.method === 'PUT') {
      const parsed = reactionSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        sendJson(response, 400, { code: 'invalid_event_reaction' });
        return true;
      }
      const seat = await this.pool.query(
        `select 1 from matches
         join room_members on room_members.room_id = matches.room_id
           and room_members.user_id = $2
         join room_seats on room_seats.room_id = matches.room_id
           and room_seats.occupant_user_id = $2
           and room_seats.controller_type = 'human'
         where matches.id = $1
           and matches.seat_order_snapshot @> jsonb_build_array(
             jsonb_build_object('userId', $2::text, 'seatIndex', room_seats.seat_index)
           )
           and exists (
             select 1 from jsonb_array_elements(matches.state_snapshot -> 'events') event
             where event ->> 'id' = $3
           )`,
        [matchId.data, session.user.id, parsed.data.eventId],
      );
      if (!seat.rows[0]) {
        sendJson(response, 403, { code: 'seat_required' });
        return true;
      }
      if (parsed.data.reaction === null) {
        await this.pool.query(
          `delete from match_event_reactions
           where match_id = $1 and event_id = $2 and user_id = $3`,
          [matchId.data, parsed.data.eventId, session.user.id],
        );
      } else {
        await this.pool.query(
          `insert into match_event_reactions (match_id, event_id, user_id, reaction)
           values ($1, $2, $3, $4)
           on conflict (match_id, event_id, user_id) do update
           set reaction = excluded.reaction,
               updated_at = statement_timestamp()
           where match_event_reactions.reaction is distinct from excluded.reaction`,
          [
            matchId.data,
            parsed.data.eventId,
            session.user.id,
            parsed.data.reaction,
          ],
        );
      }
      sendJson(response, 200, { ok: true });
      return true;
    }
    sendJson(response, 405, { code: 'method_not_allowed' });
    return true;
  }
}
