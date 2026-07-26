import { MessageChannel, Worker, type MessagePort } from 'node:worker_threads';
import type {
  AuthoritativeMatchInitialization,
  ClaimedSeat,
} from '../src/multiplayer/authoritativeEngine.ts';
import type {
  AuthoritativeInitializer,
  AuthoritativeRoom,
} from './startMatchService.ts';

interface InitializerWorkerInput {
  matchId: string;
  room: AuthoritativeRoom;
  claimedSeats: ClaimedSeat[];
}

interface WorkerResultChannel {
  resultPort: MessagePort;
}

export function runInitializerWorker<T extends InitializerWorkerInput>(
  workerEntry: URL,
  input: T,
  execArgv: string[],
): Promise<AuthoritativeMatchInitialization> {
  return new Promise((resolve, reject) => {
    const { port1: resultPort, port2: workerResultPort } = new MessageChannel();
    const workerData: InitializerWorkerInput & WorkerResultChannel = {
      ...input,
      resultPort: workerResultPort,
    };
    const worker = new Worker(workerEntry, {
      workerData,
      transferList: [workerResultPort],
      execArgv,
    });
    let settled = false;
    const finish = () => {
      resultPort.close();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    };
    resultPort.once('message', (message: unknown) => {
      if (settled) return;
      if (
        typeof message === 'object' &&
        message !== null &&
        'ok' in message &&
        message.ok === true &&
        'initialized' in message
      ) {
        settled = true;
        finish();
        resolve(message.initialized as AuthoritativeMatchInitialization);
        return;
      }
      const detail =
        typeof message === 'object' &&
        message !== null &&
        'ok' in message &&
        message.ok === false &&
        'message' in message &&
        typeof message.message === 'string'
          ? message.message
          : 'multiplayer_request_failed';
      fail(new Error(detail));
    });
    resultPort.once('messageerror', fail);
    worker.once('error', fail);
    worker.once('exit', (code) => {
      if (code !== 0) fail(new Error('multiplayer_request_failed'));
      else if (!settled)
        setImmediate(() => fail(new Error('multiplayer_request_failed')));
    });
  });
}

export const runAuthoritativeInitializer: AuthoritativeInitializer = (
  matchId: string,
  room: AuthoritativeRoom,
  claimedSeats: ClaimedSeat[],
) => {
  const workerEntry = import.meta.url.endsWith('.ts')
    ? './initializerWorker.ts'
    : './initializer-worker.mjs';
  const workerExecArguments = import.meta.url.endsWith('.ts')
    ? ['--import', 'tsx']
    : [];
  return runInitializerWorker(
    new URL(workerEntry, import.meta.url),
    { matchId, room, claimedSeats },
    workerExecArguments,
  );
};
