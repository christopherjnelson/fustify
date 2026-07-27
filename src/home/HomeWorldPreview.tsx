import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { NeutralPlanet } from '../components/NeutralPlanet';
import type { PlanetDefinition } from '../core/types/planet';
import {
  beginHomeWorldRequest,
  failHomeWorldRequest,
  initialHomeWorldPreviewState,
  resolveHomeWorldResponse,
  shouldAdvanceHomeWorldReveal,
} from './homeWorldPreviewState';
import type {
  GenerateHomeWorldRequest,
  GenerateHomeWorldResponse,
} from './homeWorldWorkerProtocol';
import {
  HOME_WORLD_CONTINENT_COUNT,
  HOME_WORLD_TERRITORY_COUNT,
} from './homeWorldWorkerProtocol';

const REVEAL_RADIANS = THREE.MathUtils.degToRad(60);
const REVEAL_SECONDS = 12;

function fixedVisualReviewSeed(): string | undefined {
  return import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('visual-review') === 'home'
    ? 'visual-review-atlas'
    : undefined;
}

function displayWorldName(seed: string): string {
  return seed
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function usePreviewActivity(container: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(!document.hidden);
  const [intersecting, setIntersecting] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) =>
      setIntersecting(entry?.isIntersecting ?? false),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return { active: visible && intersecting, reducedMotion };
}

function RevealPlanet({
  planet,
  active,
  reducedMotion,
}: {
  planet: PlanetDefinition;
  active: boolean;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const elapsed = useRef(reducedMotion ? REVEAL_SECONDS : 0);
  const interacted = useRef(false);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (active && !reducedMotion && !interacted.current) invalidate();
  }, [active, invalidate, reducedMotion]);

  useFrame((_, delta) => {
    if (
      !shouldAdvanceHomeWorldReveal({
        active,
        reducedMotion,
        interacted: interacted.current,
        elapsedSeconds: elapsed.current,
        durationSeconds: REVEAL_SECONDS,
      }) ||
      !group.current
    ) {
      return;
    }
    const remaining = REVEAL_SECONDS - elapsed.current;
    const appliedDelta = Math.min(delta, remaining);
    group.current.rotation.y +=
      (REVEAL_RADIANS / REVEAL_SECONDS) * appliedDelta;
    elapsed.current += appliedDelta;
    if (elapsed.current < REVEAL_SECONDS) invalidate();
  });

  return (
    <>
      <group ref={group}>
        <NeutralPlanet planet={planet} />
      </group>
      <OrbitControls
        makeDefault
        enabled={active}
        enableDamping={false}
        enablePan={false}
        enableZoom={false}
        rotateSpeed={0.48}
        onStart={() => {
          interacted.current = true;
        }}
        onChange={() => invalidate()}
      />
    </>
  );
}

class PreviewCanvasBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Homepage globe preview render failed.', error);
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function PreviewCanvas({
  planet,
  active,
  reducedMotion,
  onFailure,
}: {
  planet: PlanetDefinition;
  active: boolean;
  reducedMotion: boolean;
  onFailure: () => void;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas) return;
    const contextLost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    return () => canvas.removeEventListener('webglcontextlost', contextLost);
  }, [canvas, onFailure]);

  return (
    <PreviewCanvasBoundary onFailure={onFailure}>
      <Canvas
        className="home-world-canvas"
        camera={{ position: [0, 0, 5.35], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        fallback={<span>WebGL unavailable.</span>}
        onCreated={({ gl }) => setCanvas(gl.domElement)}
      >
        <ambientLight intensity={0.72} />
        <directionalLight
          position={[4, 5, 6]}
          intensity={2.1}
          color="#e7f4ff"
        />
        <directionalLight
          position={[-4, -2, -3]}
          intensity={0.65}
          color="#4569b2"
        />
        <RevealPlanet
          key={planet.seed}
          planet={planet}
          active={active}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </PreviewCanvasBoundary>
  );
}

export function HomeWorldPreview() {
  const container = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const requestSequence = useRef(0);
  const [state, setState] = useState(initialHomeWorldPreviewState);
  const [canvasFailure, setCanvasFailure] = useState(false);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const { active, reducedMotion } = usePreviewActivity(container);
  const visualSeed = fixedVisualReviewSeed();

  const ensureWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const instance = new Worker(
      new URL('./homeWorld.worker.ts', import.meta.url),
      { type: 'module', name: 'fustify-home-world' },
    );
    instance.onmessage = (event: MessageEvent<GenerateHomeWorldResponse>) => {
      setState((current) => resolveHomeWorldResponse(current, event.data));
    };
    instance.onerror = () => {
      const requestId = requestSequence.current;
      setState((current) => failHomeWorldRequest(current, requestId));
    };
    worker.current = instance;
    return instance;
  }, []);

  const generate = useCallback(() => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setState((current) => beginHomeWorldRequest(current, requestId));
    const request: GenerateHomeWorldRequest = {
      type: 'generate-home-world',
      requestId,
      seed: visualSeed,
    };
    try {
      ensureWorker().postMessage(request);
    } catch {
      setState((current) => failHomeWorldRequest(current, requestId));
    }
  }, [ensureWorker, visualSeed]);

  useEffect(() => {
    generate();
    return () => {
      requestSequence.current += 1;
      worker.current?.terminate();
      worker.current = null;
    };
  }, [generate]);

  const renderingFailed = useCallback(() => setCanvasFailure(true), []);
  const retry = () => {
    if (canvasFailure && state.planet) {
      setCanvasFailure(false);
      setCanvasAttempt((attempt) => attempt + 1);
      return;
    }
    worker.current?.terminate();
    worker.current = null;
    generate();
  };
  const busy = state.phase === 'generating';
  const failed = state.phase === 'error' || canvasFailure;

  return (
    <div
      ref={container}
      className="home-world-loaded"
      data-seed={state.planet?.seed}
      data-territories={state.planet?.territoryCount}
      data-continents={state.planet?.continentCount}
    >
      <div className="home-world-stage">
        {state.planet && !canvasFailure && (
          <PreviewCanvas
            key={canvasAttempt}
            planet={state.planet}
            active={active}
            reducedMotion={reducedMotion}
            onFailure={renderingFailed}
          />
        )}
        {busy && (
          <div className="home-world-loading home-world-loading-overlay">
            <span className="home-world-spinner" aria-hidden="true" />
            <strong>{state.planet ? 'Generating…' : 'Forging world…'}</strong>
          </div>
        )}
        {failed && (
          <div className="home-world-error">
            <strong>Globe preview unavailable</strong>
            <span>
              {canvasFailure
                ? 'WebGL could not display the generated world.'
                : state.message}
            </span>
            <button type="button" onClick={retry}>
              Retry Globe Preview
            </button>
          </div>
        )}
      </div>

      <div className="home-world-toolbar">
        <div>
          <span className="eyebrow">Live world preview</span>
          <strong>
            {state.planet
              ? displayWorldName(state.planet.seed)
              : 'Procedural world'}
          </strong>
          <span>
            {HOME_WORLD_TERRITORY_COUNT} territories ·{' '}
            {HOME_WORLD_CONTINENT_COUNT} continents
          </span>
        </div>
        <button
          type="button"
          disabled={busy || failed}
          aria-busy={busy}
          onClick={generate}
        >
          {busy ? 'Generating…' : 'Generate New World'}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {state.message}
      </p>
    </div>
  );
}
