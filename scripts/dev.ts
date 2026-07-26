import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';
import { resolveFustifyApiPort } from '../api/runtimeConfiguration.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const loadedEnvironment = loadEnv('development', repositoryRoot, '');
const environment = { ...loadedEnvironment, ...process.env };
const apiPort = resolveFustifyApiPort(environment.FUSTIFY_API_PORT);

const apiEnvironment = {
  ...environment,
  FUSTIFY_API_ALLOW_INCOMPLETE_CONFIGURATION: '1',
  FUSTIFY_API_PORT: apiPort.toString(),
  SUPABASE_URL: environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL ?? '',
  SUPABASE_PUBLISHABLE_KEY:
    environment.SUPABASE_PUBLISHABLE_KEY ??
    environment.VITE_SUPABASE_PUBLISHABLE_KEY ??
    '',
};
const viteEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  FUSTIFY_API_PORT: apiPort.toString(),
};
delete viteEnvironment.SUPABASE_SERVICE_ROLE_KEY;

const children = new Set<ChildProcess>();
let stopping = false;
let exitCode = 0;

function start(
  command: string,
  args: string[],
  childEnvironment: NodeJS.ProcessEnv,
) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: childEnvironment,
    stdio: 'inherit',
  });
  children.add(child);
  child.once('error', (error) => {
    console.error(error);
    exitCode = 1;
    stop();
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      if (signal) {
        console.error(`${command} stopped with ${signal}.`);
      }
      exitCode = code ?? 1;
      stop();
    }
    if (children.size === 0) process.exit(exitCode);
  });
}

function stop(signal: NodeJS.Signals = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
start(
  process.execPath,
  ['--import', 'tsx', '--watch', '--watch-preserve-output', 'api/server.ts'],
  apiEnvironment,
);
start(pnpm, ['exec', 'vite', ...process.argv.slice(2)], viteEnvironment);

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
