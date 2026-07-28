import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminAccountReference,
  parseAdminAccountReference,
  SupabaseAdminConsole,
  type AdminConfiguration,
} from './adminService';

const actorId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000002';
const idempotencyKey = '30000000-0000-4000-8000-000000000003';

const configuration: AdminConfiguration = {
  url: 'https://example.supabase.co',
  publishableKey: 'publishable',
  secretKey: 'secret',
  projectRef: 'example',
  managementAccessToken: 'management',
  mutationsEnabled: true,
};
const actorRef = createAdminAccountReference(actorId, configuration.secretKey);
const targetRef = createAdminAccountReference(
  targetId,
  configuration.secretKey,
);

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

function clients(admin: Record<string, unknown>) {
  return {
    auth: {} as SupabaseClient,
    admin: admin as unknown as SupabaseClient,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Supabase administration service', () => {
  it('uses authenticated opaque account references', () => {
    expect(parseAdminAccountReference(targetRef, configuration.secretKey)).toBe(
      targetId,
    );
    expect(() =>
      parseAdminAccountReference(
        `${targetRef.slice(0, 10)}${targetRef[10] === 'A' ? 'B' : 'A'}${targetRef.slice(11)}`,
        configuration.secretKey,
      ),
    ).toThrowError('invalid_account_reference');
  });

  it('rejects actions against the current administrator before privileged reads', async () => {
    const from = vi.fn();
    const service = new SupabaseAdminConsole(configuration, clients({ from }));

    await expect(
      service.mutateAccount({ userId: actorId }, actorRef, {
        action: 'ban',
        duration: '24h',
        reason: 'Security response',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({
      code: 'self_action_denied',
      status: 409,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('protects every administrator account from moderation', async () => {
    const roleQuery = query({ user_id: targetId });
    const getUserById = vi.fn();
    const service = new SupabaseAdminConsole(
      configuration,
      clients({
        from: vi.fn(() => roleQuery),
        auth: { admin: { getUserById } },
      }),
    );

    await expect(
      service.mutateAccount({ userId: actorId }, targetRef, {
        action: 'revoke',
        reason: 'Should remain protected',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'admin_target_denied', status: 409 });
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('records a sanitized failed audit outcome when an upstream Auth action fails', async () => {
    const auditInsert = vi.fn(async () => ({ error: null }));
    const moderationUpsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === 'user_roles') return query(null);
      if (table === 'account_moderation') return { upsert: moderationUpsert };
      if (table === 'admin_action_audit') {
        const auditQuery = query(null);
        return { ...auditQuery, insert: auditInsert };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const service = new SupabaseAdminConsole(
      configuration,
      clients({
        from,
        auth: {
          admin: {
            getUserById: vi.fn(async () => ({
              data: { user: { id: targetId, email: 'target@example.invalid' } },
              error: null,
            })),
            updateUserById: vi.fn(async () => ({
              error: { code: 'upstream_failure' },
            })),
          },
        },
      }),
    );

    await expect(
      service.mutateAccount({ userId: actorId }, targetRef, {
        action: 'ban',
        duration: '7d',
        reason: 'Repeated abuse reports',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'account_action_failed', status: 502 });
    expect(moderationUpsert).toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: actorId,
        target_id: targetId,
        reason: 'Repeated abuse reports',
        outcome: 'failed',
        error_code: 'account_action_failed',
      }),
    );
  });

  it('uses the ClickHouse logs endpoint with bounded cursor pagination and redaction', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: [
              {
                timestamp: '2026-07-28T04:00:00.000Z',
                source: 'auth_logs',
                event_message:
                  'failure for target@example.invalid from 203.0.113.7',
                log_attributes: {
                  level: 'error',
                  path: '/callback?token=secret',
                  request_id: targetId,
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new SupabaseAdminConsole(configuration, clients({}));

    const result = await service.logs({
      service: 'auth',
      window: '1h',
      limit: 1,
      cursor: '2026-07-28T04:01:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/v1/projects/example/analytics/endpoints/logs',
      }),
      expect.any(Object),
    );
    expect(result).toMatchObject({
      configured: true,
      nextCursor: '2026-07-28T04:00:00.000Z',
      entries: [
        {
          message: 'failure for [email] from [ip]',
          path: '/callback?[redacted]',
          requestId: '[id]',
        },
      ],
    });
  });
});
