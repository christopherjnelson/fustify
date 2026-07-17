import { createIcosphere, type IcosphereData } from '../geometry/icosphere';
import { centroid, dot, nearestPointIndex } from '../geometry/sphericalMath';
import type { Vector3Tuple } from '../types/territory';
import { PLANET_SUBDIVISIONS } from './constants';

export interface TerritorySurface {
  sphere: IcosphereData;
  faceTerritoryIndices: number[];
}

export function classifyTerritorySurface(
  centers: readonly Vector3Tuple[],
  subdivisions = PLANET_SUBDIVISIONS,
): TerritorySurface {
  const sphere = createIcosphere(subdivisions);
  const faceTerritoryIndices = sphere.faces.map(([a, b, c]) =>
    nearestPointIndex(
      centroid(sphere.vertices[a]!, sphere.vertices[b]!, sphere.vertices[c]!),
      centers,
    ),
  );
  return { sphere, faceTerritoryIndices };
}

function components(adjacency: readonly Set<number>[]): number[][] {
  const unvisited = new Set(adjacency.map((_, index) => index));
  const result: number[][] = [];
  while (unvisited.size > 0) {
    const start = unvisited.values().next().value as number;
    const component: number[] = [];
    const queue = [start];
    unvisited.delete(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency[current]!) {
        if (unvisited.delete(neighbor)) queue.push(neighbor);
      }
    }
    result.push(component);
  }
  return result;
}

/** Derives territory adjacency from differently-owned triangles sharing an edge. */
export function buildAdjacency(
  centers: readonly Vector3Tuple[],
  surface = classifyTerritorySurface(centers),
): number[][] {
  const adjacency = centers.map(() => new Set<number>());
  const edgeOwner = new Map<string, number>();

  surface.sphere.faces.forEach(([a, b, c], faceIndex) => {
    const territoryIndex = surface.faceTerritoryIndices[faceIndex]!;
    const edges: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [first, second] of edges) {
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const priorFace = edgeOwner.get(key);
      if (priorFace === undefined) {
        edgeOwner.set(key, faceIndex);
        continue;
      }
      const otherTerritory = surface.faceTerritoryIndices[priorFace]!;
      if (otherTerritory !== territoryIndex) {
        adjacency[territoryIndex]!.add(otherTerritory);
        adjacency[otherTerritory]!.add(territoryIndex);
      }
    }
  });

  // Normally the tessellated globe guarantees connectivity. At unusually low
  // resolutions, bridge components by their closest seed pair deterministically.
  let groups = components(adjacency);
  while (groups.length > 1) {
    const base = groups[0]!;
    let bestPair: [number, number] = [base[0]!, groups[1]![0]!];
    let bestSimilarity = -Infinity;
    for (const left of base) {
      for (let groupIndex = 1; groupIndex < groups.length; groupIndex += 1) {
        for (const right of groups[groupIndex]!) {
          const similarity = dot(centers[left]!, centers[right]!);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestPair = [left, right];
          }
        }
      }
    }
    adjacency[bestPair[0]]!.add(bestPair[1]);
    adjacency[bestPair[1]]!.add(bestPair[0]);
    groups = components(adjacency);
  }

  return adjacency.map((neighbors) => [...neighbors].sort((a, b) => a - b));
}
