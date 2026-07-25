import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../multiplayer/database.types';

const overviewSchema = z
  .object({
    active_matches: z.number().int().nonnegative(),
    generated_at: z.iso.datetime({ offset: true }),
    private_waiting_rooms: z.number().int().nonnegative(),
    public_waiting_missing_thumbnail: z.number().int().nonnegative(),
    public_waiting_rooms: z.number().int().nonnegative(),
    public_waiting_with_thumbnail: z.number().int().nonnegative(),
    registered_accounts: z.number().int().nonnegative(),
    total_matches: z.number().int().nonnegative(),
  })
  .strict();

const recentRoomSchema = z
  .object({
    claimed_seats: z.number().int().nonnegative(),
    created_at: z.iso.datetime({ offset: true }),
    current_members: z.number().int().nonnegative(),
    generator_version: z.union([z.literal(3), z.literal(4)]),
    host_display_name: z.string().min(1).max(40),
    maximum_players: z.number().int().min(2).max(5),
    room_name: z.string().min(1).max(60),
    room_state: z.enum(['waiting', 'active', 'closed']),
    thumbnail_available: z.boolean(),
    updated_at: z.iso.datetime({ offset: true }),
    visibility: z.enum(['public', 'private']),
  })
  .strict();

export type AdminOverview = z.infer<typeof overviewSchema>;
export type AdminRecentRoom = z.infer<typeof recentRoomSchema>;

export interface AdminDashboardSnapshot {
  overview: AdminOverview;
  recentRooms: AdminRecentRoom[];
}

export interface AdminDashboardSource {
  load(): Promise<AdminDashboardSnapshot>;
}

export async function checkCurrentUserIsAdmin(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } = await client.rpc('current_user_is_admin');
  if (error) {
    throw new Error('Admin authorization is currently unavailable.');
  }
  return data === true;
}

export function supabaseAdminDashboardSource(
  client: SupabaseClient<Database>,
): AdminDashboardSource {
  return {
    async load() {
      const [overviewResult, roomsResult] = await Promise.all([
        client.rpc('admin_dashboard_overview'),
        client.rpc('admin_recent_rooms'),
      ]);
      if (overviewResult.error || roomsResult.error) {
        throw new Error('Admin dashboard data is currently unavailable.');
      }

      const overview = overviewSchema.safeParse(overviewResult.data?.[0]);
      const rooms = z
        .array(recentRoomSchema)
        .max(20)
        .safeParse(roomsResult.data ?? []);
      if (!overview.success || !rooms.success) {
        throw new Error('Admin dashboard returned an unexpected response.');
      }
      return { overview: overview.data, recentRooms: rooms.data };
    },
  };
}
