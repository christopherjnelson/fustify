import { describe, expect, it } from 'vitest';
import { resolveAuthConfiguration } from './authConfiguration.ts';
describe('auth configuration', () => {
  it('is unavailable until both server-only values exist', () => {
    expect(resolveAuthConfiguration({})).toBeNull();
    expect(resolveAuthConfiguration({ BETTER_AUTH_SECRET: 'secret' })).toBeNull();
  });

  it('defaults trusted origins to the application origin', () => {
    expect(
      resolveAuthConfiguration({
        BETTER_AUTH_SECRET: 'secret',
        BETTER_AUTH_URL: 'https://play.example.com/api/auth',
      }),
    ).toMatchObject({
      baseUrl: 'https://play.example.com/api/auth',
      trustedOrigins: ['https://play.example.com'],
    });
  });

  it('accepts an explicit comma-separated origin allowlist', () => {
    expect(
      resolveAuthConfiguration({
        BETTER_AUTH_SECRET: 'secret',
        BETTER_AUTH_URL: 'http://localhost:8787',
        FUSTIFY_TRUSTED_ORIGINS:
          'http://localhost:5173, https://play.example.com ',
      })?.trustedOrigins,
    ).toEqual(['http://localhost:5173', 'https://play.example.com']);
  });
});
