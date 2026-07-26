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
const releaseId = process.env.FUSTIFY_RELEASE_ID?.trim() || 'local-build';
if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/.test(releaseId)) {
  throw new Error('FUSTIFY_RELEASE_ID contains unsupported characters.');
}
const builtAt =
  process.env.FUSTIFY_RELEASE_BUILT_AT?.trim() || new Date().toISOString();
if (Number.isNaN(Date.parse(builtAt))) {
  throw new Error('FUSTIFY_RELEASE_BUILT_AT must be an ISO-8601 timestamp.');
}
const metadata = {
  schemaVersion: 1,
  releaseId,
  commit,
  builtAt,
  node: process.version,
  artifacts: {
    frontend: 'web',
    api: 'api/server.mjs',
    worker: 'api/initializer-worker.mjs',
  },
};
const serializedMetadata = `${JSON.stringify(metadata, null, 2)}\n`;
await Promise.all([
  writeFile(resolve(releaseRoot, 'release.json'), serializedMetadata),
  writeFile(resolve(webRoot, 'release.json'), serializedMetadata),
  writeFile(
    resolve(webRoot, 'health.json'),
    `${JSON.stringify(
      {
        status: 'ok',
        service: 'fustify',
        releaseId,
        commit,
        builtAt,
      },
      null,
      2,
    )}\n`,
  ),
]);

console.log(
  `Packaged Fustify release ${commit.slice(0, 12)} at ${releaseRoot}`,
);
