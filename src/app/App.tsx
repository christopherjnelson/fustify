import { GlobeScene } from '../components/GlobeScene';
import { TerritoryHud } from '../components/TerritoryHud';

export function App() {
  return (
    <main className="app-shell">
      <GlobeScene />
      <TerritoryHud />
      <div className="interaction-hint" aria-hidden="true">
        Drag to orbit · Scroll to zoom · Click to select
      </div>
    </main>
  );
}
