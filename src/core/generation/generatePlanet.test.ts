import { describe, expect, it } from 'vitest';
import { createIcosphere } from '../geometry/icosphere';
import { PLANET_SUBDIVISIONS } from './constants';
import { generatePlanet } from './generatePlanet';
import { buildCellAdjacency, connectedComponents } from './surfaceTopology';
import { validatePlanet } from './validatePlanet';

const planet = generatePlanet('test-world');

describe('generatePlanet', () => {
  it('preserves the 42-territory and 6-continent gameplay targets', () => {
    expect(planet.territories).toHaveLength(42);
    expect(planet.continents).toHaveLength(6);
  });

  it('produces the same definition for the same seed and options', () => {
    expect(generatePlanet('repeatable')).toEqual(generatePlanet('repeatable'));
  });

  it('uses unique fictional names instead of positional labels', () => {
    const allNames = [
      ...planet.continents.map((continent) => continent.name),
      ...planet.territories.map((territory) => territory.name),
    ];
    expect(new Set(allNames.map((name) => name.toLowerCase())).size).toBe(
      allNames.length,
    );
    expect(
      planet.territories.every((territory) => !/\d/.test(territory.name)),
    ).toBe(true);
  });

  it('produces different centers for different seeds', () => {
    const first = generatePlanet('world-a').territories.map(
      (item) => item.center,
    );
    const second = generatePlanet('world-b').territories.map(
      (item) => item.center,
    );
    expect(first).not.toEqual(second);
  });

  it('generates the requested territory and continent counts', () => {
    const custom = generatePlanet('custom-counts', {
      territoryCount: 30,
      continentCount: 5,
    });
    expect(custom.territories).toHaveLength(30);
    expect(custom.continents).toHaveLength(5);
  });

  it('has symmetrical adjacency without self-links or duplicates', () => {
    const byId = new Map(planet.territories.map((item) => [item.id, item]));
    for (const territory of planet.territories) {
      expect(territory.adjacentTerritoryIds).not.toContain(territory.id);
      expect(new Set(territory.adjacentTerritoryIds).size).toBe(
        territory.adjacentTerritoryIds.length,
      );
      expect(territory.adjacentTerritoryIds.length).toBeGreaterThan(0);
      for (const neighborId of territory.adjacentTerritoryIds) {
        expect(byId.get(neighborId)?.adjacentTerritoryIds).toContain(
          territory.id,
        );
      }
    }
  });

  it('has a connected territory graph', () => {
    const byId = new Map(planet.territories.map((item) => [item.id, item]));
    const visited = new Set<string>();
    const queue = [planet.territories[0]!.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(...byId.get(id)!.adjacentTerritoryIds);
    }
    expect(visited.size).toBe(planet.territoryCount);
  });

  it('assigns every territory to exactly one non-empty continent', () => {
    const allMemberships = planet.continents.flatMap(
      (item) => item.territoryIds,
    );
    for (const continent of planet.continents) {
      expect(continent.territoryIds.length).toBeGreaterThan(0);
    }
    for (const territory of planet.territories) {
      expect(allMemberships.filter((id) => id === territory.id)).toHaveLength(
        1,
      );
      expect(
        planet.continents.find((item) => item.id === territory.continentId)
          ?.territoryIds,
      ).toContain(territory.id);
    }
  });

  it('creates connected continents', () => {
    const byId = new Map(planet.territories.map((item) => [item.id, item]));
    for (const continent of planet.continents) {
      const allowed = new Set(continent.territoryIds);
      const visited = new Set<string>();
      const queue = [continent.territoryIds[0]!];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        queue.push(
          ...byId
            .get(id)!
            .adjacentTerritoryIds.filter((neighbor) => allowed.has(neighbor)),
        );
      }
      expect(visited.size).toBe(allowed.size);
    }
  });

  it('serializes to data containing only plain objects, arrays, and primitives', () => {
    const copy = JSON.parse(JSON.stringify(planet)) as unknown;
    expect(copy).toEqual(planet);

    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      expect([Object.prototype, Array.prototype]).toContain(
        Object.getPrototypeOf(value),
      );
      for (const nested of Object.values(value)) visit(nested);
    };
    visit(planet);
  });

  it('passes runtime and graph validation', () => {
    expect(validatePlanet(planet)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('produces the same land/ocean mask for the same seed', () => {
    const mask = (seed: string) =>
      generatePlanet(seed).surfaceCells.map((cell) => cell.terrainType);
    expect(mask('repeatable-mask')).toEqual(mask('repeatable-mask'));
  });

  it('produces different land/ocean masks for different seeds', () => {
    const first = generatePlanet('mask-a').surfaceCells.map(
      (cell) => cell.terrainType,
    );
    const second = generatePlanet('mask-b').surfaceCells.map(
      (cell) => cell.terrainType,
    );
    expect(first).not.toEqual(second);
  });

  it('keeps ocean cells unassigned and assigns every land cell', () => {
    for (const cell of planet.surfaceCells) {
      if (cell.terrainType === 'ocean') {
        expect(cell.territoryId).toBeNull();
      } else {
        expect(cell.territoryId).not.toBeNull();
      }
    }
  });

  it('keeps every territory geographically contiguous across land cells', () => {
    const sphere = createIcosphere(PLANET_SUBDIVISIONS);
    const cellAdjacency = buildCellAdjacency(sphere);
    for (const territory of planet.territories) {
      const cells = new Set(
        planet.surfaceCells
          .filter((cell) => cell.territoryId === territory.id)
          .map((cell) => cell.id),
      );
      expect(cells.size).toBeGreaterThan(0);
      expect(connectedComponents(cells, cellAdjacency)).toHaveLength(1);
    }
  });

  it('defines every detected physical landmass exactly once', () => {
    const sphere = createIcosphere(PLANET_SUBDIVISIONS);
    const cellAdjacency = buildCellAdjacency(sphere);
    const landCells = new Set(
      planet.surfaceCells
        .filter((cell) => cell.terrainType === 'land')
        .map((cell) => cell.id),
    );
    expect(connectedComponents(landCells, cellAdjacency)).toHaveLength(
      planet.landmasses.length,
    );
    expect(planet.landmasses.length).toBeGreaterThanOrEqual(4);
    expect(planet.landmasses.length).toBeLessThanOrEqual(8);
  });

  it('adds a deterministic minimal route tree with bounded redundancy', () => {
    const routes = (seed: string) =>
      generatePlanet(seed).connections.filter(
        (connection) => connection.type === 'sea-route',
      );
    expect(routes('route-world')).toEqual(routes('route-world'));
    const planetRoutes = planet.connections.filter(
      (connection) => connection.type === 'sea-route',
    );
    expect(planetRoutes.length).toBeGreaterThanOrEqual(
      planet.landmasses.length - 1,
    );
    expect(planetRoutes.length).toBeLessThanOrEqual(
      planet.landmasses.length + 2,
    );
  });

  it('has no duplicate or self connections', () => {
    const pairs = new Set<string>();
    for (const connection of planet.connections) {
      expect(connection.fromTerritoryId).not.toBe(connection.toTerritoryId);
      const pair = [connection.fromTerritoryId, connection.toTerritoryId]
        .sort()
        .join('|');
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
    }
  });

  it('anchors every sea route on coastal territories', () => {
    const sphere = createIcosphere(PLANET_SUBDIVISIONS);
    const cellAdjacency = buildCellAdjacency(sphere);
    const coastalTerritories = new Set<string>();
    for (const cell of planet.surfaceCells) {
      if (
        cell.territoryId !== null &&
        cellAdjacency[cell.id]!.some(
          (neighbor) => planet.surfaceCells[neighbor]!.terrainType === 'ocean',
        )
      ) {
        coastalTerritories.add(cell.territoryId);
      }
    }
    for (const route of planet.connections.filter(
      (connection) => connection.type === 'sea-route',
    )) {
      expect(coastalTerritories.has(route.fromTerritoryId)).toBe(true);
      expect(coastalTerritories.has(route.toTerritoryId)).toBe(true);
    }
  });

  it('hard-fails invalid ocean ownership and duplicate connections', () => {
    const invalid = structuredClone(planet);
    const ocean = invalid.surfaceCells.find(
      (cell) => cell.terrainType === 'ocean',
    )!;
    ocean.territoryId = invalid.territories[0]!.id;
    invalid.connections.push({ ...invalid.connections[0]! });
    const validation = validatePlanet(invalid);
    expect(validation.valid).toBe(false);
    expect(
      validation.errors.some((error) => error.includes('Ocean cell')),
    ).toBe(true);
    expect(
      validation.errors.some((error) => error.includes('Duplicate connection')),
    ).toBe(true);
  });

  it('can generate low-entry defensive continents across deterministic seeds', () => {
    const seeds = [
      'defense-a',
      'defense-b',
      'defense-c',
      'defense-d',
      'defense-e',
      'defense-f',
    ];
    expect(
      seeds.some((seed) =>
        generatePlanet(seed).continents.some(
          (continent) =>
            continent.externalGatewayTerritoryIds.length >= 1 &&
            continent.externalGatewayTerritoryIds.length <= 3,
        ),
      ),
    ).toBe(true);
  });

  it('generates neutral territories without ownership or armies', () => {
    const first = generatePlanet('ownership-world');
    const second = generatePlanet('ownership-world');
    expect(first.territories.map((territory) => territory.ownerId)).toEqual(
      second.territories.map((territory) => territory.ownerId),
    );
    for (const territory of first.territories) {
      expect(territory.ownerId).toBeNull();
      expect(territory.armyCount).toBe(0);
    }
  });

  it('classifies sea-route bridges and optional redundancy deterministically', () => {
    const first = generatePlanet('redundant-routes');
    const second = generatePlanet('redundant-routes');
    expect(first.analysis.seaRouteBridgeConnections).toEqual(
      second.analysis.seaRouteBridgeConnections,
    );
    expect(first.analysis.routeRedundancy).toBe(
      first.analysis.connectionMetrics.filter(
        (metric) => metric.type === 'sea-route' && !metric.isBridge,
      ).length,
    );
    for (const bridge of first.analysis.seaRouteBridgeConnections) {
      expect(bridge.type).toBe('sea-route');
      expect(bridge.isBridge).toBe(true);
    }
  });

  it('produces optional additional routes for at least one deterministic sample', () => {
    const seeds = ['routes-a', 'routes-b', 'routes-c', 'routes-d'];
    expect(
      seeds.some((seed) => {
        const generated = generatePlanet(seed);
        const routes = generated.connections.filter(
          (connection) => connection.type === 'sea-route',
        );
        return routes.length > generated.landmasses.length - 1;
      }),
    ).toBe(true);
  });

  it('calculates deterministic placeholder continent bonuses', () => {
    const first = generatePlanet('bonus-world').continents.map(
      (continent) => continent.bonus,
    );
    const second = generatePlanet('bonus-world').continents.map(
      (continent) => continent.bonus,
    );
    expect(first).toEqual(second);
    expect(first.every((bonus) => bonus >= 2)).toBe(true);
  });

  it('keeps strategic analysis free of Three.js-specific objects', () => {
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      expect([Object.prototype, Array.prototype]).toContain(
        Object.getPrototypeOf(value),
      );
      for (const nested of Object.values(value)) visit(nested);
    };
    visit(planet.analysis);
  });

  it('generates compact gameplay continents without dominated pockets', () => {
    for (const metric of planet.analysis.continentCohesionMetrics) {
      expect(metric.cohesionScore).toBeGreaterThanOrEqual(0.42);
      expect(metric.dominatedTerritoryIds).toEqual([]);
      expect(metric.protrusionTerritoryIds).toEqual([]);
      expect(metric.internalSeaRouteCount).toBeLessThanOrEqual(
        metric.internalEdgeCount,
      );
    }
    for (const metric of planet.analysis.continentInterleavingMetrics) {
      expect(metric.sharedTerritoryEdgeCount).toBeLessThanOrEqual(4);
    }
  });

  it('emits continent-cohesion warnings for diagnosed bad shapes', () => {
    const invalid = structuredClone(planet);
    invalid.analysis.continentCohesionMetrics[0]!.cohesionScore = 0.1;
    invalid.analysis.continentCohesionMetrics[0]!.dominatedTerritoryIds = [
      invalid.continents[0]!.territoryIds[0]!,
    ];
    invalid.analysis.continentCohesionMetrics[0]!.protrusionTerritoryIds = [
      invalid.continents[0]!.territoryIds[0]!,
    ];
    invalid.analysis.continentInterleavingMetrics[0]!.sharedTerritoryEdgeCount = 9;
    const warnings = validatePlanet(invalid).warnings.join(' ');
    expect(warnings).toContain('more neighbors from another continent');
    expect(warnings).toContain('low internal-edge cohesion');
    expect(warnings).toContain('isolated-looking protrusion');
    expect(warnings).toContain('excessively interleaved boundary');
  });
});
