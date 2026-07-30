import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATOR_VERSION } from '../core/generation/constants';
import {
  buildDiscordPayload,
  handleAnnouncementRequest,
  type AnnouncementConfig,
  type AnnouncementRoom,
  type AnnouncementStore,
} from '../../supabase/functions/announce-public-room/announcement';

const announcementId = '61000000-0000-4000-8000-000000000001';
const roomId = '62000000-0000-4000-8000-000000000001';
const invocationSecret = `test-${crypto.randomUUID()}`;
const discordWebhook = `https://discord.com/api/webhooks/1234567890/${crypto.randomUUID()}`;

const room: AnnouncementRoom = {
  id: roomId,
  name: 'Atlas *Prime* @everyone',
  visibility: 'public',
  status: 'waiting',
  seed: 'quiet_[orbit]',
  territoryCount: 42,
  continentCount: 5,
  assignmentMode: 'random',
  maxSeats: 4,
  generatorVersion: DEFAULT_GENERATOR_VERSION,
};

const config: AnnouncementConfig = {
  enabled: true,
  webhookUsername: 'Fustify',
  avatarUrl: 'https://dev.fustify.com/icon.png',
  embedTitleTemplate: '{{room_name}} is open',
  embedDescriptionTemplate:
    '[Join now]({{join_url}}) · {{open_seats}}/{{max_seats}} · {{seed}} · {{configuration_summary}}',
  embedColor: 9134824,
  footerText: 'Fustify public multiplayer',
  canonicalOrigin: 'https://dev.fustify.com',
  includeOpenSeats: true,
  includeConfigurationSummary: true,
};

type StoreState = {
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  messageId: string | null;
};

function storeFixture(overrides?: {
  config?: AnnouncementConfig | null;
  room?: AnnouncementRoom | null;
  memberCount?: number;
}) {
  const state: StoreState = {
    status: 'pending',
    error: null,
    messageId: null,
  };
  const store: AnnouncementStore = {
    claim: vi.fn(async (id) => {
      if (id !== announcementId || state.status !== 'pending') return null;
      state.status = 'processing';
      return { announcementId, roomId, attemptCount: 1 };
    }),
    getRoom: vi.fn(async () =>
      overrides && 'room' in overrides ? (overrides.room ?? null) : room,
    ),
    getMemberCount: vi.fn(async () => overrides?.memberCount ?? 1),
    getSeats: vi.fn(async () =>
      Array.from({ length: room.maxSeats }, (_, seatIndex) => ({
        seatIndex,
        controllerType: 'human',
        occupantUserId:
          seatIndex === 0 ? '63000000-0000-4000-8000-000000000001' : null,
      })),
    ),
    getConfig: vi.fn(async () =>
      overrides && 'config' in overrides ? (overrides.config ?? null) : config,
    ),
    markSent: vi.fn(async (_id, messageId) => {
      state.status = 'sent';
      state.messageId = messageId;
      state.error = null;
    }),
    markFailed: vi.fn(async (_id, error) => {
      state.status = 'failed';
      state.error = error;
    }),
    markSkipped: vi.fn(async (_id, reason) => {
      state.status = 'skipped';
      state.error = reason;
    }),
  };
  return { state, store };
}

function request(secret = invocationSecret) {
  return new Request('https://example.test/functions/v1/announce-public-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: secret },
    body: JSON.stringify({ announcementId }),
  });
}

function dependencies(
  store: AnnouncementStore,
  fetchImplementation: typeof fetch,
  environment?: {
    invocationSecret?: string;
    discordWebhook?: string;
  },
) {
  return {
    store,
    fetch: fetchImplementation,
    createPreview: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
    env: {
      invocationSecret:
        environment && 'invocationSecret' in environment
          ? environment.invocationSecret
          : invocationSecret,
      discordWebhook:
        environment && 'discordWebhook' in environment
          ? environment.discordWebhook
          : discordWebhook,
    },
    timeoutMs: 5,
  };
}

describe('public room Discord announcement delivery', () => {
  it('fails safely before claiming when inbound authentication is absent or invalid', async () => {
    const fixture = storeFixture();
    const outbound = vi.fn<typeof fetch>();

    const missing = await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound, {
        invocationSecret: undefined,
      }),
    );
    const invalid = await handleAnnouncementRequest(
      request('publishable-browser-key'),
      dependencies(fixture.store, outbound),
    );

    expect(missing.status).toBe(500);
    expect(invalid.status).toBe(401);
    expect(fixture.store.claim).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it('records a sanitized failure when DISCORD_WEBHOOK is missing', async () => {
    const fixture = storeFixture();
    const outbound = vi.fn<typeof fetch>();

    const response = await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound, {
        discordWebhook: undefined,
      }),
    );

    expect(response.status).toBe(502);
    expect(fixture.state).toMatchObject({
      status: 'failed',
      error: 'discord_webhook_missing',
    });
    expect(outbound).not.toHaveBeenCalled();
  });

  it('skips a claimed row without contacting Discord when configuration is disabled', async () => {
    const fixture = storeFixture({
      config: { ...config, enabled: false },
    });
    const outbound = vi.fn<typeof fetch>();

    const response = await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );

    expect(response.status).toBe(200);
    expect(fixture.state).toMatchObject({
      status: 'skipped',
      error: 'configuration_disabled',
    });
    expect(outbound).not.toHaveBeenCalled();
  });

  it('revalidates room capacity and authoritative seat structure', async () => {
    const fixture = storeFixture({ memberCount: room.maxSeats });
    const outbound = vi.fn<typeof fetch>();

    await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );

    expect(fixture.store.getRoom).toHaveBeenCalledWith(roomId);
    expect(fixture.store.getMemberCount).toHaveBeenCalledWith(roomId);
    expect(fixture.store.getSeats).toHaveBeenCalledWith(roomId);
    expect(fixture.state.status).toBe('skipped');
    expect(outbound).not.toHaveBeenCalled();
  });

  it('fails safely when locked room settings are malformed', async () => {
    const fixture = storeFixture({
      room: { ...room, seed: '   ' },
    });
    const outbound = vi.fn<typeof fetch>();

    const response = await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );

    expect(response.status).toBe(502);
    expect(fixture.state).toMatchObject({
      status: 'failed',
      error: 'invalid_room_configuration',
    });
    expect(outbound).not.toHaveBeenCalled();
  });

  it('accepts six-continent rooms and rejects values above the supported cap', async () => {
    const accepted = storeFixture({
      room: { ...room, continentCount: 6 },
    });
    const acceptedOutbound = vi.fn<typeof fetch>(async () =>
      Response.json({ id: '123456789012345678' }),
    );

    const acceptedResponse = await handleAnnouncementRequest(
      request(),
      dependencies(accepted.store, acceptedOutbound),
    );

    expect(acceptedResponse.status).toBe(200);
    expect(accepted.state.status).toBe('sent');
    expect(acceptedOutbound).toHaveBeenCalledTimes(1);

    const rejected = storeFixture({
      room: { ...room, continentCount: 7 },
    });
    const rejectedOutbound = vi.fn<typeof fetch>();

    const rejectedResponse = await handleAnnouncementRequest(
      request(),
      dependencies(rejected.store, rejectedOutbound),
    );

    expect(rejectedResponse.status).toBe(502);
    expect(rejected.state).toMatchObject({
      status: 'failed',
      error: 'invalid_room_configuration',
    });
    expect(rejectedOutbound).not.toHaveBeenCalled();
  });

  it('uses wait=true, disables mentions, and marks a confirmed Discord message sent', async () => {
    const fixture = storeFixture();
    const outbound = vi.fn<typeof fetch>(async () =>
      Response.json({ id: '123456789012345678' }),
    );

    const response = await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );

    expect(response.status).toBe(200);
    expect(fixture.state).toEqual({
      status: 'sent',
      error: null,
      messageId: '123456789012345678',
    });
    const [url, init] = outbound.mock.calls[0];
    expect(String(url)).toBe(`${discordWebhook}?wait=true`);
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    const payload = JSON.parse(String(form.get('payload_json'))) as {
      allowed_mentions: { parse: unknown[] };
      embeds: Array<{
        url: string;
        fields: Array<{ name: string; value: string }>;
        image: { url: string };
      }>;
    };
    const preview = form.get('files[0]');
    expect(preview).toBeInstanceOf(File);
    expect(preview).toMatchObject({
      name: 'fustify-world.png',
      type: 'image/png',
    });
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].url).toBe(
      `https://dev.fustify.com/multiplayer/room/${roomId}`,
    );
    expect(payload.embeds[0].image).toEqual({
      url: 'attachment://fustify-world.png',
    });
    expect(payload.embeds[0].fields).toEqual(
      expect.arrayContaining([
        {
          name: 'Room name',
          value: 'Atlas \\*Prime\\* @everyone',
          inline: false,
        },
        { name: 'Player capacity', value: '4 players', inline: true },
        { name: 'Territories', value: '42', inline: true },
        { name: 'Continents', value: '5', inline: true },
        { name: 'Assignment', value: 'Random', inline: true },
        { name: 'Seed', value: 'quiet\\_\\[orbit\\]', inline: false },
        {
          name: 'Occupancy at publication',
          value: '1 of 4 players',
          inline: true,
        },
        {
          name: 'Direct join',
          value: `https://dev.fustify.com/multiplayer/room/${roomId}`,
          inline: false,
        },
      ]),
    );
    expect(JSON.stringify(payload)).not.toContain('join_code');
    expect(JSON.stringify(payload)).not.toContain('host_user_id');
  });

  it('stores only a short status code for Discord non-success responses', async () => {
    const fixture = storeFixture();
    const sensitiveBody = `${discordWebhook} authorization=secret detail`;
    const outbound = vi.fn<typeof fetch>(
      async () => new Response(sensitiveBody, { status: 503 }),
    );

    const response = await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );

    expect(response.status).toBe(502);
    expect(fixture.state.error).toBe('discord_http_503');
    expect(fixture.state.error).not.toContain(discordWebhook);
    expect(fixture.state.error).not.toContain('authorization');
  });

  it('records an aborted Discord request as a sanitized timeout', async () => {
    const fixture = storeFixture();
    const outbound = vi.fn<typeof fetch>(async () => {
      throw new DOMException('private network detail', 'AbortError');
    });

    await handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );

    expect(fixture.state).toMatchObject({
      status: 'failed',
      error: 'discord_timeout',
    });
  });

  it('allows only one concurrent invocation to claim and post', async () => {
    const fixture = storeFixture();
    let releaseResponse: (() => void) | undefined;
    const outbound = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          releaseResponse = () =>
            resolve(Response.json({ id: '123456789012345678' }));
        }),
    );

    const first = handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );
    const second = handleAnnouncementRequest(
      request(),
      dependencies(fixture.store, outbound),
    );
    await vi.waitFor(() => expect(outbound).toHaveBeenCalledTimes(1));
    releaseResponse?.();

    const responses = await Promise.all([first, second]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(outbound).toHaveBeenCalledTimes(1);
  });
});

describe('Discord room payload formatting', () => {
  it('renders documented placeholders, escapes room Markdown, and derives the canonical join URL', () => {
    const { joinUrl, payload } = buildDiscordPayload(room, 1, config);

    expect(joinUrl).toBe(`https://dev.fustify.com/multiplayer/room/${roomId}`);
    expect(payload.embeds[0].title).toBe('Atlas \\*Prime\\* @everyone is open');
    expect(payload.embeds[0].description).toContain('3/4');
    expect(payload.embeds[0].description).toContain('quiet\\_\\[orbit\\]');
    expect(payload.embeds[0].description).not.toContain('{{');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Room name',
          value: 'Atlas \\*Prime\\* @everyone',
        }),
        expect.objectContaining({
          name: 'Player capacity',
          value: '4 players',
        }),
        expect.objectContaining({ name: 'Territories', value: '42' }),
        expect.objectContaining({ name: 'Continents', value: '5' }),
        expect.objectContaining({ name: 'Assignment', value: 'Random' }),
        expect.objectContaining({ name: 'Seed', value: 'quiet\\_\\[orbit\\]' }),
        expect.objectContaining({
          name: 'Direct join',
          value: `https://dev.fustify.com/multiplayer/room/${roomId}`,
        }),
      ]),
    );
  });

  it('rejects an arbitrary origin path instead of constructing an attacker-controlled route', () => {
    expect(() =>
      buildDiscordPayload(room, 1, {
        ...config,
        canonicalOrigin: 'https://attacker.example/path',
      }),
    ).toThrow('invalid_canonical_origin');
  });
});
