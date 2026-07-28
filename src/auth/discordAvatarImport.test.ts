import { describe, expect, it, vi } from 'vitest';
import {
  downloadDiscordAvatar,
  isAllowedDiscordAvatarUrl,
} from '../../supabase/functions/complete-discord-profile/completion';

describe('Discord avatar import boundary', () => {
  it('allows only HTTPS Discord CDN hosts', () => {
    expect(
      isAllowedDiscordAvatarUrl(
        'https://cdn.discordapp.com/avatars/1/avatar.png',
      ),
    ).toBe(true);
    expect(
      isAllowedDiscordAvatarUrl('https://media.discordapp.net/avatars/1/a.png'),
    ).toBe(true);
    expect(isAllowedDiscordAvatarUrl('http://cdn.discordapp.com/a.png')).toBe(
      false,
    );
    expect(isAllowedDiscordAvatarUrl('https://example.com/a.png')).toBe(false);
    expect(
      isAllowedDiscordAvatarUrl(
        'https://cdn.discordapp.com@example.com/avatar.png',
      ),
    ).toBe(false);
    expect(
      isAllowedDiscordAvatarUrl(
        'https://cdn.discordapp.com.evil.example/avatar.png',
      ),
    ).toBe(false);
  });

  it('downloads a bounded safe raster response', async () => {
    const fetcher = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '3',
        },
      });
    }) as unknown as typeof fetch;
    await expect(
      downloadDiscordAvatar(
        'https://cdn.discordapp.com/avatars/1/avatar.png',
        fetcher,
      ),
    ).resolves.toMatchObject({
      contentType: 'image/png',
      extension: 'png',
    });
  });

  it('rejects arbitrary hosts, SVG, and oversized responses', async () => {
    const fetcher = vi.fn(async () => {
      return new Response('<svg/>', {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml',
          'content-length': '6',
        },
      });
    }) as unknown as typeof fetch;
    await expect(
      downloadDiscordAvatar('https://example.com/avatar.png', fetcher),
    ).rejects.toThrow('invalid_discord_avatar_url');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      downloadDiscordAvatar(
        'https://cdn.discordapp.com/avatars/1/avatar.svg',
        fetcher,
      ),
    ).rejects.toThrow('invalid_discord_avatar_response');
  });

  it('rejects declared and actual bodies over the two-megabyte limit', async () => {
    const declaredOversize = vi.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: {
            'content-type': 'image/png',
            'content-length': String(2 * 1024 * 1024 + 1),
          },
        }),
    ) as unknown as typeof fetch;
    await expect(
      downloadDiscordAvatar(
        'https://cdn.discordapp.com/avatars/1/avatar.png',
        declaredOversize,
      ),
    ).rejects.toThrow('invalid_discord_avatar_response');

    const actualOversize = vi.fn(
      async () =>
        new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
          headers: { 'content-type': 'image/webp' },
        }),
    ) as unknown as typeof fetch;
    await expect(
      downloadDiscordAvatar(
        'https://media.discordapp.net/avatars/1/avatar.webp',
        actualOversize,
      ),
    ).rejects.toThrow('invalid_discord_avatar_response');
  });

  it('rejects redirects instead of following an attacker-controlled target', async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(init?.redirect).toBe('error');
      throw new TypeError('redirect blocked');
    }) as unknown as typeof fetch;
    await expect(
      downloadDiscordAvatar(
        'https://cdn.discordapp.com/avatars/1/avatar.png',
        fetcher,
      ),
    ).rejects.toThrow('redirect blocked');
  });
});
