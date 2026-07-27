import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const ROOM_THUMBNAIL_BUCKET = 'room-thumbnails';

export function roomThumbnailPath(roomId: string): string {
  return `${roomId}/world.webp`;
}

export function roomThumbnailPublicUrl(
  client: SupabaseClient<Database>,
  path: string,
  version: number,
): string {
  const publicUrl = client.storage
    .from(ROOM_THUMBNAIL_BUCKET)
    .getPublicUrl(path).data.publicUrl;
  const url = new URL(publicUrl);
  url.searchParams.set('v', String(version));
  return url.toString();
}
