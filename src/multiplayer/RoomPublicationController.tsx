import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  fetchRoomState,
  multiplayerError,
  publishRoom,
  updateRoomSettings,
  type Room,
  type RoomState,
} from './multiplayerApi';
import { RoomPublicationDialog } from './RoomPublicationDialog';
import { shouldReplaceRoomSettingsDraft } from './roomLobbyPresentation';
import { replaceRoomThumbnail } from './worldThumbnailPublication';

export function RoomPublicationController({
  client,
  roomId,
  settings,
  isSettingsDirty,
  markSettingsClean,
  isMounted,
  nextRequestSequence,
  isCurrentRequest,
  busy,
  isBusy,
  beginPublishing,
  finishPublishing,
  error,
  setPageError,
  setError,
  setOpen,
  setSettings,
  setState,
}: {
  client: SupabaseClient<Database>;
  roomId: string;
  settings: Room;
  isSettingsDirty: () => boolean;
  markSettingsClean: () => void;
  isMounted: () => boolean;
  nextRequestSequence: () => number;
  isCurrentRequest: (sequence: number) => boolean;
  busy: string | null;
  isBusy: () => boolean;
  beginPublishing: () => boolean;
  finishPublishing: () => void;
  error: string | null;
  setPageError: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setSettings: Dispatch<SetStateAction<Room | null>>;
  setState: Dispatch<SetStateAction<RoomState | null>>;
}) {
  return (
    <RoomPublicationDialog
      busy={busy === 'publish'}
      error={error}
      onCancel={() => {
        if (isBusy()) return;
        setError(null);
        setOpen(false);
      }}
      onConfirm={() => {
        if (!beginPublishing()) return;
        setPageError(null);
        setError(null);
        void (async () => {
          try {
            if (isSettingsDirty()) {
              const saved = await updateRoomSettings(client, settings);
              markSettingsClean();
              if (isMounted()) setSettings(saved);
            }
            await publishRoom(client, roomId);
            const sequence = nextRequestSequence();
            const canonical = await fetchRoomState(client, roomId);
            if (!isMounted() || !isCurrentRequest(sequence)) {
              return;
            }
            markSettingsClean();
            setState(canonical);
            setSettings(canonical.room);
            setOpen(false);
            if (canonical.room.visibility === 'public') {
              void replaceRoomThumbnail(client, canonical.room).catch(() => {
                console.warn('Public room thumbnail publication failed.');
              });
            }
          } catch (requestError) {
            try {
              const sequence = nextRequestSequence();
              const canonical = await fetchRoomState(client, roomId);
              if (!isMounted() || !isCurrentRequest(sequence)) {
                return;
              }
              setState(canonical);
              if (
                shouldReplaceRoomSettingsDraft(
                  canonical.room,
                  isSettingsDirty(),
                )
              ) {
                setSettings(canonical.room);
              }
              if (canonical.room.visibility === 'public') {
                markSettingsClean();
                setOpen(false);
                setError(null);
                void replaceRoomThumbnail(client, canonical.room).catch(() => {
                  console.warn('Public room thumbnail publication failed.');
                });
                return;
              }
            } catch {
              // Keep the safe publication error below if reconciliation is
              // temporarily unavailable.
            }
            if (isMounted()) {
              setError(multiplayerError(requestError).message);
            }
          } finally {
            finishPublishing();
          }
        })();
      }}
    />
  );
}

export default RoomPublicationController;
