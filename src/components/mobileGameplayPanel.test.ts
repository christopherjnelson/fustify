import { describe, expect, it } from 'vitest';
import {
  mobileGameplayPanelReducer,
  shouldExpandMobileActions,
} from './mobileGameplayPanel';

describe('mobileGameplayPanelReducer', () => {
  it('toggles actions and makes auxiliary panels mutually exclusive', () => {
    expect(mobileGameplayPanelReducer('peek', { type: 'TOGGLE_ACTIONS' })).toBe(
      'actions',
    );
    expect(
      mobileGameplayPanelReducer('actions', { type: 'TOGGLE_ACTIONS' }),
    ).toBe('peek');
    expect(
      mobileGameplayPanelReducer('actions', {
        type: 'OPEN',
        panel: 'activity',
      }),
    ).toBe('activity');
    expect(mobileGameplayPanelReducer('map', { type: 'CLOSE' })).toBe('peek');
  });

  it('opens only when a changed gameplay context requires controls', () => {
    expect(
      mobileGameplayPanelReducer('activity', {
        type: 'CONTEXT_CHANGED',
        expand: true,
      }),
    ).toBe('actions');
    expect(
      mobileGameplayPanelReducer('actions', {
        type: 'CONTEXT_CHANGED',
        expand: false,
      }),
    ).toBe('peek');
  });
});

describe('shouldExpandMobileActions', () => {
  it('waits for the selection needed by globe-driven phases', () => {
    expect(
      shouldExpandMobileActions({
        phase: 'reinforce',
        sourceSelected: false,
        targetSelected: false,
        confirmingEndAttack: false,
      }),
    ).toBe(false);
    expect(
      shouldExpandMobileActions({
        phase: 'reinforce',
        sourceSelected: true,
        targetSelected: false,
        confirmingEndAttack: false,
      }),
    ).toBe(true);
    expect(
      shouldExpandMobileActions({
        phase: 'attack',
        sourceSelected: true,
        targetSelected: false,
        confirmingEndAttack: false,
      }),
    ).toBe(false);
    expect(
      shouldExpandMobileActions({
        phase: 'fortify',
        sourceSelected: true,
        targetSelected: true,
        confirmingEndAttack: false,
      }),
    ).toBe(true);
  });

  it.each(['capture', 'turn-end', 'game-over'] as const)(
    'opens mandatory %s controls',
    (phase) => {
      expect(
        shouldExpandMobileActions({
          phase,
          sourceSelected: false,
          targetSelected: false,
          confirmingEndAttack: false,
        }),
      ).toBe(true);
    },
  );

  it('opens attack confirmation even without a ready selection', () => {
    expect(
      shouldExpandMobileActions({
        phase: 'attack',
        sourceSelected: false,
        targetSelected: false,
        confirmingEndAttack: true,
      }),
    ).toBe(true);
  });
});
