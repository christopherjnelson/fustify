import { spawnSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');
const deployScript = resolve(projectRoot, 'deployment/deploy.sh');
const operatorScript = resolve(projectRoot, 'deployment/fustify-deploy');
const caddyInstaller = resolve(projectRoot, 'deployment/install-caddy.sh');
const caddyFragment = resolve(projectRoot, 'deployment/fustify.caddy');
const buildReleaseScript = resolve(projectRoot, 'scripts/buildRelease.ts');
const deployedCommit = 'a'.repeat(40);
const previousCommit = 'b'.repeat(40);

interface Harness {
  root: string;
  repository: string;
  releaseRoot: string;
  releasesRoot: string;
  currentLink: string;
  previousRelease: string;
  commandLog: string;
  notificationLog: string;
  environment: NodeJS.ProcessEnv;
}

const temporaryRoots: string[] = [];

async function writeExecutable(path: string, contents: string) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function writeCombinedRelease(
  path: string,
  commit: string,
  releaseId = basename(path),
) {
  await mkdir(join(path, 'web'), { recursive: true });
  await mkdir(join(path, 'api'), { recursive: true });
  await writeFile(join(path, 'web/index.html'), '<!doctype html>\n');
  await writeFile(join(path, 'api/server.mjs'), 'export {};\n');
  const metadata = `${JSON.stringify({ releaseId, commit }, null, 2)}\n`;
  await writeFile(join(path, 'release.json'), metadata);
  await writeFile(join(path, 'web/release.json'), metadata);
}

async function createHarness(scenario = 'success'): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'fustify-deploy-test-'));
  temporaryRoots.push(root);
  const repository = join(root, 'repository');
  const releaseRoot = join(root, 'release-root');
  const releasesRoot = join(releaseRoot, 'releases');
  const currentLink = join(releaseRoot, 'current');
  const fakeBin = join(root, 'bin');
  const fakeHome = join(root, 'home');
  const commandLog = join(root, 'commands.log');
  const notificationLog = join(root, 'notifications.log');
  const previousRelease = join(releasesRoot, '20260725T120000Z-bbbbbbbbbbbb');
  const frontendEnvironment = join(repository, '.env.production.local');
  const serverEnvironment = join(fakeHome, 'fustify-api.env');

  await mkdir(repository, { recursive: true });
  await mkdir(releasesRoot, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await mkdir(fakeHome, { recursive: true });
  await writeCombinedRelease(previousRelease, previousCommit);
  await symlink(previousRelease, currentLink);
  await writeFile(
    frontendEnvironment,
    'VITE_SUPABASE_URL=https://example.invalid\n' +
      'VITE_SUPABASE_PUBLISHABLE_KEY=public-test-value\n',
    { mode: 0o600 },
  );
  await writeFile(
    serverEnvironment,
    'SUPABASE_URL=https://example.invalid\n' +
      'SUPABASE_PUBLISHABLE_KEY=public-test-value\n' +
      'SUPABASE_SERVICE_ROLE_KEY=server-test-value\n',
    { mode: 0o600 },
  );

  await writeExecutable(
    join(fakeBin, 'id'),
    `#!/usr/bin/env bash
case "\${1:-}" in
  -u) printf '%s\\n' "\${FAKE_ID_UID:-1000}" ;;
  -un) printf '%s\\n' "\${FAKE_ID_USER:-tester}" ;;
  *) printf '%s\\n' "\${FAKE_ID_USER:-tester}" ;;
esac
`,
  );
  await writeExecutable(
    join(fakeBin, 'git'),
    `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
case "\${1:-} \${2:-}" in
  "rev-parse HEAD") printf '%s\\n' "\${FAKE_COMMIT}" ;;
  "log -1") printf '%s\\n' "Test deployment summary" ;;
  *) exit 0 ;;
esac
`,
  );
  await writeExecutable(
    join(fakeBin, 'pnpm'),
    `#!/usr/bin/env bash
printf 'pnpm %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
if [[ "\${1:-}" == "build:release" ]]; then
  mkdir -p .fustify/release/web .fustify/release/api
  printf '<!doctype html>\\n' >.fustify/release/web/index.html
  printf 'export {};\\n' >.fustify/release/api/server.mjs
  printf '{"releaseId":"%s","commit":"%s"}\\n' \
    "\${FUSTIFY_RELEASE_ID}" "\${FUSTIFY_RELEASE_COMMIT}" \
    >.fustify/release/release.json
  cp .fustify/release/release.json .fustify/release/web/release.json
  printf '{"status":"ok"}\\n' >.fustify/release/web/health.json
fi
`,
  );
  await writeExecutable(
    join(fakeBin, 'systemctl'),
    `#!/usr/bin/env bash
printf 'systemctl %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
exit 0
`,
  );
  await writeExecutable(
    join(fakeBin, 'journalctl'),
    `#!/usr/bin/env bash
printf 'journalctl %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
exit 0
`,
  );
  await writeExecutable(
    join(fakeBin, 'sleep'),
    `#!/usr/bin/env bash
printf 'sleep %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
`,
  );
  await writeExecutable(
    join(fakeBin, 'sudo'),
    `#!/usr/bin/env bash
printf 'sudo %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
if [[ "\${1:-}" == install ]]; then
  shift
  arguments=()
  while (($#)); do
    case "$1" in
      -o|-g) shift 2 ;;
      *) arguments+=("$1"); shift ;;
    esac
  done
  exec install "\${arguments[@]}"
fi
"$@"
`,
  );
  await writeExecutable(
    join(fakeBin, 'notify'),
    `#!/usr/bin/env bash
printf '%s|%s|%s|%s\\n' "\${1:-}" "\${2:-}" "\${3:-}" "\${4:-}" \
  >>"\${FAKE_NOTIFICATION_LOG}"
if [[ "\${FAKE_NOTIFY_FAILURE:-0}" == 1 && "\${1:-}" == success ]]; then
  exit 1
fi
`,
  );
  await writeExecutable(
    join(fakeBin, 'curl'),
    `#!/usr/bin/env bash
url=""
writes_status=0
for argument in "$@"; do
  url="$argument"
  if [[ "$argument" == "--write-out" || "$argument" == "-w" ]]; then
    writes_status=1
  fi
done
target="$(readlink -f "\${FUSTIFY_CURRENT_LINK}")"
is_previous=0
[[ "$target" == "\${FAKE_PREVIOUS_RELEASE}" ]] && is_previous=1

if [[ "$url" == "\${FUSTIFY_API_HEALTH_URL}" ]]; then
  count=0
  [[ -f "\${FAKE_HEALTH_COUNT}" ]] && count="$(<"\${FAKE_HEALTH_COUNT}")"
  count=$((count + 1))
  printf '%s\\n' "$count" >"\${FAKE_HEALTH_COUNT}"
  case "\${FAKE_SCENARIO}" in
    delayed)
      if ((count <= 2)); then exit 7; fi
      ;;
    health-failure)
      if ((is_previous == 0)); then exit 7; fi
      ;;
    rollback-failure) exit 7 ;;
  esac
  printf '{"status":"ok"}\\n'
  exit 0
fi

if ((writes_status)); then
  status=200
  case "$url" in
    */.env|*/.git/config|*/src/main.tsx|*/node_modules/|*.map) status=404 ;;
  esac
  if [[ "\${FAKE_SCENARIO}" == public-failure &&
    "$url" == */multiplayer ]]; then
    status=500
  fi
  if [[ "\${FAKE_SCENARIO}" == security-failure && "$url" == */.env ]]; then
    status=200
  fi
  printf '%s' "$status"
  exit 0
fi

case "$url" in
  */api/health)
    if [[ "\${FAKE_SCENARIO}" == public-health-failure ]]; then
      printf '{"status":"unhealthy"}\\n'
    else
      printf '{"status":"ok"}\\n'
    fi
    ;;
  */release.json)
    if [[ "\${FAKE_SCENARIO}" == fresh-metadata-mismatch &&
      $is_previous -eq 0 ]]; then
      printf '{"commit":"%s"}\\n' "${'c'.repeat(40)}"
    else
      cat "$target/web/release.json"
    fi
    ;;
  *) printf 'ok\\n' ;;
esac
`,
  );

  return {
    root,
    repository,
    releaseRoot,
    releasesRoot,
    currentLink,
    previousRelease,
    commandLog,
    notificationLog,
    environment: {
      ...process.env,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      HOME: fakeHome,
      FUSTIFY_DEPLOY_USER: 'tester',
      FUSTIFY_RELEASE_ROOT: releaseRoot,
      FUSTIFY_CURRENT_LINK: currentLink,
      FUSTIFY_FRONTEND_ENV: frontendEnvironment,
      FUSTIFY_SERVER_ENV: serverEnvironment,
      FUSTIFY_PUBLIC_ORIGIN: 'https://deployment.test',
      FUSTIFY_API_HEALTH_URL: 'http://127.0.0.1:18787/api/health',
      FUSTIFY_HEALTH_ATTEMPTS: '4',
      FUSTIFY_HEALTH_DELAY_SECONDS: '0',
      FUSTIFY_RELEASE_RETENTION: '5',
      FUSTIFY_NOTIFY_COMMAND: join(fakeBin, 'notify'),
      FAKE_COMMAND_LOG: commandLog,
      FAKE_NOTIFICATION_LOG: notificationLog,
      FAKE_HEALTH_COUNT: join(root, 'health-count'),
      FAKE_COMMIT: deployedCommit,
      FAKE_PREVIOUS_RELEASE: previousRelease,
      FAKE_SCENARIO: scenario,
    },
  };
}

function runDeployment(harness: Harness, environment = {}) {
  return spawnSync('bash', [deployScript], {
    cwd: harness.repository,
    env: { ...harness.environment, ...environment },
    encoding: 'utf8',
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe('combined droplet deployment', () => {
  it('builds, activates, verifies, and notifies a combined release', async () => {
    const harness = await createHarness();
    const result = runDeployment(harness);

    expect(result.status, result.stderr).toBe(0);
    const active = await readlink(harness.currentLink);
    expect(active).not.toBe(harness.previousRelease);
    expect(await readFile(join(active, 'web/index.html'), 'utf8')).toContain(
      'doctype',
    );
    expect(await readFile(join(active, 'api/server.mjs'), 'utf8')).toContain(
      'export',
    );
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain('pnpm install --frozen-lockfile');
    expect(commands).toContain('pnpm format:check');
    expect(commands).toContain('pnpm lint');
    expect(commands).toContain('pnpm exec vitest run --testTimeout=15000');
    expect(commands).toContain('pnpm test:deployment');
    expect(commands).toContain('pnpm test:integration:dev-proxy');
    expect(commands).toContain('pnpm build:release');
    expect(commands).toContain('pnpm bundle:check');
    expect(await readFile(harness.notificationLog, 'utf8')).toContain(
      'success|',
    );
  });

  it('strictly rejects a newly activated release with mismatched public metadata', async () => {
    const harness = await createHarness();
    const result = runDeployment(harness, {
      FAKE_SCENARIO: 'fresh-metadata-mismatch',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('public deployment verification');
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
  });

  it('fails before any build when frontend configuration is missing', async () => {
    const harness = await createHarness();
    await rm(join(harness.repository, '.env.production.local'));
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Required environment file');
    await expect(readFile(harness.commandLog, 'utf8')).rejects.toThrow();
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
  });

  it('overrides an inherited umask 077 with public frontend permissions', async () => {
    const harness = await createHarness();
    const result = spawnSync(
      'bash',
      ['-c', `umask 077; exec bash "${deployScript}"`],
      {
        cwd: harness.repository,
        env: harness.environment,
        encoding: 'utf8',
      },
    );

    expect(result.status, result.stderr).toBe(0);
    const active = await readlink(harness.currentLink);
    expect((await lstat(active)).mode & 0o777).toBe(0o755);
    expect((await lstat(join(active, 'web'))).mode & 0o777).toBe(0o755);
    expect((await lstat(join(active, 'web/index.html'))).mode & 0o777).toBe(
      0o644,
    );
  });

  it('tolerates a delayed API startup without noisy curl diagnostics', async () => {
    const harness = await createHarness('delayed');
    const result = runDeployment(harness);

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(harness.root, 'health-count'), 'utf8')).toBe(
      '3\n',
    );
    expect(result.stderr).not.toContain('Failed to connect');
  });

  it('rolls back and requires public metadata for a modern release', async () => {
    const harness = await createHarness('health-failure');
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
    expect(result.stderr).toContain('Rollback succeeded');
    expect(result.stdout).not.toContain('Rollback compatibility');
    expect(await readFile(harness.notificationLog, 'utf8')).toContain(
      'failure|',
    );
  });

  it('rolls back after public-route verification fails', async () => {
    const harness = await createHarness('public-failure');
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
    expect(result.stderr).toContain('public deployment verification');
    expect(result.stderr).toContain('ROLLBACK VERIFICATION FAILED');
  });

  it('rolls back to a legacy release using validated private metadata', async () => {
    const harness = await createHarness('health-failure');
    await rm(join(harness.previousRelease, 'web/release.json'));
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
    expect(result.stderr).toContain('Rollback succeeded');
    expect(result.stdout).toContain('Rollback compatibility');
  });

  it('rejects a legacy rollback with mismatched private metadata', async () => {
    const harness = await createHarness('health-failure');
    await rm(join(harness.previousRelease, 'web/release.json'));
    await writeFile(
      join(harness.previousRelease, 'release.json'),
      `${JSON.stringify({ commit: 'c'.repeat(40) })}\n`,
    );
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ROLLBACK VERIFICATION FAILED');
  });

  it('fails rollback when sensitive paths are not blocked', async () => {
    const harness = await createHarness('security-failure');
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ROLLBACK VERIFICATION FAILED');
  });

  it('fails rollback when the public API is unhealthy', async () => {
    const harness = await createHarness('public-health-failure');
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ROLLBACK VERIFICATION FAILED');
  });

  it('reports rollback verification failure explicitly', async () => {
    const harness = await createHarness('rollback-failure');
    const result = runDeployment(harness);

    expect(result.status).not.toBe(0);
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
    expect(result.stderr).toContain('ROLLBACK VERIFICATION FAILED');
    expect(await readFile(harness.notificationLog, 'utf8')).toContain(
      '|FAILED',
    );
  });

  it('retains five newest releases plus protected active and rollback releases', async () => {
    const harness = await createHarness();
    for (let index = 1; index <= 7; index += 1) {
      const day = String(10 + index).padStart(2, '0');
      await writeCombinedRelease(
        join(
          harness.releasesRoot,
          `202607${day}T120000Z-${String(index).repeat(12)}`,
        ),
        String(index).repeat(40),
      );
    }
    const result = runDeployment(harness);

    expect(result.status, result.stderr).toBe(0);
    const active = await readlink(harness.currentLink);
    await expect(lstat(active)).resolves.toBeDefined();
    await expect(lstat(harness.previousRelease)).resolves.toBeDefined();
    const releaseNames = await readdir(harness.releasesRoot);
    expect(releaseNames).toHaveLength(5);
  });

  it('allows a same-commit redeploy and rebuilds the Vite artifacts', async () => {
    const harness = await createHarness();
    const first = runDeployment(harness);
    const firstActive = await readlink(harness.currentLink);
    const second = runDeployment(harness);
    const secondActive = await readlink(harness.currentLink);

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(secondActive).not.toBe(firstActive);
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands.match(/pnpm build:release/gu)).toHaveLength(2);
  });

  it('keeps a healthy deployment active when notification delivery fails', async () => {
    const harness = await createHarness();
    const result = runDeployment(harness, { FAKE_NOTIFY_FAILURE: '1' });

    expect(result.status, result.stderr).toBe(0);
    expect(await readlink(harness.currentLink)).not.toBe(
      harness.previousRelease,
    );
    expect(result.stderr).toContain('success notification could not be sent');
  });

  it('refuses root execution', async () => {
    const harness = await createHarness();
    const result = runDeployment(harness, { FAKE_ID_UID: '0' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not root');
    expect(await readlink(harness.currentLink)).toBe(harness.previousRelease);
  });

  it('refuses unsafe release roots before creating or deleting artifacts', async () => {
    const harness = await createHarness();
    const sentinel = join(harness.root, 'sentinel');
    await writeFile(sentinel, 'preserve\n');
    const result = runDeployment(harness, {
      FUSTIFY_RELEASE_ROOT: '/',
      FUSTIFY_CURRENT_LINK: '/current',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('non-root absolute path');
    expect(await readFile(sentinel, 'utf8')).toBe('preserve\n');
  });
});

describe('release packaging metadata', () => {
  it('publishes the same non-sensitive commit metadata at the release root and web route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fustify-package-test-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'dist'));
    await mkdir(join(root, 'dist-api'));
    await writeFile(join(root, 'dist/index.html'), '<!doctype html>\n');
    await writeFile(join(root, 'dist-api/server.mjs'), 'export {};\n');
    await writeFile(
      join(root, 'dist-api/initializer-worker.mjs'),
      'export {};\n',
    );

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', buildReleaseScript],
      {
        cwd: root,
        env: {
          ...process.env,
          FUSTIFY_RELEASE_COMMIT: deployedCommit,
          FUSTIFY_RELEASE_ID: '20260726T120000Z-aaaaaaaaaaaa',
          FUSTIFY_RELEASE_BUILT_AT: '2026-07-26T12:00:00Z',
        },
        encoding: 'utf8',
      },
    );

    expect(result.status, result.stderr).toBe(0);
    const rootMetadata = await readFile(
      join(root, '.fustify/release/release.json'),
      'utf8',
    );
    const webMetadata = await readFile(
      join(root, '.fustify/release/web/release.json'),
      'utf8',
    );
    expect(webMetadata).toBe(rootMetadata);
    expect(JSON.parse(rootMetadata)).toMatchObject({
      commit: deployedCommit,
      releaseId: '20260726T120000Z-aaaaaaaaaaaa',
      artifacts: {
        frontend: 'web',
        api: 'api/server.mjs',
        worker: 'api/initializer-worker.mjs',
      },
    });
  });
});

describe('canonical operator command', () => {
  async function prepareOperatorHarness() {
    const harness = await createHarness();
    const fakeBin = join(harness.root, 'bin');
    await mkdir(join(harness.repository, 'deployment'), { recursive: true });
    await writeExecutable(
      join(harness.repository, 'deployment/deploy.sh'),
      `#!/usr/bin/env bash
printf 'combined deploy invoked\\n' >>"\${FAKE_COMMAND_LOG}"
`,
    );
    await writeExecutable(
      join(fakeBin, 'flock'),
      `#!/usr/bin/env bash
[[ "\${FAKE_LOCKED:-0}" != 1 ]]
`,
    );
    await writeExecutable(
      join(fakeBin, 'git'),
      `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
case "\${1:-} \${2:-}" in
  "branch --show-current") printf 'main\\n' ;;
  "status --porcelain")
    [[ "\${FAKE_DIRTY:-0}" == 1 ]] && printf ' M tracked-file\\n'
    ;;
  "merge-base --is-ancestor")
    [[ "\${FAKE_DIVERGED:-0}" != 1 ]]
    ;;
  *) exit 0 ;;
esac
`,
    );
    harness.environment = {
      ...harness.environment,
      FUSTIFY_REPOSITORY: harness.repository,
      FUSTIFY_BRANCH: 'main',
      FUSTIFY_REMOTE: 'origin',
      FUSTIFY_DEPLOY_LOCK: join(harness.root, 'deploy.lock'),
    };
    return harness;
  }

  it('fetches and fast-forwards before invoking a same-commit rebuild', async () => {
    const harness = await prepareOperatorHarness();
    const result = spawnSync('bash', [operatorScript], {
      cwd: harness.root,
      env: harness.environment,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain('git fetch --prune origin main');
    expect(commands).toContain('git merge --ff-only origin/main');
    expect(commands).toContain('combined deploy invoked');
  });

  it('refuses dirty tracked files before fetching', async () => {
    const harness = await prepareOperatorHarness();
    const result = spawnSync('bash', [operatorScript], {
      cwd: harness.root,
      env: { ...harness.environment, FAKE_DIRTY: '1' },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Tracked repository files are dirty');
    expect(await readFile(harness.commandLog, 'utf8')).not.toContain(
      'git fetch',
    );
  });

  it('refuses a concurrent deployment lock', async () => {
    const harness = await prepareOperatorHarness();
    const result = spawnSync('bash', [operatorScript], {
      cwd: harness.root,
      env: { ...harness.environment, FAKE_LOCKED: '1' },
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already running');
  });
});

describe('droplet installer contracts', () => {
  it('keeps sensitive-path blocking inside the ordered route before handlers', async () => {
    const fragment = await readFile(caddyFragment, 'utf8');
    const route = fragment.indexOf('\troute {');
    const blockedMatcher = fragment.indexOf('\t\t@blocked path_regexp');
    const blockedResponse = fragment.indexOf('\t\trespond @blocked 404');
    const apiHandler = fragment.indexOf('\t\thandle /api/*');
    const spaHandler = fragment.indexOf('\t\thandle {');

    expect(route).toBeGreaterThan(-1);
    expect(blockedMatcher).toBeGreaterThan(route);
    expect(blockedResponse).toBeGreaterThan(blockedMatcher);
    expect(apiHandler).toBeGreaterThan(blockedResponse);
    expect(spaHandler).toBeGreaterThan(apiHandler);
    expect(fragment).not.toMatch(/^(\t)respond @blocked 404$/mu);
  });

  it('installs the managed Caddy fragment only after backup and validation', async () => {
    const harness = await createHarness();
    const fakeBin = join(harness.root, 'bin');
    const caddyRoot = join(harness.root, 'caddy');
    const caddyfile = join(caddyRoot, 'Caddyfile');
    const sites = join(caddyRoot, 'sites');
    const backups = join(caddyRoot, 'backups');
    await mkdir(sites, { recursive: true });
    await writeFile(caddyfile, `import ${sites}/*.caddy\n`);
    await writeFile(join(sites, 'fustify.caddy'), 'old managed fragment\n');
    await writeExecutable(
      join(fakeBin, 'caddy'),
      `#!/usr/bin/env bash
printf 'caddy %s\\n' "$*" >>"\${FAKE_COMMAND_LOG}"
exit 0
`,
    );

    const result = spawnSync('bash', [caddyInstaller], {
      cwd: harness.repository,
      env: {
        ...harness.environment,
        FUSTIFY_CADDYFILE: caddyfile,
        FUSTIFY_CADDY_SITES_DIR: sites,
        FUSTIFY_CADDY_BACKUP_DIR: backups,
      },
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(sites, 'fustify.caddy'), 'utf8')).toBe(
      await readFile(resolve(projectRoot, 'deployment/fustify.caddy'), 'utf8'),
    );
    const backupNames = await readdir(backups);
    expect(backupNames.some((name) => name.startsWith('Caddyfile.'))).toBe(
      true,
    );
    expect(backupNames.some((name) => name.startsWith('fustify.caddy.'))).toBe(
      true,
    );
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands.indexOf('caddy validate')).toBeLessThan(
      commands.indexOf('systemctl reload caddy'),
    );
  });

  it('keeps only user-systemd-compatible hardening in the base unit', async () => {
    const service = await readFile(
      resolve(projectRoot, 'deployment/fustify-api.service'),
      'utf8',
    );

    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('LockPersonality=true');
    expect(service).toContain('MemoryMax=1536M');
    for (const incompatible of [
      'PrivateTmp',
      'ProtectSystem',
      'ProtectHome',
      'ProtectKernelTunables',
      'ProtectKernelModules',
      'ProtectControlGroups',
      'RestrictSUIDSGID',
    ]) {
      expect(service).not.toContain(incompatible);
    }
  });
});
