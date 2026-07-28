import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { z } from 'zod';

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(500);
const idempotencyKey = z.string().uuid();

export const adminListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(25),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    search: z.string().trim().max(100).default(''),
    status: z
      .enum([
        'all',
        'active',
        'banned',
        'anonymous',
        'admin',
        'revoked',
        'deleted',
        'waiting',
        'closed',
      ])
      .default('all'),
    provider: z.string().trim().max(50).default(''),
    confirmation: z.enum(['all', 'confirmed', 'unconfirmed']).default('all'),
  })
  .strict();

export const adminLogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    service: z
      .enum([
        'all',
        'auth',
        'api',
        'postgres',
        'edge-function',
        'realtime',
        'storage',
      ])
      .default('all'),
    window: z.enum(['15m', '1h', '3h', '24h']).default('1h'),
    cursor: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const adminMutationSchema = z
  .object({
    idempotencyKey,
    reason,
  })
  .strict();

export const accountMutationSchema = adminMutationSchema.extend({
  action: z.enum(['ban', 'unban', 'revoke', 'soft-delete']),
  duration: z.enum(['24h', '7d', '30d', 'indefinite']).optional(),
  confirmation: z.string().max(200).optional(),
});

export const roomMutationSchema = adminMutationSchema.extend({
  action: z.enum(['close', 'force-close', 'purge']),
  confirmation: z.string().max(200).optional(),
});

export const maintenanceMutationSchema = z.discriminatedUnion('action', [
  adminMutationSchema.extend({
    action: z.literal('retry-announcement'),
    announcementId: uuid,
    confirmation: z.literal('RETRY'),
  }),
  adminMutationSchema.extend({
    action: z.literal('purge-orphan-thumbnails'),
    confirmation: z.literal('DELETE ORPHANS'),
  }),
]);

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminLogQuery = z.infer<typeof adminLogQuerySchema>;
export type AccountMutation = z.infer<typeof accountMutationSchema>;
export type RoomMutation = z.infer<typeof roomMutationSchema>;
export type MaintenanceMutation = z.infer<typeof maintenanceMutationSchema>;

export interface AdminActor {
  userId: string;
  requestId?: string;
}

export interface AdminConsole {
  authorize(authorization: string | null): Promise<AdminActor>;
  overview(): Promise<unknown>;
  accounts(query: AdminListQuery): Promise<unknown>;
  revealAccount(actor: AdminActor, userId: string): Promise<unknown>;
  mutateAccount(
    actor: AdminActor,
    userId: string,
    mutation: AccountMutation,
  ): Promise<unknown>;
  rooms(query: AdminListQuery): Promise<unknown>;
  mutateRoom(
    actor: AdminActor,
    roomId: string,
    mutation: RoomMutation,
  ): Promise<unknown>;
  logs(query: AdminLogQuery): Promise<unknown>;
  maintenance(): Promise<unknown>;
  mutateMaintenance(
    actor: AdminActor,
    mutation: MaintenanceMutation,
  ): Promise<unknown>;
  audit(query: AdminListQuery): Promise<unknown>;
  metrics(): Promise<unknown>;
}

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

function bearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) throw new AdminApiError('not_authenticated', 401);
  return match[1]!;
}

function maskEmail(email: string | undefined) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return '••••';
  return `${local.slice(0, 1)}•••@${domain}`;
}

function maskIdentifier(value: string) {
  return uuid.safeParse(value).success
    ? `${value.slice(0, 8)}…${value.slice(-4)}`
    : redactAdminLogMessage(value);
}

function accountReferenceKey(secret: string) {
  return createHash('sha256')
    .update('fustify-admin-account-reference\0')
    .update(secret)
    .digest();
}

export function createAdminAccountReference(userId: string, secret: string) {
  const parsed = uuid.parse(userId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', accountReferenceKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(parsed, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}

export function parseAdminAccountReference(reference: string, secret: string) {
  try {
    const packed = Buffer.from(
      z.string().min(40).max(200).parse(reference),
      'base64url',
    );
    const decipher = createDecipheriv(
      'aes-256-gcm',
      accountReferenceKey(secret),
      packed.subarray(0, 12),
    );
    decipher.setAuthTag(packed.subarray(12, 28));
    return uuid.parse(
      Buffer.concat([
        decipher.update(packed.subarray(28)),
        decipher.final(),
      ]).toString('utf8'),
    );
  } catch {
    throw new AdminApiError('invalid_account_reference', 400);
  }
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 =
  /(?<![0-9a-f:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?:(?::[0-9a-f]{1,4}){1,6})|:(?:(?::[0-9a-f]{1,4}){1,7}|:))(?![0-9a-f:])/gi;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const QUERY = /\?[^\s]*/g;
const CREDENTIAL =
  /\b(password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["']?[^"',\s}]+/gi;

export function redactAdminLogMessage(value: string) {
  return value
    .replace(BEARER, 'Bearer [redacted]')
    .replace(QUERY, '?[redacted]')
    .replace(CREDENTIAL, '$1=[redacted]')
    .replace(EMAIL, '[email]')
    .replace(IPV4, '[ip]')
    .replace(IPV6, '[ip]')
    .replace(UUID, '[id]')
    .slice(0, 500);
}

function safeUserStatus(
  user: User,
  moderation: { state: string; banned_until: string | null } | undefined,
  admin: boolean,
) {
  if (user.deleted_at || moderation?.state === 'deleted') return 'deleted';
  if (moderation?.state === 'revoked') return 'revoked';
  if (
    user.banned_until ||
    (moderation?.state === 'banned' &&
      (!moderation.banned_until ||
        Date.parse(moderation.banned_until) > Date.now()))
  )
    return 'banned';
  if (admin) return 'admin';
  if (user.is_anonymous) return 'anonymous';
  return 'active';
}

function durationToBan(value: AccountMutation['duration']) {
  switch (value) {
    case '24h':
      return '24h';
    case '7d':
      return '168h';
    case '30d':
      return '720h';
    default:
      return '876000h';
  }
}

function durationToTimestamp(value: AccountMutation['duration']) {
  if (!value || value === 'indefinite') return null;
  const hours = value === '24h' ? 24 : value === '7d' ? 168 : 720;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export interface AdminConfiguration {
  url: string;
  publishableKey: string;
  secretKey: string;
  projectRef: string;
  managementAccessToken?: string;
  expectedMigration?: string;
  mutationsEnabled: boolean;
}

export class SupabaseAdminConsole implements AdminConsole {
  private readonly auth: SupabaseClient;
  private readonly admin: SupabaseClient;

  constructor(
    private readonly configuration: AdminConfiguration,
    clients?: { auth: SupabaseClient; admin: SupabaseClient },
  ) {
    const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    } as const;
    this.auth =
      clients?.auth ??
      createClient(configuration.url, configuration.publishableKey, options);
    this.admin =
      clients?.admin ??
      createClient(configuration.url, configuration.secretKey, options);
  }

  async authorize(authorization: string | null): Promise<AdminActor> {
    const { data, error } = await this.auth.auth.getUser(
      bearerToken(authorization),
    );
    if (error || !data.user || data.user.is_anonymous) {
      throw new AdminApiError('not_authenticated', 401);
    }
    const [{ data: role }, { data: moderation }] = await Promise.all([
      this.admin
        .from('user_roles')
        .select('user_id')
        .eq('user_id', data.user.id)
        .eq('role', 'admin')
        .maybeSingle(),
      this.admin
        .from('account_moderation')
        .select('state,banned_until')
        .eq('user_id', data.user.id)
        .maybeSingle(),
    ]);
    if (!role) throw new AdminApiError('admin_access_denied', 403);
    if (
      moderation?.state === 'deleted' ||
      moderation?.state === 'revoked' ||
      (moderation?.state === 'banned' &&
        (!moderation.banned_until ||
          Date.parse(moderation.banned_until) > Date.now()))
    ) {
      throw new AdminApiError('account_blocked', 403);
    }
    return { userId: data.user.id };
  }

  async overview() {
    const [{ data: health, error: healthError }, { data: overview, error }] =
      await Promise.all([
        this.admin.rpc('admin_server_health'),
        this.admin.rpc('admin_dashboard_overview'),
      ]);
    if (healthError || error)
      throw new AdminApiError('admin_data_unavailable', 503);
    return {
      health: this.healthSnapshot(health),
      overview: overview?.[0] ?? null,
    };
  }

  async accounts(query: AdminListQuery) {
    const { data, error } = await this.admin.auth.admin.listUsers({
      page: query.page,
      perPage: query.limit,
    });
    if (error) throw new AdminApiError('accounts_unavailable', 503);
    const userIds = data.users.map((user) => user.id);
    const [
      profilesResult,
      moderationResult,
      rolesResult,
      hostedResult,
      memberResult,
    ] =
      userIds.length === 0
        ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]
        : await Promise.all([
            this.admin
              .from('profiles')
              .select('user_id,display_name,avatar_url')
              .in('user_id', userIds),
            this.admin
              .from('account_moderation')
              .select('user_id,state,banned_until,revoked_after')
              .in('user_id', userIds),
            this.admin
              .from('user_roles')
              .select('user_id,role')
              .in('user_id', userIds),
            this.admin
              .from('rooms')
              .select('host_user_id')
              .in('host_user_id', userIds),
            this.admin
              .from('room_members')
              .select('user_id')
              .in('user_id', userIds),
          ]);
    const { data: commandRows } =
      userIds.length === 0
        ? { data: [] }
        : await this.admin
            .from('match_commands')
            .select('actor_user_id,match_id')
            .in('actor_user_id', userIds);
    const profiles = new Map(
      (profilesResult.data ?? []).map((row) => [row.user_id, row]),
    );
    const moderation = new Map(
      (moderationResult.data ?? []).map((row) => [row.user_id, row]),
    );
    const admins = new Set((rolesResult.data ?? []).map((row) => row.user_id));
    const hosted = new Map<string, number>();
    const memberships = new Map<string, number>();
    const commands = new Map<string, number>();
    const matches = new Map<string, Set<string>>();
    for (const row of hostedResult.data ?? [])
      hosted.set(row.host_user_id, (hosted.get(row.host_user_id) ?? 0) + 1);
    for (const row of memberResult.data ?? [])
      memberships.set(row.user_id, (memberships.get(row.user_id) ?? 0) + 1);
    for (const row of commandRows ?? []) {
      commands.set(
        row.actor_user_id,
        (commands.get(row.actor_user_id) ?? 0) + 1,
      );
      const userMatches = matches.get(row.actor_user_id) ?? new Set<string>();
      userMatches.add(row.match_id);
      matches.set(row.actor_user_id, userMatches);
    }

    const normalized = data.users.map((user) => {
      const profile = profiles.get(user.id);
      const state = safeUserStatus(
        user,
        moderation.get(user.id),
        admins.has(user.id),
      );
      return {
        accountRef: createAdminAccountReference(
          user.id,
          this.configuration.secretKey,
        ),
        maskedUserId: maskIdentifier(user.id),
        maskedEmail: maskEmail(user.email),
        displayName: profile?.display_name ?? 'Unknown player',
        avatarUrl: profile?.avatar_url ?? null,
        providers:
          user.app_metadata.providers ??
          [user.app_metadata.provider].filter(Boolean),
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        confirmedAt: user.confirmed_at ?? null,
        status: state,
        hostedRooms: hosted.get(user.id) ?? 0,
        roomMemberships: memberships.get(user.id) ?? 0,
        matchesPlayed: matches.get(user.id)?.size ?? 0,
        gameplayCommands: commands.get(user.id) ?? 0,
      };
    });
    const search = query.search.toLocaleLowerCase();
    const filtered = normalized.filter(
      (account) =>
        (query.status === 'all' || account.status === query.status) &&
        (!query.provider || account.providers.includes(query.provider)) &&
        (query.confirmation === 'all' ||
          (query.confirmation === 'confirmed'
            ? account.confirmedAt !== null
            : account.confirmedAt === null)) &&
        (!search ||
          account.displayName.toLocaleLowerCase().includes(search) ||
          account.maskedEmail?.toLocaleLowerCase().includes(search) ||
          data.users
            .find((user) => maskIdentifier(user.id) === account.maskedUserId)
            ?.email?.toLocaleLowerCase()
            .includes(search)),
    );
    return {
      accounts: filtered,
      page: query.page,
      limit: query.limit,
      hasMore: data.users.length === query.limit,
    };
  }

  async revealAccount(actor: AdminActor, userId: string) {
    const target = parseAdminAccountReference(
      userId,
      this.configuration.secretKey,
    );
    const { data, error } = await this.admin.auth.admin.getUserById(target);
    if (error || !data.user) throw new AdminApiError('account_not_found', 404);
    await this.recordAudit(actor, {
      action: 'account_reveal',
      targetType: 'account',
      targetId: target,
      reason: 'Explicit account identifier reveal',
      idempotencyKey: randomUUID(),
      outcome: 'succeeded',
    });
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
      identities: (data.user.identities ?? []).map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        createdAt: identity.created_at,
        lastSignInAt: identity.last_sign_in_at,
      })),
      appMetadata: {
        provider: data.user.app_metadata.provider ?? null,
        providers: data.user.app_metadata.providers ?? [],
      },
    };
  }

  async mutateAccount(
    actor: AdminActor,
    userId: string,
    mutation: AccountMutation,
  ) {
    this.requireMutations();
    const target = parseAdminAccountReference(
      userId,
      this.configuration.secretKey,
    );
    if (target === actor.userId)
      throw new AdminApiError('self_action_denied', 409);
    const { data: role } = await this.admin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', target)
      .eq('role', 'admin')
      .maybeSingle();
    if (role) throw new AdminApiError('admin_target_denied', 409);
    const { data: targetUser, error: targetError } =
      await this.admin.auth.admin.getUserById(target);
    if (targetError || !targetUser.user)
      throw new AdminApiError('account_not_found', 404);
    if (
      mutation.action === 'soft-delete' &&
      mutation.confirmation !== (targetUser.user.email ?? target)
    ) {
      throw new AdminApiError('confirmation_mismatch', 400);
    }
    await this.assertFreshAction(actor, mutation.idempotencyKey);

    try {
      if (mutation.action === 'unban') {
        const { error } = await this.admin.auth.admin.updateUserById(target, {
          ban_duration: 'none',
        });
        if (error) throw error;
        await this.admin.from('account_moderation').upsert({
          user_id: target,
          state: 'active',
          banned_until: null,
          revoked_after: new Date().toISOString(),
          reason: mutation.reason,
          updated_by: actor.userId,
        });
      } else {
        const deleted = mutation.action === 'soft-delete';
        const revoked = mutation.action === 'revoke';
        const { error: moderationError } = await this.admin
          .from('account_moderation')
          .upsert({
            user_id: target,
            state: deleted ? 'deleted' : revoked ? 'revoked' : 'banned',
            banned_until:
              mutation.action === 'ban'
                ? durationToTimestamp(mutation.duration)
                : null,
            revoked_after: new Date().toISOString(),
            reason: mutation.reason,
            updated_by: actor.userId,
          });
        if (moderationError) throw moderationError;
        if (deleted) {
          const { error } = await this.admin.auth.admin.deleteUser(
            target,
            true,
          );
          if (error) throw error;
        } else if (!revoked) {
          const { error } = await this.admin.auth.admin.updateUserById(target, {
            ban_duration:
              mutation.action === 'ban'
                ? durationToBan(mutation.duration)
                : '876000h',
          });
          if (error) throw error;
        }
      }
      await this.recordAudit(actor, {
        action: `account_${mutation.action.replace('-', '_')}`,
        targetType: 'account',
        targetId: target,
        reason: mutation.reason,
        idempotencyKey: mutation.idempotencyKey,
        outcome: 'succeeded',
        afterSummary: {
          action: mutation.action,
          duration: mutation.duration ?? null,
        },
      });
      return { ok: true };
    } catch {
      await this.recordAudit(actor, {
        action: `account_${mutation.action.replace('-', '_')}`,
        targetType: 'account',
        targetId: target,
        reason: mutation.reason,
        idempotencyKey: mutation.idempotencyKey,
        outcome: 'failed',
        errorCode: 'account_action_failed',
      });
      throw new AdminApiError('account_action_failed', 502);
    }
  }

  async rooms(query: AdminListQuery) {
    const from = (query.page - 1) * query.limit;
    let request = this.admin
      .from('rooms')
      .select(
        'id,name,visibility,status,host_user_id,max_seats,revision,created_at,updated_at,thumbnail_path,generator_version',
      )
      .order('updated_at', { ascending: false })
      .range(from, from + query.limit - 1);
    if (query.search) request = request.ilike('name', `%${query.search}%`);
    if (
      query.status !== 'all' &&
      ['waiting', 'active', 'closed'].includes(query.status)
    )
      request = request.eq('status', query.status);
    const { data: rooms, error } = await request;
    if (error) throw new AdminApiError('rooms_unavailable', 503);
    const ids = (rooms ?? []).map((room) => room.id);
    const hostIds = [
      ...new Set((rooms ?? []).map((room) => room.host_user_id)),
    ];
    const [members, seats, matches, launches, announcements, profiles] =
      ids.length === 0
        ? [
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
          ]
        : await Promise.all([
            this.admin
              .from('room_members')
              .select('room_id,last_active_at')
              .in('room_id', ids),
            this.admin
              .from('room_seats')
              .select('room_id,occupant_user_id')
              .in('room_id', ids),
            this.admin
              .from('matches')
              .select('id,room_id,status,revision,updated_at')
              .in('room_id', ids),
            this.admin
              .schema('multiplayer_private')
              .from('match_launches')
              .select('room_id,match_id,started_at')
              .in('room_id', ids),
            this.admin
              .from('discord_room_announcements')
              .select('room_id,status,attempt_count,last_error,updated_at')
              .in('room_id', ids),
            this.admin
              .from('profiles')
              .select('user_id,display_name')
              .in('user_id', hostIds),
          ]);
    const byRoom = <T extends { room_id: string }>(values: T[] | null) => {
      const map = new Map<string, T[]>();
      for (const value of values ?? [])
        map.set(value.room_id, [...(map.get(value.room_id) ?? []), value]);
      return map;
    };
    const memberMap = byRoom(
      (members.data ?? []) as Array<{
        room_id: string;
        last_active_at: string;
      }>,
    );
    const seatMap = byRoom(
      (seats.data ?? []) as Array<{
        room_id: string;
        occupant_user_id: string | null;
      }>,
    );
    const matchMap = byRoom(
      (matches.data ?? []) as Array<{
        id: string;
        room_id: string;
        status: string;
        revision: number;
        updated_at: string;
      }>,
    );
    const launchMap = byRoom(
      (launches.data ?? []) as Array<{
        room_id: string;
        match_id: string;
        started_at: string;
      }>,
    );
    const announcementMap = byRoom(
      (announcements.data ?? []) as Array<{
        room_id: string;
        status: string;
        attempt_count: number;
        last_error: string | null;
        updated_at: string;
      }>,
    );
    const profileMap = new Map(
      (profiles.data ?? []).map((profile) => [
        profile.user_id,
        profile.display_name,
      ]),
    );
    return {
      rooms: (rooms ?? []).map((room) => ({
        ...room,
        hostDisplayName: profileMap.get(room.host_user_id) ?? 'Unknown player',
        members: memberMap.get(room.id)?.length ?? 0,
        claimedSeats:
          seatMap.get(room.id)?.filter((seat) => seat.occupant_user_id)
            .length ?? 0,
        lastActivityAt:
          memberMap
            .get(room.id)
            ?.map((member) => member.last_active_at)
            .sort()
            .at(-1) ?? null,
        match: matchMap.get(room.id)?.[0] ?? null,
        launch: launchMap.get(room.id)?.[0] ?? null,
        announcement: announcementMap.get(room.id)?.[0] ?? null,
        purgeable:
          room.status === 'closed' &&
          (memberMap.get(room.id)?.length ?? 0) === 0 &&
          !matchMap.get(room.id)?.length,
      })),
      page: query.page,
      limit: query.limit,
      hasMore: (rooms ?? []).length === query.limit,
    };
  }

  async mutateRoom(actor: AdminActor, roomId: string, mutation: RoomMutation) {
    this.requireMutations();
    const target = uuid.parse(roomId);
    const { data: room } = await this.admin
      .from('rooms')
      .select('id,name,status,thumbnail_path')
      .eq('id', target)
      .maybeSingle();
    if (!room) throw new AdminApiError('room_not_found', 404);
    await this.assertFreshAction(actor, mutation.idempotencyKey);
    if (mutation.action !== 'close' && mutation.confirmation !== room.name) {
      throw new AdminApiError('confirmation_mismatch', 400);
    }
    try {
      let result: unknown;
      if (mutation.action === 'purge') {
        if (room.thumbnail_path) {
          const { error: storageError } = await this.admin.storage
            .from('room-thumbnails')
            .remove([room.thumbnail_path]);
          if (storageError) throw storageError;
        }
        const { data, error } = await this.admin.rpc('admin_purge_room', {
          p_room_id: target,
        });
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await this.admin.rpc('admin_close_room', {
          p_room_id: target,
          p_force: mutation.action === 'force-close',
        });
        if (error) throw error;
        result = data;
      }
      await this.recordAudit(actor, {
        action: `room_${mutation.action.replace('-', '_')}`,
        targetType: 'room',
        targetId: target,
        reason: mutation.reason,
        idempotencyKey: mutation.idempotencyKey,
        outcome: 'succeeded',
        beforeSummary: { status: room.status },
        afterSummary: asRecord(result),
      });
      return result;
    } catch {
      await this.recordAudit(actor, {
        action: `room_${mutation.action.replace('-', '_')}`,
        targetType: 'room',
        targetId: target,
        reason: mutation.reason,
        idempotencyKey: mutation.idempotencyKey,
        outcome: 'failed',
        errorCode: 'room_action_failed',
      });
      throw new AdminApiError('room_action_failed', 409);
    }
  }

  async logs(query: AdminLogQuery) {
    if (!this.configuration.managementAccessToken) {
      return { configured: false, entries: [] };
    }
    const seconds = { '15m': 900, '1h': 3600, '3h': 10_800, '24h': 86_400 }[
      query.window
    ];
    const sources: Record<Exclude<AdminLogQuery['service'], 'all'>, string> = {
      auth: "'auth_logs'",
      api: "'edge_logs'",
      postgres: "'postgres_logs'",
      'edge-function': "'function_logs', 'function_edge_logs'",
      realtime: "'realtime_logs'",
      storage: "'storage_logs'",
    };
    const source =
      query.service === 'all'
        ? ''
        : ` AND source IN (${sources[query.service]})`;
    const cursor = query.cursor
      ? ` AND timestamp < parseDateTime64BestEffort('${query.cursor}')`
      : '';
    const sql = `SELECT timestamp, source, event_message, log_attributes FROM logs WHERE timestamp >= now() - INTERVAL ${seconds} SECOND${source}${cursor} AND (lower(event_message) LIKE '%error%' OR lower(event_message) LIKE '%warning%' OR log_attributes['status_code'] LIKE '5%') ORDER BY timestamp DESC LIMIT ${query.limit}`;
    const endpoint = new URL(
      `https://api.supabase.com/v1/projects/${this.configuration.projectRef}/analytics/endpoints/logs`,
    );
    endpoint.searchParams.set('sql', sql);
    endpoint.searchParams.set(
      'iso_timestamp_start',
      new Date(Date.now() - seconds * 1000).toISOString(),
    );
    endpoint.searchParams.set('iso_timestamp_end', new Date().toISOString());
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${this.configuration.managementAccessToken}`,
      },
    });
    if (!response.ok) throw new AdminApiError('logs_unavailable', 502);
    const payload = asRecord(await response.json());
    const rows = Array.isArray(payload.result) ? payload.result : [];
    const entries = rows.map((value) => {
      const row = asRecord(value);
      const attributes = asRecord(row.log_attributes);
      return {
        timestamp: row.timestamp ?? null,
        service: row.source ?? query.service,
        severity: attributes.level ?? attributes.error_severity ?? 'warning',
        status: attributes.status_code ?? null,
        path:
          attributes.path === undefined
            ? null
            : redactAdminLogMessage(String(attributes.path)),
        requestId: attributes.request_id ? '[id]' : null,
        message: redactAdminLogMessage(String(row.event_message ?? '')),
      };
    });
    return {
      configured: true,
      entries,
      nextCursor:
        entries.length === query.limit &&
        typeof entries.at(-1)?.timestamp === 'string'
          ? entries.at(-1)!.timestamp
          : null,
      explorerUrl: `https://supabase.com/dashboard/project/${this.configuration.projectRef}/logs/explorer`,
    };
  }

  async metrics() {
    const endpoint = `https://${this.configuration.projectRef}.supabase.co/customer/v1/privileged/metrics`;
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `fustify:${this.configuration.secretKey}`,
        ).toString('base64')}`,
      },
    });
    if (!response.ok) throw new AdminApiError('metrics_unavailable', 502);
    const selected = new Map<string, number>();
    for (const line of (await response.text()).split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const match = line.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+(-?(?:\d+(?:\.\d+)?|Inf|NaN))/,
      );
      if (!match?.[1] || !match[2]) continue;
      if (!/(cpu|memory|disk|io|wal|connection|latency|error)/i.test(match[1]))
        continue;
      const value = Number(match[2]);
      if (!Number.isFinite(value)) continue;
      selected.set(match[1], (selected.get(match[1]) ?? 0) + value);
      if (selected.size >= 100) break;
    }
    return {
      generatedAt: new Date().toISOString(),
      aggregates: Object.fromEntries(selected),
    };
  }

  async maintenance() {
    const [
      { data: health, error },
      { data: announcements },
      { data: cleanupCandidates },
      advisors,
    ] = await Promise.all([
      this.admin.rpc('admin_server_health'),
      this.admin
        .from('discord_room_announcements')
        .select('id,room_id,status,attempt_count,last_error,updated_at')
        .in('status', ['failed', 'processing', 'pending'])
        .order('updated_at', { ascending: false })
        .limit(50),
      this.admin.rpc('admin_cleanup_candidates'),
      this.advisors(),
    ]);
    if (error) throw new AdminApiError('maintenance_unavailable', 503);
    return {
      health: this.healthSnapshot(health),
      announcements: announcements ?? [],
      cleanupCandidates: cleanupCandidates ?? [],
      advisors,
    };
  }

  async mutateMaintenance(actor: AdminActor, mutation: MaintenanceMutation) {
    this.requireMutations();
    await this.assertFreshAction(actor, mutation.idempotencyKey);
    const retry = mutation.action === 'retry-announcement';
    const action = retry ? 'announcement_retry' : 'orphan_thumbnail_cleanup';
    const targetType = retry ? 'discord_announcement' : 'storage_bucket';
    const targetId = retry ? mutation.announcementId : 'room-thumbnails';
    try {
      let result: Record<string, unknown>;
      if (mutation.action === 'retry-announcement') {
        const { data, error } = await this.admin.rpc(
          'admin_retry_discord_announcement',
          { p_announcement_id: mutation.announcementId },
        );
        if (error || data !== true) throw error ?? new Error('retry_failed');
        result = { retried: true };
      } else {
        result = await this.cleanupOrphanThumbnails();
      }
      await this.recordAudit(actor, {
        action,
        targetType,
        targetId,
        reason: mutation.reason,
        idempotencyKey: mutation.idempotencyKey,
        outcome: 'succeeded',
        afterSummary: result,
      });
      return result;
    } catch {
      await this.recordAudit(actor, {
        action,
        targetType,
        targetId,
        reason: mutation.reason,
        idempotencyKey: mutation.idempotencyKey,
        outcome: 'failed',
        errorCode: retry
          ? 'announcement_retry_failed'
          : 'thumbnail_cleanup_failed',
      });
      throw new AdminApiError(
        retry ? 'announcement_retry_failed' : 'thumbnail_cleanup_failed',
        409,
      );
    }
  }

  async audit(query: AdminListQuery) {
    const from = (query.page - 1) * query.limit;
    const { data, error } = await this.admin
      .from('admin_action_audit')
      .select(
        'id,actor_user_id,action,target_type,target_id,reason,request_id,outcome,error_code,created_at',
      )
      .order('created_at', { ascending: false })
      .range(from, from + query.limit - 1);
    if (error) throw new AdminApiError('audit_unavailable', 503);
    return {
      entries: (data ?? []).map((entry) => ({
        ...entry,
        actor_user_id: entry.actor_user_id
          ? maskIdentifier(entry.actor_user_id)
          : null,
        target_id: maskIdentifier(entry.target_id),
      })),
      page: query.page,
      limit: query.limit,
      hasMore: (data ?? []).length === query.limit,
    };
  }

  private requireMutations() {
    if (!this.configuration.mutationsEnabled)
      throw new AdminApiError('admin_mutations_disabled', 503);
  }

  private healthSnapshot(value: unknown) {
    const health = asRecord(value);
    const expected = this.configuration.expectedMigration ?? '20260728042940';
    return {
      ...health,
      expected_migration: expected,
      migration_drift: health.latest_migration !== expected,
    };
  }

  private async assertFreshAction(actor: AdminActor, key: string) {
    const { data, error } = await this.admin
      .from('admin_action_audit')
      .select('id')
      .eq('actor_user_id', actor.userId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) throw new AdminApiError('audit_unavailable', 503);
    if (data) throw new AdminApiError('duplicate_action', 409);
  }

  private async advisors() {
    if (!this.configuration.managementAccessToken) {
      return { configured: false, security: [], performance: [] };
    }
    const load = async (kind: 'security' | 'performance') => {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${this.configuration.projectRef}/advisors/${kind}`,
        {
          headers: {
            Authorization: `Bearer ${this.configuration.managementAccessToken}`,
          },
        },
      );
      if (!response.ok) return [];
      const payload = asRecord(await response.json());
      return Array.isArray(payload.lints)
        ? payload.lints.slice(0, 100).map((value) => {
            const lint = asRecord(value);
            return {
              name: String(lint.name ?? 'advisor_finding').slice(0, 120),
              level: String(lint.level ?? 'INFO').slice(0, 20),
              description: redactAdminLogMessage(
                String(lint.description ?? ''),
              ),
            };
          })
        : [];
    };
    const [security, performance] = await Promise.all([
      load('security'),
      load('performance'),
    ]);
    return { configured: true, security, performance };
  }

  private async cleanupOrphanThumbnails() {
    const [
      { data: rooms, error: roomsError },
      { data: folders, error: listError },
    ] = await Promise.all([
      this.admin
        .from('rooms')
        .select('thumbnail_path')
        .not('thumbnail_path', 'is', null),
      this.admin.storage.from('room-thumbnails').list('', { limit: 1000 }),
    ]);
    if (roomsError || listError) throw roomsError ?? listError;
    const retained = new Set(
      (rooms ?? []).flatMap((room) =>
        room.thumbnail_path ? [room.thumbnail_path] : [],
      ),
    );
    const paths: string[] = [];
    for (const folder of folders ?? []) {
      if (!uuid.safeParse(folder.name).success) continue;
      const { data: objects, error } = await this.admin.storage
        .from('room-thumbnails')
        .list(folder.name, { limit: 100 });
      if (error) throw error;
      for (const object of objects ?? []) {
        const path = `${folder.name}/${object.name}`;
        if (object.name === 'world.webp' && !retained.has(path)) {
          paths.push(path);
        }
      }
    }
    if (paths.length > 0) {
      const { error } = await this.admin.storage
        .from('room-thumbnails')
        .remove(paths);
      if (error) throw error;
    }
    return { deletedObjects: paths.length };
  }

  private async recordAudit(
    actor: AdminActor,
    input: {
      action: string;
      targetType: string;
      targetId: string;
      reason: string;
      idempotencyKey: string;
      outcome: 'succeeded' | 'failed';
      errorCode?: string;
      beforeSummary?: Record<string, unknown>;
      afterSummary?: Record<string, unknown>;
    },
  ) {
    const { error } = await this.admin.from('admin_action_audit').insert({
      actor_user_id: actor.userId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      request_id: actor.requestId ?? randomUUID(),
      idempotency_key: input.idempotencyKey,
      outcome: input.outcome,
      error_code: input.errorCode ?? null,
      before_summary: input.beforeSummary ?? null,
      after_summary: input.afterSummary ?? null,
    });
    if (error?.code === '23505')
      throw new AdminApiError('duplicate_action', 409);
    if (error) throw new AdminApiError('audit_write_failed', 503);
  }
}
