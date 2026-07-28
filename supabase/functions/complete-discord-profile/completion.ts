const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const extensions = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

export function isAllowedDiscordAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'cdn.discordapp.com' ||
        url.hostname === 'media.discordapp.net') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export type ImportedAvatar = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
};

export async function downloadDiscordAvatar(
  url: string,
  fetcher: typeof fetch,
): Promise<ImportedAvatar> {
  if (!isAllowedDiscordAvatarUrl(url)) {
    throw new Error('invalid_discord_avatar_url');
  }
  const response = await fetcher(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('discord_avatar_download_failed');

  const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
  const extension = extensions.get(contentType);
  const declaredSize = Number(response.headers.get('content-length') ?? '0');
  if (
    !extension ||
    !Number.isFinite(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > MAX_AVATAR_BYTES
  ) {
    throw new Error('invalid_discord_avatar_response');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new Error('invalid_discord_avatar_response');
  }
  return { bytes, contentType, extension };
}
