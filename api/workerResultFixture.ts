import { parentPort, type MessagePort, workerData } from 'node:worker_threads';
import type { AuthoritativeMatchInitialization } from '../src/multiplayer/authoritativeEngine.ts';

const input = workerData as {
  initialized: AuthoritativeMatchInitialization;
  resultPort: MessagePort;
};

parentPort?.postMessage({ type: 'runtime-control-message' });
input.resultPort.postMessage({ ok: true, initialized: input.initialized });
input.resultPort.close();
