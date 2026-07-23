import type { MatchEvent } from '../core/game/types';
import { matchEventIconName } from './matchEventIconName';

export function MatchEventIcon({ event }: { event: MatchEvent }) {
  const icon = matchEventIconName(event);
  return (
    <svg
      className="match-event-icon"
      data-event-icon={icon}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      {icon === 'reinforcement' && <path d="M10 3v14M3 10h14M6 6l4-3 4 3" />}
      {icon === 'combat' && (
        <>
          <rect x="3.2" y="3.2" width="5.8" height="5.8" rx="1.2" />
          <rect x="11" y="11" width="5.8" height="5.8" rx="1.2" />
          <path d="M6.1 6.1h.1M13.9 13.9h.1M15.2 12.6h.1M12.6 15.2h.1" />
        </>
      )}
      {icon === 'capture' && <path d="M5 17V3m.5 1h9l-2.2 3L14.5 10h-9" />}
      {icon === 'movement' && <path d="M3 10h13m-5-5 5 5-5 5" />}
      {icon === 'fortification' && (
        <path d="M10 2.8 16 5v4.3c0 3.7-2.4 6.2-6 7.9-3.6-1.7-6-4.2-6-7.9V5l6-2.2Z" />
      )}
      {icon === 'turn' && (
        <path d="M15.8 8A6 6 0 0 0 5.2 5.2L3 7.4M4.2 12A6 6 0 0 0 14.8 14.8l2.2-2.2M3 3v4.4h4.4M17 17v-4.4h-4.4" />
      )}
      {icon === 'victory' && (
        <path d="m4 5 3 3 3-5 3 5 3-3-1.2 9H5.2L4 5Zm2 12h8" />
      )}
      {icon === 'elimination' && (
        <>
          <circle cx="8" cy="7" r="3" />
          <path d="M3 16c.7-3 2.3-4.5 5-4.5 1.2 0 2.2.3 3 .9M13 12l4 4m0-4-4 4" />
        </>
      )}
      {icon === 'generic' && (
        <>
          <circle cx="10" cy="10" r="6" />
          <circle cx="10" cy="10" r="1.2" className="match-event-icon-fill" />
        </>
      )}
    </svg>
  );
}
