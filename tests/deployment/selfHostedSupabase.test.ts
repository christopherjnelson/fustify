import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');
const deploymentRoot = resolve(projectRoot, 'deployment/self-hosted-supabase');

async function source(name: string) {
  return readFile(resolve(deploymentRoot, name), 'utf8');
}

describe('self-hosted Supabase deployment bundle', () => {
  it('pins an immutable reviewed upstream release and PostgreSQL 17 stack', async () => {
    await expect(source('VERSION')).resolves.toBe(
      'self-hosted/v0.8.0\n241bb11c0627f2981746d37033f57dbfa81d29b0\n',
    );
    const installer = await source('install.sh');
    expect(installer).toContain('checkout --quiet "${commit}"');
    expect(installer).toContain('if [[ "${resolved}" != "${commit}" ]]');
    expect(installer).not.toContain('--branch master');
  });

  it('exposes only the TLS proxy and keeps database ports on loopback', async () => {
    const compose = await source('docker-compose.fustify.yml');
    expect(compose).toContain('ports: !override []');
    expect(compose).toContain('127.0.0.1:${POSTGRES_PORT}:5432');
    expect(compose).not.toContain('./volumes/db/custom:/etc/postgresql-custom');
    expect(compose).toContain('service_completed_successfully');
    expect(compose).toContain('fustify-apply-migrations.sh');
    expect(compose).toContain('./volumes/fustify-src:/home/deno/src:ro');
    expect(compose).toContain('80:80');
    expect(compose).toContain('443:443');
    expect(compose).not.toContain('reverse_proxy');
    await expect(source('Caddyfile.fustify')).resolves.toContain(
      'reverse_proxy api-gw:8000',
    );
  });

  it('ships every authoritative Edge Function without adding browser secrets', async () => {
    const installer = await source('install.sh');
    for (const functionName of [
      'announce-public-room',
      'complete-discord-profile',
      'multiplayer-game',
    ]) {
      expect(installer).toContain(functionName);
    }
    const environment = await source('fustify.env.example');
    expect(environment).toContain('DISCORD_CLIENT_SECRET=replace_');
    expect(environment).not.toMatch(/VITE_.*(?:SECRET|SERVICE_ROLE)/);
    expect(installer).toContain('supabase/migrations/*.sql');
  });

  it('requires explicit confirmations for restore and apply-mode storage copy', async () => {
    await expect(source('restore-platform.sh')).resolves.toContain(
      'FUSTIFY_PLATFORM_RESTORE_CONFIRMATION:-}',
    );
    await expect(source('restore-backup.sh')).resolves.toContain(
      'FUSTIFY_RESTORE_CONFIRMATION:-}',
    );
    await expect(source('copy-storage.sh')).resolves.toContain(
      'FUSTIFY_STORAGE_COPY_APPLY:-0',
    );
  });

  it('keeps operator scripts executable', async () => {
    for (const name of [
      'install.sh',
      'validate.sh',
      'sync-functions.sh',
      'apply-migrations.sh',
      'verify-runtime.sh',
      'backup.sh',
      'restore-backup.sh',
      'export-platform.sh',
      'restore-platform.sh',
      'copy-storage.sh',
    ]) {
      const path = resolve(deploymentRoot, name);
      await access(path, constants.X_OK);
      expect((await stat(path)).isFile()).toBe(true);
    }
  });
});
