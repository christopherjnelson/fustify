import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getReinforcementTargets,
} from '../core/game';
import { createIcosphere } from '../core/geometry/icosphere';
import {
  OCEAN_COLOR,
  PLANET_RADIUS,
  PLANET_SUBDIVISIONS,
} from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryDefinition } from '../core/types/territory';
import { useGameStore, type PlanetViewMode } from '../state/useGameStore';
import { ArmyMarkers } from './ArmyMarkers';
import { GraphDebugOverlay } from './GraphDebugOverlay';
import { SeaRouteOverlay } from './SeaRouteOverlay';
import { TerritoryOverlay } from './TerritoryOverlay';

interface PlanetProps {
  planet: PlanetDefinition;
}

type VisualKind =
  | 'hovered'
  | 'source'
  | 'target'
  | 'valid-source'
  | 'valid-target'
  | 'captured'
  | 'invalid'
  | null;

function territoryFillColor(
  territory: TerritoryDefinition,
  playerColor: string,
  viewMode: PlanetViewMode,
  active: boolean,
  kind: VisualKind,
) {
  let color: THREE.Color;
  if (viewMode === 'continents') {
    color = new THREE.Color(territory.displayColor).lerp(
      new THREE.Color(playerColor),
      0.16,
    );
  } else if (viewMode === 'terrain') {
    const landmassIndex = Number(territory.landmassId.split('-').at(-1) ?? 0);
    color = new THREE.Color(landmassIndex % 2 === 0 ? '#58714d' : '#6b7650')
      .lerp(new THREE.Color(territory.displayColor), 0.16)
      .offsetHSL(0, -0.12, 0);
  } else {
    color = new THREE.Color(playerColor).lerp(
      new THREE.Color(territory.displayColor),
      0.18,
    );
  }
  const numericId = Number(territory.id.slice('territory-'.length));
  color.offsetHSL(0, 0, ((numericId % 5) - 2) * 0.022);
  if (active) color.lerp(new THREE.Color('#ffffff'), 0.06);
  if (kind === 'invalid') color.multiplyScalar(0.52);
  if (kind === 'valid-source') color.lerp(new THREE.Color('#c8f2ff'), 0.18);
  if (kind === 'valid-target') color.lerp(new THREE.Color('#ffcc78'), 0.3);
  if (kind === 'captured') color.lerp(new THREE.Color('#ffffff'), 0.42);
  if (kind === 'source') color.lerp(new THREE.Color('#fff3a1'), 0.62);
  if (kind === 'target') color.lerp(new THREE.Color('#ff8c66'), 0.62);
  if (kind === 'hovered') color.lerp(new THREE.Color('#ffffff'), 0.32);
  return color;
}

export function Planet({ planet }: PlanetProps) {
  const match = useGameStore((state) => state.match);
  const hoveredId = useGameStore((state) => state.hoveredTerritoryId);
  const debugView = useGameStore((state) => state.debugView);
  const viewMode = useGameStore((state) => state.viewMode);
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
  const legal = useMemo(() => {
    let sources: string[] = [];
    let targets: string[] = [];
    if (match.phase === 'reinforce') {
      sources = getReinforcementTargets(match);
    } else if (match.phase === 'attack') {
      sources = getAttackSources(match);
      if (match.selectedSourceTerritoryId) {
        targets = getAttackTargets(
          planet,
          match,
          match.selectedSourceTerritoryId,
        );
      }
    } else if (match.phase === 'fortify') {
      sources = getReinforcementTargets(match).filter(
        (id) => match.territories[id]!.armyCount >= 2,
      );
      if (match.selectedSourceTerritoryId) {
        targets = getFortifyTargets(
          planet,
          match,
          match.selectedSourceTerritoryId,
        );
      }
    }
    const seaTargets = new Set(
      planet.connections
        .filter(
          (connection) =>
            connection.type === 'sea-route' &&
            match.selectedSourceTerritoryId !== null &&
            (connection.fromTerritoryId === match.selectedSourceTerritoryId ||
              connection.toTerritoryId === match.selectedSourceTerritoryId),
        )
        .map((connection) =>
          connection.fromTerritoryId === match.selectedSourceTerritoryId
            ? connection.toTerritoryId
            : connection.fromTerritoryId,
        )
        .filter((id) => targets.includes(id)),
    );
    return { sources: new Set(sources), targets: new Set(targets), seaTargets };
  }, [match, planet]);

  const visualKind = useCallback(
    (territoryId: string): VisualKind => {
      if (territoryId === match.selectedTargetTerritoryId) return 'target';
      if (territoryId === match.selectedSourceTerritoryId) return 'source';
      if (territoryId === hoveredId) return 'hovered';
      if (territoryId === match.recentlyCapturedTerritoryId) return 'captured';
      if (legal.targets.has(territoryId)) return 'valid-target';
      if (legal.sources.has(territoryId)) return 'valid-source';
      if (
        match.phase === 'reinforce' ||
        match.phase === 'attack' ||
        match.phase === 'fortify'
      ) {
        return 'invalid';
      }
      return null;
    },
    [
      hoveredId,
      legal,
      match.phase,
      match.recentlyCapturedTerritoryId,
      match.selectedSourceTerritoryId,
      match.selectedTargetTerritoryId,
    ],
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
      const ownerId = territory
        ? match.territories[territory.id]!.ownerId
        : null;
      const color = territory
        ? territoryFillColor(
            territory,
            playerById.get(ownerId!)!.color,
            viewMode,
            ownerId === match.activePlayerId,
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
  }, [
    match.activePlayerId,
    match.territories,
    planet,
    playerById,
    sphere,
    territoryById,
    viewMode,
  ]);

  useEffect(() => {
    const colorAttribute = landGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute;
    landCellIds.forEach((cellId, renderedFaceIndex) => {
      const territoryId = planet.surfaceCells[cellId]!.territoryId!;
      const territory = territoryById.get(territoryId)!;
      const ownerId = match.territories[territoryId]!.ownerId;
      const color = territoryFillColor(
        territory,
        playerById.get(ownerId)!.color,
        viewMode,
        ownerId === match.activePlayerId,
        visualKind(territoryId),
      );
      const vertexOffset = renderedFaceIndex * 3;
      for (let offset = 0; offset < 3; offset += 1) {
        colorAttribute.setXYZ(vertexOffset + offset, color.r, color.g, color.b);
      }
    });
    colorAttribute.needsUpdate = true;
  }, [
    landCellIds,
    landGeometry,
    match,
    planet,
    playerById,
    territoryById,
    viewMode,
    visualKind,
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
          color={viewMode === 'terrain' ? '#173b52' : OCEAN_COLOR}
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
        selectedTerritoryId={match.selectedSourceTerritoryId}
        debugView={debugView}
      />
      <ArmyMarkers
        planet={planet}
        match={match}
        validSourceIds={legal.sources}
        validTargetIds={legal.targets}
        seaTargetIds={legal.seaTargets}
      />
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
