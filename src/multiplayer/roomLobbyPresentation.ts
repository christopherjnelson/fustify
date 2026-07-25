import { publicRoomUrl, type Room } from './multiplayerApi';

export function shouldReplaceRoomSettingsDraft(
  room: Room,
  hasUnsavedPrivateSettings: boolean,
): boolean {
  return (
    room.visibility === 'public' ||
    room.status !== 'waiting' ||
    !hasUnsavedPrivateSettings
  );
}

export function roomLobbyPresentation(room: Room, userId: string) {
  const host = room.host_user_id === userId;
  const waiting = room.status === 'waiting';
  const published = room.visibility === 'public';
  return {
    host,
    waiting,
    published,
    settingsEditable: host && waiting && !published,
    canPublish: host && waiting && !published,
    join: published
      ? ({ kind: 'public-link', value: publicRoomUrl(room.id) } as const)
      : ({ kind: 'private-code', value: room.join_code } as const),
  };
}
