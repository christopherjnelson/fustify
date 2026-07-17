import { useMemo } from 'react';
import * as THREE from 'three';
import type { TerritorySurface } from '../core/generation/buildAdjacency';
import { PLANET_RADIUS } from '../core/generation/constants';

interface TerritoryOverlayProps {
  surface: TerritorySurface;
  emphasized: boolean;
}

export function TerritoryOverlay({
  surface,
  emphasized,
}: TerritoryOverlayProps) {
  const geometry = useMemo(() => {
    const edgeFaces = new Map<string, number>();
    const positions: number[] = [];
    surface.sphere.faces.forEach(([a, b, c], faceIndex) => {
      const edges: [number, number][] = [
        [a, b],
        [b, c],
        [c, a],
      ];
      for (const [first, second] of edges) {
        const key =
          first < second ? `${first}:${second}` : `${second}:${first}`;
        const priorFace = edgeFaces.get(key);
        if (priorFace === undefined) {
          edgeFaces.set(key, faceIndex);
          continue;
        }
        if (
          surface.faceTerritoryIndices[priorFace] ===
          surface.faceTerritoryIndices[faceIndex]
        ) {
          continue;
        }
        for (const vertexIndex of [first, second]) {
          const vertex = surface.sphere.vertices[vertexIndex]!;
          const radius = PLANET_RADIUS * 1.006;
          positions.push(
            vertex[0] * radius,
            vertex[1] * radius,
            vertex[2] * radius,
          );
        }
      }
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return result;
  }, [surface]);

  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      <lineBasicMaterial
        color={emphasized ? '#d7efff' : '#09121d'}
        transparent
        opacity={emphasized ? 0.9 : 0.55}
        depthWrite={false}
      />
    </lineSegments>
  );
}
