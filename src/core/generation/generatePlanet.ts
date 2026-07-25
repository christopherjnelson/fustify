import { createIcosphere } from '../geometry/icosphere.ts';
import type {
  PlanetDefinition,
  PlanetGenerationOptions,
} from '../types/planet.ts';
import type { TerritoryDefinition } from '../types/territory.ts';
import type {
  GenerationCandidateDiagnostics,
  GenerationDiagnostics,
  GenerationTimingObserver,
} from '../types/generation.ts';
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
  NORMALIZED_GENERATOR_VERSION,
  PLANET_SUBDIVISIONS,
} from './constants.ts';
import {
  calculateContinentBonus,
  chooseNormalizedContinentAssignments,
  chooseSpatialContinentAssignments,
} from './generateContinents.ts';
import { generatePlayers } from './generatePlayers.ts';
import { generateTerrain } from './generateTerrain.ts';
import type { GeneratedTerrain } from './generateTerrain.ts';
import { generateTerritoryLayout } from './generateTerritories.ts';
import {
  generateNormalizedTerritoryLayout,
  NORMALIZED_RELAXATION_ITERATIONS,
  NORMALIZED_RELAXATION_MOVE_FRACTION,
  NORMALIZED_TERRITORY_CANDIDATE_COUNT,
  type NormalizedTerritoryLayout,
} from './generateNormalizedTerritories.ts';
import { createSeededRandom } from './seededRandom.ts';
import { buildCellAdjacency } from './surfaceTopology.ts';
import { validatePlanet } from './validatePlanet.ts';
import { COORDINATE_PRECISION_DIGITS } from '../geometry/sphericalGeometry.ts';
import { regularizeSharedSurfaceVertices } from './regularizeSharedGeometry.ts';
import {
  analyzeGeometryQuality,
  areaWeightedCentroids,
  chooseInteriorAnchors,
  scoreGeometryCandidate,
  territorySphericalAreas,
  type GeometryQualityAnalysis,
} from './geometryQuality.ts';
import type { IcosphereData } from '../geometry/icosphere.ts';

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

interface NormalizedCandidate {
  terrain: GeneratedTerrain;
  layout: NormalizedTerritoryLayout;
  sphere: IcosphereData;
  assignments: number[];
  landBorders: ReturnType<typeof buildLandBorderConnections>;
  borderWeights: ReturnType<typeof buildTerritoryBorderWeights>;
  seaRoutes: ReturnType<typeof buildSeaRoutes>;
  connections: ReturnType<typeof buildSeaRoutes>;
  quality: GeometryQualityAnalysis;
  diagnostic: GenerationCandidateDiagnostics;
}

function normalizedGeographicSpreadFailureCount(
  quality: GeometryQualityAnalysis,
): number {
  return quality.continents.filter(
    (continent) =>
      continent.territoryCount >= 4 &&
      continent.maximumAngularRadiusDegrees > 72 &&
      continent.meanAngularRadiusDegrees > 38,
  ).length;
}

function generateNormalizedPlanet(
  normalizedSeed: string,
  territoryCount: number,
  continentCount: number,
  playerCount: number,
  targetLandCoverage: number,
  timingObserver?: GenerationTimingObserver,
): PlanetDefinition {
  const totalStarted = performance.now();
  const baseSphere = createIcosphere(PLANET_SUBDIVISIONS);
  const cellAdjacency = buildCellAdjacency(baseSphere);
  const versionedSeed = `${normalizedSeed}|v${NORMALIZED_GENERATOR_VERSION}`;
  const routeRandom = createSeededRandom(
    `${normalizedSeed}|routes|${NORMALIZED_GENERATOR_VERSION}`,
  );
  const additionalRouteCount = routeRandom.integer(0, 3);
  const candidates: NormalizedCandidate[] = [];

  for (
    let candidateIndex = 0;
    candidateIndex < NORMALIZED_TERRITORY_CANDIDATE_COUNT;
    candidateIndex += 1
  ) {
    const derivedSeed = `${versionedSeed}|candidate-${candidateIndex}`;
    const terrain = generateTerrain(
      derivedSeed,
      baseSphere,
      cellAdjacency,
      targetLandCoverage,
      continentCount,
      continentCount >= 5
        ? 'varied'
        : continentCount === 4
          ? candidateIndex > 0
            ? 'varied'
            : 'compact-fallback'
          : 'legacy',
    );
    const initialLayout = generateNormalizedTerritoryLayout(
      baseSphere,
      cellAdjacency,
      terrain.landComponents,
      terrain.likelihood,
      territoryCount,
      versionedSeed,
      candidateIndex,
      timingObserver,
    );
    const polygonStarted = performance.now();
    const surfaceVertices = regularizeSharedSurfaceVertices(
      baseSphere,
      initialLayout.cellTerritoryIndices,
      initialLayout.territorySites,
    );
    const sphere = { faces: baseSphere.faces, vertices: surfaceVertices };
    const territoryCentroids = areaWeightedCentroids(
      sphere,
      initialLayout.cellTerritoryIndices,
      territoryCount,
    );
    const territoryCenters = chooseInteriorAnchors(
      sphere,
      initialLayout.cellTerritoryIndices,
      territoryCentroids,
      territoryCount,
    );
    timingObserver?.(
      'polygon-construction',
      performance.now() - polygonStarted,
    );
    const layout: NormalizedTerritoryLayout = {
      ...initialLayout,
      territoryCentroids,
      territoryCenters,
    };
    const scoringStarted = performance.now();
    const landBorders = buildLandBorderConnections(
      layout.cellTerritoryIndices,
      cellAdjacency,
    );
    const borderWeights = buildTerritoryBorderWeights(
      layout.cellTerritoryIndices,
      cellAdjacency,
    );
    const landAdjacency = adjacencyFromConnections(territoryCount, landBorders);
    const territoryAreas = territorySphericalAreas(
      sphere,
      layout.cellTerritoryIndices,
      territoryCount,
    );
    const continentSelection = chooseNormalizedContinentAssignments(
      landAdjacency,
      borderWeights,
      continentCount,
      derivedSeed,
      territoryAreas,
      territoryCentroids,
      !(continentCount === 4 && candidateIndex === 0),
    );
    const seaRoutes = buildSeaRoutes(
      territoryCenters,
      layout.territoryLandmassIndices,
      terrain.landComponents.length,
      additionalRouteCount,
      findCoastalTerritoryIndices(layout.cellTerritoryIndices, cellAdjacency),
    );
    const connections = [...landBorders, ...seaRoutes];
    const quality = analyzeGeometryQuality({
      sphere,
      ownership: layout.cellTerritoryIndices,
      territoryCount,
      sites: layout.territorySites,
      centroids: territoryCentroids,
      anchors: territoryCenters,
      continentAssignments: continentSelection.assignments,
      continentCount,
      borderWeights,
      connections,
      landCoverage:
        terrain.landCellIds.size / Math.max(1, baseSphere.faces.length),
    });
    const score = scoreGeometryCandidate(quality);
    timingObserver?.('candidate-scoring', performance.now() - scoringStarted);
    candidates.push({
      layout,
      terrain,
      sphere,
      assignments: continentSelection.assignments,
      landBorders,
      borderWeights,
      seaRoutes,
      connections,
      quality,
      diagnostic: {
        candidateIndex,
        derivedSeed,
        continentCandidateIndex: continentSelection.candidateIndex,
        continentAssignmentScore: Number(continentSelection.score.toFixed(6)),
        score,
      },
    });
  }
  const selected = [...candidates].sort(
    (left, right) =>
      normalizedGeographicSpreadFailureCount(left.quality) -
        normalizedGeographicSpreadFailureCount(right.quality) ||
      (continentCount === 4 && left.diagnostic.candidateIndex === 0 ? 1 : 0) -
        (continentCount === 4 && right.diagnostic.candidateIndex === 0
          ? 1
          : 0) ||
      left.diagnostic.score.total - right.diagnostic.score.total ||
      left.diagnostic.candidateIndex - right.diagnostic.candidateIndex,
  )[0]!;
  const players = generatePlayers(playerCount);
  const detailRandom = createSeededRandom(
    `${normalizedSeed}|details|${NORMALIZED_GENERATOR_VERSION}`,
  );
  const strategicAdjacency = adjacencyFromConnections(
    territoryCount,
    selected.connections,
  );
  const territories: TerritoryDefinition[] =
    selected.layout.territoryCenters.map((center, index) => {
      const assignedContinent = selected.assignments[index]!;
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
        cellCount: selected.layout.territoryCellCounts[index]!,
        landmassId: landmassId(
          selected.layout.territoryLandmassIndices[index]!,
        ),
      };
    });
  const continents = Array.from({ length: continentCount }, (_, index) => {
    const ids = territories
      .filter((territory) => territory.continentId === continentId(index))
      .map((territory) => territory.id);
    const idSet = new Set(ids);
    const externalGatewayTerritoryIds = ids.filter((id) =>
      territories
        .find((territory) => territory.id === id)!
        .adjacentTerritoryIds.some((neighbor) => !idSet.has(neighbor)),
    );
    const neighboringContinentIds = [
      ...new Set(
        ids.flatMap((id) =>
          territories
            .find((territory) => territory.id === id)!
            .adjacentTerritoryIds.map(
              (neighbor) =>
                territories.find((territory) => territory.id === neighbor)!
                  .continentId,
            )
            .filter((neighbor) => neighbor !== continentId(index)),
        ),
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
  const surfaceCells = selected.layout.cellTerritoryIndices.map(
    (territoryIndex, id) => ({
      id,
      terrainType:
        territoryIndex === null ? ('ocean' as const) : ('land' as const),
      territoryId: territoryIndex === null ? null : territoryId(territoryIndex),
    }),
  );
  const landmasses = selected.terrain.landComponents.map((_, index) => ({
    id: landmassId(index),
    territoryIds: territories
      .filter((territory) => territory.landmassId === landmassId(index))
      .map((territory) => territory.id),
  }));
  const analysis = analyzeStrategicGraph(
    territories,
    selected.connections,
    continents,
    landmasses,
    selected.borderWeights,
  );
  const generationDiagnostics: GenerationDiagnostics = {
    profile: 'v2-normalized',
    relaxationIterations: NORMALIZED_RELAXATION_ITERATIONS,
    relaxationMoveFraction: NORMALIZED_RELAXATION_MOVE_FRACTION,
    coordinatePrecisionDigits: COORDINATE_PRECISION_DIGITS,
    candidateCount: NORMALIZED_TERRITORY_CANDIDATE_COUNT,
    selectedCandidateIndex: selected.diagnostic.candidateIndex,
    candidates: candidates.map((candidate) => candidate.diagnostic),
    territoryMetrics: selected.quality.territories,
    continentMetrics: selected.quality.continents,
    worldMetrics: selected.quality.world,
    sites: selected.layout.territorySites,
    centroids: selected.layout.territoryCentroids,
  };
  const planet: PlanetDefinition = {
    seed: normalizedSeed,
    generatorVersion: NORMALIZED_GENERATOR_VERSION,
    territoryCount,
    continentCount,
    playerCount,
    players,
    territories,
    continents,
    surfaceCells,
    landmasses,
    connections: selected.connections,
    landCoverage:
      surfaceCells.filter((cell) => cell.terrainType === 'land').length /
      surfaceCells.length,
    analysis,
    surfaceVertices: selected.sphere.vertices,
    generationDiagnostics,
  };
  const validation = validatePlanet(planet, {
    territoryCount,
    continentCount,
    playerCount,
  });
  if (!validation.valid) {
    throw new Error(
      `Generated an invalid normalized planet: ${validation.errors.join(' ')}`,
    );
  }
  const continentQuality = analyzeContinentQuality(planet);
  if (continentQuality.severeFailures.length > 0) {
    throw new Error(
      `Generated a normalized planet that failed continent shape quality: ${continentQuality.severeFailures.join(' ')}`,
    );
  }
  timingObserver?.('total', performance.now() - totalStarted);
  return planet;
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
  const generatorVersion = options.generatorVersion ?? GENERATOR_VERSION;
  if (
    generatorVersion !== GENERATOR_VERSION &&
    generatorVersion !== NORMALIZED_GENERATOR_VERSION
  ) {
    throw new Error(`Unsupported world generator version ${generatorVersion}.`);
  }
  if (generatorVersion === NORMALIZED_GENERATOR_VERSION) {
    return generateNormalizedPlanet(
      normalizedSeed,
      territoryCount,
      continentCount,
      playerCount,
      targetLandCoverage,
      options.timingObserver,
    );
  }

  const totalStarted = performance.now();
  const sphere = createIcosphere(PLANET_SUBDIVISIONS);
  const cellAdjacency = buildCellAdjacency(sphere);
  const terrain = generateTerrain(
    `${normalizedSeed}|v${GENERATOR_VERSION}`,
    sphere,
    cellAdjacency,
    targetLandCoverage,
    continentCount,
  );
  const siteStarted = performance.now();
  const layout = generateTerritoryLayout(
    sphere,
    cellAdjacency,
    terrain.landComponents,
    terrain.likelihood,
    territoryCount,
  );
  options.timingObserver?.('site-generation', performance.now() - siteStarted);
  const polygonStarted = performance.now();
  const landBorders = buildLandBorderConnections(
    layout.cellTerritoryIndices,
    cellAdjacency,
  );
  options.timingObserver?.(
    'polygon-construction',
    performance.now() - polygonStarted,
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
  const scoringStarted = performance.now();
  const assignments = chooseSpatialContinentAssignments(
    landAdjacency,
    borderWeights,
    continentCount,
    `${normalizedSeed}|v${GENERATOR_VERSION}`,
  );
  options.timingObserver?.(
    'candidate-scoring',
    performance.now() - scoringStarted,
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
  options.timingObserver?.('total', performance.now() - totalStarted);
  return planet;
}
