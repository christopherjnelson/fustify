import {
  CLOSE_DIALOG_SHORTCUT,
  CONTROL_BINDINGS,
  TERRITORY_NAVIGATOR_SHORTCUT,
} from '../core/input/controlBindings';
import { useGameStore } from '../state/useGameStore';
import { useEffect, useId, useState } from 'react';

const SESSION_KEY = 'fustify:globe-controls-collapsed';
const AUTO_COLLAPSE_MS = 8_000;

export function ControlLegend() {
  const contentId = useId();
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (window.matchMedia('(max-width: 430px)').matches) return false;
    return sessionStorage.getItem(SESSION_KEY) !== 'true';
  });
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const mode = useGameStore((state) => state.applicationMode);
  const keyboardBindings =
    mode === 'playing' || mode === 'game-over'
      ? [TERRITORY_NAVIGATOR_SHORTCUT, CLOSE_DIALOG_SHORTCUT]
      : [];

  const collapse = () => {
    setExpanded(false);
    sessionStorage.setItem(SESSION_KEY, 'true');
  };

  useEffect(() => {
    if (!expanded || hovered || focusWithin) return;
    const timeout = window.setTimeout(collapse, AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timeout);
  }, [expanded, focusWithin, hovered]);

  useEffect(() => {
    if (!expanded) return;
    const canvas = document.querySelector('.globe-canvas');
    const onInteraction = () => collapse();
    canvas?.addEventListener('pointerup', onInteraction, { once: true });
    canvas?.addEventListener('wheel', onInteraction, { once: true });
    return () => {
      canvas?.removeEventListener('pointerup', onInteraction);
      canvas?.removeEventListener('wheel', onInteraction);
    };
  }, [expanded]);

  return (
    <aside
      className={`control-legend${expanded ? ' is-expanded' : ' is-collapsed'}`}
      aria-label="Globe controls"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusWithin(false);
        }
      }}
    >
      <button
        className="control-legend-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          sessionStorage.setItem(SESSION_KEY, String(!next));
        }}
      >
        <span aria-hidden="true">⌁</span>
        Controls
      </button>
      {expanded && (
        <div id={contentId} className="control-legend-content">
          <strong>Globe controls</strong>
          <dl>
            {CONTROL_BINDINGS.map((binding) => (
              <div key={binding.input}>
                <dt>{binding.input}</dt>
                <dd>{binding.action}</dd>
              </div>
            ))}
            {keyboardBindings.map((binding) => (
              <div key={binding.key}>
                <dt>
                  <kbd>{binding.label}</kbd>
                </dt>
                <dd>{binding.action}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </aside>
  );
}
