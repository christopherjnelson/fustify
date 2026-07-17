import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../generation/generatePlanet';
import { createMatch } from '../game/createMatch';
import { createDefaultPlayerConfigs } from './playerConfig';
import {
  createMatchSetup,
  generateStartingPosition,
  startingArmyTotal,
} from './startingPositions';

const planet = generatePlanet('starting-position-tests');
const players = createDefaultPlayerConfigs(4);

describe('deterministic starting positions', () => {
  it('reproduces the same selected candidate', () => {
    expect(generateStartingPosition(planet, players, 3)).toEqual(
      generateStartingPosition(planet, players, 3),
    );
  });

  it('rerolls ownership without changing geography', () => {
    const beforeCenters = planet.territories.map(
      (territory) => territory.center,
    );
    const first = generateStartingPosition(planet, players, 0);
    const rerolled = generateStartingPosition(planet, players, 1);
    expect(rerolled.territories).not.toEqual(first.territories);
    expect(planet.territories.map((territory) => territory.center)).toEqual(
      beforeCenters,
    );
  });

  it('assigns every territory once with at least one army', () => {
    const position = generateStartingPosition(planet, players, 0);
    expect(Object.keys(position.territories)).toHaveLength(
      planet.territoryCount,
    );
    expect(
      Object.values(position.territories).every((item) => item.armyCount >= 1),
    ).toBe(true);
  });

  it('balances territory and army totals', () => {
    const position = generateStartingPosition(planet, players, 0);
    const territoryCounts = position.analysis.players.map(
      (item) => item.territoryCount,
    );
    const armyCounts = position.analysis.players.map((item) => item.armyCount);
    expect(
      Math.max(...territoryCounts) - Math.min(...territoryCounts),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...armyCounts) - Math.min(...armyCounts),
    ).toBeLessThanOrEqual(1);
    expect(armyCounts).toEqual(
      players.map(() => startingArmyTotal(players.length)),
    );
  });

  it('reports bounded, serializable balance analysis', () => {
    const analysis = generateStartingPosition(planet, players, 2).analysis;
    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.overallScore).toBeLessThanOrEqual(100);
    expect(JSON.parse(JSON.stringify(analysis))).toEqual(analysis);
    expect(JSON.stringify(analysis)).not.toContain('Object3D');
  });

  it('selects candidates deterministically and rejects impossible counts', () => {
    const selected = generateStartingPosition(planet, players, 4);
    expect(selected.candidateIndex).toBeGreaterThanOrEqual(0);
    expect(selected.candidateIndex).toBeLessThan(32);
    expect(() => generateStartingPosition(planet, players, 4, 0)).toThrow();
  });

  it('creates a match from the preview without recomputing ownership', () => {
    const setup = createMatchSetup(planet, players, 5);
    const match = createMatch(planet, setup);
    expect(match.territories).toEqual(setup.startingPosition.territories);
    expect(match.activePlayerId).toBe(players[0]!.id);
  });
});
