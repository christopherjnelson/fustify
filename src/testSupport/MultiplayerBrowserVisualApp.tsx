import { useState } from 'react';
import { BrandedAppShell } from '../brand/BrandedAppShell';
import type { UserProfile } from '../auth/profileModel';
import {
  MultiplayerBrowser,
  type MultiplayerBrowserServices,
} from '../multiplayer/MultiplayerBrowser';
import { MultiplayerRoomRoster } from '../multiplayer/MultiplayerRoomRoster';
import { buildMultiplayerRosterDisplay } from '../multiplayer/multiplayerRoomRosterViewModel';
import type { PublicRoom, Room } from '../multiplayer/multiplayerApi';
import { WaitingRoomExitDialog } from '../multiplayer/WaitingRoomExitDialog';
import { GameSetupShell } from '../components/setup/GameSetup';

const parameters = new URLSearchParams(window.location.search);
const state = parameters.get('browser-state') ?? 'populated';
const joinFailure = parameters.get('join-failure') === '1';
const thumbnailFailure = parameters.get('thumbnail-failure') === '1';

const fixtureEvents: {
  createInputs: Array<{
    name: string;
    maxSeats: number;
  }>;
  navigations: string[];
  listCalls: number;
} = {
  createInputs: [],
  navigations: [],
  listCalls: 0,
};

(
  window as typeof window & {
    __FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?: typeof fixtureEvents;
  }
).__FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__ = fixtureEvents;

const profile: UserProfile = {
  userId: '10000000-0000-4000-8000-000000000001',
  displayName: 'Visual Host',
  avatarUrl: null,
  onboardingCompleted: true,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
};

const publicRooms: PublicRoom[] = [
  {
    room_id: '20000000-0000-4000-8000-000000000001',
    room_name: 'Atlas Prime',
    host_display_name: 'NovaCommander',
    host_avatar_url: null,
    current_players: 3,
    maximum_players: 5,
    room_state: 'waiting',
    room_seed: 'atlas-prime-271',
    territory_count: 42,
    continent_count: 5,
    assignment_mode: 'random',
    thumbnail_path: 'atlas/world.webp',
    thumbnail_version: 2,
    players: [
      { displayName: 'NovaCommander', avatarUrl: null },
      { displayName: 'MistyRaven-214', avatarUrl: null },
      { displayName: 'VerdantFox-713', avatarUrl: null },
    ],
    created_at: '2026-07-25T12:00:00.000Z',
  },
  {
    room_id: '20000000-0000-4000-8000-000000000002',
    room_name: 'Verdant Reach',
    host_display_name: 'Greenline',
    host_avatar_url: null,
    current_players: 2,
    maximum_players: 4,
    room_state: 'waiting',
    room_seed: 'verdant-reach-481',
    territory_count: 36,
    continent_count: 4,
    assignment_mode: 'random',
    thumbnail_path: 'verdant/world.webp',
    thumbnail_version: 4,
    players: [
      { displayName: 'Greenline', avatarUrl: null },
      { displayName: 'CopperOtter-481', avatarUrl: null },
    ],
    created_at: '2026-07-25T11:00:00.000Z',
  },
  {
    room_id: '20000000-0000-4000-8000-000000000003',
    room_name: 'Frosthold',
    host_display_name: 'IceWarden',
    host_avatar_url: null,
    current_players: 3,
    maximum_players: 3,
    room_state: 'full',
    room_seed: 'frosthold-312',
    territory_count: 24,
    continent_count: 3,
    assignment_mode: 'random',
    thumbnail_path: null,
    thumbnail_version: 0,
    players: [
      { displayName: 'IceWarden', avatarUrl: null },
      { displayName: 'SilverCrane-312', avatarUrl: null },
      { displayName: 'CalmLynx-882', avatarUrl: null },
    ],
    created_at: '2026-07-25T10:00:00.000Z',
  },
];

const roomResult: Room = {
  assignment_mode: 'random',
  continent_count: 5,
  created_at: '2026-07-25T12:00:00.000Z',
  generator_version: 2,
  host_user_id: profile.userId,
  id: '30000000-0000-4000-8000-000000000001',
  join_code: 'ABCD1234',
  max_seats: 5,
  name: 'Visual Host’s Game',
  revision: 0,
  seed: 'visual-browser-room',
  status: 'waiting',
  territory_count: 42,
  thumbnail_path: null,
  thumbnail_version: 0,
  updated_at: '2026-07-25T12:00:00.000Z',
  visibility: 'private',
};

function thumbnailData(path: string): string {
  const cold = path.includes('atlas');
  const land = cold ? '#7ca86f' : '#b98152';
  const landTwo = cold ? '#d2c582' : '#667e99';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><radialGradient id="g"><stop stop-color="#244760"/><stop offset="1" stop-color="#071019"/></radialGradient></defs><rect width="640" height="360" fill="#070b10"/><circle cx="320" cy="180" r="145" fill="url(#g)" stroke="#7890a0" stroke-opacity=".42"/><path d="M213 90 282 66l43 31 59-2 46 52-27 35-60 8-31 62-63-22-47-58 28-38Z" fill="${land}" stroke="#cad6dd" stroke-opacity=".28"/><path d="m352 210 52-12 41 38-22 60-61 27-34-57Z" fill="${landTwo}" stroke="#cad6dd" stroke-opacity=".28"/><g fill="none" stroke="#b8d6e3" stroke-opacity=".26"><ellipse cx="320" cy="180" rx="65" ry="145"/><path d="M175 180h290M199 120h242M199 240h242"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const services: MultiplayerBrowserServices = {
  createGame: async ({ name, maxSeats }) => {
    fixtureEvents.createInputs.push({ name, maxSeats });
    return {
      ...roomResult,
      name,
      max_seats: maxSeats,
    };
  },
  joinWithCode: async () => roomResult,
  joinPublicGame: async () => {
    if (joinFailure) {
      throw new Error(
        'That public game is no longer available. Choose another game.',
      );
    }
    return roomResult;
  },
  listPublicGames: async () => {
    fixtureEvents.listCalls += 1;
    if (state === 'loading') {
      return new Promise<PublicRoom[]>(() => undefined);
    }
    if (state === 'error') throw new Error('fixture discovery error');
    return state === 'empty' ? [] : publicRooms;
  },
  thumbnailUrl: (path) =>
    thumbnailFailure ? 'data:image/webp;base64,broken' : thumbnailData(path),
  navigate: (path) => fixtureEvents.navigations.push(path),
};

function SeatRosterVisualFixture() {
  const [ownSeatIndex, setOwnSeatIndex] = useState<number | null>(null);
  const members = [
    {
      user_id: profile.userId,
      display_name: profile.displayName,
      role: 'host' as const,
    },
  ];
  const seats = Array.from({ length: 5 }, (_, seatIndex) => ({
    seat_index: seatIndex,
    occupant_user_id: seatIndex === ownSeatIndex ? profile.userId : null,
    controller_type: 'human' as const,
  }));

  return (
    <GameSetupShell
      eyebrow="Multiplayer"
      title="Multiplayer lobby"
      roster={
        <MultiplayerRoomRoster
          roster={buildMultiplayerRosterDisplay(seats, members, profile.userId)}
          busy={false}
          waiting
          ownSeatIndex={ownSeatIndex}
          onClaim={setOwnSeatIndex}
          onRelease={() => setOwnSeatIndex(null)}
        />
      }
    />
  );
}

export function MultiplayerBrowserVisualApp() {
  const parameters = new URLSearchParams(window.location.search);
  const exitDialog = parameters.get('exit-dialog');
  const remoteClosure = parameters.get('remote-closure');
  const closureNotice =
    remoteClosure === 'guest' ? 'The host closed this room.' : null;
  const [dialogOpen, setDialogOpen] = useState(Boolean(exitDialog));
  const [confirmations, setConfirmations] = useState(0);
  return (
    <BrandedAppShell
      accountControl={
        <aside className="account-control" aria-label="Account">
          <div className="account-summary">
            <span
              className="account-avatar account-avatar-fallback"
              aria-hidden="true"
            >
              VH
            </span>
            <span className="account-identity">
              <strong>Visual Host</strong>
            </span>
            <span className="account-actions">
              <button type="button">Sign out</button>
            </span>
          </div>
        </aside>
      }
    >
      {state === 'seat-roster' ? (
        <SeatRosterVisualFixture />
      ) : (
        <MultiplayerBrowser
          profile={profile}
          services={services}
          notice={closureNotice}
        />
      )}
      {dialogOpen && (
        <WaitingRoomExitDialog
          host={exitDialog === 'host'}
          busy={false}
          error={
            parameters.get('exit-error') === '1'
              ? 'The room could not be left. Try again.'
              : null
          }
          onCancel={() => setDialogOpen(false)}
          onConfirm={() => setConfirmations((value) => value + 1)}
        />
      )}
      <output hidden data-testid="exit-confirmations">
        {confirmations}
      </output>
    </BrandedAppShell>
  );
}
