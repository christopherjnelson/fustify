import { useEffect } from 'react';
import { GlobeScene } from '../components/GlobeScene';
import { TerritoryHud } from '../components/TerritoryHud';
import { HandoffScreen } from '../components/HandoffScreen';
import { PregamePanel } from '../components/PregamePanel';
import { WorldSetupPanel } from '../components/WorldSetupPanel';
import { Minimap } from '../components/Minimap';
import { ControlLegend } from '../components/ControlLegend';
import { useGameStore } from '../state/useGameStore';
import { useBotTurnRunner } from './useBotTurnRunner';
import { BRAND } from '../branding';
import { TurnNotificationController } from '../components/TurnNotificationController';
import { ActionTrackingProvider } from '../components/ActionTracking';

export function App() {
  useBotTurnRunner();
  const mode = useGameStore((state) => state.applicationMode);
  const loadSetupFromUrl = useGameStore((state) => state.loadSetupFromUrl);
  useEffect(() => {
    window.addEventListener('popstate', loadSetupFromUrl);
    return () => window.removeEventListener('popstate', loadSetupFromUrl);
  }, [loadSetupFromUrl]);
  return (
    <ActionTrackingProvider>
      <main
        className={`app-shell mode-${mode}`}
        aria-label={`${BRAND.productName} — ${BRAND.shortDescription}`}
      >
        <GlobeScene />
        {mode !== 'playing' && mode !== 'game-over' && <Minimap />}
        <ControlLegend />
        <TurnNotificationController />
        {mode === 'world-setup' && <WorldSetupPanel />}
        {mode === 'pregame' && <PregamePanel />}
        {(mode === 'playing' || mode === 'game-over') && <TerritoryHud />}
        {mode === 'handoff' && <HandoffScreen />}
      </main>
    </ActionTrackingProvider>
  );
}
