import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { browserRequiresManualHomePreviewLoad } from './homePreviewPolicy';

const LazyHomeWorldPreview = lazy(async () => {
  const module = await import('./HomeWorldPreview');
  return { default: module.HomeWorldPreview };
});

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

function ForgingWorldStatus() {
  return (
    <div className="home-world-loading" role="status" aria-live="polite">
      <span className="home-world-spinner" aria-hidden="true" />
      <strong>Forging world…</strong>
      <span>Preparing the procedural globe</span>
    </div>
  );
}

export function HomeWorldPreviewSlot() {
  const frame = useRef<HTMLDivElement>(null);
  const [manualLoad, setManualLoad] = useState(
    browserRequiresManualHomePreviewLoad,
  );
  const [loadRequested, setLoadRequested] = useState(false);

  useEffect(() => {
    if (loadRequested) return;
    const media = window.matchMedia('(max-width: 720px)');
    const updatePolicy = () =>
      setManualLoad(browserRequiresManualHomePreviewLoad());
    media.addEventListener('change', updatePolicy);
    return () => media.removeEventListener('change', updatePolicy);
  }, [loadRequested]);

  useEffect(() => {
    if (manualLoad || loadRequested) return;
    let animationFrame = 0;
    let idleHandle = 0;
    let cancelled = false;
    const idleWindow = window as IdleWindow;
    const requestLoad = () => {
      animationFrame = window.requestAnimationFrame(() => {
        if (idleWindow.requestIdleCallback) {
          idleHandle = idleWindow.requestIdleCallback(
            () => {
              if (!cancelled) setLoadRequested(true);
            },
            { timeout: 700 },
          );
        } else if (!cancelled) {
          setLoadRequested(true);
        }
      });
    };
    const element = frame.current;
    let observer: IntersectionObserver | null = null;
    if (element && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          requestLoad();
        }
      });
    }
    if (observer && element) observer.observe(element);
    else requestLoad();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (idleHandle) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, [loadRequested, manualLoad]);

  return (
    <div
      ref={frame}
      className="home-world-preview"
      aria-label="Generated world preview"
      data-load-mode={manualLoad ? 'manual' : 'automatic'}
    >
      {loadRequested ? (
        <Suspense fallback={<ForgingWorldStatus />}>
          <LazyHomeWorldPreview />
        </Suspense>
      ) : manualLoad ? (
        <div className="home-world-opt-in">
          <span className="home-world-glyph" aria-hidden="true">
            ◉
          </span>
          <strong>Explore a generated world</strong>
          <span>42 territories · 5 continents</span>
          <button type="button" onClick={() => setLoadRequested(true)}>
            View Generated Globe
          </button>
        </div>
      ) : (
        <ForgingWorldStatus />
      )}
    </div>
  );
}
