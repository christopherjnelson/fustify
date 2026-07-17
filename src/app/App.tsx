import { GlobeScene } from '../components/GlobeScene';
import { TerritoryHud } from '../components/TerritoryHud';

export function App() {
  const logoVariant =
    new URLSearchParams(window.location.search).get('logo') === 'a' ? 'a' : 'b';

  return (
    <main className="app-shell">
      <GlobeScene />
      <TerritoryHud />
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
