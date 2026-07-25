import type { IcosphereData } from '../geometry/icosphere.ts';
import { getPlanetSurfaceSphere } from '../geometry/planetSurface.ts';
import {
  angularDistance,
  sphericalTriangleArea,
  weightedSphericalCentroid,
} from '../geometry/sphericalGeometry.ts';
import { centroid, dot, normalize } from '../geometry/sphericalMath.ts';
import type {
  CandidateScoreComponents,
  ContinentGeometryMetrics,
  TerritoryGeometryMetrics,
  WorldGeometryMetrics,
} from '../types/generation.ts';
import type { TerritoryConnection } from '../types/surface.ts';
import type { PlanetDefinition } from '../types/planet.ts';
import type { Vector3Tuple } from '../types/territory.ts';
import type { TerritoryBorderWeight } from './buildConnections.ts';
import { buildTerritoryBorderWeights } from './buildConnections.ts';
import { buildCellAdjacency } from './surfaceTopology.ts';

export const GEOMETRY_QUALITY_THRESHOLDS = {
  shortEdgePerimeterFraction: 0.025,
  acuteInteriorAngleDegrees: 35,
  nearCollinearTurnDegrees: 8,
  meaningfulTurnDegrees: 24,
  meaningfulEdgePerimeterFraction: 0.07,
  lowerAreaRatio: 0.6,
  upperAreaRatio: 1.6,
} as const;

interface EdgeRecord {
  first: number;
  second: number;
  faces: number[];
}

export interface GeometryQualityInput {
  sphere: IcosphereData;
  ownership: readonly (number | null)[];
  territoryCount: number;
  sites: readonly Vector3Tuple[];
  centroids: readonly Vector3Tuple[];
  anchors: readonly Vector3Tuple[];
  continentAssignments: readonly number[];
  continentCount: number;
  borderWeights: readonly TerritoryBorderWeight[];
  connections: readonly TerritoryConnection[];
  landCoverage: number;
}

export interface GeometryQualityAnalysis {
  territories: TerritoryGeometryMetrics[];
  continents: ContinentGeometryMetrics[];
  world: WorldGeometryMetrics;
}

function rounded(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return value;
  const result = Number(value.toFixed(digits));
  return Object.is(result, -0) ? 0 : result;
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean) < 1e-14) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function edgeRecords(sphere: IcosphereData): EdgeRecord[] {
  const records = new Map<string, EdgeRecord>();
  sphere.faces.forEach(([a, b, c], faceIndex) => {
    for (const [first, second] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const low = Math.min(first, second);
      const high = Math.max(first, second);
      const key = `${low}:${high}`;
      const record = records.get(key) ?? {
        first: low,
        second: high,
        faces: [],
      };
      record.faces.push(faceIndex);
      records.set(key, record);
    }
  });
  return [...records.values()].sort(
    (left, right) => left.first - right.first || left.second - right.second,
  );
}

function boundaryEdgesForTerritory(
  territory: number,
  ownership: readonly (number | null)[],
  edges: readonly EdgeRecord[],
): Array<[number, number]> {
  return edges
    .filter(({ faces }) => {
      const [firstFace, secondFace] = faces;
      if (secondFace === undefined) return false;
      return (
        (ownership[firstFace] === territory) !==
        (ownership[secondFace] === territory)
      );
    })
    .map(({ first, second }) => [first, second]);
}

function pairKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function orderedBoundaryLoops(
  boundaryEdges: readonly [number, number][],
): number[][] {
  const neighbors = new Map<number, number[]>();
  for (const [left, right] of boundaryEdges) {
    neighbors.set(left, [...(neighbors.get(left) ?? []), right]);
    neighbors.set(right, [...(neighbors.get(right) ?? []), left]);
  }
  for (const values of neighbors.values()) values.sort((a, b) => a - b);
  const unused = new Set(
    boundaryEdges.map(([left, right]) => pairKey(left, right)),
  );
  const loops: number[][] = [];
  while (unused.size > 0) {
    const [startKey] = [...unused].sort();
    const [start, firstNeighbor] = startKey!.split(':').map(Number) as [
      number,
      number,
    ];
    const loop = [start];
    let previous = start;
    let current = firstNeighbor;
    unused.delete(pairKey(previous, current));
    for (let guard = 0; guard <= boundaryEdges.length; guard += 1) {
      if (current === start) break;
      loop.push(current);
      const next = (neighbors.get(current) ?? []).find(
        (candidate) =>
          candidate !== previous && unused.has(pairKey(current, candidate)),
      );
      if (next === undefined) {
        const fallback = (neighbors.get(current) ?? []).find((candidate) =>
          unused.has(pairKey(current, candidate)),
        );
        if (fallback === undefined) break;
        previous = current;
        current = fallback;
      } else {
        previous = current;
        current = next;
      }
      unused.delete(pairKey(previous, current));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops.sort(
    (left, right) => right.length - left.length || left[0]! - right[0]!,
  );
}

function tangentDirection(
  origin: Vector3Tuple,
  target: Vector3Tuple,
): Vector3Tuple {
  const projection = dot(origin, target);
  return normalize([
    target[0] - origin[0] * projection,
    target[1] - origin[1] * projection,
    target[2] - origin[2] * projection,
  ]);
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function pointInSphericalTriangle(
  point: Vector3Tuple,
  a: Vector3Tuple,
  b: Vector3Tuple,
  c: Vector3Tuple,
): boolean {
  const onSameSide = (
    first: Vector3Tuple,
    second: Vector3Tuple,
    reference: Vector3Tuple,
  ) =>
    dot(cross(first, second), point) * dot(cross(first, second), reference) >=
    -1e-10;
  return onSameSide(a, b, c) && onSameSide(b, c, a) && onSameSide(c, a, b);
}

function anchorInsideTerritory(
  territory: number,
  anchor: Vector3Tuple,
  sphere: IcosphereData,
  ownership: readonly (number | null)[],
): boolean {
  return sphere.faces.some(([a, b, c], faceIndex) => {
    if (ownership[faceIndex] !== territory) return false;
    return pointInSphericalTriangle(
      anchor,
      sphere.vertices[a]!,
      sphere.vertices[b]!,
      sphere.vertices[c]!,
    );
  });
}

function interiorAngleDegrees(
  previous: Vector3Tuple,
  current: Vector3Tuple,
  next: Vector3Tuple,
): number {
  return (
    Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          dot(
            tangentDirection(current, previous),
            tangentDirection(current, next),
          ),
        ),
      ),
    ) *
    (180 / Math.PI)
  );
}

function meaningfulLoopSideCount(
  loop: readonly number[],
  vertices: readonly Vector3Tuple[],
  perimeter: number,
): number {
  const retained = [...loop];
  while (retained.length > 3) {
    const removable = retained
      .map((vertex, index) => {
        const previous =
          vertices[retained[(index - 1 + retained.length) % retained.length]!]!;
        const current = vertices[vertex]!;
        const next = vertices[retained[(index + 1) % retained.length]!]!;
        const angle = interiorAngleDegrees(previous, current, next);
        const minimumEdge = Math.min(
          angularDistance(previous, current),
          angularDistance(current, next),
        );
        return {
          index,
          vertex,
          angle,
          minimumEdge,
          significance: (180 - angle) * minimumEdge,
        };
      })
      .filter(
        ({ angle, minimumEdge }) =>
          180 - angle < GEOMETRY_QUALITY_THRESHOLDS.meaningfulTurnDegrees ||
          minimumEdge <
            perimeter *
              GEOMETRY_QUALITY_THRESHOLDS.meaningfulEdgePerimeterFraction,
      )
      .sort(
        (left, right) =>
          left.significance - right.significance || left.vertex - right.vertex,
      );
    if (removable.length === 0) break;
    retained.splice(removable[0]!.index, 1);
  }
  return retained.length;
}

function tangentAspectRatio(
  center: Vector3Tuple,
  points: readonly Vector3Tuple[],
): number {
  if (points.length < 3) return 1;
  const reference: Vector3Tuple =
    Math.abs(center[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const firstAxis = normalize([
    reference[1] * center[2] - reference[2] * center[1],
    reference[2] * center[0] - reference[0] * center[2],
    reference[0] * center[1] - reference[1] * center[0],
  ]);
  const secondAxis: Vector3Tuple = [
    center[1] * firstAxis[2] - center[2] * firstAxis[1],
    center[2] * firstAxis[0] - center[0] * firstAxis[2],
    center[0] * firstAxis[1] - center[1] * firstAxis[0],
  ];
  const projected = points.map((point) => {
    const denominator = Math.max(1e-8, dot(point, center));
    return {
      x: dot(point, firstAxis) / denominator,
      y: dot(point, secondAxis) / denominator,
    };
  });
  const meanX =
    projected.reduce((sum, point) => sum + point.x, 0) / projected.length;
  const meanY =
    projected.reduce((sum, point) => sum + point.y, 0) / projected.length;
  const xx =
    projected.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) /
    projected.length;
  const yy =
    projected.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0) /
    projected.length;
  const xy =
    projected.reduce(
      (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
      0,
    ) / projected.length;
  const trace = xx + yy;
  const discriminant = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
  const major = Math.max(1e-12, (trace + discriminant) / 2);
  const minor = Math.max(1e-12, (trace - discriminant) / 2);
  return Math.sqrt(major / minor);
}

export function chooseInteriorAnchors(
  sphere: IcosphereData,
  ownership: readonly (number | null)[],
  centroids: readonly Vector3Tuple[],
  territoryCount: number,
): Vector3Tuple[] {
  return Array.from({ length: territoryCount }, (_, territory) => {
    let bestFace = -1;
    let bestSimilarity = Number.NEGATIVE_INFINITY;
    sphere.faces.forEach(([a, b, c], faceIndex) => {
      if (ownership[faceIndex] !== territory) return;
      const faceCenter = centroid(
        sphere.vertices[a]!,
        sphere.vertices[b]!,
        sphere.vertices[c]!,
      );
      const similarity = dot(faceCenter, centroids[territory]!);
      if (
        similarity > bestSimilarity ||
        (similarity === bestSimilarity &&
          (bestFace < 0 || faceIndex < bestFace))
      ) {
        bestFace = faceIndex;
        bestSimilarity = similarity;
      }
    });
    if (bestFace < 0) {
      throw new Error(`Territory ${territory} has no interior anchor cell.`);
    }
    const [a, b, c] = sphere.faces[bestFace]!;
    return centroid(
      sphere.vertices[a]!,
      sphere.vertices[b]!,
      sphere.vertices[c]!,
    );
  });
}

function graphComponents(
  nodes: readonly number[],
  adjacency: readonly number[][],
): number {
  const allowed = new Set(nodes);
  const seen = new Set<number>();
  let count = 0;
  for (const start of nodes) {
    if (seen.has(start)) continue;
    count += 1;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      if (seen.has(current) || !allowed.has(current)) continue;
      seen.add(current);
      for (const neighbor of adjacency[current]!) {
        if (allowed.has(neighbor) && !seen.has(neighbor)) queue.push(neighbor);
      }
    }
  }
  return count;
}

function articulationCount(
  nodes: readonly number[],
  adjacency: readonly number[][],
): number {
  const allowed = new Set(nodes);
  let count = 0;
  for (const removed of nodes) {
    const remaining = nodes.filter((node) => node !== removed);
    if (
      remaining.length > 1 &&
      graphComponents(
        remaining,
        adjacency.map((neighbors) =>
          neighbors.filter(
            (neighbor) => neighbor !== removed && allowed.has(neighbor),
          ),
        ),
      ) > 1
    ) {
      count += 1;
    }
  }
  return count;
}

function landAdjacency(
  territoryCount: number,
  borderWeights: readonly TerritoryBorderWeight[],
): number[][] {
  const adjacency = Array.from(
    { length: territoryCount },
    () => new Set<number>(),
  );
  for (const border of borderWeights) {
    adjacency[border.leftTerritoryIndex]!.add(border.rightTerritoryIndex);
    adjacency[border.rightTerritoryIndex]!.add(border.leftTerritoryIndex);
  }
  return adjacency.map((neighbors) => [...neighbors].sort((a, b) => a - b));
}

export function analyzeGeometryQuality(
  input: GeometryQualityInput,
): GeometryQualityAnalysis {
  const edges = edgeRecords(input.sphere);
  const areas = Array.from({ length: input.territoryCount }, () => 0);
  input.sphere.faces.forEach(([a, b, c], faceIndex) => {
    const owner = input.ownership[faceIndex];
    if (owner === null) return;
    areas[owner] += sphericalTriangleArea(
      input.sphere.vertices[a]!,
      input.sphere.vertices[b]!,
      input.sphere.vertices[c]!,
    );
  });
  const areaMedian = median(areas);
  const territories = Array.from(
    { length: input.territoryCount },
    (_, territory): TerritoryGeometryMetrics => {
      const boundaryEdges = boundaryEdgesForTerritory(
        territory,
        input.ownership,
        edges,
      );
      const loops = orderedBoundaryLoops(boundaryEdges);
      const edgeLengths = boundaryEdges.map(([first, second]) =>
        angularDistance(
          input.sphere.vertices[first]!,
          input.sphere.vertices[second]!,
        ),
      );
      const perimeter = edgeLengths.reduce((sum, value) => sum + value, 0);
      const angles = loops.flatMap((loop) =>
        loop.map((vertex, index) =>
          interiorAngleDegrees(
            input.sphere.vertices[
              loop[(index - 1 + loop.length) % loop.length]!
            ]!,
            input.sphere.vertices[vertex]!,
            input.sphere.vertices[loop[(index + 1) % loop.length]!]!,
          ),
        ),
      );
      const meaningfulSideCount = loops.reduce(
        (sum, loop) =>
          sum + meaningfulLoopSideCount(loop, input.sphere.vertices, perimeter),
        0,
      );
      const uniqueVertices = [
        ...new Set(boundaryEdges.flatMap(([first, second]) => [first, second])),
      ];
      return {
        territoryId: `territory-${String(territory + 1).padStart(2, '0')}`,
        sphericalArea: rounded(areas[territory]!),
        areaToMedianRatio: rounded(
          areas[territory]! / Math.max(1e-12, areaMedian),
        ),
        perimeter: rounded(perimeter),
        compactness: rounded(
          Math.min(1, (4 * Math.PI * areas[territory]!) / perimeter ** 2),
        ),
        diameterAspectRatio: rounded(
          tangentAspectRatio(
            input.centroids[territory]!,
            uniqueVertices.map((vertex) => input.sphere.vertices[vertex]!),
          ),
        ),
        meaningfulSideCount,
        shortestEdge: rounded(Math.min(...edgeLengths)),
        shortEdgeCount: edgeLengths.filter(
          (length) =>
            length <
            perimeter * GEOMETRY_QUALITY_THRESHOLDS.shortEdgePerimeterFraction,
        ).length,
        minimumInteriorAngleDegrees: rounded(Math.min(...angles)),
        nearCollinearVertexCount: angles.filter(
          (angle) =>
            180 - angle < GEOMETRY_QUALITY_THRESHOLDS.nearCollinearTurnDegrees,
        ).length,
        vertexCount: uniqueVertices.length,
        siteToCentroidDistance: rounded(
          angularDistance(input.sites[territory]!, input.centroids[territory]!),
        ),
        centroidToAnchorDistance: rounded(
          angularDistance(
            input.centroids[territory]!,
            input.anchors[territory]!,
          ),
        ),
        centroid: input.centroids[territory]!,
        anchorInside: anchorInsideTerritory(
          territory,
          input.anchors[territory]!,
          input.sphere,
          input.ownership,
        ),
      };
    },
  );

  const adjacency = landAdjacency(input.territoryCount, input.borderWeights);
  const continentAreas = Array.from({ length: input.continentCount }, () => 0);
  const continentPerimeters = Array.from(
    { length: input.continentCount },
    () => 0,
  );
  const continentCoastlines = Array.from(
    { length: input.continentCount },
    () => 0,
  );
  input.continentAssignments.forEach((continent, territory) => {
    continentAreas[continent] += areas[territory]!;
  });
  for (const edge of edges) {
    const [firstFace, secondFace] = edge.faces;
    if (secondFace === undefined) continue;
    const firstOwner = input.ownership[firstFace] ?? null;
    const secondOwner = input.ownership[secondFace] ?? null;
    const firstContinent =
      firstOwner === null ? null : input.continentAssignments[firstOwner]!;
    const secondContinent =
      secondOwner === null ? null : input.continentAssignments[secondOwner]!;
    if (firstContinent === secondContinent) continue;
    const length = angularDistance(
      input.sphere.vertices[edge.first]!,
      input.sphere.vertices[edge.second]!,
    );
    if (firstContinent !== null) continentPerimeters[firstContinent] += length;
    if (secondContinent !== null)
      continentPerimeters[secondContinent] += length;
    if (firstContinent !== null && secondContinent === null) {
      continentCoastlines[firstContinent] += length;
    }
    if (secondContinent !== null && firstContinent === null) {
      continentCoastlines[secondContinent] += length;
    }
  }
  const meanTerritoryCount = input.territoryCount / input.continentCount;
  const meanContinentArea =
    continentAreas.reduce((sum, value) => sum + value, 0) /
    input.continentCount;
  const continents = Array.from(
    { length: input.continentCount },
    (_, continent): ContinentGeometryMetrics => {
      const nodes = input.continentAssignments
        .map((assigned, territory) => ({ assigned, territory }))
        .filter(({ assigned }) => assigned === continent)
        .map(({ territory }) => territory);
      const diameter = nodes.reduce(
        (maximum, left, index) =>
          Math.max(
            maximum,
            ...nodes
              .slice(index + 1)
              .map((right) =>
                angularDistance(input.anchors[left]!, input.anchors[right]!),
              ),
          ),
        0,
      );
      const continentCenter = normalize(
        nodes.reduce<Vector3Tuple>(
          (sum, territory) => {
            sum[0] += input.centroids[territory]![0] * areas[territory]!;
            sum[1] += input.centroids[territory]![1] * areas[territory]!;
            sum[2] += input.centroids[territory]![2] * areas[territory]!;
            return sum;
          },
          [0, 0, 0],
        ),
      );
      const angularRadii = nodes.map(
        (territory) =>
          angularDistance(continentCenter, input.anchors[territory]!) *
          (180 / Math.PI),
      );
      const appendages = nodes.filter(
        (territory) =>
          adjacency[territory]!.filter(
            (neighbor) => input.continentAssignments[neighbor] === continent,
          ).length <= 1,
      ).length;
      const enclaves = input.continentAssignments.filter(
        (assigned, territory) =>
          assigned !== continent &&
          adjacency[territory]!.length > 0 &&
          adjacency[territory]!.every(
            (neighbor) => input.continentAssignments[neighbor] === continent,
          ),
      ).length;
      return {
        continentId: `continent-${String(continent + 1).padStart(2, '0')}`,
        territoryCount: nodes.length,
        sphericalArea: rounded(continentAreas[continent]!),
        compactness: rounded(
          Math.min(
            1,
            (4 * Math.PI * continentAreas[continent]!) /
              continentPerimeters[continent]! ** 2,
          ),
        ),
        perimeterToCoastlineRatio: rounded(
          continentPerimeters[continent]! /
            Math.max(1e-12, continentCoastlines[continent]!),
        ),
        geographicDiameterDegrees: rounded(diameter * (180 / Math.PI)),
        maximumAngularRadiusDegrees: rounded(Math.max(0, ...angularRadii)),
        meanAngularRadiusDegrees: rounded(
          angularRadii.reduce((sum, value) => sum + value, 0) /
            Math.max(1, angularRadii.length),
        ),
        oneTerritoryAppendageCount: appendages,
        narrowNeckCount: articulationCount(nodes, adjacency),
        connectedComponentCount: graphComponents(nodes, adjacency),
        enclaveOrHoleCount: enclaves,
        territoryCountToMeanRatio: rounded(
          nodes.length / Math.max(1, meanTerritoryCount),
        ),
        areaToMeanRatio: rounded(
          continentAreas[continent]! / Math.max(1e-12, meanContinentArea),
        ),
      };
    },
  );

  const degrees = adjacency.map((neighbors) => neighbors.length);
  const degreeDistribution = Object.fromEntries(
    [...new Set(degrees)]
      .sort((left, right) => left - right)
      .map((degree) => [
        String(degree),
        degrees.filter((value) => value === degree).length,
      ]),
  );
  const sideCounts = territories.map((metric) => metric.meaningfulSideCount);
  const sideCountDistribution = Object.fromEntries(
    [...new Set(sideCounts)]
      .sort((left, right) => left - right)
      .map((count) => [
        String(count),
        sideCounts.filter((value) => value === count).length,
      ]),
  );
  const seaRouteLengths = input.connections
    .filter((connection) => connection.type === 'sea-route')
    .map((connection) => {
      const indexFromId = (id: string) =>
        Number(id.slice('territory-'.length)) - 1;
      return rounded(
        angularDistance(
          input.anchors[indexFromId(connection.fromTerritoryId)]!,
          input.anchors[indexFromId(connection.toTerritoryId)]!,
        ),
      );
    })
    .sort((left, right) => left - right);
  const world: WorldGeometryMetrics = {
    territoryAreaCoefficientOfVariation: rounded(coefficientOfVariation(areas)),
    outlierTerritoryCount: territories.filter(
      (metric) =>
        metric.areaToMedianRatio < GEOMETRY_QUALITY_THRESHOLDS.lowerAreaRatio ||
        metric.areaToMedianRatio > GEOMETRY_QUALITY_THRESHOLDS.upperAreaRatio,
    ).length,
    averageMeaningfulSideCount: rounded(
      sideCounts.reduce((sum, value) => sum + value, 0) /
        Math.max(1, sideCounts.length),
    ),
    sideCountDistribution,
    tinyEdgeTotal: territories.reduce(
      (sum, metric) => sum + metric.shortEdgeCount,
      0,
    ),
    acuteCornerTotal: territories.filter(
      (metric) =>
        metric.minimumInteriorAngleDegrees <
        GEOMETRY_QUALITY_THRESHOLDS.acuteInteriorAngleDegrees,
    ).length,
    continentCompactnessDistribution: continents
      .map((metric) => metric.compactness)
      .sort((left, right) => left - right),
    landOceanBalance: rounded(input.landCoverage),
    adjacencyDegreeDistribution: degreeDistribution,
    seaRouteCount: seaRouteLengths.length,
    seaRouteLengthDistribution: seaRouteLengths,
    territoryCountBalanceCoefficientOfVariation: rounded(
      coefficientOfVariation(
        continents.map((continent) => continent.territoryCount),
      ),
    ),
    continentAreaBalanceCoefficientOfVariation: rounded(
      coefficientOfVariation(continentAreas),
    ),
  };
  return { territories, continents, world };
}

export function scoreGeometryCandidate(
  analysis: GeometryQualityAnalysis,
): CandidateScoreComponents {
  const territoryAreaVariance =
    analysis.world.territoryAreaCoefficientOfVariation * 120;
  const territoryOutliers = analysis.world.outlierTerritoryCount * 16;
  const compactness = analysis.territories.reduce(
    (sum, metric) => sum + Math.max(0, 0.45 - metric.compactness) * 35,
    0,
  );
  const tinyEdges = analysis.world.tinyEdgeTotal * 1.4;
  const acuteCorners = analysis.world.acuteCornerTotal * 5;
  const aspectRatio = analysis.territories.reduce(
    (sum, metric) => sum + Math.max(0, metric.diameterAspectRatio - 2.2) * 7,
    0,
  );
  const continentCompactness = analysis.continents.reduce(
    (sum, metric) =>
      sum +
      Math.max(0, 0.28 - metric.compactness) * 90 +
      Math.max(0, metric.geographicDiameterDegrees - 100) * 3.5 +
      (metric.maximumAngularRadiusDegrees > 68 &&
      metric.meanAngularRadiusDegrees > 35
        ? 600 +
          (metric.maximumAngularRadiusDegrees - 68) * 12 +
          (metric.meanAngularRadiusDegrees - 35) * 12
        : 0),
    0,
  );
  const continentBalance =
    analysis.world.territoryCountBalanceCoefficientOfVariation * 35 +
    analysis.world.continentAreaBalanceCoefficientOfVariation * 45;
  const tendrils =
    analysis.continents.reduce(
      (sum, metric) =>
        sum +
        metric.oneTerritoryAppendageCount +
        metric.enclaveOrHoleCount * 3 +
        Math.max(0, metric.connectedComponentCount - 1) * 10,
      0,
    ) * 11;
  const narrowNecks =
    analysis.continents.reduce(
      (sum, metric) => sum + metric.narrowNeckCount,
      0,
    ) * 6;
  const degrees = Object.entries(analysis.world.adjacencyDegreeDistribution);
  const topology = degrees.reduce(
    (sum, [degree, count]) =>
      sum +
      (Number(degree) < 2
        ? count * 40
        : Number(degree) > 7
          ? count * (Number(degree) - 7) * 9
          : 0),
    0,
  );
  const seaRoutes = analysis.world.seaRouteLengthDistribution.reduce(
    (sum, length) => sum + Math.max(0, length - Math.PI * 0.58) * 12,
    0,
  );
  const components = {
    territoryAreaVariance,
    territoryOutliers,
    compactness,
    tinyEdges,
    acuteCorners,
    aspectRatio,
    continentCompactness,
    continentBalance,
    tendrils,
    narrowNecks,
    topology,
    seaRoutes,
  };
  return {
    ...Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, rounded(value)]),
    ),
    total: rounded(
      Object.values(components).reduce((sum, value) => sum + value, 0),
    ),
  } as CandidateScoreComponents;
}

export function areaWeightedCentroids(
  sphere: IcosphereData,
  ownership: readonly (number | null)[],
  territoryCount: number,
): Vector3Tuple[] {
  return Array.from({ length: territoryCount }, (_, territory) => {
    const points: Vector3Tuple[] = [];
    const weights: number[] = [];
    sphere.faces.forEach(([a, b, c], faceIndex) => {
      if (ownership[faceIndex] !== territory) return;
      points.push(
        centroid(sphere.vertices[a]!, sphere.vertices[b]!, sphere.vertices[c]!),
      );
      weights.push(
        sphericalTriangleArea(
          sphere.vertices[a]!,
          sphere.vertices[b]!,
          sphere.vertices[c]!,
        ),
      );
    });
    return weightedSphericalCentroid(points, weights);
  });
}

export function territorySphericalAreas(
  sphere: IcosphereData,
  ownership: readonly (number | null)[],
  territoryCount: number,
): number[] {
  const areas = Array.from({ length: territoryCount }, () => 0);
  sphere.faces.forEach(([a, b, c], faceIndex) => {
    const owner = ownership[faceIndex];
    if (owner === null) return;
    areas[owner] += sphericalTriangleArea(
      sphere.vertices[a]!,
      sphere.vertices[b]!,
      sphere.vertices[c]!,
    );
  });
  return areas;
}

export function analyzePlanetGeometry(
  planet: PlanetDefinition,
): GeometryQualityAnalysis {
  const sphere = getPlanetSurfaceSphere(planet);
  const ownership = planet.surfaceCells.map((cell) =>
    cell.territoryId === null
      ? null
      : Number(cell.territoryId.slice('territory-'.length)) - 1,
  );
  const continentById = new Map(
    planet.continents.map((continent, index) => [continent.id, index]),
  );
  const continentAssignments = planet.territories.map((territory) =>
    continentById.get(territory.continentId)!,
  );
  const centroids = areaWeightedCentroids(
    sphere,
    ownership,
    planet.territoryCount,
  );
  return analyzeGeometryQuality({
    sphere,
    ownership,
    territoryCount: planet.territoryCount,
    sites:
      planet.generationDiagnostics?.sites ??
      planet.territories.map((territory) => territory.center),
    centroids,
    anchors: planet.territories.map((territory) => territory.center),
    continentAssignments,
    continentCount: planet.continentCount,
    borderWeights: buildTerritoryBorderWeights(
      ownership,
      buildCellAdjacency(sphere),
    ),
    connections: planet.connections,
    landCoverage: planet.landCoverage,
  });
}
