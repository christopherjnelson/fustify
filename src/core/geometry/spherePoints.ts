import type { Vector3Tuple } from '../types/territory.ts';
import type { SeededRandom } from '../generation/seededRandom.ts';
import { normalize } from './sphericalMath.ts';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * A jittered Fibonacci lattice avoids polar clustering while allowing the seed
 * to alter region placement. Jitter is deliberately small so coverage remains
 * much more even than fully random samples.
 */
export function generateSpherePoints(
  count: number,
  random: SeededRandom,
): Vector3Tuple[] {
  const phase = random.next() * Math.PI * 2;
  const points: Vector3Tuple[] = [];

  for (let index = 0; index < count; index += 1) {
    const verticalJitter = (random.next() - 0.5) * 0.34;
    const bandPosition = (index + 0.5 + verticalJitter) / count;
    const y = 1 - 2 * bandPosition;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle =
      phase + index * GOLDEN_ANGLE + (random.next() - 0.5) * GOLDEN_ANGLE * 0.3;
    points.push(
      normalize([Math.cos(angle) * radius, y, Math.sin(angle) * radius]),
    );
  }

  return random.shuffle(points);
}
