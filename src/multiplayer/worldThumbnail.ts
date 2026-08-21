import type { ApplicationClient } from './applicationClient';

export const ROOM_THUMBNAIL_BUCKET = 'room-thumbnails';

export function roomThumbnailPath(roomId: string): string {
  return `${roomId}/world.webp`;
}

export function roomThumbnailPublicUrl(
  _client: ApplicationClient,
  path: string,
  version: number,
): string {
  const roomId = path.split('/')[0];
  return `/api/multiplayer/rooms/${encodeURIComponent(roomId!)}/thumbnail.svg?v=${encodeURIComponent(String(version))}`;
}
