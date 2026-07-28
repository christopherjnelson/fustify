import { createClient, type User } from '@supabase/supabase-js';
import {
  profileAvatarUrlSchema,
  profileDisplayNameSchema,
} from '../../../src/auth/profileModel.ts';
import { downloadDiscordAvatar } from './completion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hasDiscordIdentity(user: User): boolean {
  return (
    user.identities?.some(({ provider }) => provider === 'discord') === true
  );
}

function discordIdentityAvatarUrl(user: User): string | null {
  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === 'discord',
  );
  const metadata = discordIdentity?.identity_data;
  if (!metadata) return null;
  for (const key of ['avatar_url', 'picture']) {
    const value = metadata[key];
    if (typeof value !== 'string') continue;
    const parsed = profileAvatarUrlSchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    [
      'username_unavailable',
      'invalid_profile_display_name',
      'invalid_profile_avatar_url',
      'account_blocked',
      'account_required',
    ].find((candidate) => message.includes(candidate)) ??
    'profile_completion_failed'
  );
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return response(405, { code: 'method_not_allowed' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !publishableKey || !serviceRoleKey) {
    return response(500, { code: 'server_configuration_error' });
  }
  if (!authorization?.startsWith('Bearer ')) {
    return response(401, { code: 'not_authenticated' });
  }

  const scoped = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await scoped.auth.getUser();
  const user = verified.data.user;
  if (
    verified.error ||
    !user ||
    user.is_anonymous !== false ||
    !hasDiscordIdentity(user)
  ) {
    return response(403, { code: 'discord_identity_required' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return response(400, { code: 'invalid_request' });
  }
  const username = profileDisplayNameSchema.safeParse(body.username);
  const avatarChoice = body.avatarChoice;
  if (
    !username.success ||
    !['current', 'discord', 'custom', 'none'].includes(
      typeof avatarChoice === 'string' ? avatarChoice : '',
    )
  ) {
    return response(400, { code: 'invalid_request' });
  }

  const { data: currentProfile, error: profileError } = await scoped
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError || !currentProfile) {
    return response(503, { code: 'profile_unavailable' });
  }

  let avatarUrl: string | null = currentProfile.avatar_url;
  if (avatarChoice === 'none') avatarUrl = null;
  if (avatarChoice === 'custom') {
    const custom = profileAvatarUrlSchema.safeParse(body.customAvatarUrl);
    if (!custom.success || !custom.data) {
      return response(400, { code: 'invalid_profile_avatar_url' });
    }
    avatarUrl = custom.data;
  }
  if (avatarChoice === 'discord') {
    const discordUrl = discordIdentityAvatarUrl(user);
    if (!discordUrl) {
      return response(400, { code: 'discord_avatar_unavailable' });
    }
    avatarUrl = discordUrl;
    try {
      const imported = await downloadDiscordAvatar(discordUrl, fetch);
      const objectPath = `${user.id}/avatar.${imported.extension}`;
      const upload = await admin.storage
        .from('profile-avatars')
        .upload(objectPath, imported.bytes, {
          contentType: imported.contentType,
          upsert: true,
          cacheControl: '3600',
        });
      if (!upload.error) {
        avatarUrl = admin.storage
          .from('profile-avatars')
          .getPublicUrl(objectPath).data.publicUrl;
      }
    } catch {
      avatarUrl = discordUrl;
    }
  }

  const completed = await scoped.rpc('complete_own_profile', {
    p_display_name: username.data,
    p_avatar_url: avatarUrl,
  });
  if (completed.error || !completed.data) {
    const code = errorCode(completed.error);
    return response(code === 'username_unavailable' ? 409 : 400, { code });
  }
  return response(200, { profile: completed.data });
});
