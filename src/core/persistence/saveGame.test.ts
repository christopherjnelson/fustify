import { describe, expect, it } from 'vitest';
import { createMatch } from '../game/createMatch';
import { generatePlanet } from '../generation/generatePlanet';
import { GENERATOR_VERSION } from '../generation/constants';
import { createDefaultPlayerConfigs } from '../setup/playerConfig';
import { createMatchSetup } from '../setup/startingPositions';
import { DEFAULT_WORLD_SETUP } from '../setup/worldSetup';
import {
  parseLocalMatchSave,
  SAVE_SCHEMA_VERSION,
  serializeLocalMatchSave,
  type LocalMatchSave,
} from './saveGame';

const planet = generatePlanet(DEFAULT_WORLD_SETUP.seed);
const setup = createMatchSetup(planet, createDefaultPlayerConfigs(4));
const match = createMatch(planet, setup);
const save: LocalMatchSave = {
  schemaVersion: SAVE_SCHEMA_VERSION,
  savedAt: '2026-01-02T03:04:05.000Z',
  generatorVersion: GENERATOR_VERSION,
  worldSetup: { ...DEFAULT_WORLD_SETUP },
  matchSetup: setup,
  matchState: match,
  applicationMode: 'playing',
};

describe('local match persistence', () => {
  it('serializes identical semantic state deterministically', () => {
    expect(serializeLocalMatchSave(save)).toBe(serializeLocalMatchSave(save));
  });

  it('restores exact match state including RNG, events, and reinforcements', () => {
    const result = parseLocalMatchSave(serializeLocalMatchSave(save));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.matchState).toEqual(match);
      expect(result.save.matchState.combatSequence).toBe(match.combatSequence);
      expect(result.save.matchState.remainingReinforcements).toBe(
        match.remainingReinforcements,
      );
      expect(result.save.matchState.events).toEqual(match.events);
    }
  });

  it('preserves a pending capture', () => {
    const pendingSave = {
      ...save,
      matchState: {
        ...match,
        phase: 'capture' as const,
        pendingCapture: {
          fromTerritoryId: planet.territories[0]!.id,
          toTerritoryId: planet.territories[1]!.id,
          minimumArmies: 1,
        },
      },
    };
    const result = parseLocalMatchSave(JSON.stringify(pendingSave));
    expect(result.ok && result.save.matchState.pendingCapture).toEqual(
      pendingSave.matchState.pendingCapture,
    );
  });

  it('rejects malformed and future saves safely', () => {
    expect(parseLocalMatchSave('{oops').ok).toBe(false);
    expect(
      parseLocalMatchSave(JSON.stringify({ ...save, schemaVersion: 999 })).ok,
    ).toBe(false);
  });

  it('migrates the explicitly supported version zero', () => {
    const old = { ...save, schemaVersion: 0 };
    delete (old as Partial<LocalMatchSave>).savedAt;
    const result = parseLocalMatchSave(JSON.stringify(old));
    expect(result.ok && result.migrated).toBe(true);
    if (result.ok) expect(result.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('contains data only and no rendering objects', () => {
    expect(() => structuredClone(save)).not.toThrow();
    expect(serializeLocalMatchSave(save)).not.toContain('Object3D');
  });
});
