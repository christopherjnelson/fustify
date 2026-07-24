import { describe, expect, it } from 'vitest';
import { createMultiplayerPlayerConfigs } from './multiplayerPlayerConfig';

describe('multiplayer player configuration', () => {
  it('preserves sparse seat colors while retaining dense turn order and stable IDs', () => {
    expect(
      createMultiplayerPlayerConfigs([
        {
          seatIndex: 3,
          playerId: 'player-01',
          displayName: 'First claimant',
        },
        {
          seatIndex: 0,
          playerId: 'player-02',
          displayName: 'Second claimant',
        },
      ]),
    ).toEqual([
      {
        id: 'player-01',
        name: 'First claimant',
        colorId: 'color-4',
        seatIndex: 0,
        controllerType: 'local-human',
      },
      {
        id: 'player-02',
        name: 'Second claimant',
        colorId: 'color-1',
        seatIndex: 1,
        controllerType: 'local-human',
      },
    ]);
  });
});
