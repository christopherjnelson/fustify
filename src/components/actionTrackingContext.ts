import { createContext, useContext } from 'react';
import type {
  ActionCue,
  FollowActionState,
} from '../presentation/actionTracking';
import { useGameStore } from '../state/useGameStore';

export interface ActionTrackingValue {
  cue: ActionCue | null;
  beamCue: ActionCue | null;
  followState: FollowActionState;
  enableFollowing: () => void;
  disableFollowing: () => void;
  pauseFollowing: () => void;
  requestManualFocus: (territoryId: string) => void;
}

const DEFAULT_VALUE: ActionTrackingValue = {
  cue: null,
  beamCue: null,
  followState: 'off',
  enableFollowing: () => undefined,
  disableFollowing: () => undefined,
  pauseFollowing: () => undefined,
  requestManualFocus: (territoryId) =>
    useGameStore.getState().requestTerritoryFocus(territoryId),
};

export const ActionTrackingContext =
  createContext<ActionTrackingValue>(DEFAULT_VALUE);

export function useActionTracking() {
  return useContext(ActionTrackingContext);
}
