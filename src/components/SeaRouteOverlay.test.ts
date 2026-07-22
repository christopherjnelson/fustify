import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import { canonicalSeaRoutes } from '../presentation/seaRoutes';

describe('neutral-preview sea routes', () => {
  it('uses each canonical route exactly once', () => {
    const planet = generatePlanet('route-overlay-test', {
      territoryCount: 42,
      continentCount: 6,
      playerCount: 4,
    });
    const routes = canonicalSeaRoutes(planet);
    const pairs = routes.map((route) =>
      [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
    );
    expect(routes).toHaveLength(
      planet.connections.filter((route) => route.type === 'sea-route').length,
    );
    expect(new Set(pairs).size).toBe(routes.length);
  });
});
