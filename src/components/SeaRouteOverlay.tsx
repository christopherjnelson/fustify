import { useMemo } from 'react';
import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryConnection } from '../core/types/surface';
import { canonicalSeaRoutes } from '../presentation/seaRoutes';

interface SeaRouteOverlayProps {
  planet: PlanetDefinition;
  selectedTerritoryId: string | null;
  debugView: boolean;
  showNeutralPreviewRoutes: boolean;
}

function routeGeometry(
  routes: readonly TerritoryConnection[],
  planet: PlanetDefinition,
  dotted = false,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const territories = new Map(
    planet.territories.map((item) => [item.id, item]),
  );
  for (const route of routes) {
    const from = territories.get(route.fromTerritoryId)!.center;
    const to = territories.get(route.toTerritoryId)!.center;
    const start = new THREE.Vector3(...from).normalize();
    const end = new THREE.Vector3(...to).normalize();
    const angle = start.angleTo(end);
    const points = Array.from({ length: 29 }, (_, index) => {
      const fraction = index / 28;
      const sinAngle = Math.sin(angle);
      const point =
        sinAngle > 0.0001
          ? start
              .clone()
              .multiplyScalar(Math.sin((1 - fraction) * angle) / sinAngle)
              .add(
                end
                  .clone()
                  .multiplyScalar(Math.sin(fraction * angle) / sinAngle),
              )
          : start.clone().lerp(end, fraction).normalize();
      return point.multiplyScalar(PLANET_RADIUS * 1.035);
    });
    for (let index = 1; index < points.length; index += 1) {
      if (dotted && index % 2 === 0) continue;
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
  showNeutralPreviewRoutes,
}: SeaRouteOverlayProps) {
  const routeGroups = useMemo(() => {
    const routes = canonicalSeaRoutes(planet);
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
  const previewGeometry = useMemo(
    () => routeGeometry(routeGroups.routes, planet, true),
    [planet, routeGroups.routes],
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
      {showNeutralPreviewRoutes && (
        <lineSegments
          geometry={previewGeometry}
          renderOrder={4}
          name="neutral-preview-sea-routes"
          userData={{ decorative: true, routeCount: routeGroups.routes.length }}
          raycast={() => undefined}
        >
          <lineBasicMaterial
            color="#8dd9ec"
            transparent
            opacity={0.48}
            depthWrite={false}
          />
        </lineSegments>
      )}
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
