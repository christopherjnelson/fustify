import type { AuthConfiguration } from './auth.ts';
export function resolveAuthConfiguration(
  environment: NodeJS.ProcessEnv,
): AuthConfiguration | null {
  const secret = environment.BETTER_AUTH_SECRET?.trim();
  const baseUrl = environment.BETTER_AUTH_URL?.trim();
  if (!secret || !baseUrl) return null;
  const configuredOrigins = environment.FUSTIFY_TRUSTED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return {
    secret,
    baseUrl,
    trustedOrigins:
      configuredOrigins && configuredOrigins.length > 0
        ? configuredOrigins
        : [new URL(baseUrl).origin],
  };
}
