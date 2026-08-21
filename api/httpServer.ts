import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { z } from 'zod';
import { MatchStartError, startMatchError } from './startMatchService.ts';

const startRequestSchema = z.object({ roomId: z.string().uuid() }).strict();
const MAX_REQUEST_BYTES = 16 * 1024;

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new MatchStartError('request_too_large', 413);
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new MatchStartError('invalid_request', 400);
  }
}

export interface MatchStarter {
  start(authorization: string | null, roomId: string): Promise<unknown>;
}

export type NodeRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

export type FallbackRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) => boolean | Promise<boolean>;

export function createApiServer(
  service?: MatchStarter,
  authHandler?: NodeRequestHandler,
  fallbackHandler?: FallbackRequestHandler,
  applicationHandler?: FallbackRequestHandler,
) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET') {
          sendJson(response, 405, { code: 'method_not_allowed' });
          return;
        }
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (
        authHandler &&
        (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/'))
      ) {
        await authHandler(request, response);
        return;
      }

      if (
        applicationHandler &&
        url.pathname.startsWith('/api/') &&
        (await applicationHandler(request, response, url))
      ) {
        return;
      }

      if (url.pathname !== '/api/multiplayer/start') {
        if (
          !url.pathname.startsWith('/api/') &&
          fallbackHandler &&
          (await fallbackHandler(request, response, url))
        ) {
          return;
        }
        sendJson(response, 404, { code: 'not_found' });
        return;
      }
      if (!service) {
        sendJson(response, 503, { code: 'multiplayer_unavailable' });
        return;
      }
      if (request.method !== 'POST') {
        sendJson(response, 405, { code: 'method_not_allowed' });
        return;
      }
      if (!request.headers['content-type']?.startsWith('application/json')) {
        throw new MatchStartError('invalid_request', 400);
      }

      const parsed = startRequestSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        throw new MatchStartError('invalid_request', 400);
      }
      const match = await service.start(
        request.headers.authorization ?? null,
        parsed.data.roomId,
      );
      sendJson(response, 200, { match });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendJson(response, 400, { code: 'invalid_request' });
        return;
      }
      const failure = startMatchError(error);
      if (failure.code === 'multiplayer_request_failed') {
        console.error('Unhandled Fustify API request failure.', error);
      }
      sendJson(response, failure.status, { code: failure.code });
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
