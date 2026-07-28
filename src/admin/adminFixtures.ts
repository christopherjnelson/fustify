import type { AdminDashboardSnapshot, AdminDashboardSource } from './adminApi';
import type { AdminConsoleSource } from './adminConsoleApi';

export const populatedAdminSnapshot: AdminDashboardSnapshot = {
  overview: {
    generated_at: '2026-07-25T17:00:00.000Z',
    registered_accounts: 184,
    public_waiting_rooms: 7,
    private_waiting_rooms: 3,
    active_matches: 12,
    total_matches: 96,
    public_waiting_with_thumbnail: 6,
    public_waiting_missing_thumbnail: 1,
  },
  recentRooms: [
    {
      room_name: 'Atlas Prime',
      visibility: 'public',
      host_display_name: 'Northstar',
      current_members: 4,
      claimed_seats: 3,
      maximum_players: 5,
      room_state: 'waiting',
      thumbnail_available: true,
      generator_version: 4,
      created_at: '2026-07-25T16:20:00.000Z',
      updated_at: '2026-07-25T16:52:00.000Z',
    },
    {
      room_name: 'Hidden Orbit',
      visibility: 'private',
      host_display_name: 'AtlasPilot',
      current_members: 2,
      claimed_seats: 2,
      maximum_players: 4,
      room_state: 'waiting',
      thumbnail_available: false,
      generator_version: 4,
      created_at: '2026-07-25T15:10:00.000Z',
      updated_at: '2026-07-25T16:05:00.000Z',
    },
  ],
};

export function fixtureAdminDashboardSource(
  state: 'populated' | 'empty' | 'error' | 'loading',
): AdminDashboardSource {
  return {
    async load() {
      if (state === 'loading') {
        return new Promise<AdminDashboardSnapshot>(() => undefined);
      }
      if (state === 'error') {
        throw new Error('Development fixture failure.');
      }
      if (state === 'empty') {
        return {
          overview: {
            generated_at: '2026-07-25T17:00:00.000Z',
            registered_accounts: 0,
            public_waiting_rooms: 0,
            private_waiting_rooms: 0,
            active_matches: 0,
            total_matches: 0,
            public_waiting_with_thumbnail: 0,
            public_waiting_missing_thumbnail: 0,
          },
          recentRooms: [],
        };
      }
      return populatedAdminSnapshot;
    },
  };
}

const health = {
  database_bytes: 73400320,
  database_connections: 9,
  registered_accounts: 184,
  anonymous_accounts: 23,
  banned_accounts: 2,
  cleanup_candidates: 4,
  stuck_launches: 1,
  announcement_attention: 2,
  thumbnail_objects: 42,
  thumbnail_bytes: 12582912,
  orphan_thumbnails: 3,
  cron_failures_24h: 1,
  missing_profiles: 1,
  inconsistent_rooms: 2,
  incomplete_matches: 1,
  latest_migration: '20260728042940',
  expected_migration: '20260728042940',
  migration_drift: false,
  cache_hit_ratio: 0.997,
  index_hit_ratio: 0.994,
  largest_tables: [],
  trends: {
    accounts_24h: 4,
    accounts_30d: 47,
    commands_24h: 316,
    rooms_24h: 9,
    matches_completed_30d: 31,
  },
};

export function fixtureAdminConsoleSource(): AdminConsoleSource {
  return {
    async overview() {
      return { health };
    },
    async metrics() {
      return {
        generatedAt: '2026-07-28T04:00:00.000Z',
        aggregates: {
          pg_stat_database_numbackends: 9,
          node_cpu_seconds_total: 3724,
          pg_stat_database_blks_hit: 845902,
          pg_stat_wal_bytes: 184320,
        },
      };
    },
    async accounts() {
      return {
        accounts: [
          {
            accountRef: 'fixture-account-reference-northstar-000000000000001',
            maskedUserId: 'a1000000…0001',
            maskedEmail: 'n•••@example.test',
            displayName: 'Northstar',
            avatarUrl: null,
            providers: ['email'],
            createdAt: '2026-06-20T14:00:00.000Z',
            lastSignInAt: '2026-07-28T03:42:00.000Z',
            confirmedAt: '2026-06-20T14:02:00.000Z',
            status: 'active',
            hostedRooms: 5,
            roomMemberships: 12,
            matchesPlayed: 8,
            gameplayCommands: 274,
          },
          {
            accountRef: 'fixture-account-reference-admin-00000000000000002',
            maskedUserId: 'a2000000…0002',
            maskedEmail: 'a•••@example.test',
            displayName: 'Atlas Admin',
            avatarUrl: null,
            providers: ['google'],
            createdAt: '2026-05-04T11:00:00.000Z',
            lastSignInAt: '2026-07-28T03:55:00.000Z',
            confirmedAt: '2026-05-04T11:00:00.000Z',
            status: 'admin',
            hostedRooms: 1,
            roomMemberships: 4,
            matchesPlayed: 3,
            gameplayCommands: 92,
          },
          {
            accountRef: 'fixture-account-reference-red-comet-0000000000003',
            maskedUserId: 'a3000000…0003',
            maskedEmail: 'r•••@example.test',
            displayName: 'Red Comet',
            avatarUrl: null,
            providers: ['email'],
            createdAt: '2026-07-10T09:00:00.000Z',
            lastSignInAt: '2026-07-26T13:10:00.000Z',
            confirmedAt: '2026-07-10T09:03:00.000Z',
            status: 'banned',
            hostedRooms: 0,
            roomMemberships: 2,
            matchesPlayed: 1,
            gameplayCommands: 21,
          },
        ],
        hasMore: true,
      };
    },
    async rooms() {
      return {
        rooms: [
          {
            id: 'b1000000-0000-4000-8000-000000000001',
            name: 'Atlas Prime',
            visibility: 'public',
            status: 'waiting',
            host_user_id: 'a1000000-0000-4000-8000-000000000001',
            hostDisplayName: 'Northstar',
            max_seats: 5,
            revision: 8,
            created_at: '2026-07-28T02:00:00.000Z',
            updated_at: '2026-07-28T03:58:00.000Z',
            thumbnail_path: 'b100/world.webp',
            generator_version: 4,
            members: 4,
            claimedSeats: 3,
            lastActivityAt: '2026-07-28T03:58:00.000Z',
            match: null,
            launch: null,
            announcement: {
              status: 'sent',
              attempt_count: 1,
              last_error: null,
              updated_at: '2026-07-28T02:01:00.000Z',
            },
            purgeable: false,
          },
          {
            id: 'b2000000-0000-4000-8000-000000000002',
            name: 'Stalled Launch',
            visibility: 'private',
            status: 'active',
            host_user_id: 'a3000000-0000-4000-8000-000000000003',
            hostDisplayName: 'Red Comet',
            max_seats: 4,
            revision: 13,
            created_at: '2026-07-27T23:00:00.000Z',
            updated_at: '2026-07-28T03:40:00.000Z',
            thumbnail_path: null,
            generator_version: 4,
            members: 3,
            claimedSeats: 3,
            lastActivityAt: '2026-07-28T03:40:00.000Z',
            match: null,
            launch: {
              match_id: 'c2000000-0000-4000-8000-000000000002',
              started_at: '2026-07-28T03:40:00.000Z',
            },
            announcement: null,
            purgeable: false,
          },
          {
            id: 'b3000000-0000-4000-8000-000000000003',
            name: 'Old Empty Room',
            visibility: 'private',
            status: 'closed',
            host_user_id: 'a1000000-0000-4000-8000-000000000001',
            hostDisplayName: 'Northstar',
            max_seats: 5,
            revision: 4,
            created_at: '2026-05-10T12:00:00.000Z',
            updated_at: '2026-05-11T12:00:00.000Z',
            thumbnail_path: null,
            generator_version: 4,
            members: 0,
            claimedSeats: 0,
            lastActivityAt: null,
            match: null,
            launch: null,
            announcement: null,
            purgeable: true,
          },
        ],
        hasMore: false,
      };
    },
    async logs() {
      return {
        configured: true,
        nextCursor: null,
        explorerUrl:
          'https://supabase.com/dashboard/project/example/logs/explorer',
        entries: [
          {
            timestamp: '2026-07-28T03:59:00.000Z',
            service: 'postgres_logs',
            severity: 'ERROR',
            status: null,
            path: null,
            requestId: '[id]',
            message: 'statement failed for [id] from [ip]',
          },
          {
            timestamp: '2026-07-28T03:57:00.000Z',
            service: 'auth_logs',
            severity: 'WARNING',
            status: 429,
            path: '/token?[redacted]',
            requestId: '[id]',
            message: 'rate limit for [email]',
          },
        ],
      };
    },
    async maintenance() {
      return {
        health,
        announcements: [
          {
            id: 'd1000000-0000-4000-8000-000000000001',
            status: 'failed',
            attempt_count: 2,
            last_error: 'discord_upstream_error',
            updated_at: '2026-07-28T03:30:00.000Z',
          },
        ],
        cleanupCandidates: [
          {
            id: 'b3000000-0000-4000-8000-000000000003',
            name: 'Old Empty Room',
            updated_at: '2026-05-11T12:00:00.000Z',
          },
        ],
        advisors: {
          configured: true,
          security: [
            {
              name: 'rls_enabled_no_policy',
              level: 'INFO',
              description: 'Intentional server-only administration table.',
            },
          ],
          performance: [],
        },
      };
    },
    async audit() {
      return [
        {
          id: 42,
          actor_user_id: 'a2000000…0002',
          action: 'room_close',
          target_type: 'room',
          target_id: 'b3000000…0003',
          reason: 'Removed abandoned test lobby',
          request_id: 'e1000000-0000-4000-8000-000000000001',
          outcome: 'succeeded',
          error_code: null,
          created_at: '2026-07-28T03:20:00.000Z',
        },
      ];
    },
    async revealAccount(userId) {
      return {
        userId,
        email: 'northstar@example.test',
        identities: [{ provider: 'email', id: '[id]' }],
      };
    },
    async accountAction() {},
    async roomAction() {},
    async maintenanceAction() {},
  };
}
