import type { PlanetDefinition } from '../core/types/planet';

export function worldFingerprint(planet: PlanetDefinition): string {
  const canonical = JSON.stringify({
    seed: planet.seed,
    generatorVersion: planet.generatorVersion,
    territoryCount: planet.territoryCount,
    continentCount: planet.continentCount,
    territories: planet.territories.map((territory) => [
      territory.id,
      territory.continentId,
      territory.center,
      territory.adjacentTerritoryIds,
    ]),
    surface: planet.surfaceCells.map((cell) => cell.territoryId),
    connections: planet.connections.map((connection) => [
      connection.fromTerritoryId,
      connection.toTerritoryId,
      connection.type,
    ]),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
