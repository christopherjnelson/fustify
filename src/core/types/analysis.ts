import type { TerritoryConnectionType } from './surface';

export interface TerritoryGraphMetric {
  territoryId: string;
  degree: number;
  seaRouteCount: number;
  isGateway: boolean;
  isArticulationPoint: boolean;
}

export interface ConnectionGraphMetric {
  fromTerritoryId: string;
  toTerritoryId: string;
  type: TerritoryConnectionType;
  isBridge: boolean;
}

export interface LandmassGraphMetric {
  landmassId: string;
  degree: number;
}

export interface ContinentCohesionMetric {
  continentId: string;
  internalEdgeCount: number;
  externalEdgeCount: number;
  internalBoundaryLength: number;
  externalBoundaryLength: number;
  internalSeaRouteCount: number;
  cohesionScore: number;
  dominatedTerritoryIds: string[];
  protrusionTerritoryIds: string[];
}

export interface ContinentInterleavingMetric {
  firstContinentId: string;
  secondContinentId: string;
  sharedTerritoryEdgeCount: number;
  sharedCellBoundaryLength: number;
}

export interface StrategicGraphAnalysis {
  connected: boolean;
  articulationTerritoryIds: string[];
  bridgeConnections: ConnectionGraphMetric[];
  seaRouteBridgeConnections: ConnectionGraphMetric[];
  gatewayTerritoryIds: string[];
  multiSeaRouteTerritoryIds: string[];
  territoryMetrics: TerritoryGraphMetric[];
  connectionMetrics: ConnectionGraphMetric[];
  landmassMetrics: LandmassGraphMetric[];
  continentCohesionMetrics: ContinentCohesionMetric[];
  continentInterleavingMetrics: ContinentInterleavingMetric[];
  routeRedundancy: number;
}
