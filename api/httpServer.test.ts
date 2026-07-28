import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminApiError,
  type AdminConsole,
  redactAdminLogMessage,
} from './adminService.ts';
import { createApiServer, type MatchStarter } from './httpServer.ts';
import { MatchStartError } from './startMatchService.ts';

const roomId = '10000000-0000-4000-8000-000000000001';
const servers: ReturnType<typeof createApiServer>[] = [];

async function listen(starter: MatchStarter, admin?: AdminConsole) {
  const server = createApiServer(starter, admin);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port.toString()}`;
}

function adminConsole(overrides: Partial<AdminConsole> = {}): AdminConsole {
  return {
    authorize: vi.fn(async () => ({ userId: roomId })),
    overview: vi.fn(async () => ({ health: { database_bytes: 1 } })),
    accounts: vi.fn(async () => ({ accounts: [] })),
    revealAccount: vi.fn(async () => ({ userId: roomId })),
    mutateAccount: vi.fn(async () => ({ ok: true })),
    rooms: vi.fn(async () => ({ rooms: [] })),
    mutateRoom: vi.fn(async () => ({ ok: true })),
    logs: vi.fn(async () => ({ configured: true, entries: [] })),
    maintenance: vi.fn(async () => ({ health: {} })),
    mutateMaintenance: vi.fn(async () => ({ retried: true })),
    audit: vi.fn(async () => ({ entries: [] })),
    metrics: vi.fn(async () => ({ aggregates: {} })),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe('localhost Node API', () => {
  it('serves a fast health response', async () => {
    const start = vi.fn();
    const origin = await listen({ start });

    const response = await fetch(`${origin}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(start).not.toHaveBeenCalled();
  });

  it('passes the bearer token and validated room ID to match start', async () => {
    const match = { id: '40000000-0000-4000-8000-000000000004' };
    const start = vi.fn(async () => match);
    const origin = await listen({ start });

    const response = await fetch(`${origin}/api/multiplayer/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer registered',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ match });
    expect(start).toHaveBeenCalledWith('Bearer registered', roomId);
  });

  it('returns stable API errors for authorization and malformed input', async () => {
    const start = vi.fn(async () => {
      throw new MatchStartError('host_only', 403);
    });
    const origin = await listen({ start });

    const forbidden = await fetch(`${origin}/api/multiplayer/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({ code: 'host_only' });

    const malformed = await fetch(`${origin}/api/multiplayer/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'not-a-room', extra: true }),
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      code: 'invalid_request',
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('keeps health responsive while initialization is blocked off the request path', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = vi.fn(async () => {
      await blocked;
      return { id: '40000000-0000-4000-8000-000000000004' };
    });
    const origin = await listen({ start });
    const pending = fetch(`${origin}/api/multiplayer/start`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer registered',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomId }),
    });
    await vi.waitFor(() => expect(start).toHaveBeenCalled());

    const startedAt = performance.now();
    const health = await fetch(`${origin}/api/health`);
    expect(health.status).toBe(200);
    expect(performance.now() - startedAt).toBeLessThan(250);

    release();
    expect((await pending).status).toBe(200);
  });

  it('authorizes every admin request before loading privileged data', async () => {
    const overview = vi.fn(async () => ({ health: {} }));
    const authorize = vi.fn(async () => {
      throw new AdminApiError('admin_access_denied', 403);
    });
    const origin = await listen(
      { start: vi.fn() },
      adminConsole({ authorize, overview }),
    );

    const response = await fetch(`${origin}/api/admin/overview`, {
      headers: { Authorization: 'Bearer ordinary-user' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'admin_access_denied',
    });
    expect(authorize).toHaveBeenCalledWith('Bearer ordinary-user');
    expect(overview).not.toHaveBeenCalled();
  });

  it('validates and routes bounded admin queries and mutations', async () => {
    const accounts = vi.fn(async () => ({ accounts: [] }));
    const mutateRoom = vi.fn(async () => ({ changed: true }));
    const admin = adminConsole({ accounts, mutateRoom });
    const origin = await listen({ start: vi.fn() }, admin);

    const listed = await fetch(
      `${origin}/api/admin/accounts?page=2&limit=50&status=banned`,
      { headers: { Authorization: 'Bearer administrator' } },
    );
    expect(listed.status).toBe(200);
    expect(accounts).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      search: '',
      status: 'banned',
      provider: '',
      confirmation: 'all',
    });

    const changed = await fetch(`${origin}/api/admin/rooms/${roomId}/actions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer administrator',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'force-close',
        reason: 'Recover a stuck launch',
        confirmation: 'Room name',
        idempotencyKey: '20000000-0000-4000-8000-000000000002',
      }),
    });
    expect(changed.status).toBe(200);
    expect(mutateRoom).toHaveBeenCalledWith(
      expect.objectContaining({ userId: roomId }),
      roomId,
      expect.objectContaining({ action: 'force-close' }),
    );
  });

  it('rejects malformed admin mutations before invoking the action', async () => {
    const mutateAccount = vi.fn();
    const origin = await listen(
      { start: vi.fn() },
      adminConsole({ mutateAccount }),
    );

    const response = await fetch(
      `${origin}/api/admin/accounts/${roomId}/actions`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer administrator',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'soft-delete',
          reason: 'x',
          idempotencyKey: 'not-a-uuid',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(mutateAccount).not.toHaveBeenCalled();
  });

  it('redacts PII and credentials from curated log messages', () => {
    expect(
      redactAdminLogMessage(
        'user person@example.com from 203.0.113.4 id 10000000-0000-4000-8000-000000000001 Authorization Bearer abc.def?token=secret',
      ),
    ).toBe(
      'user [email] from [ip] id [id] Authorization Bearer [redacted]?[redacted]',
    );
    expect(
      redactAdminLogMessage(
        'connect 2001:db8:85a3::8a2e:370:7334 password=hunter2 /room?seed=private&mode=fast',
      ),
    ).toBe('connect [ip] password=[redacted] /room?[redacted]');
  });
});
