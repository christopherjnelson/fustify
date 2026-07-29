import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { vectorToGeographicPoint } from '../core/minimap/projection';
import {
  ACTION_CUE_DURATION_MS,
  reconcileActionEvents,
  shouldRecenterAction,
  transitionFollowAction,
  type ActionCue,
  type ActionEventTracking,
  type FollowActionState,
} from '../presentation/actionTracking';
import { useGameStore } from '../state/useGameStore';
import {
  ActionTrackingContext,
  useActionTracking,
  type ActionTrackingValue,
} from './actionTrackingContext';

interface FollowSession {
  matchId: string | null;
  state: FollowActionState;
}

export function ActionTrackingProvider({ children }: { children: ReactNode }) {
  const match = useGameStore((state) => state.match);
  const planet = useGameStore((state) => state.planet);
  const requestTerritoryFocus = useGameStore(
    (state) => state.requestTerritoryFocus,
  );
  const matchId = match?.matchId ?? null;
  const [followSession, setFollowSession] = useState<FollowSession>({
    matchId,
    state: 'off',
  });
  const [activeCue, setActiveCue] = useState<ActionCue | null>(null);
  const [activeBeamCue, setActiveBeamCue] = useState<ActionCue | null>(null);
  const trackingRef = useRef<ActionEventTracking | null>(null);
  const followState =
    followSession.matchId === matchId ? followSession.state : 'off';
  const cue = activeCue?.matchId === matchId ? activeCue : null;
  const beamCue = activeBeamCue?.matchId === matchId ? activeBeamCue : null;

  const enableFollowing = useCallback(() => {
    if (matchId === null) return;
    setFollowSession((current) => ({
      matchId,
      state: transitionFollowAction(current.state, 'enable'),
    }));
  }, [matchId]);

  const disableFollowing = useCallback(() => {
    setFollowSession((current) => ({
      matchId,
      state: transitionFollowAction(current.state, 'disable'),
    }));
  }, [matchId]);

  const pauseFollowing = useCallback(() => {
    setFollowSession((current) => {
      const currentState = current.matchId === matchId ? current.state : 'off';
      const nextState = transitionFollowAction(currentState, 'pause');
      return nextState === currentState
        ? current
        : { matchId, state: nextState };
    });
  }, [matchId]);

  const requestManualFocus = useCallback(
    (territoryId: string) => {
      pauseFollowing();
      requestTerritoryFocus(territoryId);
    },
    [pauseFollowing, requestTerritoryFocus],
  );

  useEffect(() => {
    if (matchId === null || match === null) {
      trackingRef.current = null;
      return;
    }
    const reconciliation = reconcileActionEvents(
      trackingRef.current,
      matchId,
      match.events,
    );
    trackingRef.current = reconciliation.tracking;
    if (reconciliation.cue === null) return;

    setActiveCue(reconciliation.cue);
    setActiveBeamCue(reconciliation.beamCue);
    if (followState !== 'following') return;
    const territory = planet.territories.find(
      (candidate) => candidate.id === reconciliation.cue?.targetTerritoryId,
    );
    if (
      territory &&
      shouldRecenterAction(
        useGameStore.getState().globeFocus,
        vectorToGeographicPoint(territory.center),
      )
    ) {
      requestTerritoryFocus(territory.id);
    }
  }, [followState, match, matchId, planet, requestTerritoryFocus]);

  useEffect(() => {
    if (cue === null) return;
    const timeout = window.setTimeout(() => {
      setActiveCue((current) =>
        current?.sequence === cue.sequence && current.matchId === cue.matchId
          ? null
          : current,
      );
    }, ACTION_CUE_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [cue]);

  useEffect(() => {
    if (beamCue === null) return;
    const timeout = window.setTimeout(() => {
      setActiveBeamCue((current) =>
        current?.sequence === beamCue.sequence &&
        current.matchId === beamCue.matchId
          ? null
          : current,
      );
    }, ACTION_CUE_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [beamCue]);

  const value = useMemo<ActionTrackingValue>(
    () => ({
      cue,
      beamCue,
      followState,
      enableFollowing,
      disableFollowing,
      pauseFollowing,
      requestManualFocus,
    }),
    [
      beamCue,
      cue,
      disableFollowing,
      enableFollowing,
      followState,
      pauseFollowing,
      requestManualFocus,
    ],
  );

  return (
    <ActionTrackingContext.Provider value={value}>
      {children}
    </ActionTrackingContext.Provider>
  );
}

export function FollowActionButton({ compact = false }: { compact?: boolean }) {
  const { followState, enableFollowing, disableFollowing } =
    useActionTracking();
  const label =
    followState === 'following'
      ? 'Following action'
      : followState === 'paused'
        ? 'Resume follow'
        : 'Follow action';

  return (
    <button
      type="button"
      className={`follow-action-button${compact ? ' compact' : ''}`}
      aria-pressed={followState === 'following'}
      data-follow-state={followState}
      onClick={followState === 'following' ? disableFollowing : enableFollowing}
    >
      <span aria-hidden="true">◎</span>
      {label}
    </button>
  );
}
