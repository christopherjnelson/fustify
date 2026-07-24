import { describe, expect, it } from 'vitest';
import { resolveCombat } from './combat';
import { gameReducer } from './gameReducer';
import {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getValidAttackDice,
} from './legalActions';
import {
  calculateReinforcements,
  getFullyOwnedContinents,
  getReinforcementTargets,
} from './reinforcement';
import { fixtureMatch, rulesFixtures } from './testFixtures';
import type { MatchState } from './types';
import { checkVictory, getNextActivePlayer } from './victory';

function dice(values: number[]) {
  let index = 0;
  return { integer: () => values[index++] ?? 1 };
}

function attackState(planet: ReturnType<typeof rulesFixtures.adjacent>) {
  return fixtureMatch(planet, {
    phase: 'attack',
    remainingReinforcements: 0,
  });
}

function pendingState(): {
  planet: ReturnType<typeof rulesFixtures.adjacent>;
  state: MatchState;
} {
  const planet = rulesFixtures.adjacent();
  const state = attackState(planet);
  const captured = gameReducer(
    planet,
    state,
    { type: 'ATTACK', fromTerritoryId: 'a', toTerritoryId: 'b', attackDice: 3 },
    { createCombatRng: () => dice([6, 5, 4, 1]) },
  );
  expect(captured.error).toBeNull();
  return { planet, state: captured.state };
}

describe('hand-authored rules fixtures', () => {
  it('selects and clears legal reinforcement, attack, and fortification territories', () => {
    const adjacent = rulesFixtures.adjacent();
    const reinforcement = fixtureMatch(adjacent);
    const reinforcedSelection = gameReducer(adjacent, reinforcement, {
      type: 'SELECT_TERRITORY',
      territoryId: 'a',
    });
    expect(reinforcedSelection.state.selectedSourceTerritoryId).toBe('a');
    expect(
      gameReducer(adjacent, reinforcedSelection.state, {
        type: 'SELECT_TERRITORY',
        territoryId: null,
      }).state.selectedSourceTerritoryId,
    ).toBeNull();

    const nearVictory = rulesFixtures.nearVictory();
    const attacking = attackState(nearVictory);
    const source = gameReducer(nearVictory, attacking, {
      type: 'SELECT_TERRITORY',
      territoryId: 'b',
    }).state;
    const target = gameReducer(nearVictory, source, {
      type: 'SELECT_TERRITORY',
      territoryId: 'c',
    }).state;
    expect(target.selectedTargetTerritoryId).toBe('c');
    expect(
      gameReducer(nearVictory, target, {
        type: 'SELECT_TERRITORY',
        territoryId: 'b',
      }).state,
    ).toMatchObject({
      selectedSourceTerritoryId: null,
      selectedTargetTerritoryId: null,
    });

    const chain = rulesFixtures.chain();
    const fortifying = fixtureMatch(chain, {
      phase: 'fortify',
      remainingReinforcements: 0,
    });
    const fortifySource = gameReducer(chain, fortifying, {
      type: 'SELECT_TERRITORY',
      territoryId: 'a',
    }).state;
    expect(
      gameReducer(chain, fortifySource, {
        type: 'SELECT_TERRITORY',
        territoryId: 'c',
      }).state.selectedTargetTerritoryId,
    ).toBe('c');
  });

  it('rejects unknown, enemy, immobile, and wrong-phase territory selections', () => {
    const planet = rulesFixtures.nearVictory();
    const reinforcement = fixtureMatch(planet);
    expect(
      gameReducer(planet, reinforcement, {
        type: 'SELECT_TERRITORY',
        territoryId: 'missing',
      }).error?.code,
    ).toBe('UNKNOWN_TERRITORY');
    expect(
      gameReducer(planet, reinforcement, {
        type: 'SELECT_TERRITORY',
        territoryId: 'c',
      }).error?.code,
    ).toBe('NOT_OWNER');
    const attacking = attackState(planet);
    expect(
      gameReducer(planet, attacking, {
        type: 'SELECT_TERRITORY',
        territoryId: 'a',
      }).error?.code,
    ).toBe('INVALID_SOURCE');
    expect(
      gameReducer(planet, attacking, {
        type: 'SELECT_TERRITORY',
        territoryId: 'c',
      }).error?.code,
    ).toBe('INVALID_TARGET');
    expect(
      gameReducer(
        planet,
        { ...attacking, phase: 'turn-end' },
        {
          type: 'SELECT_TERRITORY',
          territoryId: 'b',
        },
      ).error?.code,
    ).toBe('WRONG_PHASE');
  });

  it('calculates base reinforcement and single-continent bonuses', () => {
    const planet = rulesFixtures.continents();
    const state = fixtureMatch(planet);
    expect(
      getFullyOwnedContinents(planet, state, 'p1').map(({ id }) => id),
    ).toEqual(['c1']);
    expect(calculateReinforcements(planet, state, 'p1')).toEqual({
      ownedTerritoryCount: 4,
      territoryBase: 3,
      continentBonus: 2,
      total: 5,
    });
  });

  it('adds multiple continent bonuses when one player owns them', () => {
    const planet = rulesFixtures.continents();
    const state = fixtureMatch(planet);
    for (const territory of Object.values(state.territories))
      territory.ownerId = 'p1';
    expect(calculateReinforcements(planet, state, 'p1')).toMatchObject({
      continentBonus: 5,
      total: 8,
    });
  });

  it('returns no reinforcement targets for a zero-territory player', () => {
    const state = fixtureMatch(rulesFixtures.zeroTerritoryPlayer());
    state.activePlayerId = 'p3';
    expect(getReinforcementTargets(state)).toEqual([]);
  });

  it('accepts owned reinforcement targets and rejects enemies immutably', () => {
    const planet = rulesFixtures.adjacent();
    const state = fixtureMatch(planet);
    const placed = gameReducer(planet, state, {
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'a',
      amount: 1,
    });
    expect(placed.state.territories.a.armyCount).toBe(5);
    expect(placed.state.events.at(-1)).toMatchObject({
      type: 'armies-placed',
      actingPlayerId: 'p1',
      primaryTerritoryId: 'a',
      armyCount: 1,
    });
    const rejected = gameReducer(planet, state, {
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'b',
      amount: 1,
    });
    expect(rejected.error?.code).toBe('NOT_OWNER');
    expect(rejected.state).toBe(state);
  });

  it('distinguishes legal attack sources, targets, and non-adjacent enemies', () => {
    const planet = rulesFixtures.nearVictory();
    const state = attackState(planet);
    expect(getAttackSources(state)).toEqual(['b']);
    expect(getAttackTargets(planet, state, 'b')).toEqual(['c']);
    expect(getAttackTargets(planet, state, 'a')).toEqual([]);
    const invalid = gameReducer(planet, state, {
      type: 'ATTACK',
      fromTerritoryId: 'b',
      toTerritoryId: 'a',
      attackDice: 1,
    });
    expect(invalid.error?.code).toBe('NOT_ADJACENT');
    expect(
      gameReducer(planet, state, { type: 'END_ATTACK_PHASE' }).state.events.at(
        -1,
      ),
    ).toMatchObject({
      type: 'attack-phase-ended',
      actingPlayerId: 'p1',
    });
  });

  it('treats both land borders and sea routes as strategic adjacency', () => {
    for (const planet of [rulesFixtures.adjacent(), rulesFixtures.seaRoute()]) {
      expect(getAttackTargets(planet, attackState(planet), 'a')).toEqual(['b']);
    }
  });

  it('enforces dice limits and defender-winning ties', () => {
    expect(getValidAttackDice(1)).toEqual([]);
    expect(getValidAttackDice(2)).toEqual([1]);
    expect(getValidAttackDice(3)).toEqual([1, 2]);
    expect(getValidAttackDice(4)).toEqual([1, 2, 3]);
    expect(resolveCombat(2, 2, dice([6, 3, 6, 2]))).toMatchObject({
      attackerLosses: 1,
      defenderLosses: 1,
    });
  });

  it('applies casualties deterministically and creates a combat event', () => {
    const planet = rulesFixtures.adjacent();
    planet.territories[1]!.armyCount = 2;
    const result = gameReducer(
      planet,
      attackState(planet),
      {
        type: 'ATTACK',
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        attackDice: 2,
      },
      { createCombatRng: () => dice([6, 1, 5, 4]) },
    );
    expect(result.state.territories).toMatchObject({
      a: { armyCount: 3 },
      b: { armyCount: 1 },
    });
    expect(result.state.events.at(-1)).toMatchObject({
      id: 'event-3',
      type: 'combat',
      actingPlayerId: 'p1',
      defenderPlayerId: 'p2',
      sourceTerritoryId: 'a',
      targetTerritoryId: 'b',
      primaryTerritoryId: 'b',
      attackerLosses: 1,
      defenderLosses: 1,
    });
  });

  it('captures, eliminates, blocks unrelated actions, and enforces capture movement bounds', () => {
    const { planet, state } = pendingState();
    expect(state).toMatchObject({
      phase: 'capture',
      pendingCapture: { minimumArmies: 3 },
      recentlyCapturedTerritoryId: 'b',
    });
    expect(state.players.p2.eliminated).toBe(true);
    expect(new Set(state.events.map((event) => event.id)).size).toBe(
      state.events.length,
    );
    expect(
      (JSON.parse(JSON.stringify(state)) as MatchState).events.map(
        (event) => event.id,
      ),
    ).toEqual(state.events.map((event) => event.id));
    expect(state.events.slice(-2).map(({ type }) => type)).toEqual([
      'territory-captured',
      'player-eliminated',
    ]);
    expect(
      state.events.find((event) => event.type === 'territory-captured'),
    ).toMatchObject({
      actingPlayerId: 'p1',
      previousOwnerId: 'p2',
      sourceTerritoryId: 'a',
      targetTerritoryId: 'b',
      primaryTerritoryId: 'b',
    });
    expect(
      gameReducer(planet, state, { type: 'END_ATTACK_PHASE' }).error?.code,
    ).toBe('CAPTURE_MOVE_REQUIRED');
    for (const amount of [2, 4]) {
      const rejected = gameReducer(planet, state, {
        type: 'MOVE_AFTER_CAPTURE',
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        amount,
      });
      expect(rejected.error?.code).toBe('INVALID_AMOUNT');
      expect(rejected.state).toBe(state);
    }
    const moved = gameReducer(planet, state, {
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      amount: 3,
    });
    expect(moved.state.territories).toMatchObject({
      a: { armyCount: 1 },
      b: { armyCount: 3 },
    });
    expect(moved.state.events.at(-1)).toMatchObject({
      type: 'match-won',
      actingPlayerId: 'p1',
    });
    expect(
      moved.state.events.find((event) => event.type === 'capture-move'),
    ).toMatchObject({
      actingPlayerId: 'p1',
      sourceTerritoryId: 'a',
      targetTerritoryId: 'b',
      primaryTerritoryId: 'b',
      armyCount: 3,
    });
  });

  it('fortifies over branched owned paths and rejects paths through enemies', () => {
    const owned = rulesFixtures.branched();
    const ownedState = fixtureMatch(owned, {
      phase: 'fortify',
      remainingReinforcements: 0,
    });
    expect(getFortifyTargets(owned, ownedState, 'a').sort()).toEqual([
      'b',
      'c',
      'd',
    ]);
    const fortified = gameReducer(owned, ownedState, {
      type: 'FORTIFY',
      fromTerritoryId: 'a',
      toTerritoryId: 'd',
      amount: 4,
    });
    expect(fortified.state).toMatchObject({
      phase: 'turn-end',
      fortifiedThisTurn: true,
    });
    expect(fortified.state.events.at(-1)).toMatchObject({
      type: 'fortification-completed',
      actingPlayerId: 'p1',
      sourceTerritoryId: 'a',
      targetTerritoryId: 'd',
      primaryTerritoryId: 'd',
      armyCount: 4,
    });

    const blocked = rulesFixtures.blockedChain();
    const blockedState = fixtureMatch(blocked, {
      phase: 'fortify',
      remainingReinforcements: 0,
    });
    expect(getFortifyTargets(blocked, blockedState, 'a')).toEqual([]);
    expect(
      gameReducer(blocked, blockedState, {
        type: 'FORTIFY',
        fromTerritoryId: 'a',
        toTerritoryId: 'c',
        amount: 1,
      }).error?.code,
    ).toBe('NO_OWNED_PATH');
  });

  it('skips eliminated players and reaches victory only after mandatory movement', () => {
    const { planet, state } = pendingState();
    expect(checkVictory(planet, state)).toBe('p1');
    expect(state.winnerId).toBe('p1');
    expect(state.phase).toBe('capture');
    const moved = gameReducer(planet, state, {
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      amount: 3,
    });
    expect(moved.state.phase).toBe('game-over');
    expect(moved.state.events.at(-1)?.type).toBe('match-won');

    const chain = rulesFixtures.chain();
    const next = fixtureMatch(chain);
    next.players.p2.eliminated = true;
    expect(getNextActivePlayer(chain, next)).toBe('p3');
  });

  it('keeps all invalid action variants referentially immutable', () => {
    const planet = rulesFixtures.adjacent();
    const state = attackState(planet);
    const actions = [
      { type: 'PLACE_REINFORCEMENT', territoryId: 'a', amount: 1 } as const,
      {
        type: 'ATTACK',
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        attackDice: 4,
      } as const,
      {
        type: 'FORTIFY',
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        amount: 1,
      } as const,
      { type: 'END_TURN' } as const,
    ];
    for (const action of actions) {
      const result = gameReducer(planet, state, action);
      expect(result.error).not.toBeNull();
      expect(result.state).toBe(state);
    }
  });

  it('round-trips a fixture match without semantic changes', () => {
    const state = fixtureMatch(rulesFixtures.continents());
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
