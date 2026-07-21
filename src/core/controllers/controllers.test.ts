import { describe, expect, it } from 'vitest';
import { fixtureMatch, fixturePlanet } from '../game/testFixtures';
import { gameReducer } from '../game/gameReducer';
import type { MatchState } from '../game/types';
import {
  controllerDecisionSeed,
  createGameObservation,
  getLegalGameCommands,
  heuristicController,
  type ControllerContext,
} from '.';

function context(
  observation: ReturnType<typeof createGameObservation>,
  decisionIndex = 0,
): ControllerContext {
  return {
    controllerType: 'heuristic-bot',
    controllerVersion: heuristicController.version,
    decisionIndex,
    decisionSeed: controllerDecisionSeed(observation, decisionIndex),
  };
}

async function choose(
  planet: ReturnType<typeof fixturePlanet>,
  state: MatchState,
) {
  const observation = createGameObservation(planet, state);
  return heuristicController.chooseAction(
    observation,
    getLegalGameCommands(planet, state),
    context(observation),
  );
}

describe('controller boundary', () => {
  it('creates a detached immutable observation', () => {
    const planet = fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'land-border']],
      owners: ['p1', 'p2'],
      armies: [3, 1],
    });
    const state = fixtureMatch(planet);
    const observation = createGameObservation(planet, state);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.territories.a)).toBe(true);
    expect(() => {
      (observation.territories.a as { armyCount: number }).armyCount = 999;
    }).toThrow();
    expect(state.territories.a!.armyCount).toBe(3);
  });

  it('enumerates commands that the reducer validates again', () => {
    const planet = fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'land-border']],
      owners: ['p1', 'p2'],
      armies: [4, 2],
    });
    const state = fixtureMatch(planet, {
      phase: 'attack',
      remainingReinforcements: 0,
    });
    const legal = getLegalGameCommands(planet, state);
    expect(legal).toContainEqual({ type: 'END_ATTACK_PHASE' });
    expect(legal).toContainEqual({
      type: 'ATTACK',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
      attackDice: 3,
    });
    const snapshot = structuredClone(state);
    const rejected = gameReducer(planet, state, {
      type: 'ATTACK',
      fromTerritoryId: 'b',
      toTerritoryId: 'a',
      attackDice: 3,
    });
    expect(rejected.error).not.toBeNull();
    expect(rejected.state).toBe(state);
    expect(state).toEqual(snapshot);
  });
});

describe('balanced heuristic controller', () => {
  it('reinforces the threatened frontier instead of a safe interior', async () => {
    const planet = fixturePlanet({
      ids: ['a', 'b', 'c'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
      ],
      owners: ['p1', 'p1', 'p2'],
      armies: [2, 1, 5],
    });
    await expect(choose(planet, fixtureMatch(planet))).resolves.toMatchObject({
      type: 'PLACE_REINFORCEMENT',
      territoryId: 'b',
    });
  });

  it('prefers a favorable attack and rejects a clearly poor one', async () => {
    const favorable = fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'land-border']],
      owners: ['p1', 'p2'],
      armies: [8, 1],
    });
    const favorableState = fixtureMatch(favorable, {
      phase: 'attack',
      remainingReinforcements: 0,
    });
    await expect(choose(favorable, favorableState)).resolves.toMatchObject({
      type: 'ATTACK',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
    });

    const poor = fixturePlanet({
      ids: ['a', 'b'],
      edges: [['a', 'b', 'land-border']],
      owners: ['p1', 'p2'],
      armies: [2, 9],
    });
    await expect(
      choose(
        poor,
        fixtureMatch(poor, { phase: 'attack', remainingReinforcements: 0 }),
      ),
    ).resolves.toEqual({ type: 'END_ATTACK_PHASE' });
  });

  it('fortifies from a safe interior territory toward the frontier', async () => {
    const planet = fixturePlanet({
      ids: ['a', 'b', 'c'],
      edges: [
        ['a', 'b', 'land-border'],
        ['b', 'c', 'land-border'],
      ],
      owners: ['p1', 'p1', 'p2'],
      armies: [6, 1, 4],
    });
    await expect(
      choose(
        planet,
        fixtureMatch(planet, {
          phase: 'fortify',
          remainingReinforcements: 0,
        }),
      ),
    ).resolves.toMatchObject({
      type: 'FORTIFY',
      fromTerritoryId: 'a',
      toTerritoryId: 'b',
    });
  });

  it('is deterministic while match seeds can vary equal-score tie breaks', async () => {
    const planet = fixturePlanet({
      ids: ['a', 'b', 'c', 'd'],
      edges: [
        ['a', 'c', 'land-border'],
        ['b', 'd', 'land-border'],
      ],
      owners: ['p1', 'p1', 'p2', 'p2'],
      armies: [2, 2, 2, 2],
    });
    const base = fixtureMatch(planet);
    const first = await choose(planet, base);
    await expect(choose(planet, base)).resolves.toEqual(first);
    const destinations = new Set<string>();
    for (let index = 0; index < 16; index += 1) {
      const state = { ...base, seed: `tie-seed-${index}` };
      const command = await choose(planet, state);
      if (command.type === 'PLACE_REINFORCEMENT') {
        destinations.add(command.territoryId);
      }
    }
    expect(destinations.size).toBeGreaterThan(1);
  });
});
