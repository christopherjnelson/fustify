import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PlanetDefinition } from '../core/types/planet';
import {
  getContinentLabelAnchors,
  globeLabelVisibility,
} from '../presentation/continentLabels';
import { placeContinentLabelSprite } from '../presentation/globeLabelSprite';

function labelTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const fontSize = name.length >= 24 ? 38 : name.length >= 18 ? 44 : 50;

  context.fillStyle = 'rgba(4, 10, 18, 0.54)';
  context.beginPath();
  context.roundRect(8, 18, 496, 92, 22);
  context.fill();
  context.font = `650 ${fontSize}px "Space Grotesk", Manrope, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 9;
  context.strokeStyle = 'rgba(2, 7, 13, 0.95)';
  context.strokeText(name, 256, 66, 456);
  context.fillStyle = '#f4fbff';
  context.fillText(name, 256, 66, 456);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export function ContinentGlobeLabels({ planet }: { planet: PlanetDefinition }) {
  const renderedGroup = useRef<THREE.Group>(null);
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
  const { group, materials, textures } = useMemo(() => {
    const labelGroup = new THREE.Group();
    const materialList: THREE.SpriteMaterial[] = [];
    const textureList: THREE.CanvasTexture[] = [];

    for (const anchor of getContinentLabelAnchors(planet)) {
      const texture = labelTexture(anchor.name);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(material);
      placeContinentLabelSprite(sprite, anchor);
      const width = THREE.MathUtils.clamp(
        anchor.name.length * 0.032,
        0.46,
        0.78,
      );
      sprite.scale.set(width, 0.17, 1);
      sprite.renderOrder = 6;
      labelGroup.add(sprite);
      materialList.push(material);
      textureList.push(texture);
    }

    return {
      group: labelGroup,
      materials: materialList,
      textures: textureList,
    };
  }, [planet]);

  useFrame(() => {
    const current = renderedGroup.current;
    if (!current) return;
    current.parent?.getWorldPosition(scratch.globeCenter);
    for (const child of current.children) {
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
      const opacity = globeLabelVisibility(
        scratch.normal.dot(scratch.cameraDirection),
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

  return <primitive ref={renderedGroup} object={group} />;
}
