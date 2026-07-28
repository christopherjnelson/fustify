import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import {
  filterTerritoryNavigationItems,
  getDefaultTerritoryFilter,
  getTerritoryNavigationItems,
  type TerritoryNavigatorFilter,
} from '../core/navigation/territoryNavigator';
import { useGameStore } from '../state/useGameStore';
import { CLOSE_DIALOG_SHORTCUT } from '../core/input/controlBindings';
import { multiplayerInteractionCapabilities } from '../multiplayer/interactionCapabilities';
import { useActionTracking } from './actionTrackingContext';

const STATUS_LABELS = {
  'valid-source': 'Valid source',
  'valid-target': 'Valid target',
  'selected-source': 'Selected source',
  'selected-target': 'Selected target',
  invalid: 'Invalid territory',
} as const;

const STATUS_SYMBOLS = {
  'valid-source': '◇',
  'valid-target': '◎',
  'selected-source': '◆',
  'selected-target': '×',
  invalid: '—',
} as const;

interface TerritoryNavigatorProps {
  open: boolean;
  onClose: () => void;
  presentation: 'rail' | 'sheet';
  selectedSummary?: ReactNode;
}

export function TerritoryNavigator({
  open,
  onClose,
  presentation,
  selectedSummary,
}: TerritoryNavigatorProps) {
  const planet = useGameStore((state) => state.planet);
  const match = useGameStore((state) => state.match)!;
  const configuredPlayers = useGameStore((state) => state.matchSetup.players);
  const selectAndFocus = useGameStore((state) => state.selectAndFocusTerritory);
  const multiplayerSession = useGameStore((state) => state.multiplayerSession);
  const botPlaybackPaused = useGameStore((state) => state.botPlaybackPaused);
  const { pauseFollowing } = useActionTracking();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TerritoryNavigatorFilter>(() =>
    getDefaultTerritoryFilter(match),
  );
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('');
  const effectiveFilter = match.phase === 'game-over' ? 'all' : filter;
  const displayPlanet = useMemo(
    () => ({
      ...planet,
      players: planet.players.map((player) => ({
        ...player,
        name:
          configuredPlayers.find((configured) => configured.id === player.id)
            ?.name ?? player.name,
      })),
    }),
    [configuredPlayers, planet],
  );
  const items = useMemo(
    () => getTerritoryNavigationItems(displayPlanet, match),
    [displayPlanet, match],
  );
  const filtered = useMemo(
    () =>
      filterTerritoryNavigationItems(
        items,
        effectiveFilter,
        match.phase === 'game-over' ? null : match.activePlayerId,
        query,
      ),
    [effectiveFilter, items, match.activePlayerId, match.phase, query],
  );
  const botControlled =
    configuredPlayers.find((player) => player.id === match.activePlayerId)
      ?.controllerType === 'heuristic-bot';
  const capabilities = multiplayerInteractionCapabilities(
    match,
    multiplayerSession,
  );
  const localPausedBot =
    botControlled && botPlaybackPaused && multiplayerSession === null;
  const inspectionOnly =
    localPausedBot ||
    (multiplayerSession !== null && !capabilities.canIssueGameplayActions);
  const selectionUnavailable =
    (botControlled && !localPausedBot) ||
    (multiplayerSession !== null &&
      multiplayerSession.pending &&
      capabilities.canIssueGameplayActions) ||
    (!inspectionOnly &&
      !['reinforce', 'attack', 'fortify'].includes(match.phase));

  useEffect(() => {
    if (!open) return;
    if (presentation === 'rail') {
      window.requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    if (!dialogRef.current) return;
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    searchRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open, presentation]);

  if (!open) return null;

  const handleKeyboard = (
    event: KeyboardEvent<HTMLDialogElement | HTMLElement>,
  ) => {
    if (event.key === CLOSE_DIALOG_SHORTCUT.key) {
      event.preventDefault();
      onClose();
      return;
    }
    if (presentation !== 'sheet') return;
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const navigator = (
    <section className="territory-navigator">
      <div className="navigator-heading">
        <div>
          <span className="eyebrow">Find territory</span>
          <h2 id="navigator-title">Territory navigator</h2>
        </div>
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          aria-label="Close territory navigator"
        >
          ×
        </button>
      </div>

      {selectedSummary}

      <div className="territory-filter" aria-label="Territory ownership filter">
        <button
          type="button"
          className={effectiveFilter === 'mine' ? 'active' : ''}
          aria-pressed={effectiveFilter === 'mine'}
          disabled={match.phase === 'game-over'}
          onClick={() => setFilter('mine')}
        >
          My territories
        </button>
        <button
          type="button"
          className={effectiveFilter === 'all' ? 'active' : ''}
          aria-pressed={effectiveFilter === 'all'}
          onClick={() => setFilter('all')}
        >
          All territories
        </button>
      </div>

      <label className="territory-search">
        <span className="sr-only">Search territories</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search territory, owner, continent"
          aria-label="Search territories"
        />
      </label>

      <div className="navigator-summary">
        <div className="navigator-legend" aria-label="Territory status legend">
          <span>◇ source</span>
          <span>◎ target</span>
          <span>◆ selected</span>
          <span>≈ sea route</span>
          <span>— invalid</span>
        </div>
        <span aria-live="polite" aria-atomic="true">
          {filtered.length}{' '}
          {filtered.length === 1 ? 'territory' : 'territories'}
        </span>
      </div>

      <ul>
        {filtered.map((item) => {
          const status = STATUS_LABELS[item.status];
          const route = item.seaRouteTarget ? ' Sea-route target.' : '';
          const selected = item.status.startsWith('selected');
          return (
            <li key={item.id} className={item.status}>
              <button
                type="button"
                onClick={() => {
                  pauseFollowing();
                  selectAndFocus(item.id);
                  setSelectionAnnouncement(
                    `${item.name} selected. Globe focus requested.`,
                  );
                }}
                disabled={selectionUnavailable}
                aria-label={`${item.name}. ${item.ownerName}, ${item.armyCount} armies, ${item.continentName}. ${status}.${route}`}
                aria-current={selected ? 'true' : undefined}
              >
                <span className="navigator-status" aria-hidden="true">
                  {STATUS_SYMBOLS[item.status]}
                  {item.seaRouteTarget && ' ≈'}
                </span>
                <strong>{item.name}</strong>
                <span>
                  {item.ownerName} · {item.armyCount} armies
                </span>
                <small>
                  {item.continentName} · {status}
                  {route}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && <p>No territories match this search.</p>}

      <div className="drawer-footer">
        <span className="sr-only" aria-live="polite">
          {selectionAnnouncement}
        </span>
        <button type="button" onClick={onClose}>
          {presentation === 'sheet'
            ? 'Close and view globe'
            : 'Collapse territory list'}
        </button>
      </div>
    </section>
  );

  if (presentation === 'rail') {
    return (
      <section
        id="territory-navigator"
        className="territory-navigator-region"
        aria-labelledby="navigator-title"
        onKeyDown={handleKeyboard}
      >
        {navigator}
      </section>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      id="territory-navigator"
      className="territory-drawer"
      aria-labelledby="navigator-title"
      aria-modal="true"
      onKeyDown={handleKeyboard}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {navigator}
    </dialog>
  );
}
