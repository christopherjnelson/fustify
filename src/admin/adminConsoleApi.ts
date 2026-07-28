import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../multiplayer/database.types';

export const adminAccountSchema = z.object({
  accountRef: z.string().min(40).max(200),
  maskedUserId: z.string(),
  maskedEmail: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  providers: z.array(z.string()),
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  status: z.enum([
    'active',
    'banned',
    'anonymous',
    'admin',
    'revoked',
    'deleted',
  ]),
  hostedRooms: z.number().int().nonnegative(),
  roomMemberships: z.number().int().nonnegative(),
  matchesPlayed: z.number().int().nonnegative(),
  gameplayCommands: z.number().int().nonnegative(),
});

const roomSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    visibility: z.enum(['public', 'private']),
    status: z.enum(['waiting', 'active', 'closed']),
    host_user_id: z.string().uuid(),
    hostDisplayName: z.string(),
    max_seats: z.number(),
    revision: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    thumbnail_path: z.string().nullable(),
    generator_version: z.number(),
    members: z.number(),
    claimedSeats: z.number(),
    lastActivityAt: z.string().nullable(),
    match: z
      .object({
        id: z.string().uuid(),
        status: z.string(),
        revision: z.number(),
        updated_at: z.string(),
      })
      .nullable(),
    launch: z
      .object({
        match_id: z.string().uuid(),
        started_at: z.string(),
      })
      .nullable(),
    announcement: z
      .object({
        status: z.string(),
        attempt_count: z.number(),
        last_error: z.string().nullable(),
        updated_at: z.string(),
      })
      .nullable(),
    purgeable: z.boolean(),
  })
  .passthrough();

const healthSchema = z
  .object({
    database_bytes: z.number().nonnegative(),
    database_connections: z.number().nonnegative(),
    registered_accounts: z.number().nonnegative(),
    anonymous_accounts: z.number().nonnegative(),
    banned_accounts: z.number().nonnegative(),
    cleanup_candidates: z.number().nonnegative(),
    stuck_launches: z.number().nonnegative(),
    announcement_attention: z.number().nonnegative(),
    thumbnail_objects: z.number().nonnegative(),
    thumbnail_bytes: z.number().nonnegative(),
    orphan_thumbnails: z.number().nonnegative(),
    cron_failures_24h: z.number().nonnegative(),
    missing_profiles: z.number().nonnegative(),
    inconsistent_rooms: z.number().nonnegative(),
    incomplete_matches: z.number().nonnegative(),
    latest_migration: z.string().nullable(),
    expected_migration: z.string(),
    migration_drift: z.boolean(),
    cache_hit_ratio: z.coerce.number().nonnegative(),
    index_hit_ratio: z.coerce.number().nonnegative(),
    largest_tables: z.array(z.record(z.string(), z.unknown())),
    trends: z.record(z.string(), z.coerce.number()),
  })
  .passthrough();

const logEntrySchema = z.object({
  timestamp: z.union([z.string(), z.number()]).nullable(),
  service: z.string(),
  severity: z.union([z.string(), z.number()]),
  status: z.union([z.string(), z.number()]).nullable(),
  path: z.string().nullable(),
  requestId: z.string().nullable(),
  message: z.string(),
});

const auditEntrySchema = z.object({
  id: z.number(),
  actor_user_id: z.string().nullable(),
  action: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  reason: z.string(),
  request_id: z.string().uuid(),
  outcome: z.enum(['succeeded', 'failed']),
  error_code: z.string().nullable(),
  created_at: z.string(),
});

export type AdminAccount = z.infer<typeof adminAccountSchema>;
export type AdminRoom = z.infer<typeof roomSchema>;
export type AdminHealth = z.infer<typeof healthSchema>;
export type AdminLogEntry = z.infer<typeof logEntrySchema>;
export type AdminAuditEntry = z.infer<typeof auditEntrySchema>;

export interface AdminConsoleSource {
  overview(): Promise<{ health: AdminHealth }>;
  accounts(filters?: {
    search?: string;
    status?: string;
    provider?: string;
    confirmation?: string;
    page?: number;
  }): Promise<{ accounts: AdminAccount[]; hasMore: boolean }>;
  rooms(filters?: {
    search?: string;
    status?: string;
    page?: number;
  }): Promise<{ rooms: AdminRoom[]; hasMore: boolean }>;
  logs(
    service?: string,
    window?: string,
  ): Promise<{
    configured: boolean;
    entries: AdminLogEntry[];
    nextCursor?: string | null;
    explorerUrl?: string;
  }>;
  maintenance(): Promise<{
    health: AdminHealth;
    announcements: Array<Record<string, unknown>>;
    cleanupCandidates: Array<Record<string, unknown>>;
    advisors: {
      configured: boolean;
      security: Array<Record<string, unknown>>;
      performance: Array<Record<string, unknown>>;
    };
  }>;
  maintenanceAction(input: Record<string, unknown>): Promise<void>;
  audit(): Promise<AdminAuditEntry[]>;
  metrics(): Promise<{
    generatedAt: string;
    aggregates: Record<string, number>;
  }>;
  revealAccount(userId: string): Promise<Record<string, unknown>>;
  accountAction(userId: string, input: Record<string, unknown>): Promise<void>;
  roomAction(roomId: string, input: Record<string, unknown>): Promise<void>;
}

async function accessToken(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('Admin session unavailable.');
  return data.session.access_token;
}

export function serverAdminConsoleSource(
  client: SupabaseClient<Database>,
): AdminConsoleSource {
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${await accessToken(client)}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      const code =
        typeof body === 'object' &&
        body !== null &&
        'code' in body &&
        typeof body.code === 'string'
          ? body.code
          : 'admin_request_failed';
      throw new Error(code);
    }
    return body;
  }

  return {
    async overview() {
      const body = z
        .object({ health: healthSchema })
        .passthrough()
        .parse(await request('/api/admin/overview'));
      return { health: body.health };
    },
    async accounts(filters = {}) {
      const params = new URLSearchParams({
        search: filters.search ?? '',
        status: filters.status ?? 'all',
        provider: filters.provider ?? '',
        confirmation: filters.confirmation ?? 'all',
        page: String(filters.page ?? 1),
      });
      return z
        .object({
          accounts: z.array(adminAccountSchema),
          hasMore: z.boolean(),
        })
        .parse(await request(`/api/admin/accounts?${params}`));
    },
    async rooms(filters = {}) {
      const params = new URLSearchParams({
        search: filters.search ?? '',
        status: filters.status ?? 'all',
        page: String(filters.page ?? 1),
      });
      return z
        .object({
          rooms: z.array(roomSchema),
          hasMore: z.boolean(),
        })
        .parse(await request(`/api/admin/rooms?${params}`));
    },
    async logs(service = 'all', window = '1h') {
      const params = new URLSearchParams({ service, window });
      return z
        .object({
          configured: z.boolean(),
          entries: z.array(logEntrySchema),
          nextCursor: z.string().nullable().optional(),
          explorerUrl: z.string().url().optional(),
        })
        .parse(await request(`/api/admin/logs?${params}`));
    },
    async maintenance() {
      return z
        .object({
          health: healthSchema,
          announcements: z.array(z.record(z.string(), z.unknown())),
          cleanupCandidates: z.array(z.record(z.string(), z.unknown())),
          advisors: z.object({
            configured: z.boolean(),
            security: z.array(z.record(z.string(), z.unknown())),
            performance: z.array(z.record(z.string(), z.unknown())),
          }),
        })
        .parse(await request('/api/admin/maintenance'));
    },
    async audit() {
      return z
        .object({ entries: z.array(auditEntrySchema) })
        .parse(await request('/api/admin/audit')).entries;
    },
    async metrics() {
      return z
        .object({
          generatedAt: z.string(),
          aggregates: z.record(z.string(), z.number()),
        })
        .parse(await request('/api/admin/metrics'));
    },
    async revealAccount(userId) {
      return z.record(z.string(), z.unknown()).parse(
        await request(
          `/api/admin/accounts/${encodeURIComponent(userId)}/reveal`,
          {
            method: 'POST',
          },
        ),
      );
    },
    async accountAction(userId, input) {
      await request(
        `/api/admin/accounts/${encodeURIComponent(userId)}/actions`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    },
    async roomAction(roomId, input) {
      await request(`/api/admin/rooms/${encodeURIComponent(roomId)}/actions`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async maintenanceAction(input) {
      await request('/api/admin/maintenance/actions', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };
}
