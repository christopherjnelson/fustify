import type { IcosphereData } from '../geometry/icosphere';
import { centroid, normalize } from '../geometry/sphericalMath';
import type { Vector3Tuple } from '../types/territory';

export interface GeneratedTerritoryLayout {
  cellTerritoryIndices: Array<number | null>;
  territoryCenters: Vector3Tuple[];
  territoryCellCounts: number[];
  territoryLandmassIndices: number[];
}

function allocateTerritories(
  components: readonly number[][],
  territoryCount: number,
): number[] {
  if (components.length > territoryCount) {
    throw new Error('There are more landmasses than requested territories.');
  }
  const allocations = components.map(() => 1);
  while (allocations.reduce((sum, value) => sum + value, 0) < territoryCount) {
    let selected = 0;
    let bestCapacity = -Infinity;
    components.forEach((component, index) => {
      const capacity = component.length / (allocations[index]! + 1);
      if (capacity > bestCapacity) {
        bestCapacity = capacity;
        selected = index;
      }
    });
    allocations[selected] += 1;
  }
  return allocations;
}

function spreadSeeds(
  component: readonly number[],
  count: number,
  adjacency: readonly number[][],
  likelihood: readonly number[],
): number[] {
  const allowed = new Set(component);
  const first = [...component].sort(
    (a, b) => likelihood[b]! - likelihood[a]! || a - b,
  )[0]!;
  const seeds = [first];
  const distances = new Map<number, number>();
  let queue = [first];

  const updateDistances = (seed: number) => {
    const local = new Map<number, number>([[seed, 0]]);
    queue = [seed];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      const nextDistance = local.get(current)! + 1;
      for (const neighbor of adjacency[current]!) {
        if (!allowed.has(neighbor) || local.has(neighbor)) continue;
        local.set(neighbor, nextDistance);
        queue.push(neighbor);
      }
    }
    for (const cellId of component) {
      distances.set(
        cellId,
        Math.min(distances.get(cellId) ?? Infinity, local.get(cellId)!),
      );
    }
  };

  updateDistances(first);

  while (seeds.length < count) {
    const next = [...component]
      .filter((cellId) => !seeds.includes(cellId))
      .sort(
        (a, b) =>
          distances.get(b)! - distances.get(a)! ||
          likelihood[b]! - likelihood[a]! ||
          a - b,
      )[0]!;
    seeds.push(next);
    updateDistances(next);
  }
  return seeds;
}

function growComponent(
  component: readonly number[],
  seeds: readonly number[],
  adjacency: readonly number[][],
  ownership: Array<number | null>,
  territoryOffset: number,
): void {
  const allowed = new Set(component);
  const sizes = seeds.map(() => 1);
  const targets = seeds.map(
    (_, index) =>
      Math.floor(component.length / seeds.length) +
      (index < component.length % seeds.length ? 1 : 0),
  );
  const frontiers = seeds.map(() => new Set<number>());

  seeds.forEach((cellId, localTerritory) => {
    ownership[cellId] = territoryOffset + localTerritory;
  });
  seeds.forEach((cellId, localTerritory) => {
    for (const neighbor of adjacency[cellId]!) {
      if (allowed.has(neighbor) && ownership[neighbor] === null) {
        frontiers[localTerritory]!.add(neighbor);
      }
    }
  });

  let remaining = component.length - seeds.length;
  while (remaining > 0) {
    const candidates = seeds
      .map((_, index) => index)
      .filter((index) => {
        for (const cellId of frontiers[index]!) {
          if (ownership[cellId] === null) return true;
        }
        return false;
      })
      .sort(
        (a, b) => sizes[a]! / targets[a]! - sizes[b]! / targets[b]! || a - b,
      );
    const localTerritory = candidates[0];
    if (localTerritory === undefined) {
      throw new Error('Territory growth exhausted its connected frontier.');
    }
    const frontier = frontiers[localTerritory]!;
    const next = [...frontier]
      .filter((cellId) => ownership[cellId] === null)
      .sort((a, b) => {
        const openA = adjacency[a]!.filter(
          (neighbor) => allowed.has(neighbor) && ownership[neighbor] === null,
        ).length;
        const openB = adjacency[b]!.filter(
          (neighbor) => allowed.has(neighbor) && ownership[neighbor] === null,
        ).length;
        return openB - openA || a - b;
      })[0]!;
    ownership[next] = territoryOffset + localTerritory;
    sizes[localTerritory] += 1;
    frontier.delete(next);
    for (const neighbor of adjacency[next]!) {
      if (allowed.has(neighbor) && ownership[neighbor] === null) {
        frontier.add(neighbor);
      }
    }
    remaining -= 1;
  }
}

export function generateTerritoryLayout(
  sphere: IcosphereData,
  adjacency: readonly number[][],
  landComponents: readonly number[][],
  likelihood: readonly number[],
  territoryCount: number,
): GeneratedTerritoryLayout {
  const ownership: Array<number | null> = sphere.faces.map(() => null);
  const allocations = allocateTerritories(landComponents, territoryCount);
  const territoryLandmassIndices: number[] = [];
  let offset = 0;
  landComponents.forEach((component, landmassIndex) => {
    const seeds = spreadSeeds(
      component,
      allocations[landmassIndex]!,
      adjacency,
      likelihood,
    );
    growComponent(component, seeds, adjacency, ownership, offset);
    seeds.forEach(() => territoryLandmassIndices.push(landmassIndex));
    offset += seeds.length;
  });

  const cellsByTerritory = Array.from(
    { length: territoryCount },
    () => [] as number[],
  );
  ownership.forEach((territoryIndex, cellId) => {
    if (territoryIndex !== null) cellsByTerritory[territoryIndex]!.push(cellId);
  });
  const territoryCenters = cellsByTerritory.map((cellIds) => {
    const sum: Vector3Tuple = [0, 0, 0];
    for (const cellId of cellIds) {
      const [a, b, c] = sphere.faces[cellId]!;
      const point = centroid(
        sphere.vertices[a]!,
        sphere.vertices[b]!,
        sphere.vertices[c]!,
      );
      sum[0] += point[0];
      sum[1] += point[1];
      sum[2] += point[2];
    }
    return normalize(sum);
  });

  return {
    cellTerritoryIndices: ownership,
    territoryCenters,
    territoryCellCounts: cellsByTerritory.map((cells) => cells.length),
    territoryLandmassIndices,
  };
}
