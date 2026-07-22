import type { PlanetDefinition } from '../core/types/planet';

export function canonicalSeaRoutes(planet: PlanetDefinition) {
  return planet.connections.filter(
    (connection) => connection.type === 'sea-route',
  );
}
