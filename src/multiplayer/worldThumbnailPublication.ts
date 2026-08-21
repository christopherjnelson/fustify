import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Room } from './multiplayerApi';
import { generateRoomPreviewPlanet } from './roomWorld';
import { ROOM_THUMBNAIL_BUCKET, roomThumbnailPath } from './worldThumbnail';
import { isHttpMultiplayerClient } from './multiplayerClient';
import {
  buildWorldThumbnailSvg,
  ROOM_THUMBNAIL_HEIGHT,
  ROOM_THUMBNAIL_WIDTH,
} from './worldThumbnailSvg';

export {
  buildWorldThumbnailSvg,
  ROOM_THUMBNAIL_HEIGHT,
  ROOM_THUMBNAIL_WIDTH,
} from './worldThumbnailSvg';

async function rasterizeWorldThumbnail(svg: string): Promise<Blob> {
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  );
  const image = new Image();
  const canvas = document.createElement('canvas');
  canvas.width = ROOM_THUMBNAIL_WIDTH;
  canvas.height = ROOM_THUMBNAIL_HEIGHT;

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('The world preview could not be rasterized.'));
      image.src = svgUrl;
    });
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0, ROOM_THUMBNAIL_WIDTH, ROOM_THUMBNAIL_HEIGHT);
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.83),
    );
    if (!webp || webp.type !== 'image/webp') {
      throw new Error('WebP encoding is unavailable.');
    }
    return webp;
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(svgUrl);
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function createRoomThumbnail(room: Room): Promise<Blob> {
  const planet = generateRoomPreviewPlanet(room);
  return rasterizeWorldThumbnail(buildWorldThumbnailSvg(planet));
}

export async function replaceRoomThumbnail(
  client: SupabaseClient<Database>,
  room: Room,
  createThumbnail: (room: Room) => Promise<Blob> = createRoomThumbnail,
): Promise<Room> {
  if (room.visibility !== 'public') return room;
  if (isHttpMultiplayerClient(client)) return room;

  const path = roomThumbnailPath(room.id);
  const thumbnail = await createThumbnail(room);
  const { error: uploadError } = await client.storage
    .from(ROOM_THUMBNAIL_BUCKET)
    .upload(path, thumbnail, {
      cacheControl: '31536000',
      contentType: 'image/webp',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await client.rpc('publish_room_thumbnail', {
    p_room_id: room.id,
    p_thumbnail_path: path,
  });
  if (error) throw error;
  return data;
}
