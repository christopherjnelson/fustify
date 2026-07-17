import { describe, expect, it } from 'vitest';
import { createMatch } from '../game/createMatch';
import { gameReducer } from '../game/gameReducer';
import { generatePlanet } from '../generation/generatePlanet';
import {
  createTerritorySelectionAction,
  filterTerritoryNavigationItems,
  getDefaultTerritoryFilter,
  getTerritoryNavigationItems,
  territoryDrawerReducer,
} from './territoryNavigator';

const planet = generatePlanet('navigator-tests');

describe('territory navigator model', () => {
  it('starts closed and supports explicit open, Escape-close, and toggle transitions', () => {
    expect(territoryDrawerReducer(false, 'open')).toBe(true);
    expect(territoryDrawerReducer(true, 'close')).toBe(false);
    expect(territoryDrawerReducer(true, 'toggle')).toBe(false);
  });

  it('represents phase-specific legal, selected, and invalid statuses', () => {
    const match = createMatch(planet);
    const items = getTerritoryNavigationItems(planet, match);
    const owned = items.filter((item) => item.status === 'valid-source');
    const invalid = items.filter((item) => item.status === 'invalid');
    expect(owned.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);

    const selected = gameReducer(
      planet,
      match,
      createTerritorySelectionAction(owned[0]!.id),
    ).state;
    expect(
      getTerritoryNavigationItems(planet, selected).find(
        (item) => item.id === owned[0]!.id,
      )?.status,
    ).toBe('selected-source');
  });

  it('uses the same typed selection action as globe selection', () => {
    const match = createMatch(planet);
    const territoryId = getTerritoryNavigationItems(planet, match).find(
      (item) => item.status === 'valid-source',
    )!.id;
    const action = createTerritorySelectionAction(territoryId);
    expect(action).toEqual({ type: 'SELECT_TERRITORY', territoryId });
    expect(gameReducer(planet, match, action).error).toBeNull();
  });

  it('identifies legal sea-route attack targets', () => {
    const route = planet.connections.find(
      (connection) => connection.type === 'sea-route',
    )!;
    const match = createMatch(planet);
    const sourceId = route.fromTerritoryId;
    const targetId = route.toTerritoryId;
    const activePlayerId = match.activePlayerId;
    const enemyId = planet.players.find(
      (player) => player.id !== activePlayerId,
    )!.id;
    const attackState = {
      ...match,
      phase: 'attack' as const,
      selectedSourceTerritoryId: sourceId,
      selectedTargetTerritoryId: null,
      territories: {
        ...match.territories,
        [sourceId]: { ownerId: activePlayerId, armyCount: 3 },
        [targetId]: { ownerId: enemyId, armyCount: 2 },
      },
    };
    const target = getTerritoryNavigationItems(planet, attackState).find(
      (item) => item.id === targetId,
    );
    expect(target).toMatchObject({
      status: 'valid-target',
      seaRouteTarget: true,
    });
  });

  it('filters active-player and all territories with correct counts', () => {
    const match = createMatch(planet);
    const items = getTerritoryNavigationItems(planet, match);
    const mine = filterTerritoryNavigationItems(
      items,
      'mine',
      match.activePlayerId,
      '',
    );
    const all = filterTerritoryNavigationItems(
      items,
      'all',
      match.activePlayerId,
      '',
    );
    expect(getDefaultTerritoryFilter(match)).toBe('mine');
    expect(mine).toHaveLength(
      Object.values(match.territories).filter(
        (territory) => territory.ownerId === match.activePlayerId,
      ).length,
    );
    expect(mine.every((item) => item.ownerId === match.activePlayerId)).toBe(
      true,
    );
    expect(all).toHaveLength(planet.territories.length);
  });

  it('searches within either filter without changing the query', () => {
    const match = createMatch(planet);
    const items = getTerritoryNavigationItems(planet, match);
    const ownedItem = items.find(
      (item) => item.ownerId === match.activePlayerId,
    )!;
    const query = ownedItem.name;
    const mine = filterTerritoryNavigationItems(
      items,
      'mine',
      match.activePlayerId,
      query,
    );
    const all = filterTerritoryNavigationItems(
      items,
      'all',
      match.activePlayerId,
      query,
    );
    expect(query).toBe(ownedItem.name);
    expect(mine.map((item) => item.id)).toContain(ownedItem.id);
    expect(all.map((item) => item.id)).toContain(ownedItem.id);
  });

  it('falls back to all territories when the match is over', () => {
    const match = { ...createMatch(planet), phase: 'game-over' as const };
    expect(getDefaultTerritoryFilter(match)).toBe('all');
  });
});
