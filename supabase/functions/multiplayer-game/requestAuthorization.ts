export interface VerifiedGameplayUser {
  id: string;
  is_anonymous?: boolean;
}

export type GameplayAuthorization =
  | { ok: true; actorUserId: string }
  | {
      ok: false;
      status: 401 | 403;
      code: 'not_authenticated' | 'account_required';
    };

export async function authorizeGameplayRequest(
  authorization: string | null,
  getUser: (
    token: string,
  ) => Promise<{ user: VerifiedGameplayUser | null; error: unknown }>,
): Promise<GameplayAuthorization> {
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'not_authenticated' };
  }
  const token = authorization.slice('Bearer '.length);
  if (!token) {
    return { ok: false, status: 401, code: 'not_authenticated' };
  }
  const verified = await getUser(token);
  if (verified.error || !verified.user) {
    return { ok: false, status: 401, code: 'not_authenticated' };
  }
  if (verified.user.is_anonymous !== false) {
    return { ok: false, status: 403, code: 'account_required' };
  }
  return { ok: true, actorUserId: verified.user.id };
}
