import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../multiplayer/database.types';
import {
  checkCurrentUserIsAdmin,
  supabaseAdminDashboardSource,
} from './adminApi';
import { populatedAdminSnapshot } from './adminFixtures';

function clientWithRpc(
  implementation: (
    name: string,
  ) => Promise<{ data: unknown; error: Error | null }>,
) {
  return {
    rpc: vi.fn(implementation),
  } as unknown as SupabaseClient<Database>;
}

describe('admin API', () => {
  it('requires an affirmative server authorization result', async () => {
    await expect(
      checkCurrentUserIsAdmin(
        clientWithRpc(async () => ({ data: true, error: null })),
      ),
    ).resolves.toBe(true);
    await expect(
      checkCurrentUserIsAdmin(
        clientWithRpc(async () => ({ data: false, error: null })),
      ),
    ).resolves.toBe(false);
  });

  it('sanitizes authorization failures', async () => {
    await expect(
      checkCurrentUserIsAdmin(
        clientWithRpc(async () => ({
          data: null,
          error: new Error('database internals'),
        })),
      ),
    ).rejects.toThrow('Admin authorization is currently unavailable.');
  });

  it('loads only the two bounded admin RPCs', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'admin_dashboard_overview') {
        return { data: [populatedAdminSnapshot.overview], error: null };
      }
      if (name === 'admin_recent_rooms') {
        return { data: populatedAdminSnapshot.recentRooms, error: null };
      }
      return { data: null, error: new Error('unexpected rpc') };
    });
    const source = supabaseAdminDashboardSource({
      rpc,
    } as unknown as SupabaseClient<Database>);

    await expect(source.load()).resolves.toEqual(populatedAdminSnapshot);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('admin_dashboard_overview');
    expect(rpc).toHaveBeenCalledWith('admin_recent_rooms');
  });

  it('rejects malformed or over-broad responses with a safe error', async () => {
    const source = supabaseAdminDashboardSource(
      clientWithRpc(async (name) =>
        name === 'admin_dashboard_overview'
          ? {
              data: [{ ...populatedAdminSnapshot.overview, email: 'nope' }],
              error: null,
            }
          : {
              data: [
                {
                  ...populatedAdminSnapshot.recentRooms[0],
                  room_name: '',
                },
              ],
              error: null,
            },
      ),
    );

    await expect(source.load()).rejects.toThrow(
      'Admin dashboard returned an unexpected response.',
    );
  });

  it('sanitizes privileged RPC failures', async () => {
    const source = supabaseAdminDashboardSource(
      clientWithRpc(async () => ({
        data: null,
        error: new Error('permission internals'),
      })),
    );

    await expect(source.load()).rejects.toThrow(
      'Admin dashboard data is currently unavailable.',
    );
  });
});
