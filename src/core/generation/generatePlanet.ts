import { createIcosphere } from '../geometry/icosphere.ts';
import type {
  PlanetDefinition,
  PlanetGenerationOptions,
} from '../types/planet.ts';
import type { TerritoryDefinition } from '../types/territory.ts';
import { analyzeStrategicGraph } from './analyzeGraph.ts';
import { analyzeContinentQuality } from './continentQuality.ts';
import {
  adjacencyFromConnections,
  buildLandBorderConnections,
  buildSeaRoutes,
  buildTerritoryBorderWeights,
  findCoastalTerritoryIndices,
  territoryId,
} from './buildConnections.ts';
import {
  CONTINENT_PALETTE,
  DEFAULT_CONTINENT_COUNT,
  DEFAULT_LAND_COVERAGE,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_TERRITORY_COUNT,
  GENERATOR_VERSION,
  PLANET_SUBDIVISIONS,
} from './constants.ts';
import {
  calculateContinentBonus,
  chooseSpatialContinentAssignments,
} from './generateContinents.ts';
import { generatePlayers } from './generatePlayers.ts';
import { generateTerrain } from './generateTerrain.ts';
import { generateTerritoryLayout } from './generateTerritories.ts';
import { createSeededRandom } from './seededRandom.ts';
import { buildCellAdjacency } from './surfaceTopology.ts';
import { validatePlanet } from './validatePlanet.ts';

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

function continentId(index: number): string {
  return `continent-${String(index + 1).padStart(2, '0')}`;
}

function landmassId(index: number): string {
  return `landmass-${String(index + 1).padStart(2, '0')}`;
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
  const playerCount = options.playerCount ?? DEFAULT_PLAYER_COUNT;
  const targetLandCoverage = options.landCoverage ?? DEFAULT_LAND_COVERAGE;
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
  if (targetLandCoverage < 0.35 || targetLandCoverage > 0.7) {
    throw new Error('Land coverage must be between 35% and 70%.');
  }
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new Error('Player count must be an integer between 2 and 6.');
  }

  const sphere = createIcosphere(PLANET_SUBDIVISIONS);
  const cellAdjacency = buildCellAdjacency(sphere);
  const terrain = generateTerrain(
    `${normalizedSeed}|v${GENERATOR_VERSION}`,
    sphere,
    cellAdjacency,
    targetLandCoverage,
    continentCount,
  );
  const layout = generateTerritoryLayout(
    sphere,
    cellAdjacency,
    terrain.landComponents,
    terrain.likelihood,
    territoryCount,
  );
  const landBorders = buildLandBorderConnections(
    layout.cellTerritoryIndices,
    cellAdjacency,
  );
  const borderWeights = buildTerritoryBorderWeights(
    layout.cellTerritoryIndices,
    cellAdjacency,
  );
  const routeRandom = createSeededRandom(
    `${normalizedSeed}|routes|${GENERATOR_VERSION}`,
  );
  const additionalRouteCount = routeRandom.integer(0, 3);
  const seaRoutes = buildSeaRoutes(
    layout.territoryCenters,
    layout.territoryLandmassIndices,
    terrain.landComponents.length,
    additionalRouteCount,
    findCoastalTerritoryIndices(layout.cellTerritoryIndices, cellAdjacency),
  );
  const connections = [...landBorders, ...seaRoutes];
  const strategicAdjacency = adjacencyFromConnections(
    territoryCount,
    connections,
  );
  const landAdjacency = adjacencyFromConnections(territoryCount, landBorders);
  const assignments = chooseSpatialContinentAssignments(
    landAdjacency,
    borderWeights,
    continentCount,
    `${normalizedSeed}|v${GENERATOR_VERSION}`,
  );
  const players = generatePlayers(playerCount);
  const detailRandom = createSeededRandom(
    `${normalizedSeed}|details|${GENERATOR_VERSION}`,
  );

  const territories: TerritoryDefinition[] = layout.territoryCenters.map(
    (center, index) => {
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
        adjacentTerritoryIds: strategicAdjacency[index]!.map(territoryId),
        ownerId: null,
        armyCount: 0,
        cellCount: layout.territoryCellCounts[index]!,
        landmassId: landmassId(layout.territoryLandmassIndices[index]!),
      };
    },
  );

  const continents = Array.from({ length: continentCount }, (_, index) => {
    const ids = territories
      .filter((territory) => territory.continentId === continentId(index))
      .map((territory) => territory.id);
    const idSet = new Set(ids);
    const externalGatewayTerritoryIds = ids.filter((id) => {
      const territory = territories.find((item) => item.id === id)!;
      return territory.adjacentTerritoryIds.some(
        (neighbor) => !idSet.has(neighbor),
      );
    });
    const neighboringContinentIds = [
      ...new Set(
        ids.flatMap((id) => {
          const territory = territories.find((item) => item.id === id)!;
          return territory.adjacentTerritoryIds
            .map(
              (neighbor) =>
                territories.find((item) => item.id === neighbor)!.continentId,
            )
            .filter(
              (neighborContinentId) =>
                neighborContinentId !== continentId(index),
            );
        }),
      ),
    ].sort();
    return {
      id: continentId(index),
      name:
        CONTINENT_NAMES[index % CONTINENT_NAMES.length] ??
        `Region ${index + 1}`,
      territoryIds: ids,
      bonus: calculateContinentBonus(
        ids.length,
        externalGatewayTerritoryIds.length,
        neighboringContinentIds.length,
      ),
      externalGatewayTerritoryIds,
      neighboringContinentIds,
    };
  });

  const surfaceCells = layout.cellTerritoryIndices.map(
    (territoryIndex, id) => ({
      id,
      terrainType:
        territoryIndex === null ? ('ocean' as const) : ('land' as const),
      territoryId: territoryIndex === null ? null : territoryId(territoryIndex),
    }),
  );
  const landmasses = terrain.landComponents.map((_, index) => ({
    id: landmassId(index),
    territoryIds: territories
      .filter((territory) => territory.landmassId === landmassId(index))
      .map((territory) => territory.id),
  }));
  const analysis = analyzeStrategicGraph(
    territories,
    connections,
    continents,
    landmasses,
    borderWeights,
  );

  const planet: PlanetDefinition = {
    seed: normalizedSeed,
    generatorVersion: GENERATOR_VERSION,
    territoryCount,
    continentCount,
    playerCount,
    players,
    territories,
    continents,
    surfaceCells,
    landmasses,
    connections,
    landCoverage:
      surfaceCells.filter((cell) => cell.terrainType === 'land').length /
      surfaceCells.length,
    analysis,
  };
  const validation = validatePlanet(planet, {
    territoryCount,
    continentCount,
    playerCount,
  });
  if (!validation.valid) {
    throw new Error(
      `Generated an invalid planet: ${validation.errors.join(' ')}`,
    );
  }
  const quality = analyzeContinentQuality(planet);
  if (quality.severeFailures.length > 0) {
    throw new Error(
      `Generated a structurally valid planet that failed continent shape quality: ${quality.severeFailures.join(' ')}`,
    );
  }
  return planet;
}
