import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const notifyScript = resolve(
  import.meta.dirname,
  '../../deployment/notify.mjs',
);
const temporaryRoots: string[] = [];

async function runNotification(
  event: 'success' | 'failure' | 'cleanup-failure' | 'changelog',
  environment: NodeJS.ProcessEnv,
) {
  const root = await mkdtemp(join(tmpdir(), 'fustify-notify-request-'));
  temporaryRoots.push(root);
  const requestLog = join(root, 'request.json');
  const fetchMock = join(root, 'fetch-mock.mjs');
  await writeFile(
    fetchMock,
    `import { writeFile } from 'node:fs/promises';
globalThis.fetch = async (url, options) => {
  await writeFile(process.env.FAKE_REQUEST_LOG, JSON.stringify({
    url,
    content: JSON.parse(options.body).content,
  }));
  return { ok: true, status: 204 };
};
`,
  );
  const child = spawn(
    process.execPath,
    [
      notifyScript,
      event,
      'a'.repeat(40),
      'test stage',
      'succeeded',
      'test checks',
      event === 'changelog'
        ? '- `aaaaaaa` Newly deployed commit'
        : 'Test summary',
    ],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=${fetchMock}`,
        FAKE_REQUEST_LOG: requestLog,
        DISCORD_ADMIN_WEBHOOK_URL: 'https://discord.test/admin',
        DISCORD_CHANGELOG_WEBHOOK_URL: 'https://discord.test/changelog',
        ...environment,
      },
      stdio: 'pipe',
    },
  );
  const status = await new Promise<number | null>((resolveExit) =>
    child.on('exit', resolveExit),
  );
  let request: { url: string; content: string } | undefined;
  try {
    request = JSON.parse(await readFile(requestLog, 'utf8'));
  } catch {
    // A missing webhook must exit before fetch.
  }
  return { status, requests: request ? [request] : [] };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe('deployment Discord notification routing', () => {
  it.each(['success', 'failure', 'cleanup-failure'] as const)(
    'routes %s operational status only to the admin webhook',
    async (event) => {
      const result = await runNotification(event, {});
      expect(result.status).toBe(0);
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0]?.url).toBe('https://discord.test/admin');
      const expectedStatus = {
        success: 'deployment succeeded',
        failure: 'deployment failed',
        'cleanup-failure': 'deployed with cleanup failure',
      }[event];
      expect(result.requests[0]?.content).toContain(expectedStatus);
    },
  );

  it('routes only the deployed commit changelog to the changelog webhook', async () => {
    const result = await runNotification('changelog', {});
    expect(result.status).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.url).toBe('https://discord.test/changelog');
    expect(result.requests[0]?.content).toContain('Newly deployed commit');
    expect(result.requests[0]?.content).not.toContain('deployment succeeded');
  });

  it('does not fall back to changelog when the admin webhook is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fustify-notify-test-'));
    temporaryRoots.push(root);
    const config = join(root, 'deploy.env');
    await writeFile(
      config,
      'DISCORD_CHANGELOG_WEBHOOK_URL=http://127.0.0.1:1/changelog\n',
    );
    await chmod(config, 0o600);
    const result = await runNotification('failure', {
      FUSTIFY_DEPLOY_ENV: config,
      DISCORD_ADMIN_WEBHOOK_URL: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.requests).toHaveLength(0);
  });

  it('does not redirect changelog content to admin when changelog is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fustify-notify-test-'));
    temporaryRoots.push(root);
    const config = join(root, 'deploy.env');
    await writeFile(
      config,
      'DISCORD_ADMIN_WEBHOOK_URL=http://127.0.0.1:1/admin\n',
    );
    await chmod(config, 0o600);
    const result = await runNotification('changelog', {
      FUSTIFY_DEPLOY_ENV: config,
      DISCORD_CHANGELOG_WEBHOOK_URL: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.requests).toHaveLength(0);
  });
});
