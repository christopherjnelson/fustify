import { describe, expect, it } from 'vitest';
import {
  parseGameAction,
  sha256Fingerprint,
  stableStringify,
} from './gameProtocol';

describe('authoritative multiplayer protocol', () => {
  it('canonicalizes object key order before hashing state', async () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    await expect(sha256Fingerprint({ b: 2, a: 1 })).resolves.toBe(
      await sha256Fingerprint({ a: 1, b: 2 }),
    );
  });

  it('accepts only reducer commands and rejects client combat results', () => {
    expect(
      parseGameAction({
        type: 'ATTACK',
        fromTerritoryId: 'territory-1',
        toTerritoryId: 'territory-2',
        attackDice: 3,
      }),
    ).toEqual({
      type: 'ATTACK',
      fromTerritoryId: 'territory-1',
      toTerritoryId: 'territory-2',
      attackDice: 3,
    });
    expect(() =>
      parseGameAction({
        type: 'ATTACK',
        fromTerritoryId: 'territory-1',
        toTerritoryId: 'territory-2',
        attackDice: 3,
        attackerRolls: [6, 6, 6],
      }),
    ).toThrow('invalid_action');
  });

  it('accepts arbitrary whole-number reinforcement amounts and rejects fractions', () => {
    expect(
      parseGameAction({
        type: 'PLACE_REINFORCEMENT',
        territoryId: 'territory-1',
        amount: 8,
      }),
    ).toEqual({
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'territory-1',
      amount: 8,
    });
    expect(() =>
      parseGameAction({
        type: 'PLACE_REINFORCEMENT',
        territoryId: 'territory-1',
        amount: 1.5,
      }),
    ).toThrow('invalid_action');
  });
});
