import { describe, expect, it } from 'vitest';
import type { PlanetDefinition } from '../core/types/planet';
import {
  beginHomeWorldRequest,
  failHomeWorldRequest,
  initialHomeWorldPreviewState,
  resolveHomeWorldResponse,
  shouldAdvanceHomeWorldReveal,
} from './homeWorldPreviewState';

const planet = {
  seed: 'quiet-ridge-314',
  territoryCount: 42,
  continentCount: 5,
} as PlanetDefinition;

describe('homepage world preview request state', () => {
  it('resolves the active generated world', () => {
    const generating = beginHomeWorldRequest(initialHomeWorldPreviewState(), 7);
    const ready = resolveHomeWorldResponse(generating, {
      type: 'home-world-generated',
      requestId: 7,
      planet,
    });
    expect(ready.phase).toBe('ready');
    expect(ready.planet).toBe(planet);
    expect(ready.message).toContain(planet.seed);
  });

  it('ignores stale success, error, and worker-failure responses', () => {
    const generating = beginHomeWorldRequest(initialHomeWorldPreviewState(), 9);
    expect(
      resolveHomeWorldResponse(generating, {
        type: 'home-world-generated',
        requestId: 8,
        planet,
      }),
    ).toBe(generating);
    expect(
      resolveHomeWorldResponse(generating, {
        type: 'home-world-error',
        requestId: 8,
        message: 'stale',
      }),
    ).toBe(generating);
    expect(failHomeWorldRequest(generating, 8)).toBe(generating);
  });

  it('keeps the prior world visible while replacement generation runs', () => {
    const ready = resolveHomeWorldResponse(
      beginHomeWorldRequest(initialHomeWorldPreviewState(), 1),
      {
        type: 'home-world-generated',
        requestId: 1,
        planet,
      },
    );
    const replacing = beginHomeWorldRequest(ready, 2);
    expect(replacing.phase).toBe('generating');
    expect(replacing.planet).toBe(planet);
    expect(replacing.message).toMatch(/new world/i);
  });

  it('surfaces the active worker error without discarding a prior world', () => {
    const current = {
      ...initialHomeWorldPreviewState(),
      activeRequestId: 3,
      planet,
    };
    const failed = failHomeWorldRequest(current, 3, 'Worker failed.');
    expect(failed.phase).toBe('error');
    expect(failed.planet).toBe(planet);
    expect(failed.message).toBe('Worker failed.');
  });

  it('only advances the reveal while visible and motion is allowed', () => {
    const reveal = {
      active: true,
      reducedMotion: false,
      interacted: false,
      elapsedSeconds: 4,
      durationSeconds: 12,
    };
    expect(shouldAdvanceHomeWorldReveal(reveal)).toBe(true);
    expect(
      shouldAdvanceHomeWorldReveal({ ...reveal, reducedMotion: true }),
    ).toBe(false);
    expect(shouldAdvanceHomeWorldReveal({ ...reveal, active: false })).toBe(
      false,
    );
    expect(shouldAdvanceHomeWorldReveal({ ...reveal, interacted: true })).toBe(
      false,
    );
    expect(
      shouldAdvanceHomeWorldReveal({ ...reveal, elapsedSeconds: 12 }),
    ).toBe(false);
  });
});
