import type { IcosphereData } from '../geometry/icosphere.ts';

export function buildCellAdjacency(sphere: IcosphereData): number[][] {
  const adjacency = sphere.faces.map(() => new Set<number>());
  const edgeFace = new Map<string, number>();

  sphere.faces.forEach(([a, b, c], faceIndex) => {
    for (const [first, second] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const previous = edgeFace.get(key);
      if (previous === undefined) {
        edgeFace.set(key, faceIndex);
      } else {
        adjacency[faceIndex]!.add(previous);
        adjacency[previous]!.add(faceIndex);
      }
    }
  });

  return adjacency.map((neighbors) => [...neighbors].sort((a, b) => a - b));
}

export function connectedComponents(
  included: ReadonlySet<number>,
  adjacency: readonly number[][],
): number[][] {
  const unvisited = new Set(included);
  const result: number[][] = [];
  while (unvisited.size > 0) {
    const start = unvisited.values().next().value as number;
    const component: number[] = [];
    const queue = [start];
    unvisited.delete(start);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      component.push(current);
      for (const neighbor of adjacency[current]!) {
        if (unvisited.delete(neighbor)) queue.push(neighbor);
      }
    }
    result.push(component.sort((a, b) => a - b));
  }
  return result.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
}
