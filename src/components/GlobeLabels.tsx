import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PlanetDefinition } from '../core/types/planet';
import {
  getContinentLabelAnchors,
  globeLabelVisibility,
} from '../presentation/continentLabels';
import {
  getTerritoryLabelAnchors,
  globeLabelMode,
  type GlobeLabelMode,
} from '../presentation/globeLabels';
import {
  placeContinentLabelSprite,
  placeTerritoryLabelSprite,
} from '../presentation/globeLabelSprite';

type LabelKind = 'continent' | 'territory';

function labelTexture(name: string, kind: LabelKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const fontSize =
    kind === 'territory'
      ? name.length >= 12
        ? 42
        : 48
      : name.length >= 24
        ? 38
        : name.length >= 18
          ? 44
          : 50;

  context.fillStyle =
    kind === 'territory' ? 'rgba(4, 10, 18, 0.82)' : 'rgba(4, 10, 18, 0.54)';
  context.beginPath();
  context.roundRect(8, 18, 496, 92, 22);
  context.fill();
  context.font = `650 ${fontSize}px "Space Grotesk", Manrope, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = kind === 'territory' ? 7 : 9;
  context.strokeStyle = 'rgba(2, 7, 13, 0.95)';
  context.strokeText(name, 256, 66, 456);
  context.fillStyle = '#f4fbff';
  context.fillText(name, 256, 66, 456);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function createLabelSprite(
  name: string,
  kind: LabelKind,
): {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
} {
  const texture = labelTexture(name, kind);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  const width =
    kind === 'territory'
      ? THREE.MathUtils.clamp(name.length * 0.024, 0.2, 0.42)
      : THREE.MathUtils.clamp(name.length * 0.032, 0.46, 0.78);
  sprite.scale.set(width, kind === 'territory' ? 0.11 : 0.17, 1);
  sprite.renderOrder = 6;
  return { sprite, material, texture };
}

export function GlobeLabels({ planet }: { planet: PlanetDefinition }) {
  const continentGroupRef = useRef<THREE.Group>(null);
  const territoryGroupRef = useRef<THREE.Group>(null);
  const territoryLabelsReady = useRef(false);
  const territoryResources = useRef<{
    materials: THREE.SpriteMaterial[];
    textures: THREE.CanvasTexture[];
  }>({ materials: [], textures: [] });
  const activeMode = useRef<GlobeLabelMode | null>(null);
  const camera = useThree((state) => state.camera);
  const scratch = useMemo(
    () => ({
      globeCenter: new THREE.Vector3(),
      labelPosition: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
    }),
    [],
  );
  const { continentGroup, materials, textures } = useMemo(() => {
    const nextContinentGroup = new THREE.Group();
    const materialList: THREE.SpriteMaterial[] = [];
    const textureList: THREE.CanvasTexture[] = [];

    for (const anchor of getContinentLabelAnchors(planet)) {
      const { sprite, material, texture } = createLabelSprite(
        anchor.name,
        'continent',
      );
      placeContinentLabelSprite(sprite, anchor);
      nextContinentGroup.add(sprite);
      materialList.push(material);
      textureList.push(texture);
    }

    return {
      continentGroup: nextContinentGroup,
      materials: materialList,
      textures: textureList,
    };
  }, [planet]);
  const territoryGroup = useMemo(() => new THREE.Group(), []);

  useFrame(() => {
    const mode = globeLabelMode(camera.position.length());
    if (mode === 'territories' && !territoryLabelsReady.current) {
      const group = territoryGroupRef.current;
      if (!group) return;
      for (const anchor of getTerritoryLabelAnchors(planet)) {
        const { sprite, material, texture } = createLabelSprite(
          anchor.name,
          'territory',
        );
        placeTerritoryLabelSprite(sprite, anchor);
        group.add(sprite);
        territoryResources.current.materials.push(material);
        territoryResources.current.textures.push(texture);
      }
      territoryLabelsReady.current = true;
    }
    const visibleGroup =
      mode === 'continents'
        ? continentGroupRef.current
        : territoryGroupRef.current;
    const hiddenGroup =
      mode === 'continents'
        ? territoryGroupRef.current
        : continentGroupRef.current;
    if (!visibleGroup || !hiddenGroup) return;

    visibleGroup.visible = true;
    hiddenGroup.visible = false;
    if (activeMode.current !== mode) {
      activeMode.current = mode;
      if (import.meta.env.DEV) {
        window.dispatchEvent(
          new CustomEvent('fustify:globe-label-mode', {
            detail: {
              mode,
              visibleLabelCount: visibleGroup.children.length,
            },
          }),
        );
      }
    }

    visibleGroup.parent?.getWorldPosition(scratch.globeCenter);
    for (const child of visibleGroup.children) {
      const sprite = child as THREE.Sprite;
      sprite.getWorldPosition(scratch.labelPosition);
      scratch.normal
        .copy(scratch.labelPosition)
        .sub(scratch.globeCenter)
        .normalize();
      scratch.cameraDirection
        .copy(camera.position)
        .sub(scratch.labelPosition)
        .normalize();
      const facing = scratch.normal.dot(scratch.cameraDirection);
      // The screen-space lift above army markers gives territory labels a
      // larger silhouette footprint, so fade them before they reach the rim.
      const opacity = globeLabelVisibility(
        mode === 'territories' ? facing - 0.5 : facing,
      );
      sprite.visible = opacity > 0.01;
      sprite.material.opacity = opacity;
    }
  });

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
    [materials, textures],
  );
  useEffect(() => {
    activeMode.current = null;
    territoryLabelsReady.current = false;
    territoryGroupRef.current?.clear();
    return () => {
      for (const material of territoryResources.current.materials) {
        material.dispose();
      }
      for (const texture of territoryResources.current.textures) {
        texture.dispose();
      }
      territoryResources.current = { materials: [], textures: [] };
    };
  }, [planet]);

  return (
    <>
      <primitive ref={continentGroupRef} object={continentGroup} />
      <primitive ref={territoryGroupRef} object={territoryGroup} />
    </>
  );
}
