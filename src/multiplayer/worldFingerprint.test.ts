import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import { worldFingerprint } from './worldFingerprint';
import {
  CURRENT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_VERSION,
} from '../core/generation/constants';

describe('multiplayer world fingerprint', () => {
  it('is stable for the same corrected deterministic world', () => {
    const options = { territoryCount: 42, continentCount: 5, playerCount: 4 };
    expect(worldFingerprint(generatePlanet('shared-preview', options))).toBe(
      worldFingerprint(generatePlanet('shared-preview', options)),
    );
  });

  it('treats generated names as cosmetic', () => {
    const planet = generatePlanet('cosmetic-name-fingerprint');
    const renamed = structuredClone(planet);
    renamed.continents[0]!.name = 'Renamed Continent';
    renamed.territories[0]!.name = 'Renamed Territory';
    expect(worldFingerprint(renamed)).toBe(worldFingerprint(planet));
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

  it('accounts for explicit v1 without changing its semantics', () => {
    const options = { territoryCount: 42, continentCount: 5, playerCount: 4 };
    const implicitNormalized = generatePlanet('versioned-fingerprint', options);
    const explicitCurrent = generatePlanet('versioned-fingerprint', {
      ...options,
      generatorVersion: CURRENT_GENERATOR_VERSION,
    });
    const normalized = generatePlanet('versioned-fingerprint', {
      ...options,
      generatorVersion: NORMALIZED_GENERATOR_VERSION,
    });
    expect(worldFingerprint(normalized)).toBe(
      worldFingerprint(implicitNormalized),
    );
    expect(worldFingerprint(explicitCurrent)).not.toBe(
      worldFingerprint(implicitNormalized),
    );
    expect(explicitCurrent.surfaceVertices).toBeUndefined();
    expect(normalized.surfaceVertices).toBeDefined();
  });
});
