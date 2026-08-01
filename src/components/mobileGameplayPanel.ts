import type { GamePhase } from '../core/game/types';

export type MobileGameplayPanel = 'peek' | 'actions' | 'activity' | 'map';

export type MobileGameplayPanelAction =
  | { type: 'TOGGLE_ACTIONS' }
  | { type: 'OPEN'; panel: Exclude<MobileGameplayPanel, 'peek'> }
  | { type: 'CLOSE' }
  | { type: 'CONTEXT_CHANGED'; expand: boolean };

export function mobileGameplayPanelReducer(
  state: MobileGameplayPanel,
  action: MobileGameplayPanelAction,
): MobileGameplayPanel {
  switch (action.type) {
    case 'TOGGLE_ACTIONS':
      return state === 'actions' ? 'peek' : 'actions';
    case 'OPEN':
      return action.panel;
    case 'CLOSE':
      return 'peek';
    case 'CONTEXT_CHANGED':
      return action.expand ? 'actions' : 'peek';
  }
}

export function shouldExpandMobileActions({
  phase,
  sourceSelected,
  targetSelected,
  confirmingEndAttack,
}: {
  phase: GamePhase;
  sourceSelected: boolean;
  targetSelected: boolean;
  confirmingEndAttack: boolean;
}) {
  if (confirmingEndAttack) return true;
  if (phase === 'capture' || phase === 'turn-end' || phase === 'game-over') {
    return true;
  }
  if (phase === 'reinforce') return sourceSelected;
  if (phase === 'attack' || phase === 'fortify') {
    return sourceSelected && targetSelected;
  }
  return false;
}
