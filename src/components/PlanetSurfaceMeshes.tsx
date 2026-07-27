import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { IcosphereData } from '../core/geometry/icosphere';
import { OCEAN_COLOR, PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryDefinition } from '../core/types/territory';

interface PlanetSurfaceMeshesProps {
  planet: PlanetDefinition;
  sphere: IcosphereData;
  territoryColor: (territory: TerritoryDefinition) => THREE.Color;
  initialTerritoryColor?: (territory: TerritoryDefinition) => THREE.Color;
  oceanColor?: string;
  onTerritoryPointerMove?: (territoryId: string | null) => void;
  onTerritoryPointerOut?: () => void;
  onTerritoryClick?: (territoryId: string) => void;
}

export function PlanetSurfaceMeshes({
  planet,
  sphere,
  territoryColor,
  initialTerritoryColor = territoryColor,
  oceanColor = OCEAN_COLOR,
  onTerritoryPointerMove,
  onTerritoryPointerOut,
  onTerritoryClick,
}: PlanetSurfaceMeshesProps) {
  const territoryById = useMemo(
    () => new Map(planet.territories.map((item) => [item.id, item])),
    [planet],
  );
  const { landGeometry, oceanGeometry, landCellIds } = useMemo(() => {
    const landPositions: number[] = [];
    const landColors: number[] = [];
    const oceanPositions: number[] = [];
    const visibleLandCellIds: number[] = [];
    sphere.faces.forEach((face, cellId) => {
      const cell = planet.surfaceCells[cellId]!;
      const territory =
        cell.territoryId === null ? null : territoryById.get(cell.territoryId)!;
      const positions = territory ? landPositions : oceanPositions;
      if (territory) visibleLandCellIds.push(cellId);
      const color = territory ? initialTerritoryColor(territory) : null;
      for (const vertexIndex of face) {
        const vertex = sphere.vertices[vertexIndex]!;
        positions.push(
          vertex[0] * PLANET_RADIUS,
          vertex[1] * PLANET_RADIUS,
          vertex[2] * PLANET_RADIUS,
        );
        if (color) landColors.push(color.r, color.g, color.b);
      }
    });
    const land = new THREE.BufferGeometry();
    land.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(landPositions, 3),
    );
    land.setAttribute('color', new THREE.Float32BufferAttribute(landColors, 3));
    land.computeVertexNormals();
    const ocean = new THREE.BufferGeometry();
    ocean.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(oceanPositions, 3),
    );
    ocean.computeVertexNormals();
    return {
      landGeometry: land,
      oceanGeometry: ocean,
      landCellIds: visibleLandCellIds,
    };
  }, [initialTerritoryColor, planet, sphere, territoryById]);

  useLayoutEffect(() => {
    const colorAttribute = landGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute;
    landCellIds.forEach((cellId, renderedFaceIndex) => {
      const territoryId = planet.surfaceCells[cellId]!.territoryId!;
      const territory = territoryById.get(territoryId)!;
      const color = territoryColor(territory);
      const vertexOffset = renderedFaceIndex * 3;
      for (let offset = 0; offset < 3; offset += 1) {
        colorAttribute.setXYZ(vertexOffset + offset, color.r, color.g, color.b);
      }
    });
    colorAttribute.needsUpdate = true;
  }, [landCellIds, landGeometry, planet, territoryById, territoryColor]);

  const territoryFromLandFace = (faceIndex: number | null | undefined) => {
    if (faceIndex == null) return null;
    const cellId = landCellIds[faceIndex];
    return cellId === undefined
      ? null
      : planet.surfaceCells[cellId]!.territoryId;
  };
  const interactive =
    onTerritoryPointerMove !== undefined ||
    onTerritoryPointerOut !== undefined ||
    onTerritoryClick !== undefined;

  return (
    <>
      <mesh geometry={oceanGeometry}>
        <meshStandardMaterial
          color={oceanColor}
          flatShading
          roughness={0.7}
          metalness={0.08}
        />
      </mesh>
      <mesh
        geometry={landGeometry}
        raycast={interactive ? undefined : () => undefined}
        onPointerMove={
          onTerritoryPointerMove
            ? (event) => {
                event.stopPropagation();
                onTerritoryPointerMove(territoryFromLandFace(event.faceIndex));
              }
            : undefined
        }
        onPointerOut={
          onTerritoryPointerOut ? () => onTerritoryPointerOut() : undefined
        }
        onClick={
          onTerritoryClick
            ? (event) => {
                const territoryId = territoryFromLandFace(event.faceIndex);
                if (territoryId !== null) {
                  event.stopPropagation();
                  onTerritoryClick(territoryId);
                }
              }
            : undefined
        }
      >
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.76}
          metalness={0.04}
        />
      </mesh>
    </>
  );
}
