import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MatchState } from '../core/game';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';

interface ArmyMarkersProps {
  planet: PlanetDefinition;
  match: MatchState;
  validSourceIds: ReadonlySet<string>;
  validTargetIds: ReadonlySet<string>;
  seaTargetIds: ReadonlySet<string>;
}

type MarkerKind =
  'source' | 'target' | 'valid-source' | 'valid-target' | 'normal';

function markerTexture(
  color: string,
  count: number,
  kind: MarkerKind,
  seaTarget: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.beginPath();
  context.arc(64, 64, 49, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = kind === 'source' || kind === 'target' ? 12 : 8;
  context.strokeStyle =
    kind === 'source'
      ? '#fff1a0'
      : kind === 'target'
        ? '#ff9b72'
        : kind === 'valid-source'
          ? '#bfeeff'
          : kind === 'valid-target'
            ? '#ffd08a'
            : 'rgba(4, 10, 18, 0.92)';
  if (kind === 'valid-source' || kind === 'valid-target') {
    context.setLineDash([9, 7]);
  }
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#ffffff';
  context.font = '700 58px Manrope, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(count), 64, 67);
  if (seaTarget) {
    context.fillStyle = '#d9f7ff';
    context.font = '700 22px sans-serif';
    context.fillText('≈', 96, 28);
  } else if (kind === 'source') {
    context.fillStyle = '#fff1a0';
    context.font = '700 18px sans-serif';
    context.fillText('◆', 96, 28);
  } else if (kind === 'target') {
    context.fillStyle = '#fff';
    context.font = '700 22px sans-serif';
    context.fillText('×', 96, 28);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function markerKind(
  territoryId: string,
  match: MatchState,
  validSourceIds: ReadonlySet<string>,
  validTargetIds: ReadonlySet<string>,
): MarkerKind {
  if (territoryId === match.selectedSourceTerritoryId) return 'source';
  if (territoryId === match.selectedTargetTerritoryId) return 'target';
  if (validTargetIds.has(territoryId)) return 'valid-target';
  if (validSourceIds.has(territoryId)) return 'valid-source';
  return 'normal';
}

function baseScale(kind: MarkerKind, seaTarget: boolean): number {
  if (kind === 'source') return 0.27;
  if (kind === 'target') return 0.26;
  if (seaTarget) return 0.24;
  if (kind === 'valid-target') return 0.22;
  if (kind === 'valid-source') return 0.19;
  return 0.17;
}

/** Renderer-local horizon fading avoids per-frame React or Zustand updates. */
export function ArmyMarkers({
  planet,
  match,
  validSourceIds,
  validTargetIds,
  seaTargetIds,
}: ArmyMarkersProps) {
  const renderedGroup = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const scratch = useMemo(
    () => ({
      globeCenter: new THREE.Vector3(),
      markerPosition: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
    }),
    [],
  );
  const { group, materials, textures } = useMemo(() => {
    const markerGroup = new THREE.Group();
    const materialList: THREE.SpriteMaterial[] = [];
    const textureList: THREE.CanvasTexture[] = [];
    const players = new Map(
      planet.players.map((player) => [player.id, player]),
    );
    for (const territory of planet.territories) {
      const territoryState = match.territories[territory.id]!;
      const player = players.get(territoryState.ownerId)!;
      const kind = markerKind(
        territory.id,
        match,
        validSourceIds,
        validTargetIds,
      );
      const seaTarget = seaTargetIds.has(territory.id);
      const texture = markerTexture(
        player.color,
        territoryState.armyCount,
        kind,
        seaTarget,
      );
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position
        .set(...territory.center)
        .multiplyScalar(PLANET_RADIUS * 1.045);
      const scale = baseScale(kind, seaTarget);
      sprite.scale.setScalar(scale);
      sprite.renderOrder = kind === 'source' || kind === 'target' ? 7 : 5;
      sprite.userData.baseScale = scale;
      markerGroup.add(sprite);
      materialList.push(material);
      textureList.push(texture);
    }
    return {
      group: markerGroup,
      materials: materialList,
      textures: textureList,
    };
  }, [match, planet, seaTargetIds, validSourceIds, validTargetIds]);

  useFrame(() => {
    const current = renderedGroup.current;
    if (!current) return;
    current.parent?.getWorldPosition(scratch.globeCenter);
    for (const child of current.children) {
      const sprite = child as THREE.Sprite;
      sprite.getWorldPosition(scratch.markerPosition);
      scratch.normal
        .copy(scratch.markerPosition)
        .sub(scratch.globeCenter)
        .normalize();
      scratch.cameraDirection
        .copy(camera.position)
        .sub(scratch.markerPosition)
        .normalize();
      const facing = scratch.normal.dot(scratch.cameraDirection);
      const visibility = THREE.MathUtils.smoothstep(facing, -0.08, 0.18);
      sprite.visible = visibility > 0.015;
      sprite.material.opacity = visibility;
      const base = sprite.userData.baseScale as number;
      sprite.scale.setScalar(base * (0.55 + visibility * 0.45));
    }
  });

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
    [materials, textures],
  );

  return <primitive ref={renderedGroup} object={group} />;
}
