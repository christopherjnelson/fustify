import * as THREE from 'three';
import {
  vectorToGeographicPoint,
  wrapLongitude,
} from '../core/minimap/projection';
import type { Vector3Tuple } from '../core/types/territory';

export const PLANET_ROTATION: Vector3Tuple = [0.08, 0, -0.08];

const inversePlanetRotation = new THREE.Quaternion()
  .setFromEuler(new THREE.Euler(...PLANET_ROTATION))
  .invert();

export function cameraDirectionToGlobeFocus(direction: Vector3Tuple) {
  const localDirection = new THREE.Vector3(...direction)
    .normalize()
    .applyQuaternion(inversePlanetRotation);
  const focus = vectorToGeographicPoint(localDirection.toArray());
  return { ...focus, longitude: wrapLongitude(focus.longitude) };
}
