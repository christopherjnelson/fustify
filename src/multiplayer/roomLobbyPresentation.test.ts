import { describe, expect, it } from 'vitest';
import type { Room } from './multiplayerApi';
import {
  isMatchLaunchPending,
  roomLobbyPresentation,
  shouldReplaceRoomSettingsDraft,
} from './roomLobbyPresentation';

const hostId = '10000000-0000-4000-8000-000000000001';
const guestId = '20000000-0000-4000-8000-000000000002';
const room = {
  id: '30000000-0000-4000-8000-000000000003',
  host_user_id: hostId,
  join_code: 'ABCD1234',
  status: 'waiting',
  visibility: 'private',
} as Room;

describe('room lobby publication presentation', () => {
  it('shows canonical match launch work to hosts and other room members', () => {
    const active = { ...room, status: 'active' };

    expect(isMatchLaunchPending(room, null, true)).toBe(true);
    expect(isMatchLaunchPending(active, null, false)).toBe(true);
    expect(
      isMatchLaunchPending(
        active,
        {
          id: '40000000-0000-4000-8000-000000000004',
          room_id: room.id,
          status: 'active',
          revision: 0,
        },
        false,
      ),
    ).toBe(false);
    expect(isMatchLaunchPending(room, null, false)).toBe(false);
  });

  it('keeps private host settings editable and exposes only the private code', () => {
    expect(roomLobbyPresentation(room, hostId)).toMatchObject({
      host: true,
      waiting: true,
      published: false,
      settingsEditable: true,
      canPublish: true,
      join: { kind: 'private-code', value: 'ABCD1234' },
    });
  });

  it('keeps private guests read-only without host publication controls', () => {
    expect(roomLobbyPresentation(room, guestId)).toMatchObject({
      host: false,
      settingsEditable: false,
      canPublish: false,
      join: { kind: 'private-code', value: 'ABCD1234' },
    });
  });

  it('renders every published lobby read-only with only the canonical direct URL', () => {
    const published = roomLobbyPresentation(
      { ...room, visibility: 'public', join_code: null },
      hostId,
    );

    expect(published).toMatchObject({
      published: true,
      settingsEditable: false,
      canPublish: false,
      join: {
        kind: 'public-link',
        value:
          'https://dev.fustify.com/multiplayer/room/30000000-0000-4000-8000-000000000003',
      },
    });
    expect(JSON.stringify(published.join)).not.toContain('ABCD1234');
  });

  it('cannot restore an editable stale draft after authoritative publication', () => {
    expect(
      shouldReplaceRoomSettingsDraft(
        { ...room, visibility: 'public', join_code: null },
        true,
      ),
    ).toBe(true);
    expect(shouldReplaceRoomSettingsDraft(room, true)).toBe(false);
    expect(shouldReplaceRoomSettingsDraft(room, false)).toBe(true);
  });
});
