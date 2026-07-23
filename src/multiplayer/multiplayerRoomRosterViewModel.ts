import { PLAYER_COLORS, type PlayerColor } from '../core/setup/playerConfig';
import type { RoomMember, RoomSeat } from './multiplayerApi';

export interface MultiplayerSeatDisplay {
  seatIndex: number;
  occupantUserId: string | null;
  occupantName: string | null;
  isHost: boolean;
  isYou: boolean;
  color: PlayerColor;
}

export interface MultiplayerRosterDisplay {
  seats: MultiplayerSeatDisplay[];
  unseatedMembers: Array<{
    userId: string;
    displayName: string;
    isHost: boolean;
    isYou: boolean;
  }>;
}

type SeatIdentity = Pick<
  RoomSeat,
  'seat_index' | 'occupant_user_id' | 'controller_type'
>;
type MemberIdentity = Pick<RoomMember, 'user_id' | 'display_name' | 'role'>;

/**
 * Match initialization compacts claimed seats into player order after sorting
 * by seat index. Claimed rows therefore receive colors first in that exact
 * order. Remaining colors are shown on open rows in seat order.
 */
export function buildMultiplayerRosterDisplay(
  seats: SeatIdentity[],
  members: MemberIdentity[],
  userId: string,
): MultiplayerRosterDisplay {
  const orderedSeats = seats
    .slice()
    .sort((a, b) => a.seat_index - b.seat_index);
  const colorOrder = [
    ...orderedSeats.filter((seat) => seat.occupant_user_id !== null),
    ...orderedSeats.filter((seat) => seat.occupant_user_id === null),
  ];
  const colorBySeat = new Map(
    colorOrder.map((seat, index) => [seat.seat_index, PLAYER_COLORS[index]!]),
  );
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const seatedMemberIds = new Set(
    orderedSeats.flatMap((seat) =>
      seat.occupant_user_id ? [seat.occupant_user_id] : [],
    ),
  );

  return {
    seats: orderedSeats.map((seat) => {
      const occupant = seat.occupant_user_id
        ? memberById.get(seat.occupant_user_id)
        : undefined;
      return {
        seatIndex: seat.seat_index,
        occupantUserId: seat.occupant_user_id,
        occupantName:
          occupant?.display_name ??
          (seat.occupant_user_id ? 'Claimed player' : null),
        isHost: occupant?.role === 'host',
        isYou: seat.occupant_user_id === userId,
        color: colorBySeat.get(seat.seat_index)!,
      };
    }),
    unseatedMembers: members
      .filter((member) => !seatedMemberIds.has(member.user_id))
      .map((member) => ({
        userId: member.user_id,
        displayName: member.display_name,
        isHost: member.role === 'host',
        isYou: member.user_id === userId,
      })),
  };
}
