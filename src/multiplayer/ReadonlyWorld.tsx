import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { getPlanetSurfaceSphere } from '../core/geometry/planetSurface';
import { OCEAN_COLOR, PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import { PLANET_ROTATION } from '../presentation/globeOrientation';
import { territoryFillColor } from '../presentation/territoryVisuals';
import { SeaRouteOverlay } from '../components/SeaRouteOverlay';
import { TerritoryOverlay } from '../components/TerritoryOverlay';
import { GlobeLabels } from '../components/GlobeLabels';

const NO_LEGAL_ROUTE_TARGETS = new Set<string>();

function ReadonlyPlanet({ planet }: { planet: PlanetDefinition }) {
  const sphere = useMemo(() => getPlanetSurfaceSphere(planet), [planet]);
  const territoryById = useMemo(
    () =>
      new Map(planet.territories.map((territory) => [territory.id, territory])),
    [planet.territories],
  );
  const { landGeometry, oceanGeometry } = useMemo(() => {
    const landPositions: number[] = [];
    const landColors: number[] = [];
    const oceanPositions: number[] = [];
    sphere.faces.forEach((face, cellId) => {
      const territoryId = planet.surfaceCells[cellId]!.territoryId;
      const territory = territoryId ? territoryById.get(territoryId)! : null;
      const positions = territory ? landPositions : oceanPositions;
      const color = territory
        ? territoryFillColor(territory, null, 'continents', false, null)
        : null;
      for (const vertexIndex of face) {
        const vertex = sphere.vertices[vertexIndex]!;
        positions.push(
          vertex[0] * PLANET_RADIUS,
          vertex[1] * PLANET_RADIUS,
          vertex[2] * PLANET_RADIUS,
        );
        if (color) landColors.push(color.r, color.g, color.b);
      }
    });
    const land = new THREE.BufferGeometry();
    land.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(landPositions, 3),
    );
    land.setAttribute('color', new THREE.Float32BufferAttribute(landColors, 3));
    land.computeVertexNormals();
    const ocean = new THREE.BufferGeometry();
    ocean.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(oceanPositions, 3),
    );
    ocean.computeVertexNormals();
    return { landGeometry: land, oceanGeometry: ocean };
  }, [planet.surfaceCells, sphere.faces, sphere.vertices, territoryById]);

  return (
    <group rotation={PLANET_ROTATION}>
      <mesh geometry={oceanGeometry}>
        <meshStandardMaterial
          color={OCEAN_COLOR}
          flatShading
          roughness={0.7}
          metalness={0.08}
        />
      </mesh>
      <mesh geometry={landGeometry}>
        <meshStandardMaterial
          vertexColors
          flatShading
          roughness={0.76}
          metalness={0.04}
        />
      </mesh>
      <TerritoryOverlay
        sphere={sphere}
        surfaceCells={planet.surfaceCells}
        territories={planet.territories}
        emphasized={false}
      />
      <SeaRouteOverlay
        planet={planet}
        selectedTerritoryId={null}
        legalTargetIds={NO_LEGAL_ROUTE_TARGETS}
        debugView={false}
        showNeutralPreviewRoutes
      />
      <GlobeLabels planet={planet} />
      <mesh scale={1.045}>
        <sphereGeometry args={[PLANET_RADIUS, 48, 32]} />
        <meshBasicMaterial
          color="#69b9df"
          transparent
          opacity={0.055}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function ReadonlyGlobe({ planet }: { planet: PlanetDefinition }) {
  return (
    <Canvas
      className="globe-canvas"
      camera={{ position: [0, 0, 5.2], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      aria-label="Read-only synchronized multiplayer globe"
    >
      <color attach="background" args={['#050914']} />
      <fog attach="fog" args={['#050914', 10, 26]} />
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 5, 6]} intensity={2.1} color="#e7f4ff" />
      <directionalLight
        position={[-4, -2, -3]}
        intensity={0.65}
        color="#4569b2"
      />
      <Stars radius={34} depth={14} count={900} factor={2} fade speed={0.25} />
      <ReadonlyPlanet planet={planet} />
      <OrbitControls
        enablePan={false}
        minDistance={3.1}
        maxDistance={8}
        rotateSpeed={0.55}
        zoomSpeed={0.75}
      />
    </Canvas>
  );
}

export { ReadonlyMinimap } from './ReadonlyMinimap';
