import { createMatch } from '../src/core/game/createMatch.ts';
import { generatePlanet } from '../src/core/generation/generatePlanet.ts';
import { generateStartingPosition } from '../src/core/setup/startingPositions.ts';
import type { LocalPlayerConfig } from '../src/core/setup/playerConfig.ts';
import { sha256Fingerprint } from '../src/multiplayer/gameProtocol.ts';

const LOCAL_INITIALIZATION_BUDGET_MS = 1_800;

const preservedFingerprints = new Map([
  ['42:2', '37bb754fa732869a2bb461f41d3e919306672fc743faf2bb3283b9a146b6f1ff'],
  ['42:5', '6a56a922d19bb0729b0cef9f9f250bab4449aa8023681b8ea633a25f3fdf77a7'],
  ['48:2', '7376d94096a1cf170ac3eaf07dc5fa33b909f710916c78a826aefcb9523edfc3'],
  ['48:5', '9c266e3183187d816d8e8b696d1f57d159dba769061ac3262bfbddb90a17518b'],
]);

function players(playerCount: number): LocalPlayerConfig[] {
  return Array.from({ length: playerCount }, (_, index) => ({
    id: `player-${String(index + 1).padStart(2, '0')}`,
    name: `Player ${index + 1}`,
    colorId: `color-${index + 1}`,
    seatIndex: index,
    controllerType: 'local-human',
  }));
}

const results: Array<Record<string, number | string>> = [];

for (const territoryCount of [42, 48]) {
  for (const playerCount of [2, 3, 4, 5]) {
    const continentCount = 5;
    const seed = `edge-limit-profile-${territoryCount}-${playerCount}`;
    const playerConfigs = players(playerCount);
    let started = performance.now();
    const planet = generatePlanet(seed, {
      territoryCount,
      continentCount,
      playerCount,
      generatorVersion: 4,
    });
    const planetMs = performance.now() - started;

    started = performance.now();
    const startingPosition = generateStartingPosition(planet, playerConfigs, 0);
    const startingPositionMs = performance.now() - started;
    const setup = {
      players: playerConfigs,
      assignmentMode: 'random' as const,
      ownershipVariant: 0,
      setupPhase: 'ready' as const,
      startingPosition,
      draft: null,
    };
    started = performance.now();
    const state = {
      ...createMatch(planet, setup, {
        matchSeed: `${seed}|multiplayer|00000000-0000-4000-8000-000000000001`,
      }),
      matchId: '00000000-0000-4000-8000-000000000002',
    };
    const stateCreationMs = performance.now() - started;
    started = performance.now();
    const stateFingerprint = await sha256Fingerprint(state);
    const fingerprintMs = performance.now() - started;
    const initializationMs =
      planetMs + startingPositionMs + stateCreationMs + fingerprintMs;

    const expectedFingerprint = preservedFingerprints.get(
      `${territoryCount}:${playerCount}`,
    );
    if (expectedFingerprint && stateFingerprint !== expectedFingerprint) {
      throw new Error(
        `State fingerprint changed for ${territoryCount} territories and ${playerCount} players.`,
      );
    }
    if (initializationMs >= LOCAL_INITIALIZATION_BUDGET_MS) {
      throw new Error(
        `Match initialization exceeded the ${LOCAL_INITIALIZATION_BUDGET_MS}ms local regression budget for ${territoryCount} territories and ${playerCount} players: ${initializationMs.toFixed(1)}ms.`,
      );
    }

    results.push({
      territories: territoryCount,
      players: playerCount,
      planetMs: Number(planetMs.toFixed(1)),
      startingPositionMs: Number(startingPositionMs.toFixed(1)),
      stateCreationMs: Number(stateCreationMs.toFixed(1)),
      fingerprintMs: Number(fingerprintMs.toFixed(1)),
      initializationMs: Number(initializationMs.toFixed(1)),
      stateFingerprint,
    });
  }
}

const denoVersion = (
  globalThis as typeof globalThis & {
    Deno?: { version?: { deno?: string } };
  }
).Deno?.version?.deno;
const nodeVersion = (
  globalThis as typeof globalThis & {
    process?: { versions?: { node?: string } };
  }
).process?.versions?.node;
console.log(
  `Authoritative initialization profile (${denoVersion ? `Deno ${denoVersion}` : `Node ${nodeVersion ?? 'unknown'}`}; local budget ${LOCAL_INITIALIZATION_BUDGET_MS}ms)`,
);
console.table(results);
