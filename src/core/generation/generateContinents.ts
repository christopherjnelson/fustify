import type { SeededRandom } from './seededRandom';

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
