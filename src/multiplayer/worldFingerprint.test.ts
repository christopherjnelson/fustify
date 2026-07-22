import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import { worldFingerprint } from './worldFingerprint';

describe('multiplayer world fingerprint', () => {
  it('is stable for the same corrected deterministic world', () => {
    const options = { territoryCount: 42, continentCount: 5, playerCount: 4 };
    expect(worldFingerprint(generatePlanet('shared-preview', options))).toBe(
      worldFingerprint(generatePlanet('shared-preview', options)),
    );
  });

  it('changes when immutable setup changes', () => {
    expect(
      worldFingerprint(generatePlanet('shared-preview', { continentCount: 5 })),
    ).not.toBe(
      worldFingerprint(
        generatePlanet('another-preview', { continentCount: 5 }),
      ),
    );
  });
});
