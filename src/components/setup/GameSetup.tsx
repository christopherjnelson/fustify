import {
  useId,
  type CSSProperties,
  type FormEventHandler,
  type ReactNode,
} from 'react';

export function GameSetupShell({
  eyebrow,
  title,
  summary,
  roster,
  world,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  summary: ReactNode;
  roster: ReactNode;
  world: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main className="game-setup-shell">
      <header className="game-setup-header">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </header>
      {summary}
      <SetupMainGrid roster={roster} world={world} />
      {actions}
    </main>
  );
}

export function SetupSummary({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="setup-summary multiplayer-card" aria-label={label}>
      {children}
    </section>
  );
}

export function SetupMainGrid({
  roster,
  world,
}: {
  roster: ReactNode;
  world: ReactNode;
}) {
  return (
    <div className="setup-main-grid">
      {roster}
      {world}
    </div>
  );
}

export function SetupRoster({
  title,
  children,
  supplemental,
}: {
  title: string;
  children: ReactNode;
  supplemental?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      className="setup-roster multiplayer-card"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      <ol className="setup-seat-list">{children}</ol>
      {supplemental}
    </section>
  );
}

export function SetupSeatRow({
  seatNumber,
  colorLabel,
  colorValue,
  primaryLabel,
  secondaryStatus,
  badges,
  controls,
  testId,
}: {
  seatNumber: number;
  colorLabel: string;
  colorValue: string;
  primaryLabel: ReactNode;
  secondaryStatus: ReactNode;
  badges?: ReactNode;
  controls?: ReactNode;
  testId?: string;
}) {
  return (
    <li
      className="setup-seat-row"
      style={{ '--setup-seat-color': colorValue } as CSSProperties}
      aria-label={`Seat ${seatNumber}, ${colorLabel}, ${typeof primaryLabel === 'string' ? primaryLabel : 'configured player'}`}
      data-testid={testId}
    >
      <span className="setup-seat-number">Seat {seatNumber}</span>
      <span
        className="setup-seat-color"
        aria-label={`${colorLabel} player color`}
      >
        <span className="setup-seat-color-marker" aria-hidden="true" />
        {colorLabel}
      </span>
      <span className="setup-seat-identity">
        <strong>{primaryLabel}</strong>
        <small>{secondaryStatus}</small>
      </span>
      {badges && <span className="setup-seat-badges">{badges}</span>}
      {controls && <span className="setup-seat-controls">{controls}</span>}
    </li>
  );
}

export function SetupWorldPanel({
  title,
  notice,
  controls,
  preview,
  onSubmit,
}: {
  title: string;
  notice?: ReactNode;
  controls: ReactNode;
  preview: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const titleId = useId();
  return (
    <form
      className="setup-world-panel multiplayer-card"
      aria-labelledby={titleId}
      onSubmit={onSubmit}
    >
      <h2 id={titleId}>{title}</h2>
      {notice}
      <div className="setup-world-content">
        <div className="setup-world-controls">{controls}</div>
        {preview}
      </div>
    </form>
  );
}

export function SetupActionBar({
  primary,
  status,
  secondary,
}: {
  primary?: ReactNode;
  status?: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <footer className="setup-action-bar multiplayer-card">
      {(primary || status) && (
        <div className="setup-action-primary">
          {primary}
          {status}
        </div>
      )}
      <div className="setup-action-secondary">{secondary}</div>
    </footer>
  );
}
