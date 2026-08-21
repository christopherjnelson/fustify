import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiServer, type MatchStarter } from './httpServer.ts';
import { MatchStartError } from './startMatchService.ts';

const roomId = '10000000-0000-4000-8000-000000000001';
const servers: ReturnType<typeof createApiServer>[] = [];

async function listen(starter: MatchStarter) {
  const server = createApiServer(starter);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port.toString()}`;
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
});
