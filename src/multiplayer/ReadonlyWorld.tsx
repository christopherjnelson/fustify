import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { createIcosphere } from '../core/geometry/icosphere';
import {
  getProjectedWorldGeometry,
  type ProjectedPoint,
} from '../core/minimap/projection';
import {
  OCEAN_COLOR,
  PLANET_RADIUS,
  PLANET_SUBDIVISIONS,
} from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import { PLANET_ROTATION } from '../presentation/globeOrientation';
import { territoryFillColor } from '../presentation/territoryVisuals';
import { SeaRouteOverlay } from '../components/SeaRouteOverlay';
import { TerritoryOverlay } from '../components/TerritoryOverlay';
import { ContinentGlobeLabels } from '../components/ContinentGlobeLabels';
import { MinimapContinentLabels } from '../components/MinimapContinentLabels';

const NO_LEGAL_ROUTE_TARGETS = new Set<string>();

function format(value: number): number {
  return Number(value.toFixed(3));
}

function polygonPath(fragments: readonly { points: ProjectedPoint[] }[]) {
  return fragments
    .map(
      ({ points }) =>
        `M ${points.map(({ x, y }) => `${format(x)} ${format(y)}`).join(' L ')} Z`,
    )
    .join(' ');
}

function linePath(fragments: readonly ProjectedPoint[][]) {
  return fragments
    .map(
      (points) =>
        `M ${points.map(({ x, y }) => `${format(x)} ${format(y)}`).join(' L ')}`,
    )
    .join(' ');
}

function ReadonlyPlanet({ planet }: { planet: PlanetDefinition }) {
  const sphere = useMemo(() => createIcosphere(PLANET_SUBDIVISIONS), []);
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
      <ContinentGlobeLabels planet={planet} />
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

export function ReadonlyMinimap({
  planet,
  className = '',
}: {
  planet: PlanetDefinition;
  className?: string;
}) {
  const geometry = useMemo(() => getProjectedWorldGeometry(planet), [planet]);
  const territoryById = useMemo(
    () =>
      new Map(planet.territories.map((territory) => [territory.id, territory])),
    [planet.territories],
  );
  const boundaryPath = (kind: 'territory' | 'continent' | 'coastline') =>
    linePath(
      geometry.boundaries
        .filter((boundary) => boundary.kind === kind)
        .map((boundary) => boundary.points),
    );
  return (
    <section
      className={`minimap-panel multiplayer-minimap ${className}`.trim()}
      aria-labelledby="multiplayer-minimap-title"
      data-testid="multiplayer-minimap"
    >
      <header className="minimap-heading">
        <div>
          <span className="eyebrow">Synchronized overview</span>
          <strong id="multiplayer-minimap-title">World minimap</strong>
        </div>
        <span className="minimap-readonly">Read-only</span>
      </header>
      <svg
        className="minimap-map"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <rect className="minimap-ocean" width="360" height="180" rx="3" />
        <g className="minimap-territories">
          {geometry.territories.map((territory) => (
            <path
              key={territory.territoryId}
              d={polygonPath(territory.fragments)}
              fill={territoryById.get(territory.territoryId)!.displayColor}
              stroke={territoryById.get(territory.territoryId)!.displayColor}
              data-territory-id={territory.territoryId}
            />
          ))}
        </g>
        <g className="minimap-routes">
          {geometry.routes.map((route) => (
            <path key={route.routeId} d={linePath(route.fragments)} />
          ))}
        </g>
        <path className="minimap-boundaries" d={boundaryPath('territory')} />
        <path
          className="minimap-continent-boundaries"
          d={boundaryPath('continent')}
        />
        <path className="minimap-coastlines" d={boundaryPath('coastline')} />
        <MinimapContinentLabels planet={planet} />
      </svg>
    </section>
  );
}
