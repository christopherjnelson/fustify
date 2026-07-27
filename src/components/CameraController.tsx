import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../state/useGameStore';
import { isVisualReview } from '../browser/visualReview';
import {
  cameraDirectionToGlobeFocus,
  PLANET_ROTATION,
} from '../presentation/globeOrientation';
import { useActionTracking } from './actionTrackingContext';

const PLANET_ROTATION_EULER = new THREE.Euler(...PLANET_ROTATION);

export function CameraController() {
  const visualReview = isVisualReview();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const destination = useRef(new THREE.Vector3(0, 0, 1));
  const focusing = useRef(false);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const planet = useGameStore((state) => state.planet);
  const focusTargetTerritoryId = useGameStore(
    (state) => state.focusTargetTerritoryId,
  );
  const focusSequence = useGameStore((state) => state.focusSequence);
  const cancelTerritoryFocus = useGameStore(
    (state) => state.cancelTerritoryFocus,
  );
  const setGlobeFocus = useGameStore((state) => state.setGlobeFocus);
  const { pauseFollowing } = useActionTracking();
  const interruptManualControl = useCallback(() => {
    pauseFollowing();
    focusing.current = false;
    cancelTerritoryFocus();
    if (controls.current) controls.current.enabled = !visualReview;
  }, [cancelTerritoryFocus, pauseFollowing, visualReview]);
  const publishFocus = useCallback(() => {
    setGlobeFocus(
      cameraDirectionToGlobeFocus(
        camera.position.clone().normalize().toArray(),
      ),
    );
  }, [camera, setGlobeFocus]);

  useEffect(() => {
    publishFocus();
  }, [publishFocus]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('pointerdown', interruptManualControl, true);
    canvas.addEventListener('wheel', interruptManualControl, {
      capture: true,
      passive: true,
    });
    return () => {
      canvas.removeEventListener('pointerdown', interruptManualControl, true);
      canvas.removeEventListener('wheel', interruptManualControl, true);
    };
  }, [gl, interruptManualControl]);

  useEffect(() => {
    if (!visualReview || !import.meta.env.DEV) return;
    const orient = (event: Event) => {
      const {
        longitude,
        latitude,
        distance = 5.2,
      } = (
        event as CustomEvent<{
          longitude: number;
          latitude: number;
          distance?: number;
        }>
      ).detail;
      const longitudeRadians = THREE.MathUtils.degToRad(longitude);
      const latitudeRadians = THREE.MathUtils.degToRad(latitude);
      const direction = new THREE.Vector3(
        Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
        Math.sin(latitudeRadians),
        Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
      ).applyEuler(PLANET_ROTATION_EULER);
      focusing.current = false;
      camera.position.copy(direction.normalize().multiplyScalar(distance));
      camera.lookAt(0, 0, 0);
      controls.current?.target.set(0, 0, 0);
      controls.current?.update();
      publishFocus();
    };
    window.addEventListener('fustify:orient-globe', orient);
    return () => window.removeEventListener('fustify:orient-globe', orient);
  }, [camera, publishFocus, visualReview]);

  useEffect(() => {
    if (focusTargetTerritoryId === null) {
      focusing.current = false;
      if (controls.current) controls.current.enabled = !visualReview;
      return;
    }
    const territory = planet.territories.find(
      (item) => item.id === focusTargetTerritoryId,
    );
    if (!territory) return;
    destination.current
      .set(...territory.center)
      .applyEuler(PLANET_ROTATION_EULER)
      .normalize();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const distance = THREE.MathUtils.clamp(camera.position.length(), 3.1, 8);
      camera.position.copy(
        destination.current.clone().multiplyScalar(distance),
      );
      camera.lookAt(0, 0, 0);
      controls.current?.target.set(0, 0, 0);
      controls.current?.update();
      publishFocus();
      focusing.current = false;
      if (controls.current) controls.current.enabled = !visualReview;
      return;
    }
    focusing.current = true;
    if (controls.current) controls.current.enabled = false;
  }, [
    camera,
    focusSequence,
    focusTargetTerritoryId,
    planet,
    publishFocus,
    visualReview,
  ]);

  useFrame(() => {
    if (!focusing.current) return;
    const distance = THREE.MathUtils.clamp(camera.position.length(), 3.1, 8);
    const direction = camera.position.clone().normalize();
    direction.lerp(destination.current, 0.085).normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    publishFocus();
    if (
      camera.position.clone().normalize().dot(destination.current) > 0.99996
    ) {
      focusing.current = false;
      if (controls.current) controls.current.enabled = !visualReview;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={visualReview ? 0 : 0.07}
      enabled={!visualReview}
      enablePan={false}
      minDistance={3.1}
      maxDistance={8}
      rotateSpeed={0.55}
      zoomSpeed={0.75}
      onStart={interruptManualControl}
      onChange={publishFocus}
    />
  );
}
