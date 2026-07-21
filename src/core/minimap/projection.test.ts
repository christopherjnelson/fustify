import { describe, expect, it } from 'vitest';
import { createMatch } from '../game/createMatch';
import { generatePlanet } from '../generation/generatePlanet';
import {
  parseLocalMatchSave,
  SAVE_SCHEMA_VERSION,
  serializeLocalMatchSave,
} from '../persistence/saveGame';
import { createDefaultPlayerConfigs } from '../setup/playerConfig';
import {
  createMatchSetup,
  createNeutralMatchSetup,
} from '../setup/startingPositions';
import {
  beginTerritoryAssignment,
  cancelTerritoryAssignment,
  pickDraftTerritory,
} from '../setup/territoryAssignment';
import type { WorldSetup } from '../setup/worldSetup';
import { cameraDirectionToGlobeFocus } from '../../presentation/globeOrientation';
import {
  displayedTerritoryStates,
  minimapTerritoryStyles,
} from '../../presentation/territoryVisuals';
import {
  getProjectedWorldGeometry,
  projectGeographicPoint,
  projectWorldGeometry,
  splitPolygonAtAntimeridian,
  splitPolylineAtAntimeridian,
  vectorToGeographicPoint,
  wrapLongitude,
} from './projection';

const DEFAULT_SETUP: WorldSetup = {
  version: 1,
  seed: 'minimap-projection',
  territoryCount: 42,
  continentCount: 6,
  playerCount: 4,
  assignmentMode: 'random',
};

function assertSeamSafe(points: readonly { x: number; y: number }[]) {
  expect(points.every(({ x }) => x >= 0 && x <= 360)).toBe(true);
  expect(points.every(({ y }) => y >= 0 && y <= 180)).toBe(true);
  for (let index = 1; index < points.length; index += 1) {
    expect(
      Math.abs(points[index]!.x - points[index - 1]!.x),
    ).toBeLessThanOrEqual(180);
  }
}

describe('equirectangular minimap projection', () => {
  it('maps longitude horizontally and latitude vertically', () => {
    expect(projectGeographicPoint({ longitude: -180, latitude: 0 })).toEqual({
      x: 0,
      y: 90,
    });
    expect(projectGeographicPoint({ longitude: 0, latitude: 90 })).toEqual({
      x: 180,
      y: 0,
    });
    expect(projectGeographicPoint({ longitude: 180, latitude: -90 })).toEqual({
      x: 360,
      y: 180,
    });
  });

  it('converts canonical vectors, including polar points', () => {
    expect(vectorToGeographicPoint([1, 0, 0])).toEqual({
      longitude: 0,
      latitude: 0,
    });
    expect(vectorToGeographicPoint([0, 1, 0])).toEqual({
      longitude: 0,
      latitude: 90,
    });
    const polar = splitPolygonAtAntimeridian(
      [
        { longitude: -45, latitude: 88 },
        { longitude: 45, latitude: 90 },
        { longitude: 135, latitude: 88 },
      ],
      'polar-territory',
    );
    expect(polar).toHaveLength(1);
    expect(polar[0]!.points.some(({ y }) => y === 0)).toBe(true);
  });

  it('is deterministic and represents every canonical territory', () => {
    const planet = generatePlanet(DEFAULT_SETUP.seed, DEFAULT_SETUP);
    const first = projectWorldGeometry(planet);
    const second = projectWorldGeometry(structuredClone(planet));
    expect(second).toEqual(first);
    expect(first.territories.map(({ territoryId }) => territoryId)).toEqual(
      planet.territories.map(({ id }) => id),
    );
    expect(
      first.territories.every(({ fragments }) => fragments.length > 0),
    ).toBe(true);
    expect(
      first.territories.every(({ territoryId, fragments }) =>
        fragments.every((fragment) => fragment.territoryId === territoryId),
      ),
    ).toBe(true);
  });

  it('splits antimeridian territory polygons while preserving logical IDs', () => {
    const fragments = splitPolygonAtAntimeridian(
      [
        { longitude: 172, latitude: 18 },
        { longitude: -174, latitude: 13 },
        { longitude: -176, latitude: 30 },
      ],
      'territory-seam',
    );
    expect(fragments).toHaveLength(2);
    expect(
      fragments.every(({ territoryId }) => territoryId === 'territory-seam'),
    ).toBe(true);
    for (const fragment of fragments) {
      expect(
        Math.max(...fragment.points.map(({ x }) => x)) -
          Math.min(...fragment.points.map(({ x }) => x)),
      ).toBeLessThan(30);
    }
  });

  it('splits antimeridian boundaries and routes without full-width lines', () => {
    for (const points of [
      [
        { longitude: 176, latitude: 8 },
        { longitude: -178, latitude: 12 },
      ],
      [
        { longitude: -171, latitude: -30 },
        { longitude: 178, latitude: -28 },
        { longitude: 165, latitude: -20 },
      ],
    ]) {
      const fragments = splitPolylineAtAntimeridian(points);
      expect(fragments).toHaveLength(2);
      fragments.forEach(assertSeamSafe);
    }
  });

  it('handles generated worlds with and without land seam crossings', () => {
    const withoutSeam = generatePlanet('minimap-fixture-58');
    const withoutProjection = projectWorldGeometry(withoutSeam);
    const withoutLandCellCount = withoutSeam.surfaceCells.filter(
      ({ terrainType }) => terrainType === 'land',
    ).length;
    expect(
      withoutProjection.territories.reduce(
        (total, territory) => total + territory.fragments.length,
        0,
      ),
    ).toBe(withoutLandCellCount);
    expect(
      withoutProjection.routes.every(({ fragments }) => fragments.length === 1),
    ).toBe(true);

    const withSeam = generatePlanet('minimap-fixture-0');
    const withProjection = projectWorldGeometry(withSeam);
    const withLandCellCount = withSeam.surfaceCells.filter(
      ({ terrainType }) => terrainType === 'land',
    ).length;
    expect(
      withProjection.territories.reduce(
        (total, territory) => total + territory.fragments.length,
        0,
      ),
    ).toBeGreaterThan(withLandCellCount);
    expect(
      withProjection.routes.some(({ fragments }) => fragments.length > 1),
    ).toBe(true);
    for (const boundary of withProjection.boundaries) {
      assertSeamSafe(boundary.points);
      expect(
        boundary.territoryIds.every((territoryId) =>
          withSeam.territories.some(({ id }) => id === territoryId),
        ),
      ).toBe(true);
    }
    for (const route of withProjection.routes) {
      route.fragments.forEach(assertSeamSafe);
      expect(
        withSeam.territories.some(({ id }) => id === route.fromTerritoryId),
      ).toBe(true);
      expect(
        withSeam.territories.some(({ id }) => id === route.toTerritoryId),
      ).toBe(true);
    }
  });

  it('caches only canonical geometry identity and rebuilds for a new world', () => {
    const planet = generatePlanet('minimap-cache-a');
    expect(getProjectedWorldGeometry(planet)).toBe(
      getProjectedWorldGeometry(planet),
    );
    expect(
      getProjectedWorldGeometry(generatePlanet('minimap-cache-b')),
    ).not.toBe(getProjectedWorldGeometry(planet));
  });
});

describe('minimap canonical state styling and focus', () => {
  it('keeps neutral territories geographic and applies canonical ownership', () => {
    const planet = generatePlanet(DEFAULT_SETUP.seed, DEFAULT_SETUP);
    const players = createDefaultPlayerConfigs(4);
    const neutral = createNeutralMatchSetup(players, 'random');
    const neutralStyles = minimapTerritoryStyles(planet, neutral, null);
    expect(neutralStyles.every(({ ownerId }) => ownerId === null)).toBe(true);
    expect(Object.keys(displayedTerritoryStates(neutral, null))).toHaveLength(
      0,
    );

    const ready = createMatchSetup(planet, players, 0);
    const ownedStyles = minimapTerritoryStyles(planet, ready, null);
    expect(
      ownedStyles.every(
        ({ territoryId, ownerId }) =>
          ownerId === ready.startingPosition.territories[territoryId]!.ownerId,
      ),
    ).toBe(true);
  });

  it('updates ownership styles without reprojecting geometry', () => {
    const planet = generatePlanet('minimap-ownership-update');
    const players = createDefaultPlayerConfigs(4);
    const setup = createMatchSetup(planet, players, 0);
    const match = createMatch(planet, setup);
    const geometry = getProjectedWorldGeometry(planet);
    const territoryId = planet.territories[0]!.id;
    const previousOwner = match.territories[territoryId]!.ownerId;
    const nextOwner = players.find(({ id }) => id !== previousOwner)!.id;
    const updatedMatch = {
      ...match,
      territories: {
        ...match.territories,
        [territoryId]: {
          ...match.territories[territoryId]!,
          ownerId: nextOwner,
        },
      },
    };
    const before = minimapTerritoryStyles(planet, setup, match).find(
      ({ territoryId: id }) => id === territoryId,
    )!;
    const after = minimapTerritoryStyles(planet, setup, updatedMatch).find(
      ({ territoryId: id }) => id === territoryId,
    )!;
    expect(after.ownerId).toBe(nextOwner);
    expect(after.fill).not.toBe(before.fill);
    expect(getProjectedWorldGeometry(planet)).toBe(geometry);
  });

  it('immediately reflects draft picks and cancellation without new geography', () => {
    const planet = generatePlanet('minimap-draft-reset');
    const players = createDefaultPlayerConfigs(4);
    const neutral = createNeutralMatchSetup(players, 'player-draft');
    const drafting = beginTerritoryAssignment(planet, neutral);
    expect(drafting.setupPhase).toBe('assignment-in-progress');
    if (drafting.setupPhase !== 'assignment-in-progress') return;
    const territoryId = planet.territories[0]!.id;
    const picked = pickDraftTerritory(planet, drafting, territoryId);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(
      minimapTerritoryStyles(planet, picked.setup, null).find(
        ({ territoryId: id }) => id === territoryId,
      )!.ownerId,
    ).toBe(players[0]!.id);
    const canceled = cancelTerritoryAssignment(picked.setup);
    expect(
      minimapTerritoryStyles(planet, canceled, null).every(
        ({ ownerId }) => ownerId === null,
      ),
    ).toBe(true);
  });

  it('updates focus from globe orientation and wraps focus longitude', () => {
    const front = cameraDirectionToGlobeFocus([0, 0, 1]);
    const side = cameraDirectionToGlobeFocus([1, 0, 0]);
    expect(side.longitude).not.toBeCloseTo(front.longitude);
    expect(projectGeographicPoint(front).x).not.toBeCloseTo(
      projectGeographicPoint(side).x,
    );
    expect(wrapLongitude(181)).toBe(-179);
    expect(wrapLongitude(-541)).toBe(179);
    expect(wrapLongitude(720)).toBe(0);
  });

  it('derives identical projection after save/load without persisting projection state', () => {
    const planet = generatePlanet(DEFAULT_SETUP.seed, DEFAULT_SETUP);
    const players = createDefaultPlayerConfigs(4);
    const matchSetup = createMatchSetup(planet, players, 0);
    const serialized = serializeLocalMatchSave({
      schemaVersion: SAVE_SCHEMA_VERSION,
      savedAt: '2026-07-18T12:00:00.000Z',
      generatorVersion: planet.generatorVersion,
      worldSetup: DEFAULT_SETUP,
      matchSetup,
      matchState: null,
      applicationMode: 'pregame',
    });
    expect(serialized).not.toContain('projectedWorldGeometry');
    expect(serialized).not.toContain('territoryFragments');
    const parsed = parseLocalMatchSave(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const loadedPlanet = generatePlanet(
      parsed.save.worldSetup.seed,
      parsed.save.worldSetup,
    );
    expect(projectWorldGeometry(loadedPlanet)).toEqual(
      projectWorldGeometry(planet),
    );
    expect(SAVE_SCHEMA_VERSION).toBe(4);
  });
});
