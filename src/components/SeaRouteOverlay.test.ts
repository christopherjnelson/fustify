import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import {
  canonicalSeaRoutes,
  getSeaRouteVisualState,
} from '../presentation/seaRoutes';

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

describe('sea-route visual state', () => {
  const route = {
    fromTerritoryId: 'source',
    toTerritoryId: 'legal-target',
    type: 'sea-route' as const,
  };

  it('keeps routes at baseline without a selected source or legal target', () => {
    expect(
      getSeaRouteVisualState({
        route,
        selectedSourceId: null,
        legalTargetIds: new Set(['legal-target']),
      }),
    ).toBe('baseline');
    expect(
      getSeaRouteVisualState({
        route,
        selectedSourceId: 'source',
        legalTargetIds: new Set(),
      }),
    ).toBe('baseline');
  });

  it('emphasizes only a legal attack route connected to the selected source', () => {
    const legalTargetIds = new Set(['legal-target']);
    expect(
      getSeaRouteVisualState({
        route,
        selectedSourceId: 'source',
        legalTargetIds,
      }),
    ).toBe('emphasized');
    expect(
      getSeaRouteVisualState({
        route,
        selectedSourceId: 'other-source',
        legalTargetIds,
      }),
    ).toBe('baseline');
  });

  it('follows fortification destinations and removes old emphasis when the source changes', () => {
    const legalTargetIds = new Set(['legal-target']);
    expect(
      getSeaRouteVisualState({
        route,
        selectedSourceId: 'source',
        legalTargetIds,
      }),
    ).toBe('emphasized');
    expect(
      getSeaRouteVisualState({
        route,
        selectedSourceId: 'legal-target',
        legalTargetIds: new Set(['different-target']),
      }),
    ).toBe('baseline');
  });
});
