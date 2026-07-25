import type { IcosphereData } from '../geometry/icosphere.ts';
import {
  boundedSphericalMove,
  quantizeCoordinate,
  quantizeVector,
  sphericalTriangleArea,
  weightedSphericalCentroid,
} from '../geometry/sphericalGeometry.ts';
import { centroid, dot } from '../geometry/sphericalMath.ts';
import type { Vector3Tuple } from '../types/territory.ts';
import type { GenerationTimingObserver } from '../types/generation.ts';
import type { SeededRandom } from './seededRandom.ts';
import { createSeededRandom } from './seededRandom.ts';

export const NORMALIZED_RELAXATION_ITERATIONS = 6;
export const NORMALIZED_RELAXATION_MOVE_FRACTION = 0.45;
export const NORMALIZED_TERRITORY_CANDIDATE_COUNT = 4;

export interface NormalizedTerritoryLayout {
  cellTerritoryIndices: Array<number | null>;
  territoryCenters: Vector3Tuple[];
  territoryCentroids: Vector3Tuple[];
  territorySites: Vector3Tuple[];
  territoryCellCounts: number[];
  territoryLandmassIndices: number[];
}

interface CellGeometry {
  centers: Vector3Tuple[];
  areas: number[];
}

interface QueueItem {
  cellId: number;
  owner: number;
  distance: number;
}

class StableMinHeap {
  private readonly items: QueueItem[] = [];

  get size(): number {
    return this.items.length;
  }

  private before(left: QueueItem, right: QueueItem): boolean {
    return (
      left.distance < right.distance ||
      (left.distance === right.distance &&
        (left.owner < right.owner ||
          (left.owner === right.owner && left.cellId < right.cellId)))
    );
  }

  push(item: QueueItem): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.before(this.items[parent]!, item)) break;
      this.items[index] = this.items[parent]!;
      index = parent;
    }
    this.items[index] = item;
  }

  pop(): QueueItem {
    const first = this.items[0]!;
    const tail = this.items.pop()!;
    if (this.items.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      const child =
        right < this.items.length &&
        this.before(this.items[right]!, this.items[left]!)
          ? right
          : left;
      if (this.before(tail, this.items[child]!)) break;
      this.items[index] = this.items[child]!;
      index = child;
    }
    this.items[index] = tail;
    return first;
  }
}

function buildCellGeometry(sphere: IcosphereData): CellGeometry {
  const centers: Vector3Tuple[] = [];
  const areas: number[] = [];
  for (const [a, b, c] of sphere.faces) {
    centers.push(
      quantizeVector(
        centroid(sphere.vertices[a]!, sphere.vertices[b]!, sphere.vertices[c]!),
      ),
    );
    areas.push(
      quantizeCoordinate(
        sphericalTriangleArea(
          sphere.vertices[a]!,
          sphere.vertices[b]!,
          sphere.vertices[c]!,
        ),
      ),
    );
  }
  return { centers, areas };
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
    let capacity = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < components.length; index += 1) {
      const nextCapacity =
        components[index]!.length / (allocations[index]! + 1);
      if (nextCapacity > capacity) {
        selected = index;
        capacity = nextCapacity;
      }
    }
    allocations[selected] += 1;
  }
  return allocations;
}

function chooseInitialSiteCells(
  component: readonly number[],
  count: number,
  geometry: CellGeometry,
  likelihood: readonly number[],
  random: SeededRandom,
): number[] {
  const tieOrder = random.shuffle([...component]);
  const tieRank = new Map(tieOrder.map((cellId, rank) => [cellId, rank]));
  const firstPool = [...component]
    .sort(
      (left, right) =>
        likelihood[right]! - likelihood[left]! ||
        tieRank.get(left)! - tieRank.get(right)! ||
        left - right,
    )
    .slice(0, Math.min(component.length, Math.max(3, Math.ceil(count / 2))));
  const sites = [firstPool[random.integer(0, firstPool.length - 1)]!];

  while (sites.length < count) {
    let selected = -1;
    let bestSeparation = Number.NEGATIVE_INFINITY;
    for (const cellId of component) {
      if (sites.includes(cellId)) continue;
      const separation = Math.min(
        ...sites.map((siteCell) =>
          quantizeCoordinate(
            1 - dot(geometry.centers[cellId]!, geometry.centers[siteCell]!),
          ),
        ),
      );
      if (
        separation > bestSeparation ||
        (separation === bestSeparation &&
          (selected < 0 ||
            tieRank.get(cellId)! < tieRank.get(selected)! ||
            (tieRank.get(cellId) === tieRank.get(selected) &&
              cellId < selected)))
      ) {
        selected = cellId;
        bestSeparation = separation;
      }
    }
    sites.push(selected);
  }
  return sites;
}

function nearestUniqueSiteCells(
  component: readonly number[],
  sites: readonly Vector3Tuple[],
  geometry: CellGeometry,
): number[] {
  const unused = new Set(component);
  return sites.map((site) => {
    let selected = -1;
    let similarity = Number.NEGATIVE_INFINITY;
    for (const cellId of unused) {
      const next = dot(site, geometry.centers[cellId]!);
      if (
        next > similarity ||
        (next === similarity && (selected < 0 || cellId < selected))
      ) {
        selected = cellId;
        similarity = next;
      }
    }
    unused.delete(selected);
    return selected;
  });
}

/**
 * Connected frontier Voronoi: a cell can only be claimed through an already
 * owned neighbor, while the global heap prefers the site with least angular
 * distance. That preserves connectedness without a repair pass.
 */
function assignConnectedCells(
  component: readonly number[],
  sites: readonly Vector3Tuple[],
  geometry: CellGeometry,
  adjacency: readonly number[][],
): number[] {
  const allowed = new Set(component);
  const localOwners = new Map<number, number>();
  const queue = new StableMinHeap();
  const siteCells = nearestUniqueSiteCells(component, sites, geometry);

  siteCells.forEach((cellId, owner) => {
    localOwners.set(cellId, owner);
  });
  siteCells.forEach((cellId, owner) => {
    for (const neighbor of adjacency[cellId]!) {
      if (!allowed.has(neighbor) || localOwners.has(neighbor)) continue;
      queue.push({
        cellId: neighbor,
        owner,
        distance: quantizeCoordinate(
          1 - dot(sites[owner]!, geometry.centers[neighbor]!),
        ),
      });
    }
  });

  while (localOwners.size < component.length && queue.size > 0) {
    const next = queue.pop();
    if (localOwners.has(next.cellId)) continue;
    localOwners.set(next.cellId, next.owner);
    for (const neighbor of adjacency[next.cellId]!) {
      if (!allowed.has(neighbor) || localOwners.has(neighbor)) continue;
      queue.push({
        cellId: neighbor,
        owner: next.owner,
        distance: quantizeCoordinate(
          1 - dot(sites[next.owner]!, geometry.centers[neighbor]!),
        ),
      });
    }
  }
  if (localOwners.size !== component.length) {
    throw new Error(
      'Normalized territory growth exhausted its connected frontier.',
    );
  }
  return component.map((cellId) => localOwners.get(cellId)!);
}

function centroidsForOwners(
  component: readonly number[],
  owners: readonly number[],
  count: number,
  geometry: CellGeometry,
): Vector3Tuple[] {
  return Array.from({ length: count }, (_, owner) => {
    const cellIds = component.filter((_, index) => owners[index] === owner);
    return weightedSphericalCentroid(
      cellIds.map((cellId) => geometry.centers[cellId]!),
      cellIds.map((cellId) => geometry.areas[cellId]!),
    );
  });
}

function relaxComponent(
  component: readonly number[],
  initialSites: readonly Vector3Tuple[],
  geometry: CellGeometry,
  adjacency: readonly number[][],
): { owners: number[]; sites: Vector3Tuple[]; centroids: Vector3Tuple[] } {
  let sites = [...initialSites];
  let owners = assignConnectedCells(component, sites, geometry, adjacency);
  let centroids = centroidsForOwners(component, owners, sites.length, geometry);
  for (
    let iteration = 0;
    iteration < NORMALIZED_RELAXATION_ITERATIONS;
    iteration += 1
  ) {
    sites = sites.map((site, index) =>
      boundedSphericalMove(
        site,
        centroids[index]!,
        NORMALIZED_RELAXATION_MOVE_FRACTION,
      ),
    );
    owners = assignConnectedCells(component, sites, geometry, adjacency);
    centroids = centroidsForOwners(component, owners, sites.length, geometry);
  }
  return { owners, sites, centroids };
}

export function generateNormalizedTerritoryLayout(
  sphere: IcosphereData,
  adjacency: readonly number[][],
  landComponents: readonly number[][],
  likelihood: readonly number[],
  territoryCount: number,
  seed: string,
  candidateIndex: number,
  timingObserver?: GenerationTimingObserver,
): NormalizedTerritoryLayout {
  const geometry = buildCellGeometry(sphere);
  const ownership: Array<number | null> = sphere.faces.map(() => null);
  const allocations = allocateTerritories(landComponents, territoryCount);
  const territoryLandmassIndices: number[] = [];
  const territorySites: Vector3Tuple[] = [];
  const territoryCentroids: Vector3Tuple[] = [];
  let offset = 0;

  landComponents.forEach((component, landmassIndex) => {
    const count = allocations[landmassIndex]!;
    const random = createSeededRandom(
      `${seed}|normalized-sites|candidate-${candidateIndex}|landmass-${landmassIndex}`,
    );
    const siteStarted = performance.now();
    const siteCells = chooseInitialSiteCells(
      component,
      count,
      geometry,
      likelihood,
      random,
    );
    timingObserver?.('site-generation', performance.now() - siteStarted);
    const relaxationStarted = performance.now();
    const relaxed = relaxComponent(
      component,
      siteCells.map((cellId) => geometry.centers[cellId]!),
      geometry,
      adjacency,
    );
    timingObserver?.('relaxation', performance.now() - relaxationStarted);
    component.forEach((cellId, index) => {
      ownership[cellId] = offset + relaxed.owners[index]!;
    });
    relaxed.sites.forEach((site) => territorySites.push(site));
    relaxed.centroids.forEach((center) => territoryCentroids.push(center));
    relaxed.sites.forEach(() => territoryLandmassIndices.push(landmassIndex));
    offset += count;
  });

  const cellsByTerritory = Array.from(
    { length: territoryCount },
    () => [] as number[],
  );
  ownership.forEach((territoryIndex, cellId) => {
    if (territoryIndex !== null) cellsByTerritory[territoryIndex]!.push(cellId);
  });
  const territoryCenters = cellsByTerritory.map((cellIds, territoryIndex) => {
    const target = territoryCentroids[territoryIndex]!;
    return geometry.centers[
      cellIds.reduce((best, cellId) => {
        const similarity = dot(geometry.centers[cellId]!, target);
        const bestSimilarity = dot(geometry.centers[best]!, target);
        return similarity > bestSimilarity ||
          (similarity === bestSimilarity && cellId < best)
          ? cellId
          : best;
      }, cellIds[0]!)
    ]!;
  });

  return {
    cellTerritoryIndices: ownership,
    territoryCenters,
    territoryCentroids,
    territorySites,
    territoryCellCounts: cellsByTerritory.map((cells) => cells.length),
    territoryLandmassIndices,
  };
}
