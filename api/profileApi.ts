import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { FustifyAuth } from './auth.ts';
import { readJson, sendJson } from './httpServer.ts';

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    avatarUrl: z.url().nullable(),
    complete: z.boolean().default(false),
  })
  .strict();

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const point = character.codePointAt(0);
        return (
          point !== undefined && (point <= 31 || (point >= 127 && point <= 159))
        );
      }),
  );

interface ProfileRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

function profileResponse(row: ProfileRow) {
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    onboarding_completed: row.onboarding_completed,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function usernameSuggestions(candidate: string): string[] {
  const suffixes = ['2', '42', 'prime'];
  return suffixes.map(
    (suffix) => `${candidate.slice(0, 40 - suffix.length)}${suffix}`,
  );
}

export class ProfileApi {
  constructor(
    private readonly pool: Pool,
    private readonly auth: FustifyAuth,
  ) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (!url.pathname.startsWith('/api/profile')) return false;
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      sendJson(response, 401, { code: 'not_authenticated' });
      return true;
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/api/profile/username-options'
    ) {
      const parsed = usernameSchema.safeParse(
        url.searchParams.get('candidate'),
      );
      if (!parsed.success) {
        sendJson(response, 400, { code: 'invalid_profile_display_name' });
        return true;
      }
      const existing = await this.pool.query(
        `select 1 from profiles
         where lower(display_name) = lower($1)
           and onboarding_completed
           and user_id <> $2`,
        [parsed.data, session.user.id],
      );
      const available = existing.rowCount === 0;
      sendJson(response, 200, {
        available,
        suggestions: available ? [] : usernameSuggestions(parsed.data),
      });
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/profile') {
      const result = await this.pool.query<ProfileRow>(
        `select user_id, display_name, avatar_url, onboarding_completed,
                created_at, updated_at
         from profiles where user_id = $1`,
        [session.user.id],
      );
      const profile = result.rows[0];
      if (!profile) {
        sendJson(response, 404, { code: 'profile_unavailable' });
      } else {
        sendJson(response, 200, profileResponse(profile));
      }
      return true;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/profile') {
      const parsed = profileUpdateSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        sendJson(response, 400, { code: 'invalid_profile' });
        return true;
      }
      try {
        const result = await this.pool.query<ProfileRow>(
          `update profiles
           set display_name = $2,
               avatar_url = $3,
               onboarding_completed = onboarding_completed or $4,
               updated_at = statement_timestamp()
           where user_id = $1
           returning user_id, display_name, avatar_url, onboarding_completed,
                     created_at, updated_at`,
          [
            session.user.id,
            parsed.data.displayName,
            parsed.data.avatarUrl,
            parsed.data.complete,
          ],
        );
        const profile = result.rows[0];
        if (!profile) {
          sendJson(response, 404, { code: 'profile_unavailable' });
        } else {
          sendJson(response, 200, profileResponse(profile));
        }
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          sendJson(response, 409, { code: 'username_unavailable' });
        } else {
          throw error;
        }
      }
      return true;
    }

    sendJson(response, 405, { code: 'method_not_allowed' });
    return true;
  }
}
