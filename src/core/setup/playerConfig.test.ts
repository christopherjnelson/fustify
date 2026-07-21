import { describe, expect, it } from 'vitest';
import {
  createDefaultPlayerConfigs,
  normalizePlayerName,
  validatePlayerConfigs,
} from './playerConfig';

describe('local player configuration', () => {
  it('creates the requested number in explicit seat order', () => {
    const players = createDefaultPlayerConfigs(6);
    expect(players).toHaveLength(6);
    expect(players.map((player) => player.seatIndex)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(validatePlayerConfigs(players)).toEqual([]);
    expect(
      players.every((player) => player.controllerType === 'local-human'),
    ).toBe(true);
  });

  it('keeps stable IDs when a name changes', () => {
    const players = createDefaultPlayerConfigs(3);
    const ids = players.map((player) => player.id);
    players[1] = { ...players[1]!, name: 'New faction' };
    expect(players.map((player) => player.id)).toEqual(ids);
  });

  it('trims and collapses whitespace', () => {
    expect(normalizePlayerName('  Dawn   Keepers  ')).toBe('Dawn Keepers');
  });

  it('rejects blank and normalized duplicate names', () => {
    const players = createDefaultPlayerConfigs(3);
    players[0] = { ...players[0]!, name: ' ' };
    players[2] = {
      ...players[2]!,
      name: ` ${players[1]!.name.toUpperCase()} `,
    };
    expect(validatePlayerConfigs(players)).toEqual(
      expect.arrayContaining([
        'Every player needs a name.',
        'Player names must be unique.',
      ]),
    );
  });

  it('rejects duplicate colors', () => {
    const players = createDefaultPlayerConfigs(2);
    players[1] = { ...players[1]!, colorId: players[0]!.colorId };
    expect(validatePlayerConfigs(players)).toContain(
      'Player colors must be unique.',
    );
  });
});
