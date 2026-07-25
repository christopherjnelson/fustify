import type { SeededRandom } from './seededRandom.ts';
import { createSeededRandom } from './seededRandom.ts';
import type { TerritoryBorderWeight } from './buildConnections.ts';
import { dot, normalize } from '../geometry/sphericalMath.ts';
import type { Vector3Tuple } from '../types/territory.ts';

function distancesFrom(
  start: number,
  adjacency: readonly number[][],
): number[] {
  const distances = adjacency.map(() => Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency[current]!) {
      if (!Number.isFinite(distances[neighbor])) {
        distances[neighbor] = distances[current]! + 1;
        queue.push(neighbor);
      }
    }
  }
  return distances;
}

function chooseSpreadSeeds(
  adjacency: readonly number[][],
  count: number,
  random: SeededRandom,
): number[] {
  const seeds = [random.integer(0, adjacency.length - 1)];
  while (seeds.length < count) {
    const distanceMaps = seeds.map((seed) => distancesFrom(seed, adjacency));
    let bestDistance = -1;
    let candidates: number[] = [];
    for (let node = 0; node < adjacency.length; node += 1) {
      if (seeds.includes(node)) continue;
      const minDistance = Math.min(...distanceMaps.map((map) => map[node]!));
      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        candidates = [node];
      } else if (minDistance === bestDistance) {
        candidates.push(node);
      }
    }
    seeds.push(random.pick(candidates));
  }
  return seeds;
}

/** Multi-source graph growth makes every resulting continent connected. */
export function generateContinentAssignments(
  adjacency: readonly number[][],
  continentCount: number,
  random: SeededRandom,
): number[] {
  const seeds = chooseSpreadSeeds(adjacency, continentCount, random);
  const assignments = adjacency.map(() => -1);
  const queue: Array<[number, number]> = [];

  seeds.forEach((territory, continent) => {
    assignments[territory] = continent;
    queue.push([territory, continent]);
  });

  while (queue.length > 0) {
    const [territory, continent] = queue.shift()!;
    for (const neighbor of random.shuffle(adjacency[territory]!)) {
      if (assignments[neighbor] === -1) {
        assignments[neighbor] = continent;
        queue.push([neighbor, continent]);
      }
    }
  }
  return assignments;
}

function strategicScore(
  assignments: readonly number[],
  adjacency: readonly number[][],
  continentCount: number,
): number {
  const sizes = Array.from({ length: continentCount }, () => 0);
  const gateways = Array.from({ length: continentCount }, () => new Set());
  assignments.forEach((continent, territory) => {
    sizes[continent] += 1;
    if (
      adjacency[territory]!.some(
        (neighbor) => assignments[neighbor] !== continent,
      )
    ) {
      gateways[continent]!.add(territory);
    }
  });
  const gatewayCounts = gateways.map((items) => items.size);
  const lowEntryCount = gatewayCounts.filter((count) => count <= 3).length;
  const sizeSpread = Math.max(...sizes) - Math.min(...sizes);
  const gatewaySpread = Math.max(...gatewayCounts) - Math.min(...gatewayCounts);
  const excessiveGateways = gatewayCounts.reduce(
    (sum, count) => sum + Math.max(0, count - 5),
    0,
  );
  return (
    sizeSpread * 1.5 +
    excessiveGateways * 2 -
    lowEntryCount * 7 -
    gatewaySpread * 0.7
  );
}

/** Selects a connected partition with useful variation in gateway profiles. */
export function chooseStrategicContinentAssignments(
  adjacency: readonly number[][],
  continentCount: number,
  seed: string,
): number[] {
  let best: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const assignments = generateContinentAssignments(
      adjacency,
      continentCount,
      createSeededRandom(`${seed}|continents|${attempt}`),
    );
    const score = strategicScore(assignments, adjacency, continentCount);
    if (score < bestScore) {
      bestScore = score;
      best = assignments;
    }
  }
  return best!;
}

function borderLookup(weights: readonly TerritoryBorderWeight[]) {
  const lookup = new Map<string, number>();
  for (const weight of weights) {
    lookup.set(
      `${weight.leftTerritoryIndex}:${weight.rightTerritoryIndex}`,
      weight.sharedCellEdgeCount,
    );
    lookup.set(
      `${weight.rightTerritoryIndex}:${weight.leftTerritoryIndex}`,
      weight.sharedCellEdgeCount,
    );
  }
  return lookup;
}

function graphComponents(adjacency: readonly number[][]): number[][] {
  const visited = new Set<number>();
  const result: number[][] = [];
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency[current]!) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    result.push(component.sort((a, b) => a - b));
  }
  return result;
}

function allocateContinents(
  components: readonly number[][],
  continentCount: number,
): number[] {
  if (components.length > continentCount) {
    throw new Error(
      `Cannot create ${continentCount} land-connected continents across ${components.length} landmasses.`,
    );
  }
  const allocations = components.map(() => 1);
  while (allocations.reduce((sum, value) => sum + value, 0) < continentCount) {
    let selected = -1;
    let bestCapacity = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < components.length; index += 1) {
      if (allocations[index]! >= components[index]!.length) continue;
      const capacity = components[index]!.length / (allocations[index]! + 1);
      if (capacity > bestCapacity) {
        bestCapacity = capacity;
        selected = index;
      }
    }
    if (selected < 0) {
      throw new Error('Continent allocation exhausted available territories.');
    }
    allocations[selected] += 1;
  }
  return allocations;
}

function chooseComponentSeeds(
  component: readonly number[],
  count: number,
  adjacency: readonly number[][],
  random: SeededRandom,
): number[] {
  const allowed = new Set(component);
  const seeds = [random.pick(component)];
  while (seeds.length < count) {
    const distanceMaps = seeds.map((seed) => distancesFrom(seed, adjacency));
    let bestDistance = -1;
    let candidates: number[] = [];
    for (const node of component) {
      if (seeds.includes(node)) continue;
      const minDistance = Math.min(...distanceMaps.map((map) => map[node]!));
      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        candidates = [node];
      } else if (minDistance === bestDistance) {
        candidates.push(node);
      }
    }
    const next = random.pick(candidates.filter((node) => allowed.has(node)));
    seeds.push(next);
  }
  return seeds;
}

function generateSpatialAssignments(
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
  random: SeededRandom,
): number[] {
  const components = graphComponents(adjacency);
  const allocations = allocateContinents(components, continentCount);
  const seeds: number[] = [];
  const targets: number[] = [];
  for (
    let componentIndex = 0;
    componentIndex < components.length;
    componentIndex += 1
  ) {
    const component = components[componentIndex]!;
    const allocation = allocations[componentIndex]!;
    seeds.push(
      ...chooseComponentSeeds(component, allocation, adjacency, random),
    );
    for (let index = 0; index < allocation; index += 1) {
      targets.push(component.length / allocation);
    }
  }
  const assignments = adjacency.map(() => -1);
  const sizes = Array.from({ length: continentCount }, () => 1);
  const weights = borderLookup(borderWeights);
  const tieOrder = random.shuffle(adjacency.map((_, index) => index));
  const tieRank = new Map(tieOrder.map((territory, rank) => [territory, rank]));
  seeds.forEach((territory, continent) => {
    assignments[territory] = continent;
  });

  let remaining = adjacency.length - seeds.length;
  while (remaining > 0) {
    const candidates: Array<{
      territory: number;
      continent: number;
      score: number;
    }> = [];
    assignments.forEach((assigned, territory) => {
      if (assigned !== -1) return;
      const neighboringContinents = new Set(
        adjacency[territory]!.map((neighbor) => assignments[neighbor]!).filter(
          (continent) => continent !== -1,
        ),
      );
      for (const continent of neighboringContinents) {
        const assignedNeighbors = adjacency[territory]!.filter(
          (neighbor) => assignments[neighbor] !== -1,
        );
        const sameStrategic = assignedNeighbors.filter(
          (neighbor) => assignments[neighbor] === continent,
        ).length;
        let sameLand = 0;
        let externalLand = 0;
        let sameBoundary = 0;
        let externalBoundary = 0;
        for (const neighbor of assignedNeighbors) {
          const boundary = weights.get(`${territory}:${neighbor}`) ?? 0;
          if (boundary === 0) continue;
          if (assignments[neighbor] === continent) {
            sameLand += 1;
            sameBoundary += boundary;
          } else {
            externalLand += 1;
            externalBoundary += boundary;
          }
        }
        const fillPenalty = (sizes[continent]! / targets[continent]!) * 8;
        candidates.push({
          territory,
          continent,
          score:
            sameBoundary * 1.8 +
            sameLand * 9 +
            sameStrategic * 2.5 -
            externalBoundary * 1.15 -
            externalLand * 5 -
            fillPenalty,
        });
      }
    });
    const selected = candidates.sort(
      (a, b) =>
        b.score - a.score ||
        tieRank.get(a.territory)! - tieRank.get(b.territory)! ||
        a.continent - b.continent,
    )[0];
    if (!selected)
      throw new Error('Continent growth exhausted its strategic frontier.');
    assignments[selected.territory] = selected.continent;
    sizes[selected.continent] += 1;
    remaining -= 1;
  }
  return assignments;
}

function longestNarrowChain(
  continent: number,
  assignments: readonly number[],
  adjacency: readonly number[][],
): number {
  const nodes = assignments
    .map((assigned, territory) => ({ assigned, territory }))
    .filter(({ assigned }) => assigned === continent)
    .map(({ territory }) => territory);
  const allowed = new Set(
    nodes.filter(
      (territory) =>
        adjacency[territory]!.filter(
          (neighbor) => assignments[neighbor] === continent,
        ).length <= 2,
    ),
  );
  let longest = 0;
  for (const start of allowed) {
    const distances = new Map([[start, 0]]);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      for (const neighbor of adjacency[current]!) {
        if (!allowed.has(neighbor) || distances.has(neighbor)) continue;
        distances.set(neighbor, distances.get(current)! + 1);
        queue.push(neighbor);
      }
    }
    longest = Math.max(longest, 1 + Math.max(0, ...distances.values()));
  }
  return longest;
}

function spatialFailureReasons(
  assignments: readonly number[],
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
): string[] {
  const reasons: string[] = [];
  for (let continent = 0; continent < continentCount; continent += 1) {
    const territories = assignments
      .map((assigned, territory) => ({ assigned, territory }))
      .filter(({ assigned }) => assigned === continent)
      .map(({ territory }) => territory);
    const allowed = new Set(territories);
    if (territories.length === 0) {
      reasons.push(`continent ${continent + 1} is empty`);
      continue;
    }
    const visited = new Set<number>();
    const queue = [territories[0]!];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      if (visited.has(current) || !allowed.has(current)) continue;
      visited.add(current);
      queue.push(...adjacency[current]!);
    }
    if (visited.size !== territories.length) {
      reasons.push(`continent ${continent + 1} is not land-connected`);
    }
    let internalEdges = 0;
    let boundaryEdges = 0;
    let dominated = 0;
    for (const territory of territories) {
      const same = adjacency[territory]!.filter(
        (neighbor) => assignments[neighbor] === continent,
      ).length;
      const externalCounts = new Map<number, number>();
      for (const neighbor of adjacency[territory]!) {
        const external = assignments[neighbor]!;
        if (external === continent) continue;
        externalCounts.set(external, (externalCounts.get(external) ?? 0) + 1);
      }
      if (Math.max(0, ...externalCounts.values()) > same) dominated += 1;
    }
    for (const border of borderWeights) {
      const left = assignments[border.leftTerritoryIndex]!;
      const right = assignments[border.rightTerritoryIndex]!;
      if (left === continent && right === continent) internalEdges += 1;
      else if (left === continent || right === continent) boundaryEdges += 1;
    }
    const chain = longestNarrowChain(continent, assignments, adjacency);
    const compactness =
      internalEdges / Math.max(1, internalEdges + boundaryEdges);
    const boundaryRatio = boundaryEdges / territories.length;
    if (
      territories.length >= 3 &&
      chain === territories.length &&
      dominated > 0 &&
      compactness < 0.3 &&
      boundaryRatio > 1.5
    ) {
      reasons.push(`continent ${continent + 1} is an exposed narrow strip`);
    }
    if (
      territories.length >= 5 &&
      chain >= Math.max(4, Math.ceil(territories.length * 0.6))
    ) {
      reasons.push(`continent ${continent + 1} has an extreme narrow chain`);
    }
  }
  return reasons;
}

function spatialScore(
  assignments: readonly number[],
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
): number {
  const sizes = Array.from({ length: continentCount }, () => 0);
  const sameLandNeighbors = assignments.map(() => 0);
  const externalByContinent = assignments.map(() => new Map<number, number>());
  let internalBoundary = 0;
  let externalBoundary = 0;
  const pairEdges = new Map<string, number>();
  assignments.forEach((continent) => {
    sizes[continent] += 1;
  });
  for (const border of borderWeights) {
    const left = border.leftTerritoryIndex;
    const right = border.rightTerritoryIndex;
    const leftContinent = assignments[left]!;
    const rightContinent = assignments[right]!;
    if (leftContinent === rightContinent) {
      internalBoundary += border.sharedCellEdgeCount;
      sameLandNeighbors[left] += 1;
      sameLandNeighbors[right] += 1;
    } else {
      externalBoundary += border.sharedCellEdgeCount;
      externalByContinent[left]!.set(
        rightContinent,
        (externalByContinent[left]!.get(rightContinent) ?? 0) + 1,
      );
      externalByContinent[right]!.set(
        leftContinent,
        (externalByContinent[right]!.get(leftContinent) ?? 0) + 1,
      );
      const pair = [leftContinent, rightContinent]
        .sort((a, b) => a - b)
        .join(':');
      pairEdges.set(pair, (pairEdges.get(pair) ?? 0) + 1);
    }
  }
  const dominated = assignments.filter((_, territory) => {
    const strongestExternal = Math.max(
      0,
      ...externalByContinent[territory]!.values(),
    );
    return strongestExternal > sameLandNeighbors[territory]!;
  }).length;
  const protrusions = assignments.filter(
    (_, territory) =>
      sameLandNeighbors[territory]! <= 1 &&
      [...externalByContinent[territory]!.values()].reduce(
        (sum, value) => sum + value,
        0,
      ) >= 2,
  ).length;
  const interleaving = [...pairEdges.values()].reduce(
    (sum, edges) => sum + Math.max(0, edges - 3) ** 2,
    0,
  );
  const sizeSpread = Math.max(...sizes) - Math.min(...sizes);
  const cohesion =
    internalBoundary / Math.max(1, internalBoundary + externalBoundary);
  const internalSeaEdges = adjacency.reduce(
    (count, neighbors, territory) =>
      count +
      neighbors.filter(
        (neighbor) =>
          neighbor > territory &&
          assignments[neighbor] === assignments[territory] &&
          !borderWeights.some(
            (border) =>
              border.leftTerritoryIndex === Math.min(territory, neighbor) &&
              border.rightTerritoryIndex === Math.max(territory, neighbor),
          ),
      ).length,
    0,
  );
  return (
    dominated * 18 +
    protrusions * 11 +
    interleaving * 4 +
    sizeSpread * 3 +
    internalSeaEdges * 8 -
    cohesion * 30
  );
}

/**
 * Connected seeded growth weighted toward shared geographic borders. Sea-route
 * claims remain possible when a continent must cross physical landmasses.
 */
export function chooseSpatialContinentAssignments(
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
  seed: string,
): number[] {
  let best: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let nearestFailure: string[] = [];
  for (
    let attempt = 0;
    attempt < MAX_CONTINENT_ASSIGNMENT_ATTEMPTS;
    attempt += 1
  ) {
    const assignments = generateSpatialAssignments(
      adjacency,
      borderWeights,
      continentCount,
      createSeededRandom(`${seed}|spatial-continents|${attempt}`),
    );
    const score = spatialScore(
      assignments,
      adjacency,
      borderWeights,
      continentCount,
    );
    const failures = spatialFailureReasons(
      assignments,
      adjacency,
      borderWeights,
      continentCount,
    );
    if (
      nearestFailure.length === 0 ||
      failures.length < nearestFailure.length
    ) {
      nearestFailure = failures;
    }
    if (failures.length === 0 && score < bestScore) {
      bestScore = score;
      best = assignments;
    }
  }
  if (!best) {
    throw new Error(
      `Unable to generate an accepted land-connected continent layout after ${MAX_CONTINENT_ASSIGNMENT_ATTEMPTS} deterministic attempts: ${nearestFailure.join(', ') || 'no candidate was produced'}.`,
    );
  }
  return best;
}

export const MAX_CONTINENT_ASSIGNMENT_ATTEMPTS = 96;

export const NORMALIZED_CONTINENT_CANDIDATE_COUNT = 24;

export interface NormalizedContinentSelection {
  assignments: number[];
  candidateIndex: number;
  score: number;
}

function normalizedContinentShapeScore(
  assignments: readonly number[],
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
  territoryAreas: readonly number[],
  territoryCenters: readonly Vector3Tuple[],
): number {
  const base = spatialScore(
    assignments,
    adjacency,
    borderWeights,
    continentCount,
  );
  const sizes = Array.from({ length: continentCount }, () => 0);
  const areas = Array.from({ length: continentCount }, () => 0);
  const centroids = Array.from(
    { length: continentCount },
    () => [0, 0, 0] as Vector3Tuple,
  );
  assignments.forEach((continent, territory) => {
    const area = territoryAreas[territory] ?? 1;
    sizes[continent] += 1;
    areas[continent] += area;
    centroids[continent]![0] += territoryCenters[territory]![0] * area;
    centroids[continent]![1] += territoryCenters[territory]![1] * area;
    centroids[continent]![2] += territoryCenters[territory]![2] * area;
  });
  const coefficientOfVariation = (values: readonly number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return (
      Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          values.length,
      ) / Math.max(1e-12, mean)
    );
  };
  const appendages = assignments.filter((continent, territory) => {
    const internal = adjacency[territory]!.filter(
      (neighbor) => assignments[neighbor] === continent,
    ).length;
    return sizes[continent]! >= 3 && internal <= 1;
  }).length;
  const geographicSpread = assignments.reduce((sum, continent, territory) => {
    const center = normalize(centroids[continent]!);
    const angle = Math.acos(
      Math.max(-1, Math.min(1, dot(center, territoryCenters[territory]!))),
    );
    return sum + angle * (territoryAreas[territory] ?? 1);
  }, 0);
  const totalArea = areas.reduce((sum, value) => sum + value, 0);
  return Number(
    (
      base +
      coefficientOfVariation(sizes) * 34 +
      coefficientOfVariation(areas) * 46 +
      appendages * 14 +
      (geographicSpread / Math.max(1e-12, totalArea)) * 22
    ).toFixed(9),
  );
}

/**
 * The v2 selector keeps the existing connected shared-boundary growth, but
 * adds explicit count/area/geographic compactness and appendage pressure.
 */
export function chooseNormalizedContinentAssignments(
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
  seed: string,
  territoryAreas: readonly number[],
  territoryCenters: readonly Vector3Tuple[],
): NormalizedContinentSelection {
  let selected: NormalizedContinentSelection | null = null;
  let nearestFailure: string[] = [];
  for (
    let attempt = 0;
    attempt < NORMALIZED_CONTINENT_CANDIDATE_COUNT;
    attempt += 1
  ) {
    const assignments = generateSpatialAssignments(
      adjacency,
      borderWeights,
      continentCount,
      createSeededRandom(`${seed}|normalized-continents|${attempt}`),
    );
    const failures = spatialFailureReasons(
      assignments,
      adjacency,
      borderWeights,
      continentCount,
    );
    if (
      nearestFailure.length === 0 ||
      failures.length < nearestFailure.length
    ) {
      nearestFailure = failures;
    }
    if (failures.length > 0) continue;
    const score = normalizedContinentShapeScore(
      assignments,
      adjacency,
      borderWeights,
      continentCount,
      territoryAreas,
      territoryCenters,
    );
    if (
      selected === null ||
      score < selected.score ||
      (score === selected.score && attempt < selected.candidateIndex)
    ) {
      selected = { assignments, candidateIndex: attempt, score };
    }
  }
  if (!selected) {
    throw new Error(
      `Unable to generate an accepted normalized continent layout after ${NORMALIZED_CONTINENT_CANDIDATE_COUNT} deterministic attempts: ${nearestFailure.join(', ') || 'no candidate was produced'}.`,
    );
  }
  return selected;
}

/** Placeholder bonus: size / 3 + neighboring continents / 2 - gateways / 4. */
export function calculateContinentBonus(
  territoryCount: number,
  externalGatewayCount: number,
  neighboringContinentCount: number,
): number {
  return Math.max(
    2,
    Math.round(
      territoryCount / 3 +
        neighboringContinentCount / 2 -
        externalGatewayCount / 4,
    ),
  );
}
