import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlanetDefinition } from '../core/types/planet';
import {
  ACTION_BEAM_LENGTH,
  actionBeamAnimation,
  actionBeamHorizonVisibility,
  actionBeamPlacement,
  actionBeamPlayerColor,
  shouldShowActionBeam,
} from '../presentation/actionBeam';
import { ACTION_CUE_DURATION_MS } from '../presentation/actionTracking';
import { useGameStore } from '../state/useGameStore';
import { useActionTracking } from './actionTrackingContext';

const OUTER_BASE_OPACITY = 0.3;
const CORE_BASE_OPACITY = 0.78;
const GLOW_BASE_OPACITY = 0.5;

interface BeamResources {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

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

function disableRaycast(object: THREE.Object3D) {
  object.raycast = () => undefined;
  object.userData.decorative = true;
  object.userData.interactive = false;
}

function createBeam(
  territoryCenter: readonly [number, number, number],
  color: string,
): BeamResources {
  const group = new THREE.Group();
  const placement = actionBeamPlacement(territoryCenter);
  group.name = 'action-beam';
  group.position.set(...placement.base);
  group.quaternion.set(...placement.quaternion);
  group.renderOrder = 4;
  group.userData.normal = placement.normal;
  disableRaycast(group);

  const outerGeometry = new THREE.CylinderGeometry(
    0.018,
    0.055,
    ACTION_BEAM_LENGTH,
    8,
    1,
    true,
  );
  const coreGeometry = new THREE.CylinderGeometry(
    0.008,
    0.017,
    ACTION_BEAM_LENGTH * 1.04,
    8,
    1,
    false,
  );
  const glowGeometry = new THREE.SphereGeometry(0.09, 16, 8);

  const outerMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: OUTER_BASE_OPACITY,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.48),
    transparent: true,
    opacity: CORE_BASE_OPACITY,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: GLOW_BASE_OPACITY,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const outer = new THREE.Mesh(outerGeometry, outerMaterial);
  outer.name = 'action-beam-outer';
  outer.position.y = ACTION_BEAM_LENGTH / 2;
  outer.renderOrder = 4;
  disableRaycast(outer);

  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.name = 'action-beam-core';
  core.position.y = (ACTION_BEAM_LENGTH * 1.04) / 2;
  core.renderOrder = 4;
  disableRaycast(core);

  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = 'action-beam-base-glow';
  glow.position.y = 0.015;
  glow.scale.y = 0.22;
  glow.renderOrder = 4;
  disableRaycast(glow);

  group.add(outer, core, glow);
  return {
    group,
    geometries: [outerGeometry, coreGeometry, glowGeometry],
    materials: [outerMaterial, coreMaterial, glowMaterial],
  };
}

function emptyBeamResources(): BeamResources {
  return {
    group: new THREE.Group(),
    geometries: [],
    materials: [],
  };
}

export function ActionBeaconOverlay({ planet }: { planet: PlanetDefinition }) {
  const { cue } = useActionTracking();
  const configuredPlayers = useGameStore((state) => state.matchSetup.players);
  const ownMultiplayerPlayerId = useGameStore(
    (state) => state.multiplayerSession?.ownPlayerId ?? null,
  );
  const reducedMotion = usePrefersReducedMotion();
  const renderedGroup = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const camera = useThree((state) => state.camera);
  const scratch = useMemo(
    () => ({
      globeCenter: new THREE.Vector3(),
      beamBase: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
    }),
    [],
  );
  const resources = useMemo(() => {
    if (!cue) return emptyBeamResources();
    if (
      !shouldShowActionBeam(
        cue.actingPlayerId,
        ownMultiplayerPlayerId,
        configuredPlayers,
      )
    ) {
      return emptyBeamResources();
    }
    const target = planet.territories.find(
      (territory) => territory.id === cue.targetTerritoryId,
    );
    if (!target) return emptyBeamResources();
    return createBeam(
      target.center,
      actionBeamPlayerColor(cue.actingPlayerId, configuredPlayers),
    );
  }, [configuredPlayers, cue, ownMultiplayerPlayerId, planet]);

  useEffect(() => {
    if (!import.meta.env.DEV || !cue) return;
    window.dispatchEvent(
      new CustomEvent('fustify:action-beam', {
        detail: {
          actingPlayerId: cue.actingPlayerId,
          sequence: cue.sequence,
          visible: resources.group.children.length > 0,
        },
      }),
    );
  }, [cue, resources]);

  useEffect(() => {
    startedAt.current = null;
  }, [cue?.sequence]);

  useFrame(({ clock }) => {
    const group = renderedGroup.current;
    if (!group || group.children.length === 0) return;
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const elapsedSeconds = clock.elapsedTime - startedAt.current;
    const progress = Math.min(
      1,
      elapsedSeconds / (ACTION_CUE_DURATION_MS / 1_000),
    );
    const animation = actionBeamAnimation(progress, reducedMotion);

    group.parent?.getWorldPosition(scratch.globeCenter);
    group.getWorldPosition(scratch.beamBase);
    scratch.normal.copy(scratch.beamBase).sub(scratch.globeCenter).normalize();
    scratch.cameraDirection
      .copy(camera.position)
      .sub(scratch.beamBase)
      .normalize();
    const horizonVisibility = actionBeamHorizonVisibility(
      scratch.normal.dot(scratch.cameraDirection),
    );
    const intensity = animation.intensity * horizonVisibility;
    group.visible = intensity > 0.01;
    group.scale.set(
      animation.widthScale,
      animation.lengthScale,
      animation.widthScale,
    );
    const outer = group.getObjectByName('action-beam-outer') as
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    const core = group.getObjectByName('action-beam-core') as
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    const glow = group.getObjectByName('action-beam-base-glow') as
      THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (outer) outer.material.opacity = OUTER_BASE_OPACITY * intensity;
    if (core) core.material.opacity = CORE_BASE_OPACITY * intensity;
    if (glow) glow.material.opacity = GLOW_BASE_OPACITY * intensity;
  });

  useEffect(
    () => () => {
      for (const geometry of resources.geometries) geometry.dispose();
      for (const material of resources.materials) material.dispose();
    },
    [resources],
  );

  if (!cue) return null;
  return <primitive ref={renderedGroup} object={resources.group} />;
}
