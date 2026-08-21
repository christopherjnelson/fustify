import { once } from 'node:events';
import { resolve } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import { createApiServer } from './httpServer.ts';
import {
  MatchStartError,
  MatchStartService,
  PostgresStartMatchRepository,
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
import { RoomApi } from './roomApi.ts';
import { MatchApi } from './matchApi.ts';
import { GameplayApi } from './gameplayApi.ts';
import { PostgresGameplayService } from './gameplayService.ts';
import { ReactionApi } from './reactionApi.ts';

function createMatchStartService(
  database: ReturnType<typeof createDatabasePool> | undefined,
) {
  if (database) {
    return new MatchStartService(
      new PostgresStartMatchRepository(database),
      runAuthoritativeInitializer,
    );
  }
  return {
    async start() {
      throw new MatchStartError('server_configuration_error', 503);
    },
  };
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
const roomApi = database && auth ? new RoomApi(database, auth) : undefined;
const matchApi = database && auth ? new MatchApi(database, auth) : undefined;
const gameplayApi = database
  ? new GameplayApi(new PostgresGameplayService(database))
  : undefined;
const reactionApi =
  database && auth ? new ReactionApi(database, auth) : undefined;
const staticRoot = process.env.FUSTIFY_STATIC_ROOT?.trim();
const server = createApiServer(
  createMatchStartService(database),
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
  profileApi || roomApi || matchApi || gameplayApi || reactionApi
    ? async (request, response, url) =>
        (await profileApi?.handle(request, response, url)) ||
        (await roomApi?.handle(request, response, url)) ||
        (await matchApi?.handle(request, response, url)) ||
        (await gameplayApi?.handle(request, response, url)) ||
        (await reactionApi?.handle(request, response, url)) ||
        false
    : undefined,
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
