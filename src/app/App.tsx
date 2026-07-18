import { useEffect } from 'react';
import { GlobeScene } from '../components/GlobeScene';
import { TerritoryHud } from '../components/TerritoryHud';
import { HandoffScreen } from '../components/HandoffScreen';
import { PregamePanel } from '../components/PregamePanel';
import { WorldSetupPanel } from '../components/WorldSetupPanel';
import { Minimap } from '../components/Minimap';
import { useGameStore } from '../state/useGameStore';

export function App() {
  const mode = useGameStore((state) => state.applicationMode);
  const loadSetupFromUrl = useGameStore((state) => state.loadSetupFromUrl);
  useEffect(() => {
    window.addEventListener('popstate', loadSetupFromUrl);
    return () => window.removeEventListener('popstate', loadSetupFromUrl);
  }, [loadSetupFromUrl]);
  const logoVariant =
    new URLSearchParams(window.location.search).get('logo') === 'a' ? 'a' : 'b';

  return (
    <main className={`app-shell mode-${mode}`}>
      <GlobeScene />
      <Minimap />
      {mode === 'world-setup' && <WorldSetupPanel />}
      {mode === 'pregame' && <PregamePanel />}
      {(mode === 'playing' || mode === 'game-over') && <TerritoryHud />}
      {mode === 'handoff' && <HandoffScreen />}
      <div className="board-brand">
        <img
          src={`/assets/worldseed-logo-${logoVariant}.png`}
          alt={`Worldseed logo variant ${logoVariant.toUpperCase()} — Generate a world. Conquer it.`}
        />
      </div>
      <div className="interaction-hint" aria-hidden="true">
        Drag to orbit · Scroll to zoom · Follow the phase prompts
      </div>
    </main>
  );
}
