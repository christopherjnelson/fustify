import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { FustifyAuth } from './auth.ts';
import { readJson, sendJson } from './httpServer.ts';
import { buildWorldThumbnailSvg } from '../src/multiplayer/worldThumbnailSvg.ts';
import { generatePlanet } from '../src/core/generation/generatePlanet.ts';
import { resolveGeneratorVersion } from '../src/core/generation/constants.ts';

const roomSettingsSchema = z
  .object({
    seed: z.string().trim().min(1).max(64),
    territoryCount: z.number().int().min(12).max(48),
    continentCount: z.number().int().min(2).max(6),
    assignmentMode: z.enum(['random', 'player-draft']),
    maxSeats: z.number().int().min(2).max(5),
    name: z.string().trim().min(1).max(60),
  })
  .strict();

const createRoomSchema = roomSettingsSchema.extend({
  assignmentMode: z.literal('random'),
});

const joinRoomSchema = z
  .object({
    joinCode: z
      .string()
      .trim()
      .regex(/^[0-9A-F-]{8,9}$/i),
  })
  .strict();

const seatSchema = z
  .object({ seatIndex: z.number().int().min(0).max(4) })
  .strict();

class RoomApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

function roomId(pathname: string): string | null {
  const match = pathname.match(
    /^\/api\/multiplayer\/rooms\/([0-9a-f-]+)(?:\/|$)/i,
  );
  return match?.[1] ?? null;
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

export class RoomApi {
  constructor(
    private readonly pool: Pool,
    private readonly auth: FustifyAuth,
  ) {}

  private async userId(request: IncomingMessage): Promise<string> {
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new RoomApiError('not_authenticated', 401);
    const profile = await this.pool.query(
      'select 1 from profiles where user_id = $1 and onboarding_completed',
      [session.user.id],
    );
    if (!profile.rows[0]) throw new RoomApiError('account_required', 403);
    return session.user.id;
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (!url.pathname.startsWith('/api/multiplayer/rooms')) return false;
    try {
      if (
        request.method === 'GET' &&
        url.pathname === '/api/multiplayer/rooms/public'
      ) {
        await this.userId(request);
        await this.listPublic(response);
        return true;
      }
      const thumbnail = url.pathname.match(
        /^\/api\/multiplayer\/rooms\/([0-9a-f-]+)\/thumbnail\.svg$/i,
      );
      if (request.method === 'GET' && thumbnail) {
        await this.thumbnail(response, thumbnail[1]!);
        return true;
      }
      const userId = await this.userId(request);
      if (
        request.method === 'POST' &&
        url.pathname === '/api/multiplayer/rooms'
      ) {
        await this.create(
          response,
          userId,
          createRoomSchema.parse(await readJson(request)),
        );
        return true;
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/api/multiplayer/rooms/join'
      ) {
        const input = joinRoomSchema.parse(await readJson(request));
        await this.joinByCode(response, userId, input.joinCode);
        return true;
      }
      const id = roomId(url.pathname);
      if (!id || !z.string().uuid().safeParse(id).success) {
        throw new RoomApiError('invalid_request', 400);
      }
      if (request.method === 'GET' && url.pathname.endsWith(id)) {
        await this.state(
          response,
          userId,
          id,
          url.searchParams.get('includeMatch') !== 'false',
        );
        return true;
      }
      if (request.method === 'POST' && url.pathname.endsWith('/join')) {
        await this.join(response, userId, id, 'public');
        return true;
      }
      if (request.method === 'PATCH' && url.pathname.endsWith('/settings')) {
        await this.updateSettings(
          response,
          userId,
          id,
          roomSettingsSchema.parse(await readJson(request)),
        );
        return true;
      }
      if (request.method === 'POST' && url.pathname.endsWith('/heartbeat')) {
        await this.heartbeat(response, userId, id);
        return true;
      }
      if (request.method === 'POST' && url.pathname.endsWith('/seats/claim')) {
        const input = seatSchema.parse(await readJson(request));
        await this.claimSeat(response, userId, id, input.seatIndex);
        return true;
      }
      if (
        request.method === 'POST' &&
        url.pathname.endsWith('/seats/release')
      ) {
        await this.releaseSeat(response, userId, id);
        return true;
      }
      if (request.method === 'POST' && url.pathname.endsWith('/publish')) {
        await this.publish(response, userId, id);
        return true;
      }
      if (request.method === 'POST' && url.pathname.endsWith('/leave')) {
        await this.leave(response, userId, id);
        return true;
      }
      if (request.method === 'POST' && url.pathname.endsWith('/close')) {
        await this.close(response, userId, id);
        return true;
      }
      sendJson(response, 405, { code: 'method_not_allowed' });
      return true;
    } catch (error) {
      if (error instanceof RoomApiError) {
        sendJson(response, error.status, { code: error.code });
      } else if (error instanceof z.ZodError) {
        sendJson(response, 400, { code: 'invalid_request' });
      } else {
        throw error;
      }
      return true;
    }
  }

  private async listPublic(response: ServerResponse) {
    const result = await this.pool.query(
      `select rooms.id as room_id, rooms.name as room_name,
              host.display_name as host_display_name,
              host.avatar_url as host_avatar_url,
              count(members.user_id)::int as current_players,
              rooms.max_seats as maximum_players,
              case when count(members.user_id) >= rooms.max_seats
                then 'full' else 'waiting' end as room_state,
              rooms.seed as room_seed, rooms.territory_count,
              rooms.continent_count, rooms.assignment_mode,
              rooms.thumbnail_path, rooms.thumbnail_version,
              coalesce(jsonb_agg(
                jsonb_build_object(
                  'displayName', members.display_name,
                  'avatarUrl', member_profiles.avatar_url
                ) order by members.joined_at
              ) filter (where members.user_id is not null), '[]') as players,
              rooms.created_at
       from rooms
       join profiles as host on host.user_id = rooms.host_user_id
       left join room_members as members on members.room_id = rooms.id
       left join profiles as member_profiles on member_profiles.user_id = members.user_id
       where rooms.visibility = 'public' and rooms.status = 'waiting'
       group by rooms.id, host.display_name, host.avatar_url
       order by rooms.created_at desc`,
    );
    sendJson(response, 200, result.rows);
  }

  private async create(
    response: ServerResponse,
    userId: string,
    input: z.infer<typeof createRoomSchema>,
  ) {
    const room = await transaction(this.pool, async (client) => {
      const profile = await client.query<{ display_name: string }>(
        'select display_name from profiles where user_id = $1',
        [userId],
      );
      if (!profile.rows[0]) throw new RoomApiError('profile_unavailable', 409);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const joinCode = randomBytes(4).toString('hex').toUpperCase();
        const result = await client.query(
          `insert into rooms (
               join_code, host_user_id, seed, territory_count, continent_count,
               assignment_mode, max_seats, name
             ) values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict (join_code) do nothing
             returning *`,
          [
            joinCode,
            userId,
            input.seed,
            input.territoryCount,
            input.continentCount,
            input.assignmentMode,
            input.maxSeats,
            input.name,
          ],
        );
        const created = result.rows[0];
        if (created) {
          await client.query(
            `insert into room_members (room_id, user_id, display_name, role)
             values ($1, $2, $3, 'host')`,
            [created.id, userId, profile.rows[0].display_name],
          );
          await client.query(
            `insert into room_seats (room_id, seat_index)
             select $1, generate_series(0, $2 - 1)`,
            [created.id, input.maxSeats],
          );
          return created;
        }
      }
      throw new RoomApiError('room_code_unavailable', 409);
    });
    sendJson(response, 201, room);
  }

  private async joinByCode(
    response: ServerResponse,
    userId: string,
    code: string,
  ) {
    const normalized = code.replaceAll('-', '').toUpperCase();
    const result = await this.pool.query<{ id: string }>(
      'select id from rooms where join_code = $1',
      [normalized],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new RoomApiError('room_not_found', 404);
    await this.join(response, userId, id, 'private');
  }

  private async join(
    response: ServerResponse,
    userId: string,
    id: string,
    visibility: 'private' | 'public',
  ) {
    const room = await transaction(this.pool, async (client) => {
      const target = await client.query(
        'select * from rooms where id = $1 for update',
        [id],
      );
      if (
        !target.rows[0] ||
        target.rows[0].visibility !== visibility ||
        target.rows[0].status !== 'waiting'
      ) {
        throw new RoomApiError('public_room_unavailable', 409);
      }
      const profile = await client.query<{ display_name: string }>(
        'select display_name from profiles where user_id = $1',
        [userId],
      );
      const existing = await client.query(
        'select 1 from room_members where room_id = $1 and user_id = $2',
        [id, userId],
      );
      if (existing.rows[0]) {
        if (visibility === 'private') {
          throw new RoomApiError('already_joined', 409);
        }
        return target.rows[0];
      }
      const count = await client.query<{ count: string }>(
        'select count(*)::text as count from room_members where room_id = $1',
        [id],
      );
      if (Number(count.rows[0]?.count ?? 0) >= target.rows[0].max_seats) {
        throw new RoomApiError('room_full', 409);
      }
      await client.query(
        `insert into room_members (room_id, user_id, display_name)
         values ($1, $2, $3)`,
        [id, userId, profile.rows[0]?.display_name],
      );
      const updated = await client.query(
        'update rooms set revision = revision + 1 where id = $1 returning *',
        [id],
      );
      return updated.rows[0];
    });
    sendJson(response, 200, room);
  }

  private async state(
    response: ServerResponse,
    userId: string,
    id: string,
    includeMatch: boolean,
  ) {
    const membership = await this.pool.query(
      'select 1 from room_members where room_id = $1 and user_id = $2',
      [id, userId],
    );
    if (!membership.rows[0]) throw new RoomApiError('room_access_denied', 403);
    const [room, members, seats, match] = await Promise.all([
      this.pool.query('select * from rooms where id = $1', [id]),
      this.pool.query(
        'select * from room_members where room_id = $1 order by joined_at',
        [id],
      ),
      this.pool.query(
        'select * from room_seats where room_id = $1 order by seat_index',
        [id],
      ),
      includeMatch
        ? this.pool.query(
            'select id, room_id, status, revision from matches where room_id = $1',
            [id],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    sendJson(response, 200, {
      room: room.rows[0],
      members: members.rows,
      seats: seats.rows,
      match: match.rows[0] ?? null,
    });
  }

  private async requireHost(
    userId: string,
    id: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<{
      host_user_id: string;
      status: string;
      visibility: string;
    }>('select host_user_id, status, visibility from rooms where id = $1', [
      id,
    ]);
    const room = result.rows[0];
    if (!room) throw new RoomApiError('room_access_denied', 403);
    if (room.host_user_id !== userId) throw new RoomApiError('host_only', 403);
    return room;
  }

  private async updateSettings(
    response: ServerResponse,
    userId: string,
    id: string,
    input: z.infer<typeof roomSettingsSchema>,
  ) {
    const room = await transaction(this.pool, async (client) => {
      const current = await this.requireHost(userId, id, client);
      if (current.status !== 'waiting')
        throw new RoomApiError('room_not_waiting', 409);
      if (current.visibility === 'public')
        throw new RoomApiError('room_settings_locked', 409);
      const occupied = await client.query<{ maximum: number | null }>(
        'select max(seat_index) as maximum from room_seats where room_id = $1 and occupant_user_id is not null',
        [id],
      );
      if ((occupied.rows[0]?.maximum ?? -1) >= input.maxSeats) {
        throw new RoomApiError('seat_in_use', 409);
      }
      await client.query(
        'delete from room_seats where room_id = $1 and seat_index >= $2',
        [id, input.maxSeats],
      );
      await client.query(
        `insert into room_seats (room_id, seat_index)
         select $1, generate_series(0, $2 - 1)
         on conflict (room_id, seat_index) do nothing`,
        [id, input.maxSeats],
      );
      const updated = await client.query(
        `update rooms set seed = $3, territory_count = $4,
             continent_count = $5, assignment_mode = $6, max_seats = $7,
             name = $8, revision = revision + 1
         where id = $1 and host_user_id = $2 returning *`,
        [
          id,
          userId,
          input.seed,
          input.territoryCount,
          input.continentCount,
          input.assignmentMode,
          input.maxSeats,
          input.name,
        ],
      );
      return updated.rows[0];
    });
    sendJson(response, 200, room);
  }

  private async heartbeat(
    response: ServerResponse,
    userId: string,
    id: string,
  ) {
    const result = await this.pool.query(
      `update room_members set last_active_at = statement_timestamp()
       where room_id = $1 and user_id = $2
         and exists (select 1 from rooms where id = $1 and status = 'waiting')
       returning 1`,
      [id, userId],
    );
    sendJson(response, 200, result.rowCount === 1);
  }

  private async claimSeat(
    response: ServerResponse,
    userId: string,
    id: string,
    seatIndex: number,
  ) {
    await transaction(this.pool, async (client) => {
      const room = await client.query(
        `select status,
                exists(select 1 from room_members where room_id = $1 and user_id = $2) as is_member
         from rooms where id = $1 for update`,
        [id, userId],
      );
      if (!room.rows[0]?.is_member)
        throw new RoomApiError('room_access_denied', 403);
      if (room.rows[0].status !== 'waiting')
        throw new RoomApiError('room_not_waiting', 409);
      const target = await client.query<{ occupant_user_id: string | null }>(
        `select occupant_user_id from room_seats
         where room_id = $1 and seat_index = $2 for update`,
        [id, seatIndex],
      );
      if (!target.rows[0]) throw new RoomApiError('invalid_seat', 400);
      if (target.rows[0].occupant_user_id === userId) return;
      if (target.rows[0].occupant_user_id)
        throw new RoomApiError('seat_conflict', 409);
      const existing = await client.query(
        'select 1 from room_seats where room_id = $1 and occupant_user_id = $2',
        [id, userId],
      );
      if (existing.rows[0]) throw new RoomApiError('already_seated', 409);
      await client.query(
        `update room_seats set occupant_user_id = $3,
             controller_type = 'human', claimed_at = statement_timestamp(), ready = true
         where room_id = $1 and seat_index = $2`,
        [id, seatIndex, userId],
      );
      await client.query(
        'update rooms set revision = revision + 1 where id = $1',
        [id],
      );
    });
    sendJson(response, 200, { ok: true });
  }

  private async releaseSeat(
    response: ServerResponse,
    userId: string,
    id: string,
  ) {
    await transaction(this.pool, async (client) => {
      const room = await client.query(
        `select status,
                exists(select 1 from room_members where room_id = $1 and user_id = $2) as is_member
         from rooms where id = $1 for update`,
        [id, userId],
      );
      if (!room.rows[0]?.is_member)
        throw new RoomApiError('room_access_denied', 403);
      if (room.rows[0].status !== 'waiting')
        throw new RoomApiError('room_not_waiting', 409);
      const released = await client.query(
        `update room_seats set occupant_user_id = null, claimed_at = null, ready = false
         where room_id = $1 and occupant_user_id = $2 returning 1`,
        [id, userId],
      );
      if (released.rows[0]) {
        await client.query(
          'update rooms set revision = revision + 1 where id = $1',
          [id],
        );
      }
    });
    sendJson(response, 200, { ok: true });
  }

  private async publish(response: ServerResponse, userId: string, id: string) {
    const current = await this.requireHost(userId, id);
    if (current.status !== 'waiting')
      throw new RoomApiError('room_not_waiting', 409);
    const result = await this.pool.query(
      `update rooms set visibility = 'public', revision = revision + 1,
         thumbnail_path = id::text || '/world.webp',
         thumbnail_version = thumbnail_version + 1
       where id = $1 returning id as room_id, visibility as room_visibility,
         revision as room_revision`,
      [id],
    );
    sendJson(response, 200, result.rows[0]);
  }

  private async thumbnail(response: ServerResponse, id: string) {
    if (!z.string().uuid().safeParse(id).success) {
      sendJson(response, 400, { code: 'invalid_request' });
      return;
    }
    const result = await this.pool.query(
      `select * from rooms
       where id = $1 and visibility = 'public' and status = 'waiting'`,
      [id],
    );
    const room = result.rows[0];
    if (!room) {
      sendJson(response, 404, { code: 'room_not_found' });
      return;
    }
    const svg = buildWorldThumbnailSvg(
      generatePlanet(room.seed, {
        territoryCount: room.territory_count,
        continentCount: room.continent_count,
        playerCount: room.max_seats,
        generatorVersion: resolveGeneratorVersion(room.generator_version),
      }),
    );
    response.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(svg);
  }

  private async leave(response: ServerResponse, userId: string, id: string) {
    await transaction(this.pool, async (client) => {
      const room = await client.query<{ host_user_id: string }>(
        `select host_user_id from rooms
         where id = $1 and exists(
           select 1 from room_members where room_id = $1 and user_id = $2
         ) for update`,
        [id, userId],
      );
      if (!room.rows[0]) throw new RoomApiError('room_access_denied', 403);
      await client.query(
        `update room_seats set occupant_user_id = null, claimed_at = null, ready = false
         where room_id = $1 and occupant_user_id = $2`,
        [id, userId],
      );
      await client.query(
        `update rooms set status = case when host_user_id = $2 then 'closed' else status end,
             revision = revision + 1 where id = $1`,
        [id, userId],
      );
      await client.query(
        'delete from room_members where room_id = $1 and user_id = $2',
        [id, userId],
      );
    });
    sendJson(response, 200, { ok: true });
  }

  private async close(response: ServerResponse, userId: string, id: string) {
    await this.requireHost(userId, id);
    await this.pool.query(
      `update rooms set status = 'closed', revision = revision + 1
       where id = $1`,
      [id],
    );
    sendJson(response, 200, { ok: true });
  }
}
