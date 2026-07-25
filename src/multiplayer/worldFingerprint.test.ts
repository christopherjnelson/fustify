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

  it('changes when immutable setup changes', () => {
    expect(
      worldFingerprint(generatePlanet('shared-preview', { continentCount: 5 })),
    ).not.toBe(
      worldFingerprint(
        generatePlanet('another-preview', { continentCount: 5 }),
      ),
    );
  });

  it('accounts for an explicit generator version without changing v1 semantics', () => {
    const options = { territoryCount: 42, continentCount: 5, playerCount: 4 };
    const implicitCurrent = generatePlanet('versioned-fingerprint', options);
    const explicitCurrent = generatePlanet('versioned-fingerprint', {
      ...options,
      generatorVersion: CURRENT_GENERATOR_VERSION,
    });
    const normalized = generatePlanet('versioned-fingerprint', {
      ...options,
      generatorVersion: NORMALIZED_GENERATOR_VERSION,
    });
    expect(worldFingerprint(explicitCurrent)).toBe(
      worldFingerprint(implicitCurrent),
    );
    expect(worldFingerprint(normalized)).not.toBe(
      worldFingerprint(implicitCurrent),
    );
    expect(normalized.surfaceVertices).toBeDefined();
  });
});
