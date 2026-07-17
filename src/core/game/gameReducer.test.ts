import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../generation/generatePlanet';
import type { PlanetDefinition } from '../types/planet';
import { resolveCombat } from './combat';
import { createMatch } from './createMatch';
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
} from './reinforcement';
import type { MatchState } from './types';
import { checkVictory, getNextActivePlayer } from './victory';

function smallPlanet(): PlanetDefinition {
  return {
    seed: 'rules-seed',
    generatorVersion: 1,
    territoryCount: 5,
    continentCount: 2,
    playerCount: 4,
    players: [
      { id: 'p1', name: 'One', color: '#f00' },
      { id: 'p2', name: 'Two', color: '#00f' },
      { id: 'p3', name: 'Three', color: '#0f0' },
      { id: 'p4', name: 'Four', color: '#ff0' },
    ],
    territories: [
      {
        id: 'a',
        name: 'A',
        center: [1, 0, 0],
        continentId: 'c1',
        displayColor: '#fff',
        adjacentTerritoryIds: ['b'],
        ownerId: 'p1',
        armyCount: 4,
        cellCount: 1,
        landmassId: 'land-1',
      },
      {
        id: 'b',
        name: 'B',
        center: [0, 1, 0],
        continentId: 'c1',
        displayColor: '#fff',
        adjacentTerritoryIds: ['a', 'c'],
        ownerId: 'p2',
        armyCount: 2,
        cellCount: 1,
        landmassId: 'land-1',
      },
      {
        id: 'c',
        name: 'C',
        center: [0, 0, 1],
        continentId: 'c2',
        displayColor: '#fff',
        adjacentTerritoryIds: ['b', 'd'],
        ownerId: 'p1',
        armyCount: 3,
        cellCount: 1,
        landmassId: 'land-2',
      },
      {
        id: 'd',
        name: 'D',
        center: [-1, 0, 0],
        continentId: 'c2',
        displayColor: '#fff',
        adjacentTerritoryIds: ['c', 'e'],
        ownerId: 'p1',
        armyCount: 1,
        cellCount: 1,
        landmassId: 'land-2',
      },
      {
        id: 'e',
        name: 'E',
        center: [0, -1, 0],
        continentId: 'c2',
        displayColor: '#fff',
        adjacentTerritoryIds: ['d'],
        ownerId: 'p3',
        armyCount: 1,
        cellCount: 1,
        landmassId: 'land-2',
      },
    ],
    continents: [
      {
        id: 'c1',
        name: 'North',
        territoryIds: ['a', 'b'],
        bonus: 2,
        externalGatewayTerritoryIds: ['b'],
        neighboringContinentIds: ['c2'],
      },
      {
        id: 'c2',
        name: 'South',
        territoryIds: ['c', 'd', 'e'],
        bonus: 4,
        externalGatewayTerritoryIds: ['c'],
        neighboringContinentIds: ['c1'],
      },
    ],
    surfaceCells: [],
    landmasses: [],
    connections: [
      { fromTerritoryId: 'a', toTerritoryId: 'b', type: 'sea-route' },
      { fromTerritoryId: 'b', toTerritoryId: 'c', type: 'land-border' },
      { fromTerritoryId: 'c', toTerritoryId: 'd', type: 'land-border' },
      { fromTerritoryId: 'd', toTerritoryId: 'e', type: 'land-border' },
    ],
    landCoverage: 0.5,
    analysis: {} as PlanetDefinition['analysis'],
  };
}

function attackState(): MatchState {
  return {
    ...createMatch(smallPlanet()),
    phase: 'attack',
    remainingReinforcements: 0,
  };
}

function queuedRng(values: number[]) {
  let index = 0;
  return { integer: () => values[index++] ?? 1 };
}

describe('local match rules', () => {
  it('creates deterministic initial match state', () => {
    const planet = generatePlanet('match-repeatable');
    expect(createMatch(planet)).toEqual(createMatch(planet));
  });

  it('does not mutate PlanetDefinition during actions', () => {
    const planet = smallPlanet();
    const before = structuredClone(planet);
    const state = createMatch(planet);
    gameReducer(planet, state, {
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'a',
      amount: 1,
    });
    expect(planet).toEqual(before);
  });

  it('calculates territory base and fully owned continent bonuses', () => {
    const planet = smallPlanet();
    const state = createMatch(planet);
    state.territories.b = { ownerId: 'p1', armyCount: 2 };
    expect(
      getFullyOwnedContinents(planet, state, 'p1').map((item) => item.id),
    ).toEqual(['c1']);
    expect(calculateReinforcements(planet, state, 'p1')).toMatchObject({
      ownedTerritoryCount: 4,
      territoryBase: 3,
      continentBonus: 2,
      total: 5,
    });
  });

  it('rejects reinforcement on an enemy territory without mutation', () => {
    const planet = smallPlanet();
    const state = createMatch(planet);
    const result = gameReducer(planet, state, {
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'b',
      amount: 1,
    });
    expect(result.error?.code).toBe('NOT_OWNER');
    expect(result.state).toBe(state);
  });

  it('cannot end reinforcement while armies remain', () => {
    const planet = smallPlanet();
    const state = createMatch(planet);
    const result = gameReducer(planet, state, { type: 'END_ATTACK_PHASE' });
    expect(result.error?.code).toBe('REINFORCEMENTS_REMAIN');
  });

  it('requires at least two armies for attack sources', () => {
    const state = attackState();
    expect(getAttackSources(state)).toContain('a');
    expect(getAttackSources(state)).not.toContain('d');
  });

  it('only allows adjacent enemy attack targets', () => {
    const planet = smallPlanet();
    const state = attackState();
    expect(getAttackTargets(planet, state, 'a')).toEqual(['b']);
    const result = gameReducer(planet, state, {
      type: 'ATTACK',
      fromTerritoryId: 'a',
      toTerritoryId: 'e',
      attackDice: 1,
    });
    expect(result.error?.code).toBe('NOT_ADJACENT');
  });

  it('treats sea-route neighbors as valid attack targets', () => {
    const planet = smallPlanet();
    expect(getAttackTargets(planet, attackState(), 'a')).toContain('b');
    expect(planet.connections[0]!.type).toBe('sea-route');
  });

  it('enforces attack dice limits', () => {
    expect(getValidAttackDice(1)).toEqual([]);
    expect(getValidAttackDice(2)).toEqual([1]);
    expect(getValidAttackDice(3)).toEqual([1, 2]);
    expect(getValidAttackDice(7)).toEqual([1, 2, 3]);
  });

  it('gives the defender ties', () => {
    expect(resolveCombat(1, 1, queuedRng([4, 4]))).toMatchObject({
      attackerLosses: 1,
      defenderLosses: 0,
    });
  });

  it('applies combat casualties', () => {
    const planet = smallPlanet();
    const state = attackState();
    const result = gameReducer(
      planet,
      state,
      {
        type: 'ATTACK',
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        attackDice: 2,
      },
      { createCombatRng: () => queuedRng([6, 1, 5, 4]) },
    );
    expect(result.state.territories.a.armyCount).toBe(3);
    expect(result.state.territories.b.armyCount).toBe(1);
  });

  it('captures a territory when its defender reaches zero', () => {
    const planet = smallPlanet();
    const state = attackState();
    state.territories.b = { ownerId: 'p2', armyCount: 1 };
    const result = gameReducer(
      planet,
      state,
      {
        type: 'ATTACK',
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        attackDice: 2,
      },
      { createCombatRng: () => queuedRng([6, 5, 1]) },
    );
    expect(result.state.territories.b.ownerId).toBe('p1');
    expect(result.state.phase).toBe('capture');
    expect(result.state.pendingCapture?.minimumArmies).toBe(2);
  });

  it('enforces the post-capture minimum movement', () => {
    const planet = smallPlanet();
    const state = attackState();
    state.phase = 'capture';
    state.pendingCapture = {
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      minimumArmies: 2,
    };
    state.territories.b = { ownerId: 'p1', armyCount: 0 };
    const result = gameReducer(planet, state, {
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      amount: 1,
    });
    expect(result.error?.code).toBe('INVALID_AMOUNT');
  });

  it('always leaves one army in a post-capture source', () => {
    const planet = smallPlanet();
    const state = attackState();
    state.phase = 'capture';
    state.pendingCapture = {
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      minimumArmies: 2,
    };
    state.territories.b = { ownerId: 'p1', armyCount: 0 };
    const rejected = gameReducer(planet, state, {
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      amount: 4,
    });
    expect(rejected.error?.code).toBe('INVALID_AMOUNT');
    const moved = gameReducer(planet, state, {
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      amount: 3,
    });
    expect(moved.state.territories.a.armyCount).toBe(1);
  });

  it('skips eliminated players in turn order', () => {
    const planet = smallPlanet();
    const state = createMatch(planet);
    state.players.p2.eliminated = true;
    expect(getNextActivePlayer(planet, state)).toBe('p3');
  });

  it('detects victory when one player owns every territory', () => {
    const planet = smallPlanet();
    const state = createMatch(planet);
    for (const territory of Object.values(state.territories))
      territory.ownerId = 'p1';
    expect(checkVictory(planet, state)).toBe('p1');
  });

  it('requires same-owner fortification territories', () => {
    const planet = smallPlanet();
    const state = { ...attackState(), phase: 'fortify' as const };
    const result = gameReducer(planet, state, {
      type: 'FORTIFY',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      amount: 1,
    });
    expect(result.error?.code).toBe('NOT_OWNER');
  });

  it('requires an owned path for fortification', () => {
    const planet = smallPlanet();
    const state = { ...attackState(), phase: 'fortify' as const };
    expect(getFortifyTargets(planet, state, 'a')).toEqual([]);
    const result = gameReducer(planet, state, {
      type: 'FORTIFY',
      fromTerritoryId: 'a',
      toTerritoryId: 'c',
      amount: 1,
    });
    expect(result.error?.code).toBe('NO_OWNED_PATH');
  });

  it('cannot move every army out during fortification', () => {
    const planet = smallPlanet();
    const state = { ...attackState(), phase: 'fortify' as const };
    state.territories.b = { ownerId: 'p1', armyCount: 2 };
    const result = gameReducer(planet, state, {
      type: 'FORTIFY',
      fromTerritoryId: 'a',
      toTerritoryId: 'c',
      amount: 4,
    });
    expect(result.error?.code).toBe('INVALID_AMOUNT');
  });

  it('allows only one fortification per turn', () => {
    const planet = smallPlanet();
    const state = {
      ...attackState(),
      phase: 'fortify' as const,
      fortifiedThisTurn: true,
    };
    state.territories.b = { ownerId: 'p1', armyCount: 2 };
    const result = gameReducer(planet, state, {
      type: 'FORTIFY',
      fromTerritoryId: 'a',
      toTerritoryId: 'c',
      amount: 1,
    });
    expect(result.error?.code).toBe('FORTIFY_ALREADY_USED');
  });

  it('reset restores deterministic initial state', () => {
    const planet = smallPlanet();
    const original = createMatch(planet);
    const changed = gameReducer(planet, original, {
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'a',
      amount: 1,
    }).state;
    expect(gameReducer(planet, changed, { type: 'RESET_MATCH' }).state).toEqual(
      original,
    );
  });

  it('makes combat deterministic for the same seed and action sequence', () => {
    const planet = smallPlanet();
    const state = attackState();
    const action = {
      type: 'ATTACK' as const,
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      attackDice: 2,
    };
    expect(gameReducer(planet, state, action).state).toEqual(
      gameReducer(planet, state, action).state,
    );
  });

  it('does not mutate match state for invalid actions', () => {
    const planet = smallPlanet();
    const state = attackState();
    const before = structuredClone(state);
    const result = gameReducer(planet, state, {
      type: 'ATTACK',
      fromTerritoryId: 'd',
      toTerritoryId: 'e',
      attackDice: 3,
    });
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });

  it('keeps match state serializable and free of rendering objects', () => {
    const state = createMatch(generatePlanet('test-world'));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      expect([Object.prototype, Array.prototype]).toContain(
        Object.getPrototypeOf(value),
      );
      for (const nested of Object.values(value)) visit(nested);
    };
    visit(state);
  });
});
