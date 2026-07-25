import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATOR_VERSION } from '../core/generation/constants';
import type { Database } from './database.types';
import type { Room } from './multiplayerApi';
import { generateRoomPreviewPlanet } from './roomWorld';
import {
  buildWorldThumbnailSvg,
  replaceRoomThumbnail,
  roomThumbnailPath,
} from './worldThumbnail';

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

  it('publishes a public room through one stable upsert path', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(async () => ({
      data: { ...room, thumbnail_path: roomThumbnailPath(room.id) },
      error: null,
    }));
    const client = {
      storage: { from: vi.fn(() => ({ upload })) },
      rpc,
    } as unknown as SupabaseClient<Database>;
    const thumbnail = new Blob(['webp'], { type: 'image/webp' });
    const createThumbnail = vi.fn(async () => thumbnail);

    await replaceRoomThumbnail(client, room, createThumbnail);

    expect(createThumbnail).toHaveBeenCalledWith(room);
    expect(upload).toHaveBeenCalledWith(
      `${room.id}/world.webp`,
      thumbnail,
      expect.objectContaining({
        contentType: 'image/webp',
        upsert: true,
      }),
    );
    expect(rpc).toHaveBeenCalledWith('publish_room_thumbnail', {
      p_room_id: room.id,
      p_thumbnail_path: `${room.id}/world.webp`,
    });
  });

  it('does no thumbnail work for private rooms', async () => {
    const client = {
      storage: { from: vi.fn() },
      rpc: vi.fn(),
    } as unknown as SupabaseClient<Database>;
    const createThumbnail = vi.fn();

    await expect(
      replaceRoomThumbnail(
        client,
        { ...room, visibility: 'private' },
        createThumbnail,
      ),
    ).resolves.toMatchObject({ visibility: 'private' });
    expect(createThumbnail).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('does not publish metadata when the upload fails', async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ error: new Error('storage failed') })),
        })),
      },
      rpc: vi.fn(),
    } as unknown as SupabaseClient<Database>;

    await expect(
      replaceRoomThumbnail(client, room, async () => new Blob(['webp'])),
    ).rejects.toThrow('storage failed');
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
