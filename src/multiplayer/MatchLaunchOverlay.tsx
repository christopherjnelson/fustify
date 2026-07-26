import { useEffect, useRef } from 'react';
import { FustifyLogo } from '../brand/FustifyLogo';
import type { PlanetDefinition } from '../core/types/planet';
import { ReadonlyMinimap } from './ReadonlyWorld';

export function MatchLaunchOverlay({
  planet,
  roomName,
}: {
  planet: PlanetDefinition;
  roomName: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  return (
    <div className="match-launch-backdrop">
      <div
        ref={dialog}
        className="match-launch-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-launch-title"
        aria-describedby="match-launch-description"
        tabIndex={-1}
      >
        <div className="match-launch-brand">
          <FustifyLogo
            size="compact"
            decorative
            showDescriptor
            variant="full-color"
          />
          <span className="match-launch-kicker">
            Authoritative match launch
          </span>
        </div>
        <div className="match-launch-preview" aria-hidden="true">
          <ReadonlyMinimap
            planet={planet}
            className="match-launch-world-preview"
          />
          <span className="match-launch-orbit" />
        </div>
        <div className="match-launch-copy" role="status" aria-live="polite">
          <span className="match-launch-pulse" aria-hidden="true" />
          <div>
            <h2 id="match-launch-title">Preparing {roomName}</h2>
            <p id="match-launch-description">
              Building the opening world, balancing starting territories, and
              securing the first turn. This can take a moment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
