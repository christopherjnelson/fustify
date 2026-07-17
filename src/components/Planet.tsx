import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { classifyTerritorySurface } from '../core/generation/buildAdjacency';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import { useGameStore } from '../state/useGameStore';
import { TerritoryOverlay } from './TerritoryOverlay';

interface PlanetProps {
  planet: PlanetDefinition;
}

function highlightedColor(base: string, kind: 'hovered' | 'selected' | null) {
  const color = new THREE.Color(base);
  if (kind === 'selected') color.lerp(new THREE.Color('#fff2a8'), 0.56);
  if (kind === 'hovered') color.lerp(new THREE.Color('#ffffff'), 0.34);
  return color;
}

export function Planet({ planet }: PlanetProps) {
  const hoveredId = useGameStore((state) => state.hoveredTerritoryId);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const debugView = useGameStore((state) => state.debugView);
  const setHovered = useGameStore((state) => state.setHoveredTerritory);
  const select = useGameStore((state) => state.selectTerritory);

  const surface = useMemo(
    () =>
      classifyTerritorySurface(planet.territories.map((item) => item.center)),
    [planet],
  );

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    surface.sphere.faces.forEach((face, faceIndex) => {
      const territoryIndex = surface.faceTerritoryIndices[faceIndex]!;
      const territory = planet.territories[territoryIndex]!;
      const color = highlightedColor(territory.displayColor, null);
      for (const vertexIndex of face) {
        const vertex = surface.sphere.vertices[vertexIndex]!;
        positions.push(
          vertex[0] * PLANET_RADIUS,
          vertex[1] * PLANET_RADIUS,
          vertex[2] * PLANET_RADIUS,
        );
        colors.push(color.r, color.g, color.b);
      }
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    result.computeVertexNormals();
    return result;
  }, [planet, surface]);

  useEffect(() => {
    const colorAttribute = geometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute;
    surface.faceTerritoryIndices.forEach((territoryIndex, faceIndex) => {
      const territory = planet.territories[territoryIndex]!;
      const kind =
        territory.id === selectedId
          ? 'selected'
          : territory.id === hoveredId
            ? 'hovered'
            : null;
      const color = highlightedColor(territory.displayColor, kind);
      const vertexOffset = faceIndex * 3;
      for (let offset = 0; offset < 3; offset += 1) {
        colorAttribute.setXYZ(vertexOffset + offset, color.r, color.g, color.b);
      }
    });
    colorAttribute.needsUpdate = true;
  }, [geometry, hoveredId, planet, selectedId, surface]);

  const territoryFromFace = (faceIndex: number | null | undefined) => {
    if (faceIndex == null) return null;
    const territoryIndex = surface.faceTerritoryIndices[faceIndex];
    return territoryIndex === undefined
      ? null
      : planet.territories[territoryIndex]!.id;
  };

  return (
    <group rotation={[0.08, 0, -0.08]}>
      <mesh
        geometry={geometry}
        onPointerMove={(event) => {
          event.stopPropagation();
          setHovered(territoryFromFace(event.faceIndex));
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(event) => {
          event.stopPropagation();
          select(territoryFromFace(event.faceIndex));
        }}
      >
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.76}
          metalness={0.04}
        />
      </mesh>
      <TerritoryOverlay surface={surface} emphasized={debugView} />
      <mesh scale={1.045}>
        <sphereGeometry args={[PLANET_RADIUS, 48, 32]} />
        <meshBasicMaterial
          color="#69b9df"
          transparent
          opacity={0.055}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
