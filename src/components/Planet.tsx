import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createIcosphere } from '../core/geometry/icosphere';
import {
  OCEAN_COLOR,
  PLANET_RADIUS,
  PLANET_SUBDIVISIONS,
} from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import { useGameStore } from '../state/useGameStore';
import type { TerritoryDefinition } from '../core/types/territory';
import { ArmyMarkers } from './ArmyMarkers';
import { GraphDebugOverlay } from './GraphDebugOverlay';
import { SeaRouteOverlay } from './SeaRouteOverlay';
import { TerritoryOverlay } from './TerritoryOverlay';

interface PlanetProps {
  planet: PlanetDefinition;
}

function territoryFillColor(
  territory: TerritoryDefinition,
  playerColor: string,
  kind: 'hovered' | 'selected' | null,
) {
  const color = new THREE.Color(playerColor).lerp(
    new THREE.Color(territory.displayColor),
    0.18,
  );
  const numericId = Number(territory.id.slice('territory-'.length));
  color.offsetHSL(0, 0, ((numericId % 5) - 2) * 0.025);
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
  const sphere = useMemo(() => createIcosphere(PLANET_SUBDIVISIONS), []);
  const territoryById = useMemo(
    () => new Map(planet.territories.map((item) => [item.id, item])),
    [planet],
  );
  const playerById = useMemo(
    () => new Map(planet.players.map((player) => [player.id, player])),
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
      const color = territory
        ? territoryFillColor(
            territory,
            playerById.get(territory.ownerId!)!.color,
            null,
          )
        : null;
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
  }, [planet, playerById, sphere, territoryById]);

  useEffect(() => {
    const colorAttribute = landGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute;
    landCellIds.forEach((cellId, renderedFaceIndex) => {
      const territoryId = planet.surfaceCells[cellId]!.territoryId!;
      const territory = territoryById.get(territoryId)!;
      const kind =
        territory.id === selectedId
          ? 'selected'
          : territory.id === hoveredId
            ? 'hovered'
            : null;
      const color = territoryFillColor(
        territory,
        playerById.get(territory.ownerId!)!.color,
        kind,
      );
      const vertexOffset = renderedFaceIndex * 3;
      for (let offset = 0; offset < 3; offset += 1) {
        colorAttribute.setXYZ(vertexOffset + offset, color.r, color.g, color.b);
      }
    });
    colorAttribute.needsUpdate = true;
  }, [
    hoveredId,
    landCellIds,
    landGeometry,
    planet,
    playerById,
    selectedId,
    territoryById,
  ]);

  const territoryFromLandFace = (faceIndex: number | null | undefined) => {
    if (faceIndex == null) return null;
    const cellId = landCellIds[faceIndex];
    return cellId === undefined
      ? null
      : planet.surfaceCells[cellId]!.territoryId;
  };

  return (
    <group rotation={[0.08, 0, -0.08]}>
      <mesh geometry={oceanGeometry}>
        <meshStandardMaterial
          color={OCEAN_COLOR}
          flatShading
          roughness={0.7}
          metalness={0.08}
        />
      </mesh>
      <mesh
        geometry={landGeometry}
        onPointerMove={(event) => {
          event.stopPropagation();
          setHovered(territoryFromLandFace(event.faceIndex));
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(event) => {
          const territoryId = territoryFromLandFace(event.faceIndex);
          if (territoryId !== null) {
            event.stopPropagation();
            select(territoryId);
          }
        }}
      >
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.76}
          metalness={0.04}
        />
      </mesh>
      <TerritoryOverlay
        sphere={sphere}
        surfaceCells={planet.surfaceCells}
        territories={planet.territories}
        emphasized={debugView}
      />
      <SeaRouteOverlay
        planet={planet}
        selectedTerritoryId={selectedId}
        debugView={debugView}
      />
      <ArmyMarkers planet={planet} selectedTerritoryId={selectedId} />
      <GraphDebugOverlay planet={planet} visible={debugView} />
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
