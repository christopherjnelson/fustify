import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../generation/generatePlanet';
import { createDefaultPlayerConfigs } from './playerConfig';
import {
  analyzeStartingPosition,
  createNeutralMatchSetup,
  startingArmyTotal,
} from './startingPositions';
import {
  activeDraftPlayer,
  beginTerritoryAssignment,
  pickDraftTerritory,
} from './territoryAssignment';

describe('territory assignment strategies', () => {
  const planet = generatePlanet('draft-domain', {
    territoryCount: 13,
    continentCount: 3,
    playerCount: 3,
  });
  const players = createDefaultPlayerConfigs(3);

  it('uses deterministic round-robin order and rejects duplicate picks', () => {
    const begun = beginTerritoryAssignment(
      planet,
      createNeutralMatchSetup(players, 'player-draft'),
    );
    expect(begun.setupPhase).toBe('assignment-in-progress');
    if (begun.setupPhase !== 'assignment-in-progress') return;
    expect(activeDraftPlayer(begun).id).toBe(players[0]!.id);
    const first = pickDraftTerritory(planet, begun, planet.territories[0]!.id);
    expect(first.ok).toBe(true);
    if (!first.ok || first.setup.setupPhase !== 'assignment-in-progress')
      return;
    expect(activeDraftPlayer(first.setup).id).toBe(players[1]!.id);
    expect(
      pickDraftTerritory(planet, first.setup, planet.territories[0]!.id),
    ).toEqual({ ok: false, error: 'That territory has already been drafted.' });
  });

  it('completes uneven drafts with valid fixed army totals', () => {
    let setup = beginTerritoryAssignment(
      planet,
      createNeutralMatchSetup(players, 'player-draft'),
    );
    for (const territory of planet.territories) {
      if (setup.setupPhase !== 'assignment-in-progress') break;
      const result = pickDraftTerritory(planet, setup, territory.id);
      if (!result.ok) throw new Error(result.error);
      setup = result.setup;
    }
    expect(setup.setupPhase).toBe('ready');
    if (setup.setupPhase !== 'ready') return;
    expect(
      setup.startingPosition.analysis.players.map((p) => p.territoryCount),
    ).toEqual([5, 4, 4]);
    expect(
      setup.startingPosition.analysis.players.map((p) => p.armyCount),
    ).toEqual([
      startingArmyTotal(3),
      startingArmyTotal(3),
      startingArmyTotal(3),
    ]);
    expect(setup.startingPosition.analysis.hardFailure).toBe(false);
  });

  it('treats manual strategic imbalance as advisory but blocks bad structure', () => {
    const territories = Object.fromEntries(
      planet.territories.map((territory, index) => [
        territory.id,
        { ownerId: players[index % players.length]!.id, armyCount: 1 },
      ]),
    );
    const manual = analyzeStartingPosition(
      planet,
      players,
      territories,
      'player-draft',
    );
    expect(manual.hardFailure).toBe(false);
    delete territories[planet.territories[0]!.id];
    const incomplete = analyzeStartingPosition(
      planet,
      players,
      territories,
      'player-draft',
    );
    expect(incomplete.hardFailureReasons).toContain(
      'Not every territory has a starting owner.',
    );
  });
});
