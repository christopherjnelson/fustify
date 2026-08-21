import { once } from 'node:events';
import { resolve } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import { SupabaseAdminConsole } from './adminService.ts';
import { createApiServer } from './httpServer.ts';
import {
  MatchStartError,
  MatchStartService,
  SupabaseStartMatchRepository,
} from './startMatchService.ts';
import { runAuthoritativeInitializer } from './workerInitializer.ts';
import {
  resolveFustifyApiHost,
  resolveFustifyApiPort,
} from './runtimeConfiguration.ts';
import { createFustifyAuth } from './auth.ts';
import { resolveAuthConfiguration } from './authConfiguration.ts';
import { createDatabasePool, runDatabaseMigrations } from './database.ts';
import { createStaticFileHandler } from './staticFiles.ts';
import { ProfileApi } from './profileApi.ts';

class MissingEnvironmentError extends Error {
  readonly variableName: string;

  constructor(variableName: string) {
    super(`Missing required environment variable: ${variableName}`);
    this.variableName = variableName;
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingEnvironmentError(name);
  return value;
}

function createMatchStartService() {
  try {
    const repository = new SupabaseStartMatchRepository({
      url: requiredEnvironment('SUPABASE_URL'),
      publishableKey: requiredEnvironment('SUPABASE_PUBLISHABLE_KEY'),
      serviceRoleKey:
        process.env.SUPABASE_SECRET_KEY?.trim() ||
        requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    });
    return new MatchStartService(repository, runAuthoritativeInitializer);
  } catch (error) {
    if (
      process.env.FUSTIFY_API_ALLOW_INCOMPLETE_CONFIGURATION === '1' &&
      error instanceof MissingEnvironmentError
    ) {
      console.warn(`Fustify match start unavailable: ${error.message}.`);
      return {
        async start() {
          throw new MatchStartError('server_configuration_error', 503);
        },
      };
    }
    throw error;
  }
}

function createAdminConsole() {
  try {
    const url = requiredEnvironment('SUPABASE_URL');
    return new SupabaseAdminConsole({
      url,
      publishableKey: requiredEnvironment('SUPABASE_PUBLISHABLE_KEY'),
      secretKey:
        process.env.SUPABASE_SECRET_KEY?.trim() ||
        requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
      projectRef:
        process.env.SUPABASE_PROJECT_REF?.trim() ||
        new URL(url).hostname.split('.')[0]!,
      managementAccessToken:
        process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN?.trim() || undefined,
      expectedMigration:
        process.env.FUSTIFY_EXPECTED_SUPABASE_MIGRATION?.trim() ||
        '20260728042940',
      mutationsEnabled: process.env.FUSTIFY_ADMIN_MUTATIONS_ENABLED === '1',
    });
  } catch (error) {
    if (
      process.env.FUSTIFY_API_ALLOW_INCOMPLETE_CONFIGURATION === '1' &&
      error instanceof MissingEnvironmentError
    ) {
      console.warn(`Fustify administration unavailable: ${error.message}.`);
      return undefined;
    }
    throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
const database = databaseUrl
  ? createDatabasePool({ connectionString: databaseUrl })
  : undefined;
if (database) {
  const applied = await runDatabaseMigrations(database);
  if (applied.length > 0) {
    console.log(`Applied database migrations: ${applied.join(', ')}`);
  }
}
const authConfiguration = resolveAuthConfiguration(process.env);
const auth =
  database && authConfiguration
    ? createFustifyAuth(database, authConfiguration)
    : undefined;
const authHandler = auth ? toNodeHandler(auth) : undefined;
const profileApi =
  database && auth ? new ProfileApi(database, auth) : undefined;
const staticRoot = process.env.FUSTIFY_STATIC_ROOT?.trim();
const server = createApiServer(
  createMatchStartService(),
  createAdminConsole(),
  authHandler
    ? async (request, response) => {
        // This private header is always overwritten at the trusted Node
        // boundary, so clients cannot spoof the address used for rate limits.
        request.headers['x-fustify-client-ip'] =
          request.socket.remoteAddress ?? 'unknown';
        await authHandler(request, response);
      }
    : undefined,
  staticRoot ? createStaticFileHandler(resolve(staticRoot)) : undefined,
  profileApi ? profileApi.handle.bind(profileApi) : undefined,
);
const port = resolveFustifyApiPort(process.env.FUSTIFY_API_PORT);
const host = resolveFustifyApiHost(process.env.FUSTIFY_API_HOST);

server.listen(port, host);
await once(server, 'listening');
console.log(`Fustify API listening on http://${host}:${port.toString()}`);

async function shutdown() {
  server.close();
  await once(server, 'close');
  await database?.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
