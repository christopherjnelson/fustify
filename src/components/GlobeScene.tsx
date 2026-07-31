import { Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useGameStore } from '../state/useGameStore';
import { CameraController } from './CameraController';
import { GlobeLighting } from './GlobeAppearance';
import { Planet } from './Planet';
import { isVisualReview } from '../browser/visualReview';

export function GlobeScene() {
  const planet = useGameStore((state) => state.planet);
  const clearSelection = useGameStore((state) => state.selectTerritory);
  const visualReview = isVisualReview();
  const setupPhase = useGameStore((state) => state.matchSetup.setupPhase);
  const applicationMode = useGameStore((state) => state.applicationMode);
  const seaRouteCount = planet.connections.filter(
    (connection) => connection.type === 'sea-route',
  ).length;

  return (
    <>
      <span
        className="sr-only"
        data-testid="globe-neutral-sea-routes"
        data-visible={
          applicationMode === 'world-setup' && setupPhase === 'neutral-preview'
        }
        data-route-count={seaRouteCount}
        aria-hidden="true"
      />
      <Canvas
        className="globe-canvas"
        camera={{ position: [0, 0, 5.2], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => clearSelection(null)}
      >
        <color attach="background" args={['#050914']} />
        <fog attach="fog" args={['#050914', 10, 26]} />
        <GlobeLighting />
        {!visualReview && (
          <Stars
            radius={34}
            depth={14}
            count={900}
            factor={2}
            fade
            speed={0.25}
          />
        )}
        <Planet planet={planet} />
        <CameraController />
      </Canvas>
    </>
  );
}
