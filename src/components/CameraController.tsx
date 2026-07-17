import { OrbitControls } from '@react-three/drei';

export function CameraController() {
  return (
    <OrbitControls
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
