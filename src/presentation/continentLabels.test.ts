import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import type { ContinentDefinition } from '../core/types/continent';
import type {
  TerritoryDefinition,
  Vector3Tuple,
} from '../core/types/territory';
import {
  getContinentLabelAnchors,
  globeLabelVisibility,
  layoutMinimapContinentLabels,
} from './continentLabels';

function vector(longitude: number, latitude = 0): Vector3Tuple {
  const longitudeRadians = (longitude * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  return [
    Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    Math.sin(latitudeRadians),
    Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
  ];
}

function territory(
  id: string,
  center: Vector3Tuple,
  cellCount = 10,
): TerritoryDefinition {
  return {
    id,
    name: id,
    center,
    continentId: 'continent-1',
    displayColor: '#ffffff',
    adjacentTerritoryIds: [],
    ownerId: null,
    armyCount: 0,
    cellCount,
    landmassId: 'landmass-1',
  };
}

function continent(territoryIds: string[]): ContinentDefinition {
  return {
    id: 'continent-1',
    name: 'Test Reach',
    territoryIds,
    bonus: 1,
    externalGatewayTerritoryIds: [],
    neighboringContinentIds: [],
  };
}

describe('continent label anchors', () => {
  it('produces one identical anchor per continent for repeated calculations', () => {
    const planet = generatePlanet('continent-anchor-test', {
      territoryCount: 42,
      continentCount: 5,
      playerCount: 4,
    });

    const first = getContinentLabelAnchors(planet);
    const second = getContinentLabelAnchors(planet);

    expect(first).toHaveLength(planet.continents.length);
    expect(second).toEqual(first);
    expect(new Set(first.map((anchor) => anchor.continentId)).size).toBe(
      planet.continents.length,
    );
  });

  it('keeps an antimeridian continent beside its actual territories', () => {
    const anchors = getContinentLabelAnchors({
      continents: [continent(['east', 'west'])],
      territories: [
        territory('east', vector(178)),
        territory('west', vector(-176)),
      ],
    });

    expect(Math.abs(anchors[0]!.geographic.longitude)).toBeGreaterThan(170);
    expect(anchors[0]!.territoryId).toMatch(/east|west/);
  });

  it('uses the largest territory as a stable near-cancelling fallback', () => {
    const world = {
      continents: [continent(['large', 'opposite'])],
      territories: [
        territory('large', vector(0), 10),
        territory('opposite', vector(180), 8),
      ],
    };

    expect(getContinentLabelAnchors(world)[0]).toMatchObject({
      territoryId: 'large',
      strategy: 'largest-territory-fallback',
    });
    expect(getContinentLabelAnchors(world)).toEqual(
      getContinentLabelAnchors(world),
    );
  });

  it('lays labels out deterministically and fades the globe horizon geometrically', () => {
    const anchors = getContinentLabelAnchors({
      continents: [continent(['first'])],
      territories: [territory('first', vector(30, 10))],
    });

    expect(layoutMinimapContinentLabels(anchors)).toEqual(
      layoutMinimapContinentLabels(anchors),
    );
    expect(globeLabelVisibility(-0.2)).toBe(0);
    expect(globeLabelVisibility(0.05)).toBeGreaterThan(0);
    expect(globeLabelVisibility(0.3)).toBe(1);
  });
});
