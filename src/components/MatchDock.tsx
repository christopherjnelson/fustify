import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from 'react';
import type { MatchEvent } from '../core/game/types';
import type { PlanetDefinition } from '../core/types/planet';
import type { LocalPlayerConfig } from '../core/setup/playerConfig';
import type { ActivityReactionController } from '../multiplayer/matchEventReactions';
import { EventLog } from './EventLog';
import {
  markActivityRead,
  reconcileActivityFeed,
  type ActivityFeedTracking,
} from './activityFeedState';
import { FollowActionButton } from './ActionTracking';

const ACTIVITY_OPEN_KEY = 'fustify.activity-dock.open';
const BOTTOM_TOLERANCE = 12;

function readOpenPreference() {
  if (typeof window === 'undefined') return true;
  try {
    const preference = window.localStorage.getItem(ACTIVITY_OPEN_KEY);
    return preference === null ? true : preference === 'true';
  } catch {
    return true;
  }
}

function writeOpenPreference(open: boolean) {
  try {
    window.localStorage.setItem(ACTIVITY_OPEN_KEY, String(open));
  } catch {
    // The dock remains usable when storage is disabled or unavailable.
  }
}

export function MatchDock({
  matchId,
  events,
  planet,
  players,
  onFocusTerritory,
  reactions,
  presentation = 'dock',
  open: controlledOpen,
  onOpenChange,
  onUnreadCountChange,
}: {
  matchId: string;
  events: MatchEvent[];
  planet: PlanetDefinition;
  players: LocalPlayerConfig[];
  onFocusTerritory: (territoryId: string) => void;
  reactions?: ActivityReactionController;
  presentation?: 'dock' | 'mobile-sheet';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(readOpenPreference);
  const open = controlledOpen ?? uncontrolledOpen;
  const trackingRef = useRef<ActivityFeedTracking>(
    reconcileActivityFeed(null, matchId, events, true),
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const pinnedToNewestRef = useRef(true);

  const clearUnread = () => {
    trackingRef.current = markActivityRead(trackingRef.current);
    setUnreadCount(0);
  };

  const scrollToNewest = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    pinnedToNewestRef.current = true;
    clearUnread();
  };

  const expand = () => {
    pinnedToNewestRef.current = true;
    clearUnread();
    if (controlledOpen === undefined) {
      setUncontrolledOpen(true);
      writeOpenPreference(true);
    }
    onOpenChange?.(true);
  };

  const collapse = () => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(false);
      writeOpenPreference(false);
    }
    onOpenChange?.(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  useLayoutEffect(() => {
    if (!open || !pinnedToNewestRef.current) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [events, open]);

  useEffect(() => {
    const next = reconcileActivityFeed(
      trackingRef.current,
      matchId,
      events,
      open && pinnedToNewestRef.current,
    );
    trackingRef.current = next;
    setUnreadCount(next.unreadCount);
  }, [events, matchId, open]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  const handleScroll = (event: UIEvent<HTMLOListElement>) => {
    const list = event.currentTarget;
    const atNewest =
      list.scrollHeight - list.scrollTop - list.clientHeight <=
      BOTTOM_TOLERANCE;
    pinnedToNewestRef.current = atNewest;
    if (atNewest && trackingRef.current.unreadCount > 0) clearUnread();
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    collapse();
  };

  return (
    <div
      className={`match-dock-slot${presentation === 'mobile-sheet' ? ' mobile-match-dock-slot' : ''}`}
    >
      {open ? (
        <section
          id={
            presentation === 'mobile-sheet'
              ? 'mobile-activity-panel'
              : undefined
          }
          className={`match-dock activity-panel${presentation === 'mobile-sheet' ? ' mobile-match-dock' : ''}`}
          aria-labelledby="activity-title"
          onKeyDown={handlePanelKeyDown}
        >
          <header className="activity-header">
            <div>
              <span className="eyebrow">Match feed</span>
              <h2 id="activity-title">Activity</h2>
            </div>
            <div className="activity-header-actions">
              <FollowActionButton compact />
              <button
                type="button"
                className="activity-collapse"
                aria-label={
                  presentation === 'mobile-sheet'
                    ? 'Close Activity'
                    : 'Collapse Activity'
                }
                onClick={collapse}
              >
                <span aria-hidden="true">⌄</span>
              </button>
            </div>
          </header>
          {unreadCount > 0 && (
            <button
              type="button"
              className="new-activity-button"
              onClick={scrollToNewest}
            >
              New activity ({unreadCount})
            </button>
          )}
          <EventLog
            events={events}
            planet={planet}
            players={players}
            onFocusTerritory={onFocusTerritory}
            listRef={listRef}
            onScroll={handleScroll}
            reactions={reactions}
          />
        </section>
      ) : presentation === 'mobile-sheet' ? null : (
        <div className="activity-launcher-row">
          <button
            ref={launcherRef}
            type="button"
            className="activity-launcher"
            aria-label={
              unreadCount > 0 ? `Activity, ${unreadCount} new` : 'Open Activity'
            }
            onClick={expand}
          >
            <span>Activity</span>
            {unreadCount > 0 && (
              <strong aria-hidden="true">· {unreadCount} new</strong>
            )}
          </button>
          <FollowActionButton compact />
        </div>
      )}
    </div>
  );
}
