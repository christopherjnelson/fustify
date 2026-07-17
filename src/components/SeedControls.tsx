import type { FormEvent } from 'react';
import { useGameStore } from '../state/useGameStore';

export function SeedControls() {
  const seedInput = useGameStore((state) => state.seedInput);
  const setSeedInput = useGameStore((state) => state.setSeedInput);
  const regenerate = useGameStore((state) => state.regenerate);
  const randomize = useGameStore((state) => state.randomizeSeed);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    regenerate();
  };

  return (
    <form className="seed-controls" onSubmit={submit}>
      <label htmlFor="planet-seed">Planet seed</label>
      <div className="seed-row">
        <input
          id="planet-seed"
          value={seedInput}
          onChange={(event) => setSeedInput(event.target.value)}
          spellCheck={false}
          aria-label="Planet seed"
        />
        <button type="submit">Regenerate</button>
        <button type="button" className="secondary" onClick={randomize}>
          Random seed
        </button>
      </div>
    </form>
  );
}
