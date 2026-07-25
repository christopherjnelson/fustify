import { describe, expect, it } from 'vitest';
import type { TerritoryBorderWeight } from './buildConnections';
import {
  analyzeContinentQuality,
  severeContinentQualityFailures,
  type ContinentShapeMetrics,
} from './continentQuality';
import {
  chooseSpatialContinentAssignments,
  MAX_CONTINENT_ASSIGNMENT_ATTEMPTS,
} from './generateContinents';
import { generatePlanet } from './generatePlanet';
import { validatePlanet } from './validatePlanet';

const knownRegressionSeeds = ['calm-reef-648', 'golden-citadel-587'] as const;

describe('continent quality', () => {
  it.each(knownRegressionSeeds)(
    'accepts corrected known regression seed %s',
    (seed) => {
      const report = analyzeContinentQuality(
        generatePlanet(seed, { territoryCount: 42, continentCount: 6 }),
      );
      expect(report.category).toBe('acceptable-diversity');
      expect(report.hardFailures).toEqual([]);
      expect(report.severeFailures).toEqual([]);
      expect(report.metrics).toHaveLength(6);
    },
  );

  it.each([
    [42, 6, 'quality-42-6'],
    [42, 5, 'quality-42-5'],
    [36, 6, 'quality-36-6'],
    [48, 6, 'quality-48-6'],
    [24, 4, 'quality-24-4'],
    [12, 2, 'engine-coverage-12-2'],
    [12, 8, 'engine-coverage-12-8'],
  ] as const)(
    'keeps %i/%i continents land-connected and completely assigned',
    (territoryCount, continentCount, seed) => {
      const planet = generatePlanet(seed, { territoryCount, continentCount });
      const report = analyzeContinentQuality(planet);
      expect(report.hardFailures).toEqual([]);
      expect(
        report.metrics.every((metric) => metric.landComponentCount === 1),
      ).toBe(true);
      expect(
        new Set(
          planet.continents.flatMap((continent) => continent.territoryIds),
        ).size,
      ).toBe(territoryCount);
    },
  );

  it('reports component metrics deterministically without an opaque score', () => {
    const first = analyzeContinentQuality(generatePlanet('metric-components'));
    const second = analyzeContinentQuality(generatePlanet('metric-components'));
    expect(first).toEqual(second);
    expect(first.metrics[0]).toMatchObject({
      landComponentCount: 1,
      territoryCount: expect.any(Number),
      approximateSurfaceAreaSteradians: expect.any(Number),
      graphDiameter: expect.any(Number),
      meanInternalGraphDistance: expect.any(Number),
      internalAdjacencyEdgeCount: expect.any(Number),
      boundaryEdgeCount: expect.any(Number),
      boundaryToTerritoryRatio: expect.any(Number),
      articulationTerritoryCount: expect.any(Number),
      leafTerritoryCount: expect.any(Number),
      longestOneTerritoryWideChain: expect.any(Number),
      maximumAngularDistanceDegrees: expect.any(Number),
      compactness: expect.any(Number),
      narrowNeckCount: expect.any(Number),
      neighboringContinentCount: expect.any(Number),
      seaRouteConnectionCount: expect.any(Number),
    });
    expect(first).not.toHaveProperty('score');
  });

  it('detects the exposed three-territory strip seen in the golden baseline', () => {
    const metric: ContinentShapeMetrics = {
      continentId: 'continent-strip',
      territoryCount: 3,
      approximateSurfaceAreaSteradians: 0.4786,
      landComponentCount: 1,
      graphDiameter: 2,
      meanInternalGraphDistance: 1.3333,
      internalAdjacencyEdgeCount: 2,
      boundaryEdgeCount: 5,
      boundaryToTerritoryRatio: 1.6667,
      articulationTerritoryCount: 1,
      leafTerritoryCount: 2,
      longestOneTerritoryWideChain: 3,
      centroid: [-0.6493, 0.2961, -0.7005],
      maximumAngularDistanceDegrees: 20.9051,
      meanAngularDistanceDegrees: 16.4503,
      compactness: 0.2857,
      narrowNeckCount: 1,
      neighboringContinentCount: 2,
      seaRouteConnectionCount: 1,
      internalSeaRouteCount: 0,
      dominatedTerritoryCount: 1,
      protrusionTerritoryCount: 0,
    };
    expect(severeContinentQualityFailures([metric])).toEqual([
      'continent-strip is a fully narrow, exposed strip (0.286 compactness; 1.67 boundary edges per territory).',
    ]);
  });

  it('does not reject a naturally small compact continent', () => {
    const compact: ContinentShapeMetrics = {
      continentId: 'continent-compact',
      territoryCount: 1,
      approximateSurfaceAreaSteradians: 0.1571,
      landComponentCount: 1,
      graphDiameter: 0,
      meanInternalGraphDistance: 0,
      internalAdjacencyEdgeCount: 0,
      boundaryEdgeCount: 3,
      boundaryToTerritoryRatio: 3,
      articulationTerritoryCount: 0,
      leafTerritoryCount: 0,
      longestOneTerritoryWideChain: 1,
      centroid: [-0.8411, -0.3555, -0.4075],
      maximumAngularDistanceDegrees: 0,
      meanAngularDistanceDegrees: 0,
      compactness: 0,
      narrowNeckCount: 0,
      neighboringContinentCount: 1,
      seaRouteConnectionCount: 0,
      internalSeaRouteCount: 0,
      dominatedTerritoryCount: 1,
      protrusionTerritoryCount: 1,
    };
    expect(severeContinentQualityFailures([compact])).toEqual([]);
  });
});

describe('land-connected continent growth', () => {
  const adjacency = [
    [1, 2],
    [0, 2, 3],
    [0, 1, 3],
    [1, 2],
    [5, 6],
    [4, 6, 7],
    [4, 5, 7],
    [5, 6],
  ];
  const borders: TerritoryBorderWeight[] = adjacency.flatMap(
    (neighbors, left) =>
      neighbors
        .filter((right) => right > left)
        .map((right) => ({
          leftTerritoryIndex: left,
          rightTerritoryIndex: right,
          sharedCellEdgeCount: 3,
        })),
  );

  it('distributes seeds across land components and remains deterministic', () => {
    const first = chooseSpatialContinentAssignments(
      adjacency,
      borders,
      4,
      'component-seeds',
    );
    expect(first).toEqual(
      chooseSpatialContinentAssignments(
        adjacency,
        borders,
        4,
        'component-seeds',
      ),
    );
    expect(new Set(first.slice(0, 4)).size).toBe(2);
    expect(new Set(first.slice(4)).size).toBe(2);
    expect(new Set(first.slice(0, 4))).not.toEqual(new Set(first.slice(4)));
  });

  it('hard-fails with a stable bounded-attempt policy when connectivity is impossible', () => {
    expect(MAX_CONTINENT_ASSIGNMENT_ATTEMPTS).toBe(96);
    expect(() =>
      chooseSpatialContinentAssignments([[], [], [], []], [], 3, 'impossible'),
    ).toThrow('Cannot create 3 land-connected continents across 4 landmasses.');
  });

  it('does not count a sea route as internal continent connectivity', () => {
    const planet = generatePlanet('sea-route-connectivity');
    const route = planet.connections.find(
      (connection) => connection.type === 'sea-route',
    )!;
    const invalid = structuredClone(planet);
    const left = invalid.territories.find(
      (territory) => territory.id === route.fromTerritoryId,
    )!;
    const right = invalid.territories.find(
      (territory) => territory.id === route.toTerritoryId,
    )!;
    const target = invalid.continents.find(
      (continent) => continent.id === left.continentId,
    )!;
    const source = invalid.continents.find(
      (continent) => continent.id === right.continentId,
    )!;
    source.territoryIds = source.territoryIds.filter((id) => id !== right.id);
    target.territoryIds.push(right.id);
    right.continentId = target.id;
    expect(
      validatePlanet(invalid).errors.some((error) =>
        error.includes('not connected through land-territory adjacency'),
      ),
    ).toBe(true);
  });

  it('rejects land borders that do not reflect canonical surface adjacency', () => {
    const invalid = structuredClone(generatePlanet('invalid-land-border'));
    const landBorder = invalid.connections.find(
      (connection) => connection.type === 'land-border',
    )!;
    const connected = new Set(
      invalid.connections.flatMap((connection) => [
        `${connection.fromTerritoryId}|${connection.toTerritoryId}`,
        `${connection.toTerritoryId}|${connection.fromTerritoryId}`,
      ]),
    );
    const replacement = invalid.territories.find(
      (territory) =>
        territory.id !== landBorder.fromTerritoryId &&
        !connected.has(`${landBorder.fromTerritoryId}|${territory.id}`),
    )!;
    landBorder.toTerritoryId = replacement.id;
    expect(validatePlanet(invalid).errors).toContain(
      'Land-border connections do not match geographically adjacent territories.',
    );
  });
});
