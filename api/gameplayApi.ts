import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { readJson, sendJson } from './httpServer.ts';
import {
  GameplayCommandError,
  type PostgresGameplayService,
} from './gameplayService.ts';

const commandSchema = z
  .object({
    operation: z.literal('command'),
    matchId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().uuid(),
    action: z.unknown(),
  })
  .strict();

export class GameplayApi {
  constructor(private readonly service: PostgresGameplayService) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (url.pathname !== '/api/multiplayer/command') return false;
    if (request.method !== 'POST') {
      sendJson(response, 405, { code: 'method_not_allowed' });
      return true;
    }
    try {
      const body = commandSchema.parse(await readJson(request));
      sendJson(
        response,
        200,
        await this.service.command(request.headers.authorization ?? null, body),
      );
    } catch (error) {
      if (error instanceof GameplayCommandError) {
        sendJson(response, error.status, {
          code: error.code,
          ...(error.gameError ? { gameError: error.gameError } : {}),
        });
      } else if (error instanceof z.ZodError) {
        sendJson(response, 400, { code: 'invalid_request' });
      } else {
        throw error;
      }
    }
    return true;
  }
}
