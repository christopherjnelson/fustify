import {
  playerColorForSeat,
  type LocalPlayerConfig,
} from '../core/setup/playerConfig.ts';

export interface MultiplayerPlayerSeat {
  seatIndex: number;
  playerId: string;
  displayName: string;
}

export function createMultiplayerPlayerConfigs(
  seats: MultiplayerPlayerSeat[],
): LocalPlayerConfig[] {
  return seats.map((seat, turnIndex) => ({
    id: seat.playerId,
    name: seat.displayName,
    colorId: playerColorForSeat(seat.seatIndex).id,
    seatIndex: turnIndex,
    controllerType: 'local-human',
  }));
}
