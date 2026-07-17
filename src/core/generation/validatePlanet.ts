import { z } from 'zod';
import type { PlanetDefinition } from '../types/planet';

const vectorSchema = z.tuple([z.number(), z.number(), z.number()]);

export const planetDefinitionSchema = z.object({
  seed: z.string().min(1),
  generatorVersion: z.number().int().positive(),
  territoryCount: z.number().int().positive(),
  continentCount: z.number().int().positive(),
  territories: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      center: vectorSchema,
      continentId: z.string().min(1),
      displayColor: z.string().min(1),
      adjacentTerritoryIds: z.array(z.string()),
      ownerId: z.string().nullable(),
      armyCount: z.number().int().nonnegative(),
    }),
  ),
  continents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      territoryIds: z.array(z.string()),
      bonus: z.number().int().nonnegative(),
    }),
  ),
});

export interface PlanetValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePlanet(
  planet: PlanetDefinition,
): PlanetValidationResult {
  const parsed = planetDefinitionSchema.safeParse(planet);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );

  if (planet.territories.length !== planet.territoryCount) {
    errors.push('Territory count does not match the territory array.');
  }
  if (planet.continents.length !== planet.continentCount) {
    errors.push('Continent count does not match the continent array.');
  }

  const territories = new Map(
    planet.territories.map((item) => [item.id, item]),
  );
  const membership = new Map<string, number>();
  for (const continent of planet.continents) {
    if (continent.territoryIds.length === 0) {
      errors.push(`${continent.id} contains no territories.`);
    }
    for (const territoryId of continent.territoryIds) {
      membership.set(territoryId, (membership.get(territoryId) ?? 0) + 1);
    }
  }

  for (const territory of planet.territories) {
    const uniqueNeighbors = new Set(territory.adjacentTerritoryIds);
    if (uniqueNeighbors.size !== territory.adjacentTerritoryIds.length) {
      errors.push(`${territory.id} has duplicate adjacency entries.`);
    }
    if (uniqueNeighbors.has(territory.id)) {
      errors.push(`${territory.id} is adjacent to itself.`);
    }
    if (uniqueNeighbors.size === 0) {
      errors.push(`${territory.id} has no neighbors.`);
    }
    if (membership.get(territory.id) !== 1) {
      errors.push(`${territory.id} must belong to exactly one continent.`);
    }
    const continent = planet.continents.find(
      (item) => item.id === territory.continentId,
    );
    if (!continent?.territoryIds.includes(territory.id)) {
      errors.push(`${territory.id} has an inconsistent continent ID.`);
    }
    for (const neighborId of uniqueNeighbors) {
      const neighbor = territories.get(neighborId);
      if (!neighbor) {
        errors.push(
          `${territory.id} references missing neighbor ${neighborId}.`,
        );
      } else if (!neighbor.adjacentTerritoryIds.includes(territory.id)) {
        errors.push(
          `${territory.id} adjacency with ${neighborId} is not symmetrical.`,
        );
      }
    }
  }

  if (planet.territories.length > 0) {
    const visited = new Set<string>();
    const queue = [planet.territories[0]!.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...(territories.get(current)?.adjacentTerritoryIds ?? []));
    }
    if (visited.size !== planet.territories.length) {
      errors.push('Territory adjacency graph is not connected.');
    }
  }

  return { valid: errors.length === 0, errors };
}
