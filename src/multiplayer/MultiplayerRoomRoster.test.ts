import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MultiplayerRoomRoster } from './MultiplayerRoomRoster';
import { buildMultiplayerRosterDisplay } from './multiplayerRoomRosterViewModel';

const hostId = '00000000-0000-4000-8000-000000000001';
const playerId = '00000000-0000-4000-8000-000000000002';
const observerId = '00000000-0000-4000-8000-000000000003';

const members = [
  {
    user_id: hostId,
    display_name: 'redwurm',
    role: 'host',
  },
  {
    user_id: playerId,
    display_name: 'Alex',
    role: 'player',
  },
  {
    user_id: observerId,
    display_name: 'Morgan',
    role: 'player',
  },
];

const seats = Array.from({ length: 5 }, (_, seat_index) => ({
  seat_index,
  occupant_user_id:
    seat_index === 0 ? hostId : seat_index === 3 ? playerId : null,
  controller_type: 'human',
}));

describe('multiplayer room roster presentation', () => {
  it('uses authoritative claimed-player order for deterministic colors', () => {
    const roster = buildMultiplayerRosterDisplay(seats, members, hostId);

    expect(
      roster.seats.map((seat) => [
        seat.seatIndex,
        seat.color.label,
        seat.occupantName,
      ]),
    ).toEqual([
      [0, 'Crimson', 'redwurm'],
      [1, 'Gold', null],
      [2, 'Verdant', null],
      [3, 'Azure', 'Alex'],
      [4, 'Violet', null],
    ]);
  });

  it('maps claimed members into rows and retains only genuinely unseated members', () => {
    const roster = buildMultiplayerRosterDisplay(seats, members, hostId);

    expect(roster.seats[0]).toMatchObject({
      occupantName: 'redwurm',
      isHost: true,
      isYou: true,
    });
    expect(roster.seats[3]).toMatchObject({
      occupantName: 'Alex',
      isHost: false,
      isYou: false,
    });
    expect(roster.unseatedMembers).toEqual([
      {
        userId: observerId,
        displayName: 'Morgan',
        isHost: false,
        isYou: false,
      },
    ]);
  });

  it('renders open and claimed states with labeled actions and text badges', () => {
    const roster = buildMultiplayerRosterDisplay(seats, members, hostId);
    const markup = renderToStaticMarkup(
      createElement(MultiplayerRoomRoster, {
        roster,
        busy: false,
        waiting: true,
        ownSeatIndex: 0,
        onClaim: vi.fn(),
        onRelease: vi.fn(),
      }),
    );
    const unseatedMarkup = markup.slice(markup.indexOf('setup-unseated'));

    expect(markup).toContain('Seat 1, Crimson, redwurm');
    expect(markup).toContain('Claimed seat');
    expect(markup).toContain('>Host<');
    expect(markup).toContain('>You<');
    expect(markup).toContain('Seat 2, Gold, Open');
    expect(markup).toContain('Available to claim');
    expect(markup).toContain('aria-label="Claim Seat 2"');
    expect(markup).toContain('aria-label="Release Seat 1"');
    expect(unseatedMarkup).toContain('In room without a seat');
    expect(unseatedMarkup).toContain('Morgan');
    expect(unseatedMarkup).not.toContain('redwurm');
    expect(unseatedMarkup).not.toContain('Alex');
  });
});
