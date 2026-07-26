import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const viteOrigin = 'http://127.0.0.1:5173';
let development: ChildProcess | null = null;
let output = '';

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local API port.');
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function waitForHealth(): Promise<Response> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (development?.exitCode !== null) {
      throw new Error(`Development servers stopped early.\n${output}`);
    }
    try {
      const response = await fetch(`${viteOrigin}/api/health`);
      if (response.ok) return response;
    } catch {
      // Both real servers may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Development proxy did not become healthy.\n${output}`);
}

async function stopDevelopment() {
  const child = development;
  development = null;
  if (!child?.pid || child.exitCode !== null) return;
  process.kill(-child.pid, 'SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

afterEach(stopDevelopment);

describe('Vite development API proxy', () => {
  it('routes health and malformed start requests to the real Node API', async () => {
    const apiPort = await availablePort();
    development = spawn(
      'pnpm',
      ['dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
      {
        cwd: process.cwd(),
        detached: true,
        env: {
          ...process.env,
          FUSTIFY_API_PORT: apiPort.toString(),
          SUPABASE_SERVICE_ROLE_KEY: 'integration-service-role',
          VITE_SUPABASE_URL: 'https://example.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_integration',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    development.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    development.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    const health = await waitForHealth();
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });

    const malformed = await fetch(`${viteOrigin}/api/multiplayer/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'not-a-room-id' }),
    });
    expect(malformed.status).toBe(400);
    expect(malformed.status).not.toBe(404);
    await expect(malformed.json()).resolves.toEqual({
      code: 'invalid_request',
    });
  });
});
