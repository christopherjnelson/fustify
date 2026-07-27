import { DEFAULT_GENERATOR_VERSION } from '../core/generation/constants';
import { generatePlanet } from '../core/generation/generatePlanet';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import type {
  GenerateHomeWorldRequest,
  GenerateHomeWorldResponse,
} from './homeWorldWorkerProtocol';
import {
  HOME_WORLD_CONTINENT_COUNT,
  HOME_WORLD_PLAYER_COUNT,
  HOME_WORLD_TERRITORY_COUNT,
} from './homeWorldWorkerProtocol';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<GenerateHomeWorldRequest>) => void) | null;
  postMessage: (response: GenerateHomeWorldResponse) => void;
};

workerScope.onmessage = (event) => {
  if (event.data.type !== 'generate-home-world') return;
  const { requestId } = event.data;
  try {
    const seed = event.data.seed ?? generateReadableWorldSeed();
    const planet = generatePlanet(seed, {
      territoryCount: HOME_WORLD_TERRITORY_COUNT,
      continentCount: HOME_WORLD_CONTINENT_COUNT,
      playerCount: HOME_WORLD_PLAYER_COUNT,
      generatorVersion: DEFAULT_GENERATOR_VERSION,
    });
    workerScope.postMessage({
      type: 'home-world-generated',
      requestId,
      planet,
    });
  } catch {
    workerScope.postMessage({
      type: 'home-world-error',
      requestId,
      message: 'That world could not be generated. Try again.',
    });
  }
};
