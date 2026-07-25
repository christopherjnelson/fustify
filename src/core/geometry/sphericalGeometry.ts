import type { Vector3Tuple } from '../types/territory.ts';
import { dot, normalize } from './sphericalMath.ts';

const COORDINATE_PRECISION_DIGITS = 12;

export function quantizeCoordinate(value: number): number {
  const rounded = Number(value.toFixed(COORDINATE_PRECISION_DIGITS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function quantizeVector(point: Vector3Tuple): Vector3Tuple {
  const normalized = normalize(point);
  return normalized.map(quantizeCoordinate) as Vector3Tuple;
}

export function angularDistance(
  left: Vector3Tuple,
  right: Vector3Tuple,
): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(left, right))));
}

export function sphericalTriangleArea(
  a: Vector3Tuple,
  b: Vector3Tuple,
  c: Vector3Tuple,
): number {
  const determinant =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  return (
    2 *
    Math.atan2(
      Math.abs(determinant),
      Math.max(Number.EPSILON, 1 + dot(a, b) + dot(b, c) + dot(c, a)),
    )
  );
}

export function boundedSphericalMove(
  from: Vector3Tuple,
  toward: Vector3Tuple,
  fraction: number,
  maximumRadians = Number.POSITIVE_INFINITY,
): Vector3Tuple {
  const start = normalize(from);
  const end = normalize(toward);
  const angle = angularDistance(start, end);
  if (angle < 1e-14) return quantizeVector(start);
  const amount = Math.min(fraction, maximumRadians / angle);
  const sine = Math.sin(angle);
  if (Math.abs(sine) < 1e-12) {
    return quantizeVector([
      start[0] * (1 - amount) + end[0] * amount,
      start[1] * (1 - amount) + end[1] * amount,
      start[2] * (1 - amount) + end[2] * amount,
    ]);
  }
  const startWeight = Math.sin((1 - amount) * angle) / sine;
  const endWeight = Math.sin(amount * angle) / sine;
  return quantizeVector([
    start[0] * startWeight + end[0] * endWeight,
    start[1] * startWeight + end[1] * endWeight,
    start[2] * startWeight + end[2] * endWeight,
  ]);
}

export function weightedSphericalCentroid(
  points: readonly Vector3Tuple[],
  weights: readonly number[],
): Vector3Tuple {
  const sum: Vector3Tuple = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const weight = weights[index] ?? 1;
    const point = points[index]!;
    sum[0] += point[0] * weight;
    sum[1] += point[1] * weight;
    sum[2] += point[2] * weight;
  }
  return quantizeVector(sum);
}

export { COORDINATE_PRECISION_DIGITS };
