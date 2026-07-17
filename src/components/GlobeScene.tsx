import { Stars } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useGameStore } from '../state/useGameStore';
import { CameraController } from './CameraController';
import { Planet } from './Planet';
import { isVisualReview } from '../browser/visualReview';

export function GlobeScene() {
  const planet = useGameStore((state) => state.planet);
  const clearSelection = useGameStore((state) => state.selectTerritory);
  const visualReview = isVisualReview();

  return (
    <Canvas
      className="globe-canvas"
      camera={{ position: [0, 0, 5.2], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => clearSelection(null)}
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
  );
}
