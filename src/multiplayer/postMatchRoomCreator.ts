import {
  multiplayerError,
  type MultiplayerRoomSettings,
  type Room,
} from './multiplayerApi';

export interface PostMatchRoomCreatorDependencies {
  settings: MultiplayerRoomSettings;
  createRoom: (settings: MultiplayerRoomSettings) => Promise<Room>;
  generateSeed: () => string;
  navigate: (path: string) => void;
  onPendingChange: (pending: boolean) => void;
  onError: (message: string | null) => void;
}

export function createPostMatchRoomCreator({
  settings,
  createRoom,
  generateSeed,
  navigate,
  onPendingChange,
  onError,
}: PostMatchRoomCreatorDependencies) {
  let pending = false;

  const create = async (freshWorld: boolean) => {
    if (pending) return;
    pending = true;
    onPendingChange(true);
    onError(null);
    try {
      const room = await createRoom(
        freshWorld ? { ...settings, seed: generateSeed() } : settings,
      );
      navigate(`/multiplayer/room/${room.id}`);
    } catch (error) {
      onError(multiplayerError(error).message);
    } finally {
      pending = false;
      onPendingChange(false);
    }
  };

  return {
    rematchSameWorld: () => create(false),
    generateNewWorld: () => create(true),
  };
}
