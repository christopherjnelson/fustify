import { describe, expect, it } from 'vitest';
import { generatePlanet } from './generatePlanet';
import { validatePlanet } from './validatePlanet';

const planet = generatePlanet('test-world');

describe('generatePlanet', () => {
  it('produces the same definition for the same seed and options', () => {
    expect(generatePlanet('repeatable')).toEqual(generatePlanet('repeatable'));
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
    expect(validatePlanet(planet)).toEqual({ valid: true, errors: [] });
  });
});
