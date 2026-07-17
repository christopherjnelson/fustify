import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../state/useGameStore';

const PLANET_ROTATION = new THREE.Euler(0.08, 0, -0.08);

export function CameraController() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const destination = useRef(new THREE.Vector3(0, 0, 1));
  const focusing = useRef(false);
  const camera = useThree((state) => state.camera);
  const planet = useGameStore((state) => state.planet);
  const focusTargetTerritoryId = useGameStore(
    (state) => state.focusTargetTerritoryId,
  );
  const focusSequence = useGameStore((state) => state.focusSequence);

  useEffect(() => {
    if (focusTargetTerritoryId === null) {
      focusing.current = false;
      if (controls.current) controls.current.enabled = true;
      return;
    }
    const territory = planet.territories.find(
      (item) => item.id === focusTargetTerritoryId,
    );
    if (!territory) return;
    destination.current
      .set(...territory.center)
      .applyEuler(PLANET_ROTATION)
      .normalize();
    focusing.current = true;
    if (controls.current) controls.current.enabled = false;
  }, [focusSequence, focusTargetTerritoryId, planet]);

  useFrame(() => {
    if (!focusing.current) return;
    const distance = THREE.MathUtils.clamp(camera.position.length(), 3.1, 8);
    const direction = camera.position.clone().normalize();
    direction.lerp(destination.current, 0.085).normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    if (
      camera.position.clone().normalize().dot(destination.current) > 0.99996
    ) {
      focusing.current = false;
      if (controls.current) controls.current.enabled = true;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      enablePan={false}
      minDistance={3.1}
      maxDistance={8}
      rotateSpeed={0.55}
      zoomSpeed={0.75}
    />
  );
}
