import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import {
  handleAnnouncementRequest,
  type AnnouncementConfig,
  type AnnouncementRoom,
  type AnnouncementSeat,
  type AnnouncementStore,
} from './announcement.ts';
import { buildAnnouncementPreview } from './preview.ts';

type SupabaseClient = ReturnType<typeof createClient>;

function serverError(): never {
  throw new Error('database_operation_failed');
}

function announcementStore(client: SupabaseClient): AnnouncementStore {
  return {
    async claim(id) {
      const { data, error } = await client.rpc(
        'claim_discord_room_announcement',
        { p_announcement_id: id },
      );
      if (error) serverError();
      const claimed = data?.[0];
      return claimed
        ? {
            announcementId: claimed.announcement_id,
            roomId: claimed.room_id,
            attemptCount: claimed.attempt_count,
          }
        : null;
    },
    async getRoom(id) {
      const { data, error } = await client
        .from('rooms')
        .select(
          'id, name, visibility, status, seed, territory_count, continent_count, assignment_mode, max_seats, generator_version',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) serverError();
      return data
        ? ({
            id: data.id,
            name: data.name,
            visibility: data.visibility,
            status: data.status,
            seed: data.seed,
            territoryCount: data.territory_count,
            continentCount: data.continent_count,
            assignmentMode: data.assignment_mode,
            maxSeats: data.max_seats,
            generatorVersion: data.generator_version,
          } satisfies AnnouncementRoom)
        : null;
    },
    async getMemberCount(id) {
      const { count, error } = await client
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', id);
      if (error || count === null) serverError();
      return count;
    },
    async getSeats(id) {
      const { data, error } = await client
        .from('room_seats')
        .select('seat_index, occupant_user_id, controller_type')
        .eq('room_id', id)
        .order('seat_index');
      if (error) serverError();
      return (data ?? []).map((seat): AnnouncementSeat => ({
        seatIndex: seat.seat_index,
        occupantUserId: seat.occupant_user_id,
        controllerType: seat.controller_type,
      }));
    },
    async getConfig() {
      const { data, error } = await client
        .from('discord_room_announcement_config')
        .select('*')
        .eq('id', true)
        .maybeSingle();
      if (error) serverError();
      return data
        ? ({
            enabled: data.enabled,
            webhookUsername: data.webhook_username,
            avatarUrl: data.avatar_url,
            embedTitleTemplate: data.embed_title_template,
            embedDescriptionTemplate: data.embed_description_template,
            embedColor: data.embed_color,
            footerText: data.footer_text,
            canonicalOrigin: data.canonical_origin,
            includeOpenSeats: data.include_open_seats,
            includeConfigurationSummary: data.include_configuration_summary,
          } satisfies AnnouncementConfig)
        : null;
    },
    async markSent(id, messageId) {
      const { error } = await client
        .from('discord_room_announcements')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          discord_message_id: messageId,
          last_error: null,
        })
        .eq('id', id)
        .eq('status', 'processing');
      if (error) serverError();
    },
    async markFailed(id, errorCode) {
      const { error } = await client
        .from('discord_room_announcements')
        .update({ status: 'failed', last_error: errorCode })
        .eq('id', id)
        .eq('status', 'processing');
      if (error) serverError();
    },
    async markSkipped(id, reason) {
      const { error } = await client
        .from('discord_room_announcements')
        .update({ status: 'skipped', last_error: reason })
        .eq('id', id)
        .eq('status', 'processing');
      if (error) serverError();
    },
  };
}

Deno.serve((request) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    return Response.json(
      { code: 'server_configuration_error' },
      { status: 500 },
    );
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handleAnnouncementRequest(request, {
    store: announcementStore(client),
    fetch,
    createPreview: (room) =>
      buildAnnouncementPreview({
        seed: room.seed,
        territoryCount: room.territoryCount,
        continentCount: room.continentCount,
        playerCapacity: room.maxSeats,
        generatorVersion: room.generatorVersion,
      }),
    env: {
      invocationSecret: Deno.env.get(
        'DISCORD_ROOM_ANNOUNCEMENT_INVOCATION_SECRET',
      ),
      discordWebhook: Deno.env.get('DISCORD_WEBHOOK'),
    },
  });
});
