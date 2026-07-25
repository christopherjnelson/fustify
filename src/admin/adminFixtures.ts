import type { AdminDashboardSnapshot, AdminDashboardSource } from './adminApi';

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
