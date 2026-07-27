import type { PlanetDefinition } from '../core/types/planet';
import type { GenerateHomeWorldResponse } from './homeWorldWorkerProtocol';

export interface HomeWorldPreviewState {
  phase: 'generating' | 'ready' | 'error';
  activeRequestId: number;
  planet: PlanetDefinition | null;
  message: string;
}

export interface HomeWorldRevealState {
  active: boolean;
  reducedMotion: boolean;
  interacted: boolean;
  elapsedSeconds: number;
  durationSeconds: number;
}

export function shouldAdvanceHomeWorldReveal({
  active,
  reducedMotion,
  interacted,
  elapsedSeconds,
  durationSeconds,
}: HomeWorldRevealState): boolean {
  return (
    active && !reducedMotion && !interacted && elapsedSeconds < durationSeconds
  );
}

export function initialHomeWorldPreviewState(): HomeWorldPreviewState {
  return {
    phase: 'generating',
    activeRequestId: 0,
    planet: null,
    message: 'Forging world…',
  };
}

export function beginHomeWorldRequest(
  state: HomeWorldPreviewState,
  requestId: number,
): HomeWorldPreviewState {
  return {
    ...state,
    phase: 'generating',
    activeRequestId: requestId,
    message: state.planet ? 'Generating a new world…' : 'Forging world…',
  };
}

export function resolveHomeWorldResponse(
  state: HomeWorldPreviewState,
  response: GenerateHomeWorldResponse,
): HomeWorldPreviewState {
  if (response.requestId !== state.activeRequestId) return state;
  if (response.type === 'home-world-error') {
    return {
      ...state,
      phase: 'error',
      message: response.message,
    };
  }
  return {
    phase: 'ready',
    activeRequestId: state.activeRequestId,
    planet: response.planet,
    message: `World ready: ${response.planet.seed}.`,
  };
}

export function failHomeWorldRequest(
  state: HomeWorldPreviewState,
  requestId: number,
  message = 'The globe preview could not be generated.',
): HomeWorldPreviewState {
  if (requestId !== state.activeRequestId) return state;
  return {
    ...state,
    phase: 'error',
    message,
  };
}
