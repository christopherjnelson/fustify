import type { Vector3Tuple } from '../types/territory';

export function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize(point: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(point[0], point[1], point[2]);
  return [point[0] / length, point[1] / length, point[2] / length];
}

export function midpoint(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return normalize([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
}

export function centroid(
  a: Vector3Tuple,
  b: Vector3Tuple,
  c: Vector3Tuple,
): Vector3Tuple {
  return normalize([
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ]);
}

export function nearestPointIndex(
  point: Vector3Tuple,
  candidates: readonly Vector3Tuple[],
): number {
  let nearestIndex = 0;
  let nearestDot = -Infinity;
  for (let index = 0; index < candidates.length; index += 1) {
    const similarity = dot(point, candidates[index] as Vector3Tuple);
    if (similarity > nearestDot) {
      nearestDot = similarity;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}
