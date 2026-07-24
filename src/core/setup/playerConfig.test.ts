import { describe, expect, it } from 'vitest';
import {
  createDefaultPlayerConfigs,
  normalizePlayerName,
  playerColorForSeat,
  validatePlayerConfigs,
} from './playerConfig';

describe('local player configuration', () => {
  it('maps seat identity to the existing palette', () => {
    expect(
      [0, 1, 2, 3, 4].map((seatIndex) => {
        const color = playerColorForSeat(seatIndex);
        return [color.id, color.label];
      }),
    ).toEqual([
      ['color-1', 'Crimson'],
      ['color-2', 'Azure'],
      ['color-3', 'Gold'],
      ['color-4', 'Verdant'],
      ['color-5', 'Violet'],
    ]);
  });

  it('creates the requested number in explicit seat order', () => {
    const players = createDefaultPlayerConfigs(6);
    expect(players).toHaveLength(6);
    expect(players.map((player) => player.seatIndex)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(validatePlayerConfigs(players)).toEqual([]);
    expect(players.map((player) => player.controllerType)).toEqual([
      'local-human',
      'heuristic-bot',
      'heuristic-bot',
      'heuristic-bot',
      'heuristic-bot',
      'heuristic-bot',
    ]);
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
