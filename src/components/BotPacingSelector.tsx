import {
  useBotPacingPreference,
  type BotPacingMode,
} from '../browser/botPacingPreference';

const BOT_PACING_OPTIONS: readonly {
  mode: BotPacingMode;
  label: string;
}[] = [
  { mode: 'instant', label: 'Instant' },
  { mode: 'fast', label: 'Fast · 1 second' },
  { mode: 'deliberate', label: 'Deliberate · 5 seconds' },
];

export function BotPacingSelector({
  context,
}: {
  context: 'setup' | 'game-menu';
}) {
  const [mode, setMode] = useBotPacingPreference();

  return (
    <fieldset className={`bot-pacing-selector bot-pacing-${context}`}>
      <legend>Bot pacing</legend>
      {BOT_PACING_OPTIONS.map((option) => (
        <label key={option.mode}>
          <input
            type="radio"
            name={`bot-pacing-${context}`}
            value={option.mode}
            checked={mode === option.mode}
            onChange={() => setMode(option.mode)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
