import { describe, expect, it } from 'vitest';
import { createMatch } from '../game/createMatch';
import { GENERATOR_VERSION } from '../generation/constants';
import { generatePlanet } from '../generation/generatePlanet';
import { createDefaultPlayerConfigs } from '../setup/playerConfig';
import {
  createMatchSetup,
  createNeutralMatchSetup,
} from '../setup/startingPositions';
import {
  beginTerritoryAssignment,
  pickDraftTerritory,
} from '../setup/territoryAssignment';
import { DEFAULT_WORLD_SETUP } from '../setup/worldSetup';
import {
  parseLocalMatchSave,
  SAVE_SCHEMA_VERSION,
  serializeLocalMatchSave,
  type LocalMatchSave,
} from './saveGame';

const planet = generatePlanet(DEFAULT_WORLD_SETUP.seed, {
  territoryCount: DEFAULT_WORLD_SETUP.territoryCount,
  continentCount: DEFAULT_WORLD_SETUP.continentCount,
  playerCount: DEFAULT_WORLD_SETUP.playerCount,
});
const players = createDefaultPlayerConfigs(4);
const setup = createMatchSetup(planet, players);
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

  it('restores exact match state and rebuilds derived balance analysis', () => {
    const raw = structuredClone(save);
    if (raw.matchSetup.setupPhase !== 'ready')
      throw new Error('Expected ready setup.');
    raw.matchSetup.startingPosition.analysis.overallScore = 0;
    const result = parseLocalMatchSave(serializeLocalMatchSave(raw));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.matchState).toEqual(match);
      expect(result.save.matchSetup.setupPhase).toBe('ready');
      if (result.save.matchSetup.setupPhase === 'ready') {
        expect(result.save.matchSetup.startingPosition.analysis).toEqual(
          setup.startingPosition.analysis,
        );
      }
    }
  });

  it('preserves a pending capture', () => {
    const pendingSave: LocalMatchSave = {
      ...save,
      matchState: {
        ...match,
        phase: 'capture',
        pendingCapture: {
          fromTerritoryId: planet.territories[0]!.id,
          toTerritoryId: planet.territories[1]!.id,
          minimumArmies: 1,
        },
      },
    };
    const result = parseLocalMatchSave(JSON.stringify(pendingSave));
    expect(result.ok ? result.save.matchState?.pendingCapture : null).toEqual(
      pendingSave.matchState?.pendingCapture,
    );
  });

  it('saves and restores a neutral preview with no match ownership', () => {
    const neutral = createNeutralMatchSetup(players, 'player-draft');
    const neutralSave: LocalMatchSave = {
      ...save,
      worldSetup: {
        ...DEFAULT_WORLD_SETUP,
        assignmentMode: 'player-draft',
      },
      matchSetup: neutral,
      matchState: null,
      applicationMode: 'pregame',
    };
    const result = parseLocalMatchSave(JSON.stringify(neutralSave));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.matchState).toBeNull();
      expect(result.save.matchSetup.setupPhase).toBe('neutral-preview');
      expect(result.save.matchSetup.assignmentMode).toBe('player-draft');
    }
  });

  it('saves and restores an in-progress player draft', () => {
    const neutral = createNeutralMatchSetup(players, 'player-draft');
    const begun = beginTerritoryAssignment(planet, neutral);
    expect(begun.setupPhase).toBe('assignment-in-progress');
    if (begun.setupPhase !== 'assignment-in-progress') return;
    const picked = pickDraftTerritory(planet, begun, planet.territories[0]!.id);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    const draftSave: LocalMatchSave = {
      ...save,
      worldSetup: {
        ...DEFAULT_WORLD_SETUP,
        assignmentMode: 'player-draft',
      },
      matchSetup: picked.setup,
      matchState: null,
      applicationMode: 'pregame',
    };
    const result = parseLocalMatchSave(JSON.stringify(draftSave));
    expect(result.ok).toBe(true);
    if (
      result.ok &&
      result.save.matchSetup.setupPhase === 'assignment-in-progress'
    ) {
      expect(result.save.matchSetup.draft.pickIndex).toBe(1);
      expect(result.save.matchSetup.draft.territoryOwners).toEqual(
        picked.setup.draft?.territoryOwners,
      );
    }
    const tampered = structuredClone(draftSave);
    if (tampered.matchSetup.setupPhase === 'assignment-in-progress') {
      tampered.matchSetup.draft.territoryOwners[planet.territories[1]!.id] =
        players[0]!.id;
      tampered.matchSetup.draft.pickIndex = 2;
      expect(parseLocalMatchSave(JSON.stringify(tampered)).ok).toBe(false);
    }
  });

  it('rejects malformed, inconsistent, and future saves safely', () => {
    expect(parseLocalMatchSave('{oops').ok).toBe(false);
    expect(
      parseLocalMatchSave(JSON.stringify({ ...save, schemaVersion: 999 })).ok,
    ).toBe(false);
    expect(
      parseLocalMatchSave(
        JSON.stringify({
          ...save,
          matchState: null,
          applicationMode: 'playing',
        }),
      ).ok,
    ).toBe(false);
  });

  it.each([0, 1, 2, 3] as const)(
    'migrates supported version %s to random ready setup',
    (schemaVersion) => {
      const old = structuredClone(save) as unknown as Record<string, unknown>;
      old.schemaVersion = schemaVersion;
      if (schemaVersion === 0) delete old.savedAt;
      const oldWorld = old.worldSetup as Record<string, unknown>;
      if (schemaVersion < 3) delete oldWorld.assignmentMode;
      const oldSetup = old.matchSetup as Record<string, unknown>;
      const oldPlayers = oldSetup.players as Array<Record<string, unknown>>;
      oldPlayers.forEach((player) => delete player.controllerType);
      if (schemaVersion < 3) {
        delete oldSetup.assignmentMode;
        delete oldSetup.setupPhase;
        delete oldSetup.draft;
      }
      const result = parseLocalMatchSave(JSON.stringify(old));
      expect(result.ok && result.migrated).toBe(true);
      if (result.ok) {
        expect(result.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
        expect(result.save.matchSetup.assignmentMode).toBe('random');
        expect(result.save.matchSetup.setupPhase).toBe('ready');
        expect(
          result.save.matchSetup.players.every(
            (player) => player.controllerType === 'local-human',
          ),
        ).toBe(true);
      }
    },
  );

  it('contains data only and no rendering objects', () => {
    expect(() => structuredClone(save)).not.toThrow();
    expect(serializeLocalMatchSave(save)).not.toContain('Object3D');
  });
});
