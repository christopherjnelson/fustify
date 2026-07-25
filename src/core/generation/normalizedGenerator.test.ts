import { describe, expect, it } from 'vitest';
import { createIcosphere } from '../geometry/icosphere';
import { sphericalTriangleArea } from '../geometry/sphericalGeometry';
import { getPlanetSurfaceSphere } from '../geometry/planetSurface';
import {
  CURRENT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_VERSION,
  PLANET_SUBDIVISIONS,
} from './constants';
import { analyzePlanetGeometry } from './geometryQuality';
import { generatePlanet } from './generatePlanet';
import { validatePlanet } from './validatePlanet';
import { worldFingerprint } from '../../multiplayer/worldFingerprint';

const NORMALIZED_OPTIONS = {
  territoryCount: 42,
  continentCount: 5,
  playerCount: 4,
  generatorVersion: NORMALIZED_GENERATOR_VERSION,
} as const;

function edgeKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function signedOrientation(
  vertices: ReturnType<typeof createIcosphere>['vertices'],
  [a, b, c]: [number, number, number],
): number {
  const first = vertices[a]!;
  const second = vertices[b]!;
  const third = vertices[c]!;
  const ab = second.map((value, index) => value - first[index]!) as [
    number,
    number,
    number,
  ];
  const ac = third.map((value, index) => value - first[index]!) as [
    number,
    number,
    number,
  ];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return cross.reduce(
    (sum, value, index) =>
      sum + value * (first[index]! + second[index]! + third[index]!),
    0,
  );
}

describe('normalized world generator v2', () => {
  it('leaves default v1 output and its existing fingerprint unchanged', () => {
    const defaultPlanet = generatePlanet('atlas-prime', {
      territoryCount: 42,
      continentCount: 5,
      playerCount: 4,
    });
    const explicitPlanet = generatePlanet('atlas-prime', {
      territoryCount: 42,
      continentCount: 5,
      playerCount: 4,
      generatorVersion: CURRENT_GENERATOR_VERSION,
    });
    expect(explicitPlanet).toEqual(defaultPlanet);
    expect(defaultPlanet.surfaceVertices).toBeUndefined();
    expect(defaultPlanet.generationDiagnostics).toBeUndefined();
    expect(worldFingerprint(defaultPlanet)).toBe('fnv-c99c03d8');
  });

  it('is byte-identical and selects the same bounded candidate repeatedly', () => {
    const first = generatePlanet('normalized-repeatable', NORMALIZED_OPTIONS);
    const second = generatePlanet('normalized-repeatable', NORMALIZED_OPTIONS);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(worldFingerprint(second)).toBe(worldFingerprint(first));
    expect(first.generationDiagnostics).toMatchObject({
      profile: 'v2-normalized',
      relaxationIterations: 6,
      candidateCount: 4,
    });
    expect(first.generationDiagnostics?.candidates).toHaveLength(4);
    expect(first.generationDiagnostics?.selectedCandidateIndex).toBe(
      second.generationDiagnostics?.selectedCandidateIndex,
    );
  });

  it('keeps one watertight, consistently oriented shared-edge topology', () => {
    const planet = generatePlanet(
      'normalized-shared-geometry',
      NORMALIZED_OPTIONS,
    );
    const sphere = getPlanetSurfaceSphere(planet);
    const base = createIcosphere(PLANET_SUBDIVISIONS);
    const edgeFaces = new Map<string, number[]>();
    sphere.faces.forEach(([a, b, c], faceIndex) => {
      expect(
        sphericalTriangleArea(
          sphere.vertices[a]!,
          sphere.vertices[b]!,
          sphere.vertices[c]!,
        ),
      ).toBeGreaterThan(0);
      expect(
        signedOrientation(sphere.vertices, [a, b, c]) *
          signedOrientation(base.vertices, [a, b, c]),
      ).toBeGreaterThan(0);
      for (const [left, right] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const key = edgeKey(left, right);
        edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), faceIndex]);
      }
    });
    expect(sphere.faces).toEqual(base.faces);
    expect(planet.surfaceVertices).toHaveLength(base.vertices.length);
    expect([...edgeFaces.values()].every((faces) => faces.length === 2)).toBe(
      true,
    );

    const pairEdges = new Map<string, Set<string>>();
    for (const [edge, faces] of edgeFaces) {
      const owners = faces
        .map((face) => planet.surfaceCells[face]!.territoryId)
        .filter((owner): owner is string => owner !== null);
      if (owners.length !== 2 || owners[0] === owners[1]) continue;
      const pair = [...owners].sort().join('|');
      const existing = pairEdges.get(pair) ?? new Set<string>();
      existing.add(edge);
      pairEdges.set(pair, existing);
    }
    for (const connection of planet.connections.filter(
      (item) => item.type === 'land-border',
    )) {
      const pair = [connection.fromTerritoryId, connection.toTerritoryId]
        .sort()
        .join('|');
      expect(pairEdges.get(pair)?.size).toBeGreaterThan(0);
    }
  });

  it('uses interior anchors and improves selected jagged v1 baselines', () => {
    const seeds = [
      'calm-reef-648',
      'golden-citadel-587',
      'polar-normalized-217',
    ];
    const comparisons = seeds.map((seed) => {
      const current = analyzePlanetGeometry(
        generatePlanet(seed, {
          ...NORMALIZED_OPTIONS,
          generatorVersion: CURRENT_GENERATOR_VERSION,
        }),
      );
      const normalized = analyzePlanetGeometry(
        generatePlanet(seed, NORMALIZED_OPTIONS),
      );
      return { current, normalized };
    });
    const sum = (
      side: 'current' | 'normalized',
      read: (analysis: ReturnType<typeof analyzePlanetGeometry>) => number,
    ) => comparisons.reduce((total, item) => total + read(item[side]), 0);
    expect(
      sum(
        'normalized',
        (quality) => quality.world.territoryAreaCoefficientOfVariation,
      ),
    ).toBeLessThan(
      sum(
        'current',
        (quality) => quality.world.territoryAreaCoefficientOfVariation,
      ),
    );
    expect(
      sum('normalized', (quality) => quality.world.tinyEdgeTotal),
    ).toBeLessThan(
      sum('current', (quality) => quality.world.tinyEdgeTotal) * 0.1,
    );
    expect(
      sum('normalized', (quality) =>
        quality.territories.reduce(
          (total, territory) => total + territory.compactness,
          0,
        ),
      ),
    ).toBeGreaterThan(
      sum('current', (quality) =>
        quality.territories.reduce(
          (total, territory) => total + territory.compactness,
          0,
        ),
      ) * 1.8,
    );
    expect(
      comparisons.every(({ normalized }) =>
        normalized.territories.every((territory) => territory.anchorInside),
      ),
    ).toBe(true);
    const normalizedSides = comparisons.flatMap(({ normalized }) =>
      normalized.territories.map((territory) => territory.meaningfulSideCount),
    );
    expect(
      normalizedSides.filter((sideCount) => sideCount >= 5 && sideCount <= 7)
        .length,
    ).toBeGreaterThan(normalizedSides.length * 0.6);
  });

  it.each([2, 3, 4, 5])(
    'keeps supported %s-continent worlds connected and valid',
    (continentCount) => {
      const planet = generatePlanet(`normalized-${continentCount}-continents`, {
        ...NORMALIZED_OPTIONS,
        continentCount,
      });
      const validation = validatePlanet(planet, {
        territoryCount: 42,
        continentCount,
        playerCount: 4,
      });
      expect(validation.errors).toEqual([]);
      expect(
        planet.generationDiagnostics?.continentMetrics.every(
          (continent) =>
            continent.connectedComponentCount === 1 &&
            continent.enclaveOrHoleCount === 0,
        ),
      ).toBe(true);
      expect(
        planet.territories.every(
          (territory) =>
            territory.adjacentTerritoryIds.length >= 2 &&
            territory.adjacentTerritoryIds.length <= 8,
        ),
      ).toBe(true);
    },
  );

  it('supports the reporting-only 60/5 representative size', () => {
    const planet = generatePlanet('normalized-sixty', {
      ...NORMALIZED_OPTIONS,
      territoryCount: 60,
    });
    expect(planet.territories).toHaveLength(60);
    expect(planet.generationDiagnostics?.candidateCount).toBe(4);
  });
});
