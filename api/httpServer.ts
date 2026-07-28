import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  accountMutationSchema,
  AdminApiError,
  adminListQuerySchema,
  adminLogQuerySchema,
  type AdminConsole,
  maintenanceMutationSchema,
  roomMutationSchema,
} from './adminService.ts';
import { MatchStartError, startMatchError } from './startMatchService.ts';

const startRequestSchema = z.object({ roomId: z.string().uuid() }).strict();
const MAX_REQUEST_BYTES = 16 * 1024;

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
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

function queryObject(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

async function handleAdminRequest(
  admin: AdminConsole,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  const authorized = await admin.authorize(
    request.headers.authorization ?? null,
  );
  const suppliedRequestId = request.headers['x-request-id'];
  const actor = {
    ...authorized,
    requestId:
      typeof suppliedRequestId === 'string' &&
      z.string().uuid().safeParse(suppliedRequestId).success
        ? suppliedRequestId
        : randomUUID(),
  };
  if (
    request.method === 'POST' &&
    !request.headers['content-type']?.startsWith('application/json')
  ) {
    throw new AdminApiError('invalid_request', 400);
  }
  const accountAction = url.pathname.match(
    /^\/api\/admin\/accounts\/([^/]+)\/(reveal|actions)$/,
  );
  const roomAction = url.pathname.match(
    /^\/api\/admin\/rooms\/([0-9a-f-]+)\/actions$/,
  );

  if (request.method === 'GET' && url.pathname === '/api/admin/overview') {
    sendJson(response, 200, await admin.overview());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/accounts') {
    sendJson(
      response,
      200,
      await admin.accounts(adminListQuerySchema.parse(queryObject(url))),
    );
    return;
  }
  if (
    request.method === 'POST' &&
    accountAction?.[2] === 'reveal' &&
    accountAction[1]
  ) {
    sendJson(
      response,
      200,
      await admin.revealAccount(actor, decodeURIComponent(accountAction[1])),
    );
    return;
  }
  if (
    request.method === 'POST' &&
    accountAction?.[2] === 'actions' &&
    accountAction[1]
  ) {
    sendJson(
      response,
      200,
      await admin.mutateAccount(
        actor,
        decodeURIComponent(accountAction[1]),
        accountMutationSchema.parse(await readJson(request)),
      ),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/rooms') {
    sendJson(
      response,
      200,
      await admin.rooms(adminListQuerySchema.parse(queryObject(url))),
    );
    return;
  }
  if (request.method === 'POST' && roomAction?.[1]) {
    sendJson(
      response,
      200,
      await admin.mutateRoom(
        actor,
        roomAction[1],
        roomMutationSchema.parse(await readJson(request)),
      ),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/logs') {
    sendJson(
      response,
      200,
      await admin.logs(adminLogQuerySchema.parse(queryObject(url))),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/maintenance') {
    sendJson(response, 200, await admin.maintenance());
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === '/api/admin/maintenance/actions'
  ) {
    sendJson(
      response,
      200,
      await admin.mutateMaintenance(
        actor,
        maintenanceMutationSchema.parse(await readJson(request)),
      ),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
    sendJson(
      response,
      200,
      await admin.audit(adminListQuerySchema.parse(queryObject(url))),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/metrics') {
    sendJson(response, 200, await admin.metrics());
    return;
  }
  sendJson(response, 404, { code: 'not_found' });
}

export function createApiServer(service: MatchStarter, admin?: AdminConsole) {
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

      if (url.pathname.startsWith('/api/admin/')) {
        if (!admin) {
          sendJson(response, 503, { code: 'admin_unavailable' });
          return;
        }
        await handleAdminRequest(admin, request, response, url);
        return;
      }

      if (url.pathname !== '/api/multiplayer/start') {
        sendJson(response, 404, { code: 'not_found' });
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
      if (error instanceof AdminApiError) {
        sendJson(response, error.status, { code: error.code });
        return;
      }
      if (error instanceof z.ZodError) {
        sendJson(response, 400, { code: 'invalid_request' });
        return;
      }
      const failure = startMatchError(error);
      sendJson(response, failure.status, { code: failure.code });
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
