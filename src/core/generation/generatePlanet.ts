import type {
  PlanetDefinition,
  PlanetGenerationOptions,
} from '../types/planet';
import type { TerritoryDefinition } from '../types/territory';
import { generateSpherePoints } from '../geometry/spherePoints';
import { buildAdjacency, classifyTerritorySurface } from './buildAdjacency';
import {
  CONTINENT_PALETTE,
  DEFAULT_CONTINENT_COUNT,
  DEFAULT_TERRITORY_COUNT,
  GENERATOR_VERSION,
} from './constants';
import { generateContinentAssignments } from './generateContinents';
import { createSeededRandom } from './seededRandom';
import { validatePlanet } from './validatePlanet';

const CONTINENT_NAMES = [
  'Azure Reach',
  'Ember Crown',
  'Verdant Expanse',
  'Golden March',
  'Violet Rim',
  'Teal Frontier',
  'Rose Meridian',
  'Moss Basin',
] as const;

const TERRITORY_PREFIXES = [
  'Aster',
  'Boreal',
  'Cinder',
  'Dawn',
  'Echo',
  'Frost',
  'Gale',
  'Haven',
  'Ion',
  'Jade',
  'Kestrel',
  'Lumen',
] as const;

function territoryId(index: number): string {
  return `territory-${String(index + 1).padStart(2, '0')}`;
}

function continentId(index: number): string {
  return `continent-${String(index + 1).padStart(2, '0')}`;
}

function shadeColor(hex: string, variation: number): string {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  const adjusted = channels.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel + variation))),
  );
  return `#${adjusted.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function generatePlanet(
  seed: string,
  options: PlanetGenerationOptions = {},
): PlanetDefinition {
  const normalizedSeed = seed.trim() || 'new-world';
  const territoryCount = options.territoryCount ?? DEFAULT_TERRITORY_COUNT;
  const continentCount = options.continentCount ?? DEFAULT_CONTINENT_COUNT;
  if (!Number.isInteger(territoryCount) || territoryCount < 2) {
    throw new Error('Territory count must be an integer of at least 2.');
  }
  if (
    !Number.isInteger(continentCount) ||
    continentCount < 1 ||
    continentCount > territoryCount
  ) {
    throw new Error('Continent count must be between 1 and territory count.');
  }

  const pointRandom = createSeededRandom(
    `${normalizedSeed}|points|${GENERATOR_VERSION}`,
  );
  const centers = generateSpherePoints(territoryCount, pointRandom);
  const surface = classifyTerritorySurface(centers);
  const adjacency = buildAdjacency(centers, surface);
  const continentRandom = createSeededRandom(
    `${normalizedSeed}|continents|${GENERATOR_VERSION}`,
  );
  const assignments = generateContinentAssignments(
    adjacency,
    continentCount,
    continentRandom,
  );
  const detailRandom = createSeededRandom(
    `${normalizedSeed}|details|${GENERATOR_VERSION}`,
  );

  const territories: TerritoryDefinition[] = centers.map((center, index) => {
    const assignedContinent = assignments[index]!;
    const prefix = TERRITORY_PREFIXES[index % TERRITORY_PREFIXES.length];
    return {
      id: territoryId(index),
      name: `${prefix} ${String(index + 1).padStart(2, '0')}`,
      center,
      continentId: continentId(assignedContinent),
      displayColor: shadeColor(
        CONTINENT_PALETTE[assignedContinent % CONTINENT_PALETTE.length]!,
        detailRandom.integer(-15, 15),
      ),
      adjacentTerritoryIds: adjacency[index]!.map(territoryId),
      ownerId: null,
      armyCount: detailRandom.integer(1, 8),
    };
  });

  const continents = Array.from({ length: continentCount }, (_, index) => {
    const ids = territories
      .filter((territory) => territory.continentId === continentId(index))
      .map((territory) => territory.id);
    return {
      id: continentId(index),
      name:
        CONTINENT_NAMES[index % CONTINENT_NAMES.length] ??
        `Region ${index + 1}`,
      territoryIds: ids,
      bonus: Math.max(2, Math.round(ids.length / 3)),
    };
  });

  const planet: PlanetDefinition = {
    seed: normalizedSeed,
    generatorVersion: GENERATOR_VERSION,
    territoryCount,
    continentCount,
    territories,
    continents,
  };
  const validation = validatePlanet(planet);
  if (!validation.valid) {
    throw new Error(
      `Generated an invalid planet: ${validation.errors.join(' ')}`,
    );
  }
  return planet;
}
