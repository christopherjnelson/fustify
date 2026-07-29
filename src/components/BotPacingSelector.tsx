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
  const selectedIndex = BOT_PACING_OPTIONS.findIndex(
    (option) => option.mode === mode,
  );
  const selectedOption = BOT_PACING_OPTIONS[selectedIndex]!;

  return (
    <fieldset className={`bot-pacing-selector bot-pacing-${context}`}>
      <legend>Bot pacing</legend>
      <input
        type="range"
        name={`bot-pacing-${context}`}
        min={0}
        max={BOT_PACING_OPTIONS.length - 1}
        step={1}
        value={selectedIndex}
        aria-label="Bot pacing"
        aria-valuetext={selectedOption.label}
        onChange={(event) => {
          const option = BOT_PACING_OPTIONS[Number(event.currentTarget.value)];
          if (option) setMode(option.mode);
        }}
      />
      <div className="bot-pacing-labels" aria-hidden="true">
        {BOT_PACING_OPTIONS.map((option) => (
          <span key={option.mode}>{option.label}</span>
        ))}
      </div>
    </fieldset>
  );
}
