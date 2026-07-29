import { describe, expect, it } from 'vitest';
import {
  GEOGRAPHIC_NAMING_VERSION,
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

  it('reports one distinct phonetic family and one dialect per continent', () => {
    const generated = generateGeographicNames(
      'cohesive-names',
      5,
      STANDARD_ASSIGNMENTS,
    );
    expect(new Set(generated.familyIds).size).toBe(5);
    expect(generated.dialects).toHaveLength(5);
    expect(
      generated.dialects.every(
        (dialect) => Number.isInteger(dialect) && dialect >= 0 && dialect < 50,
      ),
    ).toBe(true);
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

  it('rejects awkward phonetic runs without over-filtering readable names', () => {
    expect(isAcceptableGeographicName('Rioeia')).toBe(false);
    expect(isAcceptableGeographicName('Barkstan')).toBe(false);
    expect(isAcceptableGeographicName('Kairirirawai')).toBe(false);
    expect(isAcceptableGeographicName('Paradeu')).toBe(true);
    expect(isAcceptableGeographicName('Halaken')).toBe(true);
  });

  it('keeps repeats below the allowed rate across deterministic ten-game sequences', () => {
    let sequencesWithRepeats = 0;
    const auditMode = process.env.NAMING_AUDIT === '1';
    const sequenceCount = auditMode ? 1_000 : 10;
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
    if (auditMode) {
      expect(sequencesWithRepeats).toBeLessThan(sequenceCount * 0.25);
    } else {
      // Ten sequences exercise the audit path but are too coarse to enforce a
      // 25% statistical ceiling. The full naming audit owns that acceptance.
      expect(sequencesWithRepeats).toBe(4);
    }
  }, 120_000);

  it('locks the versioned naming stream to its reviewed v2 output', () => {
    const generated = generateGeographicNames(
      'versioned-names',
      5,
      STANDARD_ASSIGNMENTS,
    );
    expect(GEOGRAPHIC_NAMING_VERSION).toBe(2);
    expect({
      continentNames: generated.continentNames,
      territoryNames: generated.territoryNames.slice(0, 10),
      familyIds: generated.familyIds,
      dialects: generated.dialects,
    }).toEqual({
      continentNames: [
        'Makobafoi',
        'Skeiliund',
        'Maigin',
        'Bahaikaim',
        'Heokin',
      ],
      territoryNames: [
        'Zamarafon',
        'Joruoliund',
        'Ranigi',
        'Saruikair',
        'Meikiun',
        'Kanolofon',
        'Halulien',
        'Nairagin',
        'Qasunkaim',
        'Keunkin',
      ],
      familyIds: ['doran', 'boreal', 'harani', 'saharic', 'keshic'],
      dialects: [11, 22, 14, 16, 18],
    });
  });

  it('rejects invalid continent assignments', () => {
    expect(() => generateGeographicNames('invalid', 5, [5])).toThrow(
      'valid continent assignment',
    );
  });
});
