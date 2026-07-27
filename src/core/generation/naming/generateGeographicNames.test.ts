import { describe, expect, it } from 'vitest';
import {
  generateGeographicNames,
  isAcceptableGeographicName,
} from './generateGeographicNames.ts';

const STANDARD_ASSIGNMENTS = Array.from(
  { length: 42 },
  (_, territoryIndex) => territoryIndex % 5,
);

describe('generateGeographicNames', () => {
  it('is deterministic while varying by seed', () => {
    const first = generateGeographicNames(
      'repeatable-names',
      5,
      STANDARD_ASSIGNMENTS,
    );
    expect(first).toEqual(
      generateGeographicNames('repeatable-names', 5, STANDARD_ASSIGNMENTS),
    );
    expect(first.territoryNames).not.toEqual(
      generateGeographicNames('another-world', 5, STANDARD_ASSIGNMENTS)
        .territoryNames,
    );
  });

  it('uses one distinct phonetic family and dialect per continent', () => {
    const generated = generateGeographicNames(
      'cohesive-names',
      5,
      STANDARD_ASSIGNMENTS,
    );
    expect(new Set(generated.familyIds).size).toBe(5);
    expect(generated.dialects).toHaveLength(5);
  });

  it('produces safe unique readable names for a standard world', () => {
    const generated = generateGeographicNames(
      'safe-names',
      5,
      STANDARD_ASSIGNMENTS,
    );
    const allNames = [...generated.continentNames, ...generated.territoryNames];
    expect(new Set(allNames.map((name) => name.toLowerCase())).size).toBe(
      allNames.length,
    );
    for (const name of allNames) {
      expect(name).toMatch(/^[A-Z][a-z]{3,11}$/);
      expect(isAcceptableGeographicName(name)).toBe(true);
    }
  });

  it('rejects source names, close copies, duplicates, and unsafe fragments', () => {
    expect(isAcceptableGeographicName('Poland')).toBe(false);
    expect(isAcceptableGeographicName('Boland')).toBe(false);
    expect(isAcceptableGeographicName('Shitaria')).toBe(false);
    expect(isAcceptableGeographicName('Myria', new Set(['myria']))).toBe(false);
  });

  it('keeps repeats rare across deterministic ten-game sequences', () => {
    let sequencesWithRepeats = 0;
    const sequenceCount = process.env.NAMING_AUDIT === '1' ? 1_000 : 10;
    for (let sequence = 0; sequence < sequenceCount; sequence += 1) {
      const seen = new Set<string>();
      let repeated = false;
      for (let game = 0; game < 10; game += 1) {
        const generated = generateGeographicNames(
          `name-audit-${sequence}-${game}`,
          5,
          STANDARD_ASSIGNMENTS,
        );
        for (const name of generated.territoryNames) {
          const key = name.toLowerCase();
          if (seen.has(key)) repeated = true;
          seen.add(key);
        }
      }
      if (repeated) sequencesWithRepeats += 1;
    }
    expect(sequencesWithRepeats).toBeLessThan(sequenceCount * 0.01);
  }, 120_000);

  it('rejects invalid continent assignments', () => {
    expect(() => generateGeographicNames('invalid', 5, [5])).toThrow(
      'valid continent assignment',
    );
  });
});
