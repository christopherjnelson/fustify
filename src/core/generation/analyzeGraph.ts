import type { ContinentDefinition } from '../types/continent.ts';
import type {
  ConnectionGraphMetric,
  StrategicGraphAnalysis,
} from '../types/analysis.ts';
import type {
  LandmassDefinition,
  TerritoryConnection,
} from '../types/surface.ts';
import type { TerritoryDefinition } from '../types/territory.ts';
import type { TerritoryBorderWeight } from './buildConnections.ts';

export interface UndirectedEdge {
  from: string;
  to: string;
}

export interface UndirectedGraphAnalysis {
  connected: boolean;
  articulationNodeIds: string[];
  bridgeEdgeKeys: string[];
}

export function undirectedEdgeKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

/** Tarjan DFS for articulation points and bridges in an undirected graph. */
export function analyzeUndirectedGraph(
  nodeIds: readonly string[],
  edges: readonly UndirectedEdge[],
): UndirectedGraphAnalysis {
  const adjacency = new Map(
    nodeIds.map((nodeId) => [
      nodeId,
      [] as Array<{ nodeId: string; edgeKey: string }>,
    ]),
  );
  for (const edge of edges) {
    const edgeKey = undirectedEdgeKey(edge.from, edge.to);
    adjacency.get(edge.from)?.push({ nodeId: edge.to, edgeKey });
    adjacency.get(edge.to)?.push({ nodeId: edge.from, edgeKey });
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }

  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const articulation = new Set<string>();
  const bridges = new Set<string>();
  let time = 0;
  let componentCount = 0;

  const visit = (nodeId: string, parentEdgeKey: string | null): void => {
    time += 1;
    discovery.set(nodeId, time);
    low.set(nodeId, time);
    let childCount = 0;

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (neighbor.edgeKey === parentEdgeKey) continue;
      if (!discovery.has(neighbor.nodeId)) {
        childCount += 1;
        visit(neighbor.nodeId, neighbor.edgeKey);
        low.set(nodeId, Math.min(low.get(nodeId)!, low.get(neighbor.nodeId)!));
        if (
          parentEdgeKey !== null &&
          low.get(neighbor.nodeId)! >= discovery.get(nodeId)!
        ) {
          articulation.add(nodeId);
        }
        if (low.get(neighbor.nodeId)! > discovery.get(nodeId)!) {
          bridges.add(neighbor.edgeKey);
        }
      } else {
        low.set(
          nodeId,
          Math.min(low.get(nodeId)!, discovery.get(neighbor.nodeId)!),
        );
      }
    }
    if (parentEdgeKey === null && childCount > 1) articulation.add(nodeId);
  };

  for (const nodeId of [...nodeIds].sort()) {
    if (discovery.has(nodeId)) continue;
    componentCount += 1;
    visit(nodeId, null);
  }

  return {
    connected: nodeIds.length === 0 || componentCount === 1,
    articulationNodeIds: [...articulation].sort(),
    bridgeEdgeKeys: [...bridges].sort(),
  };
}

export function analyzeStrategicGraph(
  territories: readonly TerritoryDefinition[],
  connections: readonly TerritoryConnection[],
  continents: readonly ContinentDefinition[],
  landmasses: readonly LandmassDefinition[],
  borderWeights: readonly TerritoryBorderWeight[],
): StrategicGraphAnalysis {
  const graph = analyzeUndirectedGraph(
    territories.map((territory) => territory.id),
    connections.map((connection) => ({
      from: connection.fromTerritoryId,
      to: connection.toTerritoryId,
    })),
  );
  const bridgeKeys = new Set(graph.bridgeEdgeKeys);
  const gatewayTerritoryIds = [
    ...new Set(
      continents.flatMap((continent) => continent.externalGatewayTerritoryIds),
    ),
  ].sort();
  const gatewayIds = new Set(gatewayTerritoryIds);
  const articulationIds = new Set(graph.articulationNodeIds);
  const seaRouteCounts = new Map(
    territories.map((territory) => [territory.id, 0]),
  );
  const connectionMetrics: ConnectionGraphMetric[] = connections.map(
    (connection) => {
      if (connection.type === 'sea-route') {
        seaRouteCounts.set(
          connection.fromTerritoryId,
          seaRouteCounts.get(connection.fromTerritoryId)! + 1,
        );
        seaRouteCounts.set(
          connection.toTerritoryId,
          seaRouteCounts.get(connection.toTerritoryId)! + 1,
        );
      }
      return {
        ...connection,
        isBridge: bridgeKeys.has(
          undirectedEdgeKey(
            connection.fromTerritoryId,
            connection.toTerritoryId,
          ),
        ),
      };
    },
  );
  const bridgeConnections = connectionMetrics.filter(
    (metric) => metric.isBridge,
  );
  const seaRouteBridgeConnections = bridgeConnections.filter(
    (metric) => metric.type === 'sea-route',
  );
  const territoryMetrics = territories.map((territory) => ({
    territoryId: territory.id,
    degree: territory.adjacentTerritoryIds.length,
    seaRouteCount: seaRouteCounts.get(territory.id)!,
    isGateway: gatewayIds.has(territory.id),
    isArticulationPoint: articulationIds.has(territory.id),
  }));
  const multiSeaRouteTerritoryIds = territoryMetrics
    .filter((metric) => metric.seaRouteCount > 1)
    .map((metric) => metric.territoryId);
  const landmassDegree = new Map(
    landmasses.map((landmass) => [landmass.id, new Set<string>()]),
  );
  const territoryById = new Map(
    territories.map((territory) => [territory.id, territory]),
  );
  for (const connection of connections.filter(
    (item) => item.type === 'sea-route',
  )) {
    const left = territoryById.get(connection.fromTerritoryId)!.landmassId;
    const right = territoryById.get(connection.toTerritoryId)!.landmassId;
    landmassDegree.get(left)!.add(right);
    landmassDegree.get(right)!.add(left);
  }

  const continentIndexById = new Map(
    continents.map((continent, index) => [continent.id, index]),
  );
  const sameNeighbors = territories.map(() => 0);
  const externalNeighbors = territories.map(() => new Map<number, number>());
  const cohesionAccumulators = continents.map(() => ({
    internalEdges: 0,
    externalEdges: 0,
    internalBoundary: 0,
    externalBoundary: 0,
    internalSeaRoutes: 0,
  }));
  const interleaving = new Map<
    string,
    {
      first: number;
      second: number;
      edges: number;
      boundary: number;
    }
  >();
  for (const border of borderWeights) {
    const leftTerritory = territories[border.leftTerritoryIndex]!;
    const rightTerritory = territories[border.rightTerritoryIndex]!;
    const leftContinent = continentIndexById.get(leftTerritory.continentId)!;
    const rightContinent = continentIndexById.get(rightTerritory.continentId)!;
    if (leftContinent === rightContinent) {
      sameNeighbors[border.leftTerritoryIndex] += 1;
      sameNeighbors[border.rightTerritoryIndex] += 1;
      cohesionAccumulators[leftContinent]!.internalEdges += 1;
      cohesionAccumulators[leftContinent]!.internalBoundary +=
        border.sharedCellEdgeCount;
    } else {
      for (const [territoryIndex, externalContinent] of [
        [border.leftTerritoryIndex, rightContinent],
        [border.rightTerritoryIndex, leftContinent],
      ] as const) {
        externalNeighbors[territoryIndex]!.set(
          externalContinent,
          (externalNeighbors[territoryIndex]!.get(externalContinent) ?? 0) + 1,
        );
      }
      cohesionAccumulators[leftContinent]!.externalEdges += 1;
      cohesionAccumulators[rightContinent]!.externalEdges += 1;
      cohesionAccumulators[leftContinent]!.externalBoundary +=
        border.sharedCellEdgeCount;
      cohesionAccumulators[rightContinent]!.externalBoundary +=
        border.sharedCellEdgeCount;
      const first = Math.min(leftContinent, rightContinent);
      const second = Math.max(leftContinent, rightContinent);
      const key = `${first}:${second}`;
      const current = interleaving.get(key) ?? {
        first,
        second,
        edges: 0,
        boundary: 0,
      };
      current.edges += 1;
      current.boundary += border.sharedCellEdgeCount;
      interleaving.set(key, current);
    }
  }
  for (const route of connections.filter(
    (connection) => connection.type === 'sea-route',
  )) {
    const leftContinent = continentIndexById.get(
      territoryById.get(route.fromTerritoryId)!.continentId,
    )!;
    const rightContinent = continentIndexById.get(
      territoryById.get(route.toTerritoryId)!.continentId,
    )!;
    if (leftContinent === rightContinent) {
      cohesionAccumulators[leftContinent]!.internalSeaRoutes += 1;
    }
  }
  const continentCohesionMetrics = continents.map(
    (continent, continentIndex) => {
      const accumulator = cohesionAccumulators[continentIndex]!;
      const dominatedTerritoryIds: string[] = [];
      const protrusionTerritoryIds: string[] = [];
      for (const territoryId of continent.territoryIds) {
        const territoryIndex = territories.findIndex(
          (item) => item.id === territoryId,
        );
        const strongestExternal = Math.max(
          0,
          ...externalNeighbors[territoryIndex]!.values(),
        );
        const externalTotal = [
          ...externalNeighbors[territoryIndex]!.values(),
        ].reduce((sum, value) => sum + value, 0);
        if (strongestExternal > sameNeighbors[territoryIndex]!) {
          dominatedTerritoryIds.push(territoryId);
        }
        if (sameNeighbors[territoryIndex]! <= 1 && externalTotal >= 2) {
          protrusionTerritoryIds.push(territoryId);
        }
      }
      return {
        continentId: continent.id,
        internalEdgeCount: accumulator.internalEdges,
        externalEdgeCount: accumulator.externalEdges,
        internalBoundaryLength: accumulator.internalBoundary,
        externalBoundaryLength: accumulator.externalBoundary,
        internalSeaRouteCount: accumulator.internalSeaRoutes,
        cohesionScore:
          accumulator.internalBoundary /
          Math.max(
            1,
            accumulator.internalBoundary + accumulator.externalBoundary,
          ),
        dominatedTerritoryIds,
        protrusionTerritoryIds,
      };
    },
  );
  const continentInterleavingMetrics = [...interleaving.values()]
    .sort((a, b) => a.first - b.first || a.second - b.second)
    .map((metric) => ({
      firstContinentId: continents[metric.first]!.id,
      secondContinentId: continents[metric.second]!.id,
      sharedTerritoryEdgeCount: metric.edges,
      sharedCellBoundaryLength: metric.boundary,
    }));

  return {
    connected: graph.connected,
    articulationTerritoryIds: graph.articulationNodeIds,
    bridgeConnections,
    seaRouteBridgeConnections,
    gatewayTerritoryIds,
    multiSeaRouteTerritoryIds,
    territoryMetrics,
    connectionMetrics,
    landmassMetrics: landmasses.map((landmass) => ({
      landmassId: landmass.id,
      degree: landmassDegree.get(landmass.id)!.size,
    })),
    continentCohesionMetrics,
    continentInterleavingMetrics,
    routeRedundancy: connectionMetrics.filter(
      (metric) => metric.type === 'sea-route' && !metric.isBridge,
    ).length,
  };
}
