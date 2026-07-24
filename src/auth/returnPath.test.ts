import { describe, expect, it } from 'vitest';
import { validatedReturnPath } from './returnPath';

describe('authentication return paths', () => {
  it.each([
    '/',
    '/local',
    '/multiplayer',
    '/multiplayer/room/room-id?tab=players',
    '/multiplayer/match/match-id#activity',
  ])('accepts application path %s', (path) => {
    expect(validatedReturnPath(path)).toBe(path);
  });

  it.each([
    'https://attacker.example/',
    '//attacker.example/',
    'javascript:alert(1)',
    '/multiplayer/room/',
    '/auth/callback',
    '/unknown',
    '/\\attacker.example',
    '/multiplayer/room/%',
    '/multiplayer/room/%5Cattacker.example',
    '/multiplayer/room/room%0Aid',
  ])('rejects unsafe return path %s', (path) => {
    expect(validatedReturnPath(path)).toBe('/');
  });
});
