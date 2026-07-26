import { once } from 'node:events';
import { createApiServer } from './httpServer.ts';
import {
  MatchStartError,
  MatchStartService,
  SupabaseStartMatchRepository,
} from './startMatchService.ts';
import { runAuthoritativeInitializer } from './workerInitializer.ts';
import { resolveFustifyApiPort } from './runtimeConfiguration.ts';

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
      serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
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

const service = createMatchStartService();
const server = createApiServer(service);
const port = resolveFustifyApiPort(process.env.FUSTIFY_API_PORT);

server.listen(port, '127.0.0.1');
await once(server, 'listening');
console.log(`Fustify API listening on http://127.0.0.1:${port.toString()}`);

async function shutdown() {
  server.close();
  await once(server, 'close');
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
