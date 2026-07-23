import { useMemo } from 'react';
import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryConnection } from '../core/types/surface';
import {
  canonicalSeaRoutes,
  getSeaRouteVisualState,
} from '../presentation/seaRoutes';

interface SeaRouteOverlayProps {
  planet: PlanetDefinition;
  selectedTerritoryId: string | null;
  legalTargetIds: ReadonlySet<string>;
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
  legalTargetIds,
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
    const emphasized = routes.filter(
      (route) =>
        getSeaRouteVisualState({
          route,
          selectedSourceId: selectedTerritoryId,
          legalTargetIds,
        }) === 'emphasized',
    );
    const emphasizedPairs = new Set(
      emphasized.map((route) =>
        [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
      ),
    );
    const baseline = routes.filter(
      (route) =>
        !emphasizedPairs.has(
          [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
        ),
    );
    return {
      routes,
      emphasized,
      baseline,
      bridges: baseline.filter((route) =>
        bridgePairs.has(
          [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
        ),
      ),
      redundant: baseline.filter(
        (route) =>
          !bridgePairs.has(
            [route.fromTerritoryId, route.toTerritoryId].sort().join('|'),
          ),
      ),
    };
  }, [legalTargetIds, planet, selectedTerritoryId]);
  const emphasizedGeometry = useMemo(
    () => routeGeometry(routeGroups.emphasized, planet),
    [planet, routeGroups.emphasized],
  );
  const baselineGeometry = useMemo(
    () => routeGeometry(routeGroups.baseline, planet, true),
    [planet, routeGroups.baseline],
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
      <lineSegments
        geometry={baselineGeometry}
        renderOrder={4}
        name={
          showNeutralPreviewRoutes
            ? 'neutral-preview-sea-routes'
            : 'baseline-sea-routes'
        }
        userData={{
          decorative: true,
          interactive: false,
          routeCount: routeGroups.baseline.length,
          visualState: 'baseline',
        }}
        raycast={() => undefined}
      >
        <lineBasicMaterial
          color="#8dd9ec"
          transparent
          opacity={0.58}
          depthWrite={false}
        />
      </lineSegments>
      {debugView && (
        <>
          <lineSegments
            geometry={redundantGeometry}
            renderOrder={5}
            raycast={() => undefined}
          >
            <lineBasicMaterial
              color="#72cfea"
              transparent
              opacity={0.55}
              depthWrite={false}
            />
          </lineSegments>
          <lineSegments
            geometry={bridgeGeometry}
            renderOrder={6}
            raycast={() => undefined}
          >
            <lineBasicMaterial
              color="#ff8c64"
              transparent
              opacity={0.92}
              depthWrite={false}
            />
          </lineSegments>
          <points
            geometry={endpoints}
            renderOrder={7}
            raycast={() => undefined}
          >
            <pointsMaterial
              color="#e8f8ff"
              size={0.07}
              sizeAttenuation
              depthWrite={false}
            />
          </points>
        </>
      )}
      {routeGroups.emphasized.length > 0 && (
        <>
          <lineSegments
            geometry={emphasizedGeometry}
            renderOrder={8}
            name="emphasized-sea-routes"
            userData={{
              decorative: true,
              interactive: false,
              routeCount: routeGroups.emphasized.length,
              visualState: 'emphasized',
            }}
            raycast={() => undefined}
          >
            <lineBasicMaterial
              color="#fff3a3"
              transparent
              opacity={1}
              depthWrite={false}
            />
          </lineSegments>
          <lineSegments
            geometry={emphasizedGeometry}
            scale={1.002}
            renderOrder={7}
            name="emphasized-sea-route-glow"
            userData={{ decorative: true, interactive: false }}
            raycast={() => undefined}
          >
            <lineBasicMaterial
              color="#61dfff"
              transparent
              opacity={0.36}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </lineSegments>
        </>
      )}
    </>
  );
}
