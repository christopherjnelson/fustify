import type { ApplicationClient } from './applicationClient';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATOR_VERSION } from '../core/generation/constants';
import type { Room } from './multiplayerApi';
import { generateRoomPreviewPlanet } from './roomWorld';
import { roomThumbnailPublicUrl } from './worldThumbnail';
import {
  buildWorldThumbnailSvg,
  replaceRoomThumbnail,
} from './worldThumbnailPublication';

const room: Room = {
  assignment_mode: 'random',
  continent_count: 2,
  created_at: '2026-07-25T00:00:00.000Z',
  generator_version: DEFAULT_GENERATOR_VERSION,
  host_user_id: '10000000-0000-4000-8000-000000000001',
  id: '20000000-0000-4000-8000-000000000001',
  join_code: 'ABCD1234',
  max_seats: 3,
  name: 'Atlas Prime',
  revision: 0,
  seed: 'thumbnail-world-123',
  status: 'waiting',
  territory_count: 12,
  thumbnail_path: null,
  thumbnail_version: 0,
  updated_at: '2026-07-25T00:00:00.000Z',
  visibility: 'public',
};

describe('room world thumbnails', () => {
  it('builds deterministic Fustify minimap SVG at the WebP framing size', () => {
    const planet = generateRoomPreviewPlanet(room);
    const first = buildWorldThumbnailSvg(planet);
    const second = buildWorldThumbnailSvg(planet);

    expect(second).toBe(first);
    expect(first).toContain('width="640" height="360"');
    expect(first).toContain('#102d43');
    expect(first).toContain('stroke="#78c4df"');
    expect(first).not.toContain('<script');
  });

  it('does no thumbnail work for private rooms', async () => {
    const client = {
      removeChannel: vi.fn(),
    } as unknown as ApplicationClient;
    const createThumbnail = vi.fn();

    await expect(
      replaceRoomThumbnail(
        client,
        { ...room, visibility: 'private' },
        createThumbnail,
      ),
    ).resolves.toMatchObject({ visibility: 'private' });
    expect(createThumbnail).not.toHaveBeenCalled();
  });

  it('uses the same-origin generated SVG for application API rooms', async () => {
    const client = {
      transport: 'fustify-http',
    } as unknown as ApplicationClient;
    const createThumbnail = vi.fn();

    await expect(
      replaceRoomThumbnail(client, room, createThumbnail),
    ).resolves.toBe(room);
    expect(createThumbnail).not.toHaveBeenCalled();
    expect(
      roomThumbnailPublicUrl(
        client,
        `${room.id}/world.webp`,
        room.thumbnail_version + 1,
      ),
    ).toBe(`/api/multiplayer/rooms/${room.id}/thumbnail.svg?v=1`);
  });
});
