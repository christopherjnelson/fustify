import type { Vector3Tuple } from '../types/territory.ts';
import { midpoint, normalize } from './sphericalMath.ts';

export type Triangle = [number, number, number];

export interface IcosphereData {
  vertices: Vector3Tuple[];
  faces: Triangle[];
}

const PHI = (1 + Math.sqrt(5)) / 2;

const RAW_VERTICES: Vector3Tuple[] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];

const BASE_VERTICES: Vector3Tuple[] = RAW_VERTICES.map(normalize);

const BASE_FACES: Triangle[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

export function createIcosphere(subdivisions: number): IcosphereData {
  const vertices = [...BASE_VERTICES];
  let faces = [...BASE_FACES];

  for (let level = 0; level < subdivisions; level += 1) {
    const midpointCache = new Map<string, number>();
    const getMidpoint = (first: number, second: number): number => {
      const low = Math.min(first, second);
      const high = Math.max(first, second);
      const key = `${low}:${high}`;
      const cached = midpointCache.get(key);
      if (cached !== undefined) return cached;
      const index = vertices.length;
      vertices.push(midpoint(vertices[low]!, vertices[high]!));
      midpointCache.set(key, index);
      return index;
    };

    const nextFaces: Triangle[] = [];
    for (const [a, b, c] of faces) {
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  return { vertices, faces };
}
