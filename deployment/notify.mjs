import { lstat, readFile } from 'node:fs/promises';

function parseEnvironment(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator < 1) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const [event, commit, stage, rollback, checks, summary] = process.argv.slice(2);
if (
  !['success', 'failure', 'cleanup-failure', 'changelog'].includes(event ?? '')
) {
  console.error(
    'Notification event must be success, failure, cleanup-failure, or changelog.',
  );
  process.exit(1);
}

const configFile =
  process.env.FUSTIFY_DEPLOY_ENV ??
  `${process.env.HOME ?? ''}/.config/fustify/deploy.env`;
let fileEnvironment = {};
try {
  const configurationStat = await lstat(configFile);
  if (
    !configurationStat.isFile() ||
    configurationStat.isSymbolicLink() ||
    configurationStat.mode & 0o077
  ) {
    console.error(
      'Deployment notification configuration must be a private regular file.',
    );
    process.exit(1);
  }
  fileEnvironment = parseEnvironment(await readFile(configFile, 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') {
    console.error('Could not read the deployment notification configuration.');
    process.exit(1);
  }
}
const webhookVariable =
  event === 'changelog'
    ? 'DISCORD_CHANGELOG_WEBHOOK_URL'
    : 'DISCORD_ADMIN_WEBHOOK_URL';
const webhookUrl =
  process.env[webhookVariable] ?? fileEnvironment[webhookVariable];
if (!webhookUrl) {
  console.error(
    `Discord notification is not configured; set ${webhookVariable}.`,
  );
  process.exit(1);
}

const shortCommit = (commit ?? 'unknown').slice(0, 12);
const content =
  event === 'changelog'
    ? [
        '## Fustify release changelog',
        `Deployed commit: \`${shortCommit}\``,
        summary || 'No new commits.',
      ].join('\n')
    : event === 'success'
      ? [
          '## Fustify deployment succeeded',
          summary || 'Fustify was updated.',
          `Commit: \`${shortCommit}\``,
          `Verified: ${checks || 'local and public deployment checks'}`,
        ].join('\n')
      : event === 'cleanup-failure'
        ? [
            '## Fustify deployed with cleanup failure',
            `Commit: \`${shortCommit}\``,
            summary ||
              'The verified release is live, but post-deployment cleanup failed.',
          ].join('\n')
        : [
            '## Fustify deployment failed',
            `Commit: \`${shortCommit}\``,
            `Failed stage: ${stage || 'unknown'}`,
            `Rollback: ${rollback || 'not required'}`,
          ].join('\n');
const conciseContent = content.slice(0, 1900);

let response;
try {
  response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'Fustify Deployments',
      content: conciseContent,
      allowed_mentions: { parse: [] },
    }),
  });
} catch {
  console.error('Discord deployment notification request failed.');
  process.exit(1);
}
if (!response.ok) {
  console.error(
    `Discord deployment notification failed with HTTP ${response.status}.`,
  );
  process.exit(1);
}

console.log('Discord deployment notification sent.');
