import {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getReinforcementTargets,
} from '../game';
import type { MatchState } from '../game/types';
import type { GameAction } from '../game/types';
import type { PlanetDefinition } from '../types/planet';

export type TerritoryLegalStatus =
  | 'valid-source'
  | 'valid-target'
  | 'selected-source'
  | 'selected-target'
  | 'invalid';

export interface TerritoryNavigationItem {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  armyCount: number;
  continentName: string;
  status: TerritoryLegalStatus;
  seaRouteTarget: boolean;
}

export type TerritoryNavigatorFilter = 'mine' | 'all';

export type TerritoryDrawerAction = 'open' | 'close' | 'toggle';

export function territoryDrawerReducer(
  open: boolean,
  action: TerritoryDrawerAction,
): boolean {
  if (action === 'open') return true;
  if (action === 'close') return false;
  return !open;
}

export function getDefaultTerritoryFilter(
  match: MatchState,
): TerritoryNavigatorFilter {
  return match.phase === 'game-over' || !match.activePlayerId ? 'all' : 'mine';
}

export function filterTerritoryNavigationItems(
  items: TerritoryNavigationItem[],
  filter: TerritoryNavigatorFilter,
  activePlayerId: string | null,
  query: string,
): TerritoryNavigationItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (
      filter === 'mine' &&
      (activePlayerId === null || item.ownerId !== activePlayerId)
    ) {
      return false;
    }
    return [item.name, item.ownerName, item.continentName].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    );
  });
}

export function createTerritorySelectionAction(
  territoryId: string | null,
): GameAction {
  return { type: 'SELECT_TERRITORY', territoryId };
}

export function getTerritoryNavigationItems(
  planet: PlanetDefinition,
  match: MatchState,
): TerritoryNavigationItem[] {
  let sources: string[] = [];
  let targets: string[] = [];
  if (match.phase === 'reinforce') {
    sources = getReinforcementTargets(match);
  } else if (match.phase === 'attack') {
    sources = getAttackSources(match);
    targets = match.selectedSourceTerritoryId
      ? getAttackTargets(planet, match, match.selectedSourceTerritoryId)
      : [];
  } else if (match.phase === 'fortify') {
    sources = getReinforcementTargets(match).filter(
      (id) => match.territories[id]!.armyCount >= 2,
    );
    targets = match.selectedSourceTerritoryId
      ? getFortifyTargets(planet, match, match.selectedSourceTerritoryId)
      : [];
  }
  const sourceSet = new Set(sources);
  const targetSet = new Set(targets);
  const seaTargets = new Set(
    planet.connections
      .filter(
        (connection) =>
          connection.type === 'sea-route' &&
          match.selectedSourceTerritoryId !== null &&
          (connection.fromTerritoryId === match.selectedSourceTerritoryId ||
            connection.toTerritoryId === match.selectedSourceTerritoryId),
      )
      .map((connection) =>
        connection.fromTerritoryId === match.selectedSourceTerritoryId
          ? connection.toTerritoryId
          : connection.fromTerritoryId,
      )
      .filter((id) => targetSet.has(id)),
  );
  const players = new Map(planet.players.map((player) => [player.id, player]));
  const continents = new Map(
    planet.continents.map((continent) => [continent.id, continent]),
  );
  return planet.territories.map((territory) => {
    let status: TerritoryLegalStatus = 'invalid';
    if (territory.id === match.selectedTargetTerritoryId) {
      status = 'selected-target';
    } else if (territory.id === match.selectedSourceTerritoryId) {
      status = 'selected-source';
    } else if (targetSet.has(territory.id)) {
      status = 'valid-target';
    } else if (sourceSet.has(territory.id)) {
      status = 'valid-source';
    }
    const territoryState = match.territories[territory.id]!;
    return {
      id: territory.id,
      name: territory.name,
      ownerId: territoryState.ownerId,
      ownerName: players.get(territoryState.ownerId)?.name ?? 'Unknown',
      armyCount: territoryState.armyCount,
      continentName:
        continents.get(territory.continentId)?.name ?? 'Unknown continent',
      status,
      seaRouteTarget: seaTargets.has(territory.id),
    };
  });
}
