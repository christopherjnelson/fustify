import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { authorizeGameplayRequest } from './requestAuthorization';

describe('authoritative gameplay request authorization', () => {
  it('rejects missing authorization without invoking Auth', async () => {
    const getUser = vi.fn();
    await expect(authorizeGameplayRequest(null, getUser)).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token through trusted Auth verification', async () => {
    const getUser = vi.fn(async () => ({
      user: null,
      error: new Error('private JWT detail'),
    }));
    await expect(
      authorizeGameplayRequest('Bearer invalid-token', getUser),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    });
  });

  it('rejects a verified anonymous user before authority work begins', async () => {
    const loadMatchState = vi.fn();
    const authorized = await authorizeGameplayRequest(
      'Bearer legacy-token',
      vi.fn(async () => ({
        user: { id: 'legacy-user', is_anonymous: true },
        error: null,
      })),
    );
    if (authorized.ok) loadMatchState();

    expect(authorized).toEqual({
      ok: false,
      status: 403,
      code: 'account_required',
    });
    expect(loadMatchState).not.toHaveBeenCalled();
  });

  it('fails closed when anonymous status is unavailable', async () => {
    await expect(
      authorizeGameplayRequest(
        'Bearer status-missing',
        vi.fn(async () => ({
          user: { id: 'unknown-user' },
          error: null,
        })),
      ),
    ).resolves.toMatchObject({ ok: false, code: 'account_required' });
  });

  it('allows a verified registered user to reach existing command validation', async () => {
    const validateCommand = vi.fn(() => {
      throw new Error('invalid_request');
    });
    const authorized = await authorizeGameplayRequest(
      'Bearer registered-token',
      vi.fn(async () => ({
        user: { id: 'registered-user', is_anonymous: false },
        error: null,
      })),
    );

    expect(authorized).toEqual({
      ok: true,
      actorUserId: 'registered-user',
    });
    expect(() => {
      if (authorized.ok) validateCommand();
    }).toThrow('invalid_request');
  });

  it('authorizes before parsing or loading match state and does not log credentials', async () => {
    const source = await readFile(
      'supabase/functions/multiplayer-game/index.ts',
      'utf8',
    );
    const authorizationCall = source.indexOf(
      'const authorized = await authorizeGameplayRequest',
    );
    expect(authorizationCall).toBeGreaterThan(0);
    expect(authorizationCall).toBeLessThan(source.indexOf('request.json()'));
    expect(authorizationCall).toBeLessThan(source.indexOf(".from('matches')"));
    expect(source).not.toMatch(/console\.(?:log|info|debug|warn|error)/);
    expect(source).not.toContain('JSON.stringify(authData');
  });
});
