import { useMemo } from 'react';
import * as THREE from 'three';
import type { IcosphereData } from '../core/geometry/icosphere';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { SurfaceCellDefinition } from '../core/types/surface';
import type { TerritoryDefinition } from '../core/types/territory';

interface TerritoryOverlayProps {
  sphere: IcosphereData;
  surfaceCells: readonly SurfaceCellDefinition[];
  territories: readonly TerritoryDefinition[];
  emphasized: boolean;
}

export const CONTINENT_BORDER_COLOR = '#c89b37';
export const CONTINENT_BORDER_OPACITY = 0.72;
export const COASTLINE_COLOR = '#e0b943';
export const COASTLINE_OPACITY = 0.92;

function boundaryGeometry(
  sphere: IcosphereData,
  surfaceCells: readonly SurfaceCellDefinition[],
  territoryContinents: ReadonlyMap<string, string>,
  kind: 'coastline' | 'territory' | 'continent',
) {
  const edgeFaces = new Map<string, number>();
  const positions: number[] = [];
  sphere.faces.forEach(([a, b, c], faceIndex) => {
    for (const [first, second] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const priorFace = edgeFaces.get(key);
      if (priorFace === undefined) {
        edgeFaces.set(key, faceIndex);
        continue;
      }
      const firstCell = surfaceCells[priorFace]!;
      const secondCell = surfaceCells[faceIndex]!;
      const isCoastline = firstCell.terrainType !== secondCell.terrainType;
      const isTerritoryBorder =
        firstCell.terrainType === 'land' &&
        secondCell.terrainType === 'land' &&
        firstCell.territoryId !== secondCell.territoryId;
      const isContinentBorder =
        isTerritoryBorder &&
        territoryContinents.get(firstCell.territoryId!) !==
          territoryContinents.get(secondCell.territoryId!);
      if (
        (kind === 'coastline' && !isCoastline) ||
        (kind === 'territory' && !isTerritoryBorder) ||
        (kind === 'continent' && !isContinentBorder)
      ) {
        continue;
      }
      for (const vertexIndex of [first, second]) {
        const vertex = sphere.vertices[vertexIndex]!;
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
}

export function TerritoryOverlay({
  sphere,
  surfaceCells,
  territories,
  emphasized,
}: TerritoryOverlayProps) {
  const territoryContinents = useMemo(
    () =>
      new Map(
        territories.map((territory) => [territory.id, territory.continentId]),
      ),
    [territories],
  );
  const coastlines = useMemo(
    () =>
      boundaryGeometry(sphere, surfaceCells, territoryContinents, 'coastline'),
    [sphere, surfaceCells, territoryContinents],
  );
  const territoryBorders = useMemo(
    () =>
      boundaryGeometry(sphere, surfaceCells, territoryContinents, 'territory'),
    [sphere, surfaceCells, territoryContinents],
  );
  const continentBorders = useMemo(
    () =>
      boundaryGeometry(sphere, surfaceCells, territoryContinents, 'continent'),
    [sphere, surfaceCells, territoryContinents],
  );

  return (
    <>
      <lineSegments geometry={territoryBorders} renderOrder={2}>
        <lineBasicMaterial
          color={emphasized ? '#d7efff' : '#09121d'}
          transparent
          opacity={emphasized ? 0.92 : 0.78}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={continentBorders} renderOrder={3}>
        <lineBasicMaterial
          color={emphasized ? '#ffe9a3' : CONTINENT_BORDER_COLOR}
          transparent
          opacity={emphasized ? 1 : CONTINENT_BORDER_OPACITY}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={coastlines} renderOrder={4}>
        <lineBasicMaterial
          color={emphasized ? '#ffdc70' : COASTLINE_COLOR}
          transparent
          opacity={emphasized ? 1 : COASTLINE_OPACITY}
          depthWrite={false}
        />
      </lineSegments>
    </>
  );
}
