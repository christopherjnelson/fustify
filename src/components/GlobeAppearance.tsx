import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';

export const GLOBE_KEY_LIGHT_COLOR = '#ffe4a3';
export const GLOBE_KEY_LIGHT_INTENSITY = 2.1;
export const GLOBE_FILL_LIGHT_COLOR = '#526889';
export const GLOBE_FILL_LIGHT_INTENSITY = 0.58;

export const GLOBE_ATMOSPHERE_COLOR = '#d6ad45';
export const GLOBE_ATMOSPHERE_OPACITY = 0.09;
export const GLOBE_ATMOSPHERE_SCALE = 1.045;

export function GlobeLighting() {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight
        position={[4, 5, 6]}
        intensity={GLOBE_KEY_LIGHT_INTENSITY}
        color={GLOBE_KEY_LIGHT_COLOR}
      />
      <directionalLight
        position={[-4, -2, -3]}
        intensity={GLOBE_FILL_LIGHT_INTENSITY}
        color={GLOBE_FILL_LIGHT_COLOR}
      />
    </>
  );
}

export function GlobeAtmosphere() {
  return (
    <mesh scale={GLOBE_ATMOSPHERE_SCALE}>
      <sphereGeometry args={[PLANET_RADIUS, 48, 32]} />
      <meshBasicMaterial
        color={GLOBE_ATMOSPHERE_COLOR}
        transparent
        opacity={GLOBE_ATMOSPHERE_OPACITY}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
