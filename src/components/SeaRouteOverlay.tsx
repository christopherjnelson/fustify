import { useMemo } from 'react';
import * as THREE from 'three';
import { normalize } from '../core/geometry/sphericalMath';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryConnection } from '../core/types/surface';

interface SeaRouteOverlayProps {
  planet: PlanetDefinition;
  selectedTerritoryId: string | null;
  debugView: boolean;
}

function routeGeometry(
  routes: readonly TerritoryConnection[],
  planet: PlanetDefinition,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const territories = new Map(
    planet.territories.map((item) => [item.id, item]),
  );
  for (const route of routes) {
    const from = territories.get(route.fromTerritoryId)!.center;
    const to = territories.get(route.toTerritoryId)!.center;
    const middle = normalize([
      from[0] + to[0],
      from[1] + to[1],
      from[2] + to[2],
    ]);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from).multiplyScalar(PLANET_RADIUS * 1.025),
      new THREE.Vector3(...middle).multiplyScalar(PLANET_RADIUS * 1.2),
      new THREE.Vector3(...to).multiplyScalar(PLANET_RADIUS * 1.025),
    );
    const points = curve.getPoints(28);
    for (let index = 1; index < points.length; index += 1) {
      positions.push(
        ...points[index - 1]!.toArray(),
        ...points[index]!.toArray(),
      );
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return result;
}

function endpointGeometry(
  routes: readonly TerritoryConnection[],
  planet: PlanetDefinition,
): THREE.BufferGeometry {
  const territories = new Map(
    planet.territories.map((item) => [item.id, item]),
  );
  const endpointIds = [
    ...new Set(
      routes.flatMap((route) => [route.fromTerritoryId, route.toTerritoryId]),
    ),
  ];
  const positions = endpointIds.flatMap((id) => {
    const center = territories.get(id)!.center;
    return center.map((value) => value * PLANET_RADIUS * 1.035);
  });
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return result;
}

export function SeaRouteOverlay({
  planet,
  selectedTerritoryId,
  debugView,
}: SeaRouteOverlayProps) {
  const routeGroups = useMemo(() => {
    const routes = planet.connections.filter(
      (connection) => connection.type === 'sea-route',
    );
    const bridgePairs = new Set(
      planet.analysis.seaRouteBridgeConnections.map((connection) =>
        [connection.fromTerritoryId, connection.toTerritoryId].sort().join('|'),
      ),
    );
    const selected = routes.filter(
      (route) =>
        selectedTerritoryId !== null &&
        (route.fromTerritoryId === selectedTerritoryId ||
          route.toTerritoryId === selectedTerritoryId),
    );
    const selectedPairs = new Set(
      selected.map((route) =>
        [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
      ),
    );
    const unselected = routes.filter(
      (route) =>
        !selectedPairs.has(
          [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
        ),
    );
    return {
      routes,
      selected,
      bridges: unselected.filter((route) =>
        bridgePairs.has(
          [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
        ),
      ),
      redundant: unselected.filter(
        (route) =>
          !bridgePairs.has(
            [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
          ),
      ),
    };
  }, [planet, selectedTerritoryId]);
  const selectedGeometry = useMemo(
    () => routeGeometry(routeGroups.selected, planet),
    [planet, routeGroups.selected],
  );
  const bridgeGeometry = useMemo(
    () => routeGeometry(routeGroups.bridges, planet),
    [planet, routeGroups.bridges],
  );
  const redundantGeometry = useMemo(
    () => routeGeometry(routeGroups.redundant, planet),
    [planet, routeGroups.redundant],
  );
  const endpoints = useMemo(
    () => endpointGeometry(routeGroups.routes, planet),
    [planet, routeGroups.routes],
  );

  return (
    <>
      {debugView && (
        <>
          <lineSegments geometry={redundantGeometry} renderOrder={5}>
            <lineBasicMaterial
              color="#72cfea"
              transparent
              opacity={0.55}
              depthWrite={false}
            />
          </lineSegments>
          <lineSegments geometry={bridgeGeometry} renderOrder={6}>
            <lineBasicMaterial
              color="#ff8c64"
              transparent
              opacity={0.92}
              depthWrite={false}
            />
          </lineSegments>
          <points geometry={endpoints} renderOrder={7}>
            <pointsMaterial
              color="#e8f8ff"
              size={0.07}
              sizeAttenuation
              depthWrite={false}
            />
          </points>
        </>
      )}
      {routeGroups.selected.length > 0 && (
        <lineSegments geometry={selectedGeometry} renderOrder={8}>
          <lineBasicMaterial
            color="#ffe16b"
            transparent
            opacity={1}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </>
  );
}
