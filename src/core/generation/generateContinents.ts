import type { SeededRandom } from './seededRandom';
import { createSeededRandom } from './seededRandom';
import type { TerritoryBorderWeight } from './buildConnections';

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

function generateSpatialAssignments(
  adjacency: readonly number[][],
  borderWeights: readonly TerritoryBorderWeight[],
  continentCount: number,
  random: SeededRandom,
): number[] {
  const seeds = chooseSpreadSeeds(adjacency, continentCount, random);
  const assignments = adjacency.map(() => -1);
  const sizes = Array.from({ length: continentCount }, () => 1);
  const targets = Array.from(
    { length: continentCount },
    (_, index) =>
      Math.floor(adjacency.length / continentCount) +
      (index < adjacency.length % continentCount ? 1 : 0),
  );
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
        const seaOnlyPenalty = sameLand === 0 ? 22 : 0;
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
            seaOnlyPenalty -
            fillPenalty,
        });
      }
    });
    const underTarget = candidates.filter(
      (candidate) =>
        sizes[candidate.continent]! < targets[candidate.continent]!,
    );
    const pool = underTarget.length > 0 ? underTarget : candidates;
    const selected = pool.sort(
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
    if (score < bestScore) {
      bestScore = score;
      best = assignments;
    }
  }
  return best!;
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
