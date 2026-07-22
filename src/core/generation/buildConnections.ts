import { dot } from '../geometry/sphericalMath.ts';
import type { TerritoryConnection } from '../types/surface.ts';
import type { Vector3Tuple } from '../types/territory.ts';

function connectionKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

export interface TerritoryBorderWeight {
  leftTerritoryIndex: number;
  rightTerritoryIndex: number;
  sharedCellEdgeCount: number;
}

export function buildTerritoryBorderWeights(
  cellTerritoryIndices: readonly (number | null)[],
  cellAdjacency: readonly number[][],
): TerritoryBorderWeight[] {
  const weights = new Map<string, number>();
  cellTerritoryIndices.forEach((territoryIndex, cellId) => {
    if (territoryIndex === null) return;
    for (const neighbor of cellAdjacency[cellId]!) {
      if (neighbor <= cellId) continue;
      const other = cellTerritoryIndices[neighbor];
      if (other !== null && other !== territoryIndex) {
        const key = connectionKey(territoryIndex, other);
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
    }
  });
  return [...weights]
    .map(([key, sharedCellEdgeCount]) => {
      const [leftTerritoryIndex, rightTerritoryIndex] = key
        .split(':')
        .map(Number) as [number, number];
      return {
        leftTerritoryIndex,
        rightTerritoryIndex,
        sharedCellEdgeCount,
      };
    })
    .sort(
      (a, b) =>
        a.leftTerritoryIndex - b.leftTerritoryIndex ||
        a.rightTerritoryIndex - b.rightTerritoryIndex,
    );
}

export function buildLandBorderConnections(
  cellTerritoryIndices: readonly (number | null)[],
  cellAdjacency: readonly number[][],
): TerritoryConnection[] {
  return buildTerritoryBorderWeights(cellTerritoryIndices, cellAdjacency).map(
    ({ leftTerritoryIndex, rightTerritoryIndex }) => ({
      fromTerritoryId: territoryId(leftTerritoryIndex),
      toTerritoryId: territoryId(rightTerritoryIndex),
      type: 'land-border' as const,
    }),
  );
}

interface LandmassEdge {
  leftLandmass: number;
  rightLandmass: number;
  leftTerritory: number;
  rightTerritory: number;
  similarity: number;
}

function closestLandmassEdges(
  territoryCenters: readonly Vector3Tuple[],
  territoryLandmassIndices: readonly number[],
  landmassCount: number,
  coastalTerritoryIndices?: ReadonlySet<number>,
): LandmassEdge[] {
  const result: LandmassEdge[] = [];
  for (let leftLandmass = 0; leftLandmass < landmassCount; leftLandmass += 1) {
    for (
      let rightLandmass = leftLandmass + 1;
      rightLandmass < landmassCount;
      rightLandmass += 1
    ) {
      let best: LandmassEdge | null = null;
      territoryCenters.forEach((leftCenter, leftTerritory) => {
        if (territoryLandmassIndices[leftTerritory] !== leftLandmass) return;
        if (
          coastalTerritoryIndices &&
          !coastalTerritoryIndices.has(leftTerritory)
        )
          return;
        territoryCenters.forEach((rightCenter, rightTerritory) => {
          if (territoryLandmassIndices[rightTerritory] !== rightLandmass)
            return;
          if (
            coastalTerritoryIndices &&
            !coastalTerritoryIndices.has(rightTerritory)
          )
            return;
          const similarity = dot(leftCenter, rightCenter);
          if (
            !best ||
            similarity > best.similarity ||
            (similarity === best.similarity &&
              (leftTerritory < best.leftTerritory ||
                (leftTerritory === best.leftTerritory &&
                  rightTerritory < best.rightTerritory)))
          ) {
            best = {
              leftLandmass,
              rightLandmass,
              leftTerritory,
              rightTerritory,
              similarity,
            };
          }
        });
      });
      result.push(best!);
    }
  }
  return result.sort(
    (a, b) =>
      b.similarity - a.similarity ||
      a.leftLandmass - b.leftLandmass ||
      a.rightLandmass - b.rightLandmass ||
      a.leftTerritory - b.leftTerritory ||
      a.rightTerritory - b.rightTerritory,
  );
}

/** A deterministic Kruskal tree adds exactly landmassCount - 1 sea routes. */
export function buildSeaRoutes(
  territoryCenters: readonly Vector3Tuple[],
  territoryLandmassIndices: readonly number[],
  landmassCount: number,
  additionalRouteCount = 0,
  coastalTerritoryIndices?: ReadonlySet<number>,
): TerritoryConnection[] {
  const parents = Array.from({ length: landmassCount }, (_, index) => index);
  const find = (value: number): number => {
    let current = value;
    while (parents[current] !== current) current = parents[current]!;
    return current;
  };
  const routes: TerritoryConnection[] = [];
  const candidates = closestLandmassEdges(
    territoryCenters,
    territoryLandmassIndices,
    landmassCount,
    coastalTerritoryIndices,
  );
  for (const edge of candidates) {
    const leftRoot = find(edge.leftLandmass);
    const rightRoot = find(edge.rightLandmass);
    if (leftRoot === rightRoot) continue;
    parents[rightRoot] = leftRoot;
    routes.push({
      fromTerritoryId: territoryId(edge.leftTerritory),
      toTerritoryId: territoryId(edge.rightTerritory),
      type: 'sea-route',
    });
    if (routes.length === landmassCount - 1) break;
  }
  const usedPairs = new Set(
    routes.map((route) =>
      [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
    ),
  );
  const routeDegree = new Map<number, number>();
  for (const route of routes) {
    for (const id of [route.fromTerritoryId, route.toTerritoryId]) {
      const index = Number(id.slice('territory-'.length)) - 1;
      routeDegree.set(index, (routeDegree.get(index) ?? 0) + 1);
    }
  }
  for (const maxDegree of [2, 3]) {
    for (const edge of candidates) {
      if (routes.length >= landmassCount - 1 + additionalRouteCount) break;
      const leftId = territoryId(edge.leftTerritory);
      const rightId = territoryId(edge.rightTerritory);
      const pair = [leftId, rightId].sort().join('|');
      if (
        usedPairs.has(pair) ||
        (routeDegree.get(edge.leftTerritory) ?? 0) >= maxDegree ||
        (routeDegree.get(edge.rightTerritory) ?? 0) >= maxDegree
      ) {
        continue;
      }
      routes.push({
        fromTerritoryId: leftId,
        toTerritoryId: rightId,
        type: 'sea-route',
      });
      usedPairs.add(pair);
      routeDegree.set(
        edge.leftTerritory,
        (routeDegree.get(edge.leftTerritory) ?? 0) + 1,
      );
      routeDegree.set(
        edge.rightTerritory,
        (routeDegree.get(edge.rightTerritory) ?? 0) + 1,
      );
    }
  }
  return routes;
}

export function findCoastalTerritoryIndices(
  cellTerritoryIndices: readonly (number | null)[],
  cellAdjacency: readonly number[][],
): Set<number> {
  const coastal = new Set<number>();
  cellTerritoryIndices.forEach((territoryIndex, cellId) => {
    if (
      territoryIndex !== null &&
      cellAdjacency[cellId]!.some(
        (neighbor) => cellTerritoryIndices[neighbor] === null,
      )
    ) {
      coastal.add(territoryIndex);
    }
  });
  return coastal;
}

export function territoryId(index: number): string {
  return `territory-${String(index + 1).padStart(2, '0')}`;
}

export function adjacencyFromConnections(
  territoryCount: number,
  connections: readonly TerritoryConnection[],
): number[][] {
  const adjacency = Array.from(
    { length: territoryCount },
    () => new Set<number>(),
  );
  const indexFromId = (id: string) => Number(id.slice('territory-'.length)) - 1;
  for (const connection of connections) {
    const left = indexFromId(connection.fromTerritoryId);
    const right = indexFromId(connection.toTerritoryId);
    adjacency[left]!.add(right);
    adjacency[right]!.add(left);
  }
  return adjacency.map((neighbors) => [...neighbors].sort((a, b) => a - b));
}
