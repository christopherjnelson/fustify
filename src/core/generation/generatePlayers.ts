import type { PlayerDefinition } from '../types/player';
import { PLAYER_PALETTE } from './constants';
import { createSeededRandom } from './seededRandom';

const PLAYER_NAMES = [
  'Crimson League',
  'Azure Pact',
  'Golden Union',
  'Verdant Order',
  'Violet Assembly',
  'Rose Coalition',
] as const;

function distancesFrom(
  start: number,
  adjacency: readonly number[][],
): number[] {
  const distances = adjacency.map(() => Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of adjacency[current]!) {
      if (!Number.isFinite(distances[neighbor])) {
        distances[neighbor] = distances[current]! + 1;
        queue.push(neighbor);
      }
    }
  }
  return distances;
}

function spreadSeeds(
  adjacency: readonly number[][],
  playerCount: number,
  seed: string,
): number[] {
  const random = createSeededRandom(`${seed}|ownership-seeds`);
  const seeds = [random.integer(0, adjacency.length - 1)];
  while (seeds.length < playerCount) {
    const distanceMaps = seeds.map((item) => distancesFrom(item, adjacency));
    const candidates = adjacency
      .map((_, index) => index)
      .filter((index) => !seeds.includes(index))
      .map((index) => ({
        index,
        distance: Math.min(...distanceMaps.map((map) => map[index]!)),
      }))
      .sort((a, b) => b.distance - a.distance || a.index - b.index);
    const bestDistance = candidates[0]!.distance;
    seeds.push(
      random.pick(candidates.filter((item) => item.distance === bestDistance))
        .index,
    );
  }
  return seeds;
}

/** Balanced multi-source growth gives each player a connected starting region. */
function growOwnershipAssignments(
  adjacency: readonly number[][],
  playerCount: number,
  seed: string,
): number[] {
  const seeds = spreadSeeds(adjacency, playerCount, seed);
  const assignments = adjacency.map(() => -1);
  const sizes = Array.from({ length: playerCount }, () => 1);
  const targets = Array.from(
    { length: playerCount },
    (_, index) =>
      Math.floor(adjacency.length / playerCount) +
      (index < adjacency.length % playerCount ? 1 : 0),
  );
  const frontiers = seeds.map(() => new Set<number>());
  seeds.forEach((territory, player) => {
    assignments[territory] = player;
  });
  seeds.forEach((territory, player) => {
    for (const neighbor of adjacency[territory]!) {
      if (assignments[neighbor] === -1) frontiers[player]!.add(neighbor);
    }
  });

  let remaining = adjacency.length - seeds.length;
  while (remaining > 0) {
    const available = seeds
      .map((_, player) => player)
      .filter((player) =>
        [...frontiers[player]!].some(
          (territory) => assignments[territory] === -1,
        ),
      );
    const underTarget = available.filter(
      (player) => sizes[player]! < targets[player]!,
    );
    const player = (underTarget.length > 0 ? underTarget : available).sort(
      (a, b) => sizes[a]! / targets[a]! - sizes[b]! / targets[b]! || a - b,
    )[0];
    if (player === undefined) {
      throw new Error('Ownership growth exhausted its connected frontier.');
    }
    const next = [...frontiers[player]!]
      .filter((territory) => assignments[territory] === -1)
      .sort((a, b) => {
        const openA = adjacency[a]!.filter(
          (neighbor) => assignments[neighbor] === -1,
        ).length;
        const openB = adjacency[b]!.filter(
          (neighbor) => assignments[neighbor] === -1,
        ).length;
        return openB - openA || a - b;
      })[0]!;
    assignments[next] = player;
    sizes[player] += 1;
    frontiers[player]!.delete(next);
    for (const neighbor of adjacency[next]!) {
      if (assignments[neighbor] === -1) frontiers[player]!.add(neighbor);
    }
    remaining -= 1;
  }
  return assignments;
}

export function generateOwnershipAssignments(
  adjacency: readonly number[][],
  playerCount: number,
  seed: string,
): number[] {
  let best: number[] | null = null;
  let bestSpread = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const assignments = growOwnershipAssignments(
      adjacency,
      playerCount,
      `${seed}|attempt-${attempt}`,
    );
    const counts = Array.from(
      { length: playerCount },
      (_, player) =>
        assignments.filter((assigned) => assigned === player).length,
    );
    const spread = Math.max(...counts) - Math.min(...counts);
    if (spread < bestSpread) {
      bestSpread = spread;
      best = assignments;
    }
    if (spread <= 1) break;
  }
  if (!best || bestSpread > 1) {
    throw new Error('Unable to generate balanced connected player ownership.');
  }
  return best;
}

export function generatePlayers(playerCount: number): PlayerDefinition[] {
  return Array.from({ length: playerCount }, (_, index) => ({
    id: `player-${String(index + 1).padStart(2, '0')}`,
    name: PLAYER_NAMES[index % PLAYER_NAMES.length] ?? `Player ${index + 1}`,
    color: PLAYER_PALETTE[index % PLAYER_PALETTE.length]!,
  }));
}
