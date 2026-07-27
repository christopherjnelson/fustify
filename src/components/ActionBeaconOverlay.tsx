import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import { ACTION_CUE_DURATION_MS } from '../presentation/actionTracking';
import { useActionTracking } from './actionTrackingContext';

const SOURCE_COLOR = '#fff3a1';
const TARGET_COLOR = '#ff8c66';
const REINFORCEMENT_COLOR = '#c8f2ff';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function beaconTexture(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, 128, 128);
  context.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  context.lineWidth = 5;
  context.beginPath();
  context.arc(64, 64, 50, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = 9;
  context.beginPath();
  context.arc(64, 64, 40, 0, Math.PI * 2);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBeacon(
  group: THREE.Group,
  center: readonly [number, number, number],
  color: string,
  scale: number,
) {
  const texture = beaconTexture(color);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 0.92,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(...center).multiplyScalar(PLANET_RADIUS * 1.075);
  sprite.scale.setScalar(scale);
  sprite.renderOrder = 9;
  sprite.userData.beaconBaseScale = scale;
  group.add(sprite);
  return { material, texture };
}

export function ActionBeaconOverlay({ planet }: { planet: PlanetDefinition }) {
  const { cue } = useActionTracking();
  const reducedMotion = usePrefersReducedMotion();
  const renderedGroup = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const resources = useMemo(() => {
    const group = new THREE.Group();
    const materials: THREE.SpriteMaterial[] = [];
    const textures: THREE.CanvasTexture[] = [];
    if (cue) {
      const target = planet.territories.find(
        (territory) => territory.id === cue.targetTerritoryId,
      );
      const source = cue.sourceTerritoryId
        ? planet.territories.find(
            (territory) => territory.id === cue.sourceTerritoryId,
          )
        : null;
      if (source && source.id !== target?.id) {
        const created = addBeacon(group, source.center, SOURCE_COLOR, 0.29);
        materials.push(created.material);
        textures.push(created.texture);
      }
      if (target) {
        const created = addBeacon(
          group,
          target.center,
          cue.kind === 'reinforcement' ? REINFORCEMENT_COLOR : TARGET_COLOR,
          0.34,
        );
        materials.push(created.material);
        textures.push(created.texture);
      }
    }
    return { group, materials, textures };
  }, [cue, planet]);

  useEffect(() => {
    startedAt.current = null;
  }, [cue?.sequence]);

  useFrame(({ clock }) => {
    const group = renderedGroup.current;
    if (!group) return;
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const elapsedSeconds = clock.elapsedTime - startedAt.current;
    const progress = Math.min(
      1,
      elapsedSeconds / (ACTION_CUE_DURATION_MS / 1_000),
    );
    const pulse = reducedMotion
      ? 0
      : (Math.sin(progress * Math.PI * 4) + 1) / 2;
    for (const child of group.children) {
      const sprite = child as THREE.Sprite;
      const baseScale = sprite.userData.beaconBaseScale as number;
      sprite.scale.setScalar(baseScale * (1 + pulse * 0.22));
    }
  });

  useEffect(
    () => () => {
      for (const material of resources.materials) material.dispose();
      for (const texture of resources.textures) texture.dispose();
    },
    [resources],
  );

  if (!cue) return null;
  return <primitive ref={renderedGroup} object={resources.group} />;
}
