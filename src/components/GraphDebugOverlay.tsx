import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';

interface DebugInstancesProps {
  territoryIds: readonly string[];
  planet: PlanetDefinition;
  color: string;
  radius: number;
  scale: number;
}

function DebugInstances({
  territoryIds,
  planet,
  color,
  radius,
  scale,
}: DebugInstancesProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const byId = new Map(
      planet.territories.map((territory) => [territory.id, territory]),
    );
    const matrix = new THREE.Matrix4();
    territoryIds.forEach((territoryId, index) => {
      const center = byId.get(territoryId)!.center;
      matrix.makeTranslation(
        center[0] * PLANET_RADIUS * radius,
        center[1] * PLANET_RADIUS * radius,
        center[2] * PLANET_RADIUS * radius,
      );
      matrix.scale(new THREE.Vector3(scale, scale, scale));
      mesh.current?.setMatrixAt(index, matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [planet, radius, scale, territoryIds]);
  if (territoryIds.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, territoryIds.length]}
      renderOrder={8}
    >
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={color} depthWrite={false} />
    </instancedMesh>
  );
}

interface GraphDebugOverlayProps {
  planet: PlanetDefinition;
  visible: boolean;
}

export function GraphDebugOverlay({ planet, visible }: GraphDebugOverlayProps) {
  const bridgeEndpoints = [
    ...new Set(
      planet.analysis.bridgeConnections.flatMap((connection) => [
        connection.fromTerritoryId,
        connection.toTerritoryId,
      ]),
    ),
  ];
  if (!visible) return null;
  return (
    <>
      <DebugInstances
        territoryIds={planet.analysis.gatewayTerritoryIds}
        planet={planet}
        color="#ccff00"
        radius={1.075}
        scale={0.035}
      />
      <DebugInstances
        territoryIds={bridgeEndpoints}
        planet={planet}
        color="#ffc85b"
        radius={1.09}
        scale={0.028}
      />
      <DebugInstances
        territoryIds={planet.analysis.articulationTerritoryIds}
        planet={planet}
        color="#ff5b6e"
        radius={1.105}
        scale={0.042}
      />
    </>
  );
}
