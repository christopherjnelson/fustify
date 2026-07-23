import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryConnection } from '../core/types/surface';

export function canonicalSeaRoutes(planet: PlanetDefinition) {
  return planet.connections.filter(
    (connection) => connection.type === 'sea-route',
  );
}

export function getSeaRouteVisualState({
  route,
  selectedSourceId,
  legalTargetIds,
}: {
  route: TerritoryConnection;
  selectedSourceId: string | null;
  legalTargetIds: ReadonlySet<string>;
}): 'baseline' | 'emphasized' {
  if (selectedSourceId === null) return 'baseline';
  const targetId =
    route.fromTerritoryId === selectedSourceId
      ? route.toTerritoryId
      : route.toTerritoryId === selectedSourceId
        ? route.fromTerritoryId
        : null;
  return targetId !== null && legalTargetIds.has(targetId)
    ? 'emphasized'
    : 'baseline';
}
