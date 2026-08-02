export const ROOM_CODE_COPY_FEEDBACK_MS = 2_000;

export type RoomCodeCopyFeedback = 'idle' | 'copied' | 'failed';

export async function copyRoomCode(
  roomCode: string,
  writeText: (text: string) => Promise<void>,
): Promise<RoomCodeCopyFeedback> {
  try {
    await writeText(roomCode);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function scheduleRoomCodeCopyReset(
  reset: () => void,
): ReturnType<typeof setTimeout> {
  return globalThis.setTimeout(reset, ROOM_CODE_COPY_FEEDBACK_MS);
}
