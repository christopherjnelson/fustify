import type { Vector3Tuple } from './territory.ts';

export interface TerritoryGeometryMetrics {
  territoryId: string;
  sphericalArea: number;
  areaToMedianRatio: number;
  perimeter: number;
  compactness: number;
  diameterAspectRatio: number;
  meaningfulSideCount: number;
  shortestEdge: number;
  shortEdgeCount: number;
  minimumInteriorAngleDegrees: number;
  nearCollinearVertexCount: number;
  vertexCount: number;
  siteToCentroidDistance: number;
  centroidToAnchorDistance: number;
  centroid: Vector3Tuple;
  anchorInside: boolean;
}

export interface ContinentGeometryMetrics {
  continentId: string;
  territoryCount: number;
  sphericalArea: number;
  compactness: number;
  perimeterToCoastlineRatio: number;
  geographicDiameterDegrees: number;
  maximumAngularRadiusDegrees: number;
  meanAngularRadiusDegrees: number;
  oneTerritoryAppendageCount: number;
  narrowNeckCount: number;
  connectedComponentCount: number;
  enclaveOrHoleCount: number;
  territoryCountToMeanRatio: number;
  areaToMeanRatio: number;
}

export interface WorldGeometryMetrics {
  territoryAreaCoefficientOfVariation: number;
  outlierTerritoryCount: number;
  averageMeaningfulSideCount: number;
  sideCountDistribution: Record<string, number>;
  tinyEdgeTotal: number;
  acuteCornerTotal: number;
  continentCompactnessDistribution: number[];
  landOceanBalance: number;
  adjacencyDegreeDistribution: Record<string, number>;
  seaRouteCount: number;
  seaRouteLengthDistribution: number[];
  territoryCountBalanceCoefficientOfVariation: number;
  continentAreaBalanceCoefficientOfVariation: number;
}

export interface CandidateScoreComponents {
  territoryAreaVariance: number;
  territoryOutliers: number;
  compactness: number;
  tinyEdges: number;
  acuteCorners: number;
  aspectRatio: number;
  continentCompactness: number;
  continentBalance: number;
  tendrils: number;
  narrowNecks: number;
  topology: number;
  seaRoutes: number;
  total: number;
}

export interface GenerationCandidateDiagnostics {
  candidateIndex: number;
  derivedSeed: string;
  continentCandidateIndex: number;
  continentAssignmentScore: number;
  score: CandidateScoreComponents;
}

export interface GenerationDiagnostics {
  profile: 'v2-normalized';
  relaxationIterations: number;
  relaxationMoveFraction: number;
  coordinatePrecisionDigits: number;
  candidateCount: number;
  selectedCandidateIndex: number;
  candidates: GenerationCandidateDiagnostics[];
  territoryMetrics: TerritoryGeometryMetrics[];
  continentMetrics: ContinentGeometryMetrics[];
  worldMetrics: WorldGeometryMetrics;
  sites: Vector3Tuple[];
  centroids: Vector3Tuple[];
}

export type GenerationTimingPhase =
  | 'site-generation'
  | 'relaxation'
  | 'polygon-construction'
  | 'candidate-scoring'
  | 'total';

export type GenerationTimingObserver = (
  phase: GenerationTimingPhase,
  milliseconds: number,
) => void;
