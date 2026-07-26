import { type MessagePort, workerData } from 'node:worker_threads';
import {
  createAuthoritativeMatch,
  type ClaimedSeat,
} from '../src/multiplayer/authoritativeEngine.ts';
import type { AuthoritativeRoom } from './startMatchService.ts';

interface InitializationWorkerData {
  matchId: string;
  room: AuthoritativeRoom;
  claimedSeats: ClaimedSeat[];
  resultPort: MessagePort;
}

const input = workerData as InitializationWorkerData;

try {
  const initialized = await createAuthoritativeMatch(
    input.matchId,
    input.room,
    input.claimedSeats,
  );
  input.resultPort.postMessage({ ok: true, initialized });
} catch (error) {
  input.resultPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  });
} finally {
  input.resultPort.close();
}
