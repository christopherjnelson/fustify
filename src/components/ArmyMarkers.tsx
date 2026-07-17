import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';

interface ArmyMarkersProps {
  planet: PlanetDefinition;
  selectedTerritoryId: string | null;
}

function markerTexture(color: string, count: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.beginPath();
  context.arc(64, 64, 49, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 9;
  context.strokeStyle = 'rgba(4, 10, 18, 0.92)';
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '700 58px Manrope, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(count), 64, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One Three.js group with cached owner/count materials; no per-marker React tree. */
export function ArmyMarkers({ planet, selectedTerritoryId }: ArmyMarkersProps) {
  const renderedGroup = useRef<THREE.Group>(null);
  const { group, materials, textures } = useMemo(() => {
    const markerGroup = new THREE.Group();
    const materialCache = new Map<string, THREE.SpriteMaterial>();
    const textureCache = new Map<string, THREE.CanvasTexture>();
    const players = new Map(
      planet.players.map((player) => [player.id, player]),
    );
    for (const territory of planet.territories) {
      const player = players.get(territory.ownerId!)!;
      const key = `${player.id}:${territory.armyCount}`;
      let material = materialCache.get(key);
      if (!material) {
        const texture = markerTexture(player.color, territory.armyCount);
        textureCache.set(key, texture);
        material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          sizeAttenuation: true,
        });
        materialCache.set(key, material);
      }
      const sprite = new THREE.Sprite(material);
      sprite.position
        .set(...territory.center)
        .multiplyScalar(PLANET_RADIUS * 1.045);
      sprite.scale.setScalar(0.18);
      sprite.renderOrder = 5;
      sprite.userData.territoryId = territory.id;
      markerGroup.add(sprite);
    }
    return {
      group: markerGroup,
      materials: [...materialCache.values()],
      textures: [...textureCache.values()],
    };
  }, [planet]);
  useEffect(() => {
    for (const child of renderedGroup.current?.children ?? []) {
      const selected = child.userData.territoryId === selectedTerritoryId;
      child.scale.setScalar(selected ? 0.26 : 0.18);
      child.renderOrder = selected ? 7 : 5;
    }
  }, [group, selectedTerritoryId]);

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
    [materials, textures],
  );

  return <primitive ref={renderedGroup} object={group} />;
}
