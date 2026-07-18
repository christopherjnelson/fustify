import {
  CLOSE_DIALOG_SHORTCUT,
  CONTROL_BINDINGS,
  TERRITORY_NAVIGATOR_SHORTCUT,
} from '../core/input/controlBindings';
import { useGameStore } from '../state/useGameStore';

export function ControlLegend() {
  const mode = useGameStore((state) => state.applicationMode);
  const keyboardBindings =
    mode === 'playing' || mode === 'game-over'
      ? [TERRITORY_NAVIGATOR_SHORTCUT, CLOSE_DIALOG_SHORTCUT]
      : [];

  return (
    <aside className="control-legend" aria-labelledby="control-legend-title">
      <strong id="control-legend-title">Globe controls</strong>
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
    </aside>
  );
}
