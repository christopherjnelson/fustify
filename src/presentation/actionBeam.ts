import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import {
  playerColorValue,
  type LocalPlayerConfig,
} from '../core/setup/playerConfig';
import type { Vector3Tuple } from '../core/types/territory';

export const ACTION_BEAM_LENGTH = 0.82;
export const ACTION_BEAM_BASE_RADIUS = PLANET_RADIUS * 1.035;

const HORIZON_FADE_START = -0.04;
const HORIZON_FADE_END = 0.14;
const LOCAL_UP = new THREE.Vector3(0, 1, 0);

export interface ActionBeamPlacement {
  base: Vector3Tuple;
  normal: Vector3Tuple;
  quaternion: readonly [number, number, number, number];
}

export interface ActionBeamAnimation {
  lengthScale: number;
  widthScale: number;
  intensity: number;
}

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function actionBeamPlacement(
  territoryCenter: Readonly<Vector3Tuple>,
): ActionBeamPlacement {
  const normal = new THREE.Vector3(...territoryCenter).normalize();
  const base = normal.clone().multiplyScalar(ACTION_BEAM_BASE_RADIUS);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    LOCAL_UP,
    normal,
  );
  return {
    base: base.toArray(),
    normal: normal.toArray(),
    quaternion: quaternion.toArray(),
  };
}

export function actionBeamHorizonVisibility(facing: number): number {
  return smoothstep(
    (facing - HORIZON_FADE_START) / (HORIZON_FADE_END - HORIZON_FADE_START),
  );
}

export function actionBeamAnimation(
  progress: number,
  reducedMotion: boolean,
): ActionBeamAnimation {
  if (reducedMotion) {
    return { lengthScale: 1, widthScale: 1, intensity: 1 };
  }

  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  const rise = smoothstep(clamped / 0.2);
  const fade = clamped < 0.65 ? 1 : 1 - smoothstep((clamped - 0.65) / 0.35);
  const pulse = Math.sin(clamped * Math.PI * 4);
  return {
    lengthScale: Math.max(0.02, rise),
    widthScale: 1 + pulse * 0.06,
    intensity: fade * (0.9 + pulse * 0.1),
  };
}

export function actionBeamPlayerColor(
  actingPlayerId: string | null,
  players: readonly LocalPlayerConfig[],
): string {
  const actingPlayer = players.find((player) => player.id === actingPlayerId);
  return actingPlayer ? playerColorValue(actingPlayer.colorId) : '#ffffff';
}

export function shouldShowActionBeam(
  actingPlayerId: string | null,
  ownMultiplayerPlayerId: string | null,
  players: readonly LocalPlayerConfig[],
): boolean {
  if (actingPlayerId === null) return true;
  if (ownMultiplayerPlayerId !== null) {
    return actingPlayerId !== ownMultiplayerPlayerId;
  }
  return (
    players.find((player) => player.id === actingPlayerId)?.controllerType !==
    'local-human'
  );
}
