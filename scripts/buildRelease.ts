import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const releaseRoot = resolve('.fustify/release');
const webRoot = resolve(releaseRoot, 'web');
const apiRoot = resolve(releaseRoot, 'api');

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
await Promise.all([
  cp(resolve('dist'), webRoot, { recursive: true }),
  cp(resolve('dist-api'), apiRoot, { recursive: true }),
]);

const commit =
  process.env.FUSTIFY_RELEASE_COMMIT?.trim() || 'local-worktree-build';
if (!/^(?:[0-9a-f]{40}|local-worktree-build)$/.test(commit)) {
  throw new Error('FUSTIFY_RELEASE_COMMIT must be a full Git commit hash.');
}
await writeFile(
  resolve(releaseRoot, 'release.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      commit,
      node: process.version,
      artifacts: {
        frontend: 'web',
        api: 'api/server.mjs',
        worker: 'api/initializer-worker.mjs',
      },
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Packaged Fustify release ${commit.slice(0, 12)} at ${releaseRoot}`,
);
