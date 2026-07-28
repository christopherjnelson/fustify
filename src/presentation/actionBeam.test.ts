import { describe, expect, it } from 'vitest';
import { PLANET_RADIUS } from '../core/generation/constants';
import { createDefaultPlayerConfigs } from '../core/setup/playerConfig';
import {
  ACTION_BEAM_BASE_RADIUS,
  actionBeamAnimation,
  actionBeamHorizonVisibility,
  actionBeamPlacement,
  actionBeamPlayerColor,
  shouldShowActionBeam,
} from './actionBeam';

describe('action beam presentation', () => {
  it('places the beam on the surface and aligns it with the territory normal', () => {
    const placement = actionBeamPlacement([3, 4, 0]);
    const [qx, qy, qz, qw] = placement.quaternion;
    const up = [0, 1, 0] as const;
    const rotatedUp = [
      2 * (qx * qy - qz * qw) * up[1],
      (1 - 2 * (qx * qx + qz * qz)) * up[1],
      2 * (qy * qz + qx * qw) * up[1],
    ];

    expect(Math.hypot(...placement.normal)).toBeCloseTo(1);
    expect(Math.hypot(...placement.base)).toBeCloseTo(PLANET_RADIUS * 1.035);
    expect(ACTION_BEAM_BASE_RADIUS).toBe(PLANET_RADIUS * 1.035);
    expect(rotatedUp[0]).toBeCloseTo(placement.normal[0], 6);
    expect(rotatedUp[1]).toBeCloseTo(placement.normal[1], 6);
    expect(rotatedUp[2]).toBeCloseTo(placement.normal[2], 6);
  });

  it('hides detached back-side beams and smoothly reveals front-side beams', () => {
    expect(actionBeamHorizonVisibility(-0.05)).toBe(0);
    expect(actionBeamHorizonVisibility(0.05)).toBeGreaterThan(0);
    expect(actionBeamHorizonVisibility(0.05)).toBeLessThan(1);
    expect(actionBeamHorizonVisibility(0.15)).toBe(1);
  });

  it('grows and fades motion while keeping reduced motion static', () => {
    expect(actionBeamAnimation(0, false).lengthScale).toBeCloseTo(0.02);
    expect(actionBeamAnimation(0.3, false).lengthScale).toBe(1);
    expect(actionBeamAnimation(1, false).intensity).toBe(0);
    expect(actionBeamAnimation(0.83, true)).toEqual({
      lengthScale: 1,
      widthScale: 1,
      intensity: 1,
    });
  });

  it('uses the acting player palette color with a safe neutral fallback', () => {
    const players = createDefaultPlayerConfigs(4);
    expect(actionBeamPlayerColor(players[1]!.id, players)).toBe('#3f91e8');
    expect(actionBeamPlayerColor(null, players)).toBe('#ffffff');
    expect(actionBeamPlayerColor('missing-player', players)).toBe('#ffffff');
  });

  it('shows remote and bot actions while suppressing the viewer action', () => {
    const players = createDefaultPlayerConfigs(4);
    expect(shouldShowActionBeam(players[0]!.id, players[0]!.id, players)).toBe(
      false,
    );
    expect(shouldShowActionBeam(players[1]!.id, players[0]!.id, players)).toBe(
      true,
    );
    expect(shouldShowActionBeam(players[0]!.id, null, players)).toBe(false);
    expect(shouldShowActionBeam(players[1]!.id, null, players)).toBe(true);
    expect(shouldShowActionBeam(null, players[0]!.id, players)).toBe(true);
  });
});
