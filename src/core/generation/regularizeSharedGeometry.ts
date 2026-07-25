import type { IcosphereData } from '../geometry/icosphere.ts';
import {
  angularDistance,
  boundedSphericalMove,
  quantizeVector,
} from '../geometry/sphericalGeometry.ts';
import { dot, normalize } from '../geometry/sphericalMath.ts';
import type { Vector3Tuple } from '../types/territory.ts';

const INTERNAL_BORDER_MOVE_FRACTION = 0.42;
const INTERNAL_BORDER_MAXIMUM_RADIANS = 0.018;
// Repeated local passes suppress mesh-scale staircase turns. Capping the total
// move from the source contour prevents those passes from progressively
// shrinking low-frequency bends into a uniformly rounded outline.
const COASTLINE_MOVE_FRACTION = 0.42;
const COASTLINE_MAXIMUM_RADIANS = 0.014;
const COASTLINE_CUMULATIVE_MAXIMUM_RADIANS = 0.032;
const COASTLINE_SMOOTHING_PASSES = 3;
const MINIMUM_BASE_EDGE_LENGTH_RATIO = 0.55;

function edgeKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function projectedToBisector(
  point: Vector3Tuple,
  firstSite: Vector3Tuple,
  secondSite: Vector3Tuple,
): Vector3Tuple {
  const normal: Vector3Tuple = [
    firstSite[0] - secondSite[0],
    firstSite[1] - secondSite[1],
    firstSite[2] - secondSite[2],
  ];
  const length = Math.hypot(...normal);
  if (length < 1e-12) return point;
  const unit = normal.map((value) => value / length) as Vector3Tuple;
  const amount = dot(point, unit);
  return normalize([
    point[0] - unit[0] * amount,
    point[1] - unit[1] * amount,
    point[2] - unit[2] * amount,
  ]);
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function tripleJunction(
  point: Vector3Tuple,
  sites: readonly Vector3Tuple[],
): Vector3Tuple {
  const firstNormal: Vector3Tuple = [
    sites[0]![0] - sites[1]![0],
    sites[0]![1] - sites[1]![1],
    sites[0]![2] - sites[1]![2],
  ];
  const secondNormal: Vector3Tuple = [
    sites[0]![0] - sites[2]![0],
    sites[0]![1] - sites[2]![1],
    sites[0]![2] - sites[2]![2],
  ];
  const candidate = cross(firstNormal, secondNormal);
  if (Math.hypot(...candidate) < 1e-12) return point;
  const normalized = normalize(candidate);
  return dot(normalized, point) < 0
    ? (normalized.map((value) => -value) as Vector3Tuple)
    : normalized;
}

function orientation(
  vertices: readonly Vector3Tuple[],
  [a, b, c]: readonly [number, number, number],
): number {
  const first = vertices[a]!;
  const second = vertices[b]!;
  const third = vertices[c]!;
  const ab: Vector3Tuple = [
    second[0] - first[0],
    second[1] - first[1],
    second[2] - first[2],
  ];
  const ac: Vector3Tuple = [
    third[0] - first[0],
    third[1] - first[1],
    third[2] - first[2],
  ];
  const outward: Vector3Tuple = [
    first[0] + second[0] + third[0],
    first[1] + second[1] + third[1],
    first[2] + second[2] + third[2],
  ];
  return dot(cross(ab, ac), outward);
}

/**
 * Moves each shared topology vertex at most once. The fixed face list and cell
 * ownership never change, so fill, raycasts, adjacency, outlines, and minimap
 * still use one canonical watertight surface.
 */
export function regularizeSharedSurfaceVertices(
  sphere: IcosphereData,
  ownership: readonly (number | null)[],
  territorySites: readonly Vector3Tuple[],
): Vector3Tuple[] {
  const incidentFaces = sphere.vertices.map(() => [] as number[]);
  const priorFaceByEdge = new Map<string, number>();
  const coastlineNeighbors = sphere.vertices.map(() => new Set<number>());

  sphere.faces.forEach(([a, b, c], faceIndex) => {
    incidentFaces[a]!.push(faceIndex);
    incidentFaces[b]!.push(faceIndex);
    incidentFaces[c]!.push(faceIndex);
    for (const [left, right] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(left, right);
      const prior = priorFaceByEdge.get(key);
      if (prior === undefined) {
        priorFaceByEdge.set(key, faceIndex);
      } else if (
        (ownership[prior] === null) !==
        (ownership[faceIndex] === null)
      ) {
        coastlineNeighbors[left]!.add(right);
        coastlineNeighbors[right]!.add(left);
      }
    }
  });

  const vertices = sphere.vertices.map((point, vertexIndex) => {
    const owners = new Set(
      incidentFaces[vertexIndex]!.map((faceIndex) => ownership[faceIndex]),
    );
    const hasOcean = owners.delete(null);
    const landOwners = [...owners].sort(
      (left, right) => left! - right!,
    ) as number[];
    if (hasOcean && coastlineNeighbors[vertexIndex]!.size >= 2) {
      const target = normalize(
        [...coastlineNeighbors[vertexIndex]!].reduce<Vector3Tuple>(
          (sum, neighbor) => {
            const next = sphere.vertices[neighbor]!;
            sum[0] += next[0];
            sum[1] += next[1];
            sum[2] += next[2];
            return sum;
          },
          [0, 0, 0],
        ),
      );
      return boundedSphericalMove(
        point,
        target,
        COASTLINE_MOVE_FRACTION,
        COASTLINE_MAXIMUM_RADIANS,
      );
    }
    if (!hasOcean && landOwners.length === 2) {
      return boundedSphericalMove(
        point,
        projectedToBisector(
          point,
          territorySites[landOwners[0]!]!,
          territorySites[landOwners[1]!]!,
        ),
        INTERNAL_BORDER_MOVE_FRACTION,
        INTERNAL_BORDER_MAXIMUM_RADIANS,
      );
    }
    if (!hasOcean && landOwners.length === 3) {
      return boundedSphericalMove(
        point,
        tripleJunction(
          point,
          landOwners.map((owner) => territorySites[owner]!),
        ),
        INTERNAL_BORDER_MOVE_FRACTION,
        INTERNAL_BORDER_MAXIMUM_RADIANS,
      );
    }
    return quantizeVector(point);
  });
  for (let pass = 1; pass < COASTLINE_SMOOTHING_PASSES; pass += 1) {
    const previous = vertices.map((vertex) => vertex);
    coastlineNeighbors.forEach((neighbors, vertexIndex) => {
      if (neighbors.size < 2) return;
      const target = normalize(
        [...neighbors].reduce<Vector3Tuple>(
          (sum, neighbor) => {
            const next = previous[neighbor]!;
            sum[0] += next[0];
            sum[1] += next[1];
            sum[2] += next[2];
            return sum;
          },
          [0, 0, 0],
        ),
      );
      const smoothed = boundedSphericalMove(
        previous[vertexIndex]!,
        target,
        COASTLINE_MOVE_FRACTION,
        COASTLINE_MAXIMUM_RADIANS,
      );
      vertices[vertexIndex] = boundedSphericalMove(
        sphere.vertices[vertexIndex]!,
        smoothed,
        1,
        COASTLINE_CUMULATIVE_MAXIMUM_RADIANS,
      );
    });
  }

  const collapsedEdgeVertices = new Set<number>();
  for (const key of priorFaceByEdge.keys()) {
    const [first, second] = key.split(':').map(Number) as [number, number];
    if (
      angularDistance(vertices[first]!, vertices[second]!) <
      angularDistance(sphere.vertices[first]!, sphere.vertices[second]!) *
        MINIMUM_BASE_EDGE_LENGTH_RATIO
    ) {
      collapsedEdgeVertices.add(first);
      collapsedEdgeVertices.add(second);
    }
  }
  for (const vertex of collapsedEdgeVertices) {
    vertices[vertex] = quantizeVector(sphere.vertices[vertex]!);
  }

  // A bounded move should preserve orientation. If numerical or exceptional
  // junction geometry flips a triangle, restore its vertices deterministically.
  for (let pass = 0; pass < 2; pass += 1) {
    const unsafeVertices = new Set<number>();
    sphere.faces.forEach((face) => {
      if (
        orientation(sphere.vertices, face) * orientation(vertices, face) <=
        0
      ) {
        face.forEach((vertex) => unsafeVertices.add(vertex));
      }
    });
    if (unsafeVertices.size === 0) break;
    for (const vertex of unsafeVertices) {
      vertices[vertex] = quantizeVector(sphere.vertices[vertex]!);
    }
  }
  return vertices;
}

export const SHARED_GEOMETRY_REGULARIZATION = {
  internalBorderMoveFraction: INTERNAL_BORDER_MOVE_FRACTION,
  internalBorderMaximumRadians: INTERNAL_BORDER_MAXIMUM_RADIANS,
  coastlineMoveFraction: COASTLINE_MOVE_FRACTION,
  coastlineMaximumRadians: COASTLINE_MAXIMUM_RADIANS,
  coastlineCumulativeMaximumRadians: COASTLINE_CUMULATIVE_MAXIMUM_RADIANS,
  coastlineSmoothingPasses: COASTLINE_SMOOTHING_PASSES,
  minimumBaseEdgeLengthRatio: MINIMUM_BASE_EDGE_LENGTH_RATIO,
} as const;
