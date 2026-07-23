import { describe, expect, it } from 'vitest';
import type { Room } from './multiplayerApi';
import { generateRoomPreviewPlanet, withFreshRoomSeed } from './roomWorld';

const room = {
  id: '00000000-0000-4000-8000-000000000001',
  join_code: 'ABCD1234',
  host_user_id: '00000000-0000-4000-8000-000000000002',
  status: 'waiting',
  seed: 'calm-bay-123',
  territory_count: 12,
  continent_count: 2,
  assignment_mode: 'random',
  max_seats: 3,
  revision: 4,
  created_at: '2026-07-23T00:00:00.000Z',
  updated_at: '2026-07-23T00:00:00.000Z',
} satisfies Room;

describe('multiplayer room worlds', () => {
  it('changes only the seed when the host generates a world', () => {
    expect(withFreshRoomSeed(room, () => 'wild-ridge-987')).toEqual({
      ...room,
      seed: 'wild-ridge-987',
    });
  });

  it('derives a deterministic preview from synchronized room settings', () => {
    const first = generateRoomPreviewPlanet(room);
    const second = generateRoomPreviewPlanet({ ...room });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      seed: room.seed,
      territoryCount: room.territory_count,
      continentCount: room.continent_count,
      playerCount: room.max_seats,
    });
  });
});
