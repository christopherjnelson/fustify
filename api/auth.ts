import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
export interface AuthConfiguration {
  baseUrl: string;
  secret: string;
  trustedOrigins: string[];
  discordClientId?: string;
  discordClientSecret?: string;
}

export function createFustifyAuth(pool: Pool, configuration: AuthConfiguration) {
  const discord =
    configuration.discordClientId && configuration.discordClientSecret
      ? {
          discord: {
            clientId: configuration.discordClientId,
            clientSecret: configuration.discordClientSecret,
          },
        }
      : undefined;
  return betterAuth({
    database: pool,
    baseURL: configuration.baseUrl,
    basePath: '/api/auth',
    secret: configuration.secret,
    trustedOrigins: configuration.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: discord,
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: ['x-fustify-client-ip'] },
    },
    user: {
      modelName: 'auth_users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      modelName: 'auth_sessions',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
    },
    account: {
      modelName: 'auth_accounts',
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'auth_verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const fallback = user.name.trim() || `Player ${user.id.slice(0, 8)}`;
            await pool.query(
              `insert into profiles (user_id, display_name)
               values ($1, $2)
               on conflict (user_id) do nothing`,
              [user.id, fallback.slice(0, 40)],
            );
          },
        },
      },
    },
  });
}

export type FustifyAuth = ReturnType<typeof createFustifyAuth>;
