import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');
const deploymentRoot = resolve(projectRoot, 'deployment/lan');

async function source(name: string) {
  return readFile(resolve(deploymentRoot, name), 'utf8');
}

describe('Fustify LAN deployment bundle', () => {
  it('routes the application and Supabase through one public gateway', async () => {
    const caddy = await source('Caddyfile');
    expect(caddy).toContain('reverse_proxy fustify-api:8787');
    expect(caddy).toContain('reverse_proxy api-gw:8000');
    expect(caddy).toContain('/realtime/v1/*');
    expect(caddy).toContain('/functions/v1/*');

    const compose = await source('compose.yaml');
    expect(compose).toContain('${FUSTIFY_LAN_PORT:-8080}:8080');
    expect(compose).toContain('ports: !override []');
    expect(compose).toContain(
      'docker-entrypoint.sh:/docker-entrypoint.sh:ro,Z',
    );
    expect(compose).toContain(
      '127.0.0.1:${FUSTIFY_LAN_POSTGRES_PORT:-15432}:5432',
    );
    expect(compose).not.toContain('/etc/postgresql-custom');
    expect(compose).toContain('service_completed_successfully');
    expect(compose).toContain(
      'fustify-apply-migrations.sh:/fustify/apply-migrations.sh:ro,Z',
    );
    expect(compose).not.toContain('443:443');
  });

  it('uses generated public and server keys at the correct trust boundaries', async () => {
    const compose = await source('compose.yaml');
    expect(compose).toContain(
      "SUPABASE_PUBLISHABLE_KEY: '${SUPABASE_PUBLISHABLE_KEY}'",
    );
    expect(compose).toContain("SUPABASE_SECRET_KEY: '${SUPABASE_SECRET_KEY}'");

    const dockerfile = await source('Dockerfile');
    expect(dockerfile).toContain('VITE_SUPABASE_URL=same-origin');
    expect(dockerfile).toContain(
      'VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}',
    );
    expect(dockerfile).not.toContain('SUPABASE_SECRET_KEY');
    expect(dockerfile).not.toContain('SERVICE_ROLE_KEY');
  });

  it('creates unique credentials and defaults external integrations off', async () => {
    const installer = await source('install.sh');
    expect(installer).toContain('generate-keys.sh --update-env');
    expect(installer).toContain('add-new-auth-keys.sh --update-env');
    expect(installer).toContain('set_env ENABLE_ANONYMOUS_USERS false');
    expect(installer).toContain('set_env ENABLE_EMAIL_AUTOCONFIRM true');
    expect(installer).toContain('set_env DISCORD_ENABLED false');
    expect(installer).not.toContain('.env.local');
  });

  it('keeps LAN operator scripts executable', async () => {
    for (const name of [
      'install.sh',
      'sync.sh',
      'verify.sh',
      'copy-app-source.sh',
    ]) {
      const path = resolve(deploymentRoot, name);
      await access(path, constants.X_OK);
      expect((await stat(path)).isFile()).toBe(true);
    }
  });
});
