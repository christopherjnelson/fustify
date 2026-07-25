const MAX_ERROR_LENGTH = 200;
const DISCORD_TIMEOUT_MS = 8_000;

export type AnnouncementClaim = {
  announcementId: string;
  roomId: string;
  attemptCount: number;
};

export type AnnouncementRoom = {
  id: string;
  name: string;
  visibility: string;
  status: string;
  seed: string;
  territoryCount: number;
  continentCount: number;
  assignmentMode: string;
  maxSeats: number;
};

export type AnnouncementSeat = {
  seatIndex: number;
  occupantUserId: string | null;
};

export type AnnouncementConfig = {
  enabled: boolean;
  webhookUsername: string;
  avatarUrl: string | null;
  embedTitleTemplate: string;
  embedDescriptionTemplate: string;
  embedColor: number;
  footerText: string | null;
  canonicalOrigin: string;
  includeSeed: boolean;
  includeOpenSeats: boolean;
  includeConfigurationSummary: boolean;
};

export interface AnnouncementStore {
  claim(id: string): Promise<AnnouncementClaim | null>;
  getRoom(id: string): Promise<AnnouncementRoom | null>;
  getMemberCount(id: string): Promise<number>;
  getSeats(id: string): Promise<AnnouncementSeat[]>;
  getConfig(): Promise<AnnouncementConfig | null>;
  markSent(id: string, messageId: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
}

export type AnnouncementDependencies = {
  store: AnnouncementStore;
  fetch: typeof fetch;
  env: {
    invocationSecret: string | undefined;
    discordWebhook: string | undefined;
  };
  timeoutMs?: number;
};

export type DiscordPayload = {
  username: string;
  avatar_url?: string;
  allowed_mentions: { parse: never[] };
  embeds: Array<{
    title: string;
    description: string;
    url: string;
    color: number;
    footer?: { text: string };
    fields?: Array<{ name: string; value: string; inline: boolean }>;
  }>;
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function sanitizeError(value: string): string {
  return value.replace(/[^a-z0-9_-]/giu, '_').slice(0, MAX_ERROR_LENGTH);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function secretsMatch(
  actual: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (!actual || !expected) return false;
  const [actualDigest, expectedDigest] = await Promise.all([
    digest(actual),
    digest(expected),
  ]);
  let difference = 0;
  for (let index = 0; index < actualDigest.length; index += 1) {
    difference |= actualDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

function markdownEscape(value: string): string {
  return value.replace(/[\\`*_{}[\]()<>#+\-.!|~>]/gu, '\\$&');
}

function safeOrigin(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('invalid_canonical_origin');
  }
  return url;
}

function substitute(
  template: string,
  placeholders: Record<string, string>,
): string {
  return template.replace(
    /\{\{([a-z_]+)\}\}/gu,
    (token, key: string) => placeholders[key] ?? token,
  );
}

function assertDiscordPayload(payload: DiscordPayload): void {
  const embed = payload.embeds[0];
  if (
    !embed ||
    embed.title.length < 1 ||
    embed.title.length > 256 ||
    embed.description.length < 1 ||
    embed.description.length > 4096 ||
    (embed.footer?.text.length ?? 0) > 2048 ||
    payload.username.length < 1 ||
    payload.username.length > 80
  ) {
    throw new Error('invalid_discord_payload');
  }
  const combinedLength =
    embed.title.length +
    embed.description.length +
    (embed.footer?.text.length ?? 0) +
    (embed.fields ?? []).reduce(
      (total, field) => total + field.name.length + field.value.length,
      0,
    );
  if (
    combinedLength > 6000 ||
    (embed.fields ?? []).some(
      (field) =>
        field.name.length < 1 ||
        field.name.length > 256 ||
        field.value.length < 1 ||
        field.value.length > 1024,
    )
  ) {
    throw new Error('invalid_discord_payload');
  }
}

export function buildDiscordPayload(
  room: AnnouncementRoom,
  memberCount: number,
  config: AnnouncementConfig,
): { joinUrl: string; payload: DiscordPayload } {
  const origin = safeOrigin(config.canonicalOrigin);
  const joinUrl = new URL(
    `/multiplayer/room/${encodeURIComponent(room.id)}`,
    origin,
  ).toString();
  const openSeats = Math.max(0, room.maxSeats - memberCount);
  const configurationSummary = `${room.territoryCount} territories · ${room.continentCount} continents · ${room.assignmentMode}`;
  const placeholders = {
    room_name: markdownEscape(room.name),
    join_url: joinUrl,
    open_seats: String(openSeats),
    max_seats: String(room.maxSeats),
    seed: markdownEscape(room.seed),
    territory_count: String(room.territoryCount),
    continent_count: String(room.continentCount),
    assignment_mode: markdownEscape(room.assignmentMode),
    configuration_summary: markdownEscape(configurationSummary),
  };
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (config.includeOpenSeats) {
    fields.push({
      name: 'Open seats',
      value: `${openSeats} of ${room.maxSeats}`,
      inline: true,
    });
  }
  if (config.includeSeed) {
    fields.push({
      name: 'Seed',
      value: markdownEscape(room.seed),
      inline: true,
    });
  }
  if (config.includeConfigurationSummary) {
    fields.push({
      name: 'Configuration',
      value: markdownEscape(configurationSummary),
      inline: false,
    });
  }
  const payload: DiscordPayload = {
    username: config.webhookUsername,
    ...(config.avatarUrl ? { avatar_url: config.avatarUrl } : {}),
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: substitute(config.embedTitleTemplate, placeholders),
        description: substitute(config.embedDescriptionTemplate, placeholders),
        url: joinUrl,
        color: config.embedColor,
        ...(config.footerText ? { footer: { text: config.footerText } } : {}),
        ...(fields.length ? { fields } : {}),
      },
    ],
  };
  assertDiscordPayload(payload);
  return { joinUrl, payload };
}

async function markFailure(
  dependencies: AnnouncementDependencies,
  announcementId: string,
  code: string,
): Promise<Response> {
  const sanitized = sanitizeError(code);
  await dependencies.store.markFailed(announcementId, sanitized);
  return jsonResponse(502, { code: sanitized });
}

export async function handleAnnouncementRequest(
  request: Request,
  dependencies: AnnouncementDependencies,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { code: 'method_not_allowed' });
  }
  if (!dependencies.env.invocationSecret) {
    return jsonResponse(500, { code: 'invocation_secret_missing' });
  }
  if (
    !(await secretsMatch(
      request.headers.get('apikey'),
      dependencies.env.invocationSecret,
    ))
  ) {
    return jsonResponse(401, { code: 'not_authenticated' });
  }

  let announcementId: string;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isUuid(body.announcementId)) throw new Error('invalid_request');
    announcementId = body.announcementId;
  } catch {
    return jsonResponse(400, { code: 'invalid_request' });
  }

  const claim = await dependencies.store.claim(announcementId);
  if (!claim) {
    return jsonResponse(409, { code: 'announcement_not_pending' });
  }
  if (!dependencies.env.discordWebhook) {
    return markFailure(dependencies, announcementId, 'discord_webhook_missing');
  }

  try {
    const [room, memberCount, seats, config] = await Promise.all([
      dependencies.store.getRoom(claim.roomId),
      dependencies.store.getMemberCount(claim.roomId),
      dependencies.store.getSeats(claim.roomId),
      dependencies.store.getConfig(),
    ]);
    if (!config) {
      return markFailure(
        dependencies,
        announcementId,
        'announcement_config_missing',
      );
    }
    if (!config.enabled) {
      await dependencies.store.markSkipped(
        announcementId,
        'configuration_disabled',
      );
      return jsonResponse(200, { code: 'configuration_disabled' });
    }
    if (
      !room ||
      room.visibility !== 'public' ||
      room.status !== 'waiting' ||
      memberCount >= room.maxSeats ||
      seats.length < room.maxSeats
    ) {
      await dependencies.store.markSkipped(announcementId, 'room_not_eligible');
      return jsonResponse(200, { code: 'room_not_eligible' });
    }

    const { payload } = buildDiscordPayload(room, memberCount, config);
    const webhookUrl = new URL(dependencies.env.discordWebhook);
    webhookUrl.searchParams.set('wait', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      dependencies.timeoutMs ?? DISCORD_TIMEOUT_MS,
    );
    let discordResponse: Response;
    try {
      discordResponse = await dependencies.fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const code =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'discord_timeout'
          : 'discord_request_failed';
      return markFailure(dependencies, announcementId, code);
    } finally {
      clearTimeout(timeout);
    }
    if (!discordResponse.ok) {
      return markFailure(
        dependencies,
        announcementId,
        `discord_http_${discordResponse.status}`,
      );
    }
    let messageId: unknown;
    try {
      const result = (await discordResponse.json()) as Record<string, unknown>;
      messageId = result.id;
    } catch {
      return markFailure(
        dependencies,
        announcementId,
        'discord_invalid_response',
      );
    }
    if (typeof messageId !== 'string' || !/^[0-9]+$/u.test(messageId)) {
      return markFailure(
        dependencies,
        announcementId,
        'discord_invalid_response',
      );
    }
    await dependencies.store.markSent(announcementId, messageId);
    return jsonResponse(200, { code: 'sent' });
  } catch {
    return markFailure(dependencies, announcementId, 'delivery_failed');
  }
}
