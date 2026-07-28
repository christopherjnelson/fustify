import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { gameReducer } from '../../../src/core/game/gameReducer.ts';
import type { MatchState } from '../../../src/core/game/types.ts';
import type { PlanetDefinition } from '../../../src/core/types/planet.ts';
import {
  isMatchState,
  parseGameAction,
  sha256Fingerprint,
  stableStringify,
} from '../../../src/multiplayer/gameProtocol.ts';
import { authorizeGameplayRequest } from '../../../src/multiplayer/requestAuthorization.ts';

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

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    'room_access_denied',
    'account_required',
    'account_blocked',
    'host_only',
    'not_enough_players',
    'multiplayer_draft_unsupported',
    'legacy_match_incomplete',
    'match_not_found',
    'match_not_active',
    'match_completed',
    'revision_conflict',
    'idempotency_conflict',
    'seat_required',
    'not_your_turn',
    'invalid_action',
    'invalid_request',
    'invalid_authoritative_state',
    'profile_unavailable',
  ].find((candidate) => message.includes(candidate));
  return known ?? 'multiplayer_request_failed';
}

function statusFor(code: string): number {
  if (code === 'revision_conflict' || code === 'idempotency_conflict')
    return 409;
  if (
    [
      'account_required',
      'account_blocked',
      'room_access_denied',
      'host_only',
      'seat_required',
      'not_your_turn',
    ].includes(code)
  )
    return 403;
  if (code === 'match_not_found') return 404;
  return 400;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST')
    return response(405, { code: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !publishableKey || !serviceRoleKey) {
    return response(500, { code: 'server_configuration_error' });
  }
  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authorized = await authorizeGameplayRequest(
    authorization,
    async (token) => {
      const { data, error } = await authClient.auth.getUser(token);
      return { user: data.user, error };
    },
  );
  if (!authorized.ok) {
    return response(authorized.status, { code: authorized.code });
  }
  const actorUserId = authorized.actorUserId;
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: moderation, error: moderationError } = await admin
      .from('account_moderation')
      .select('state,banned_until')
      .eq('user_id', actorUserId)
      .maybeSingle();
    if (moderationError) throw moderationError;
    if (
      moderation?.state === 'deleted' ||
      moderation?.state === 'revoked' ||
      (moderation?.state === 'banned' &&
        (!moderation.banned_until ||
          Date.parse(moderation.banned_until) > Date.now()))
    ) {
      throw new Error('account_blocked');
    }
    const { data: actorProfile, error: actorProfileError } = await admin
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', actorUserId)
      .maybeSingle();
    if (actorProfileError || actorProfile?.onboarding_completed !== true) {
      throw new Error('account_required');
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (body.operation !== 'command') throw new Error('invalid_request');
    if (
      typeof body.matchId !== 'string' ||
      !Number.isSafeInteger(body.expectedRevision) ||
      typeof body.idempotencyKey !== 'string'
    )
      throw new Error('invalid_request');
    const action = parseGameAction(body.action);
    const commandHash = await sha256Fingerprint({
      expectedRevision: body.expectedRevision,
      action,
    });
    const { data: match, error: matchError } = await admin
      .from('matches')
      .select('*')
      .eq('id', body.matchId)
      .single();
    if (matchError || !match) throw new Error('match_not_found');
    const actorSeat = (
      match.seat_order_snapshot as Array<Record<string, unknown>>
    ).find((seat) => seat.userId === actorUserId);
    if (!actorSeat) throw new Error('seat_required');
    const { data: currentSeat } = await admin
      .from('room_seats')
      .select('seat_index')
      .eq('room_id', match.room_id)
      .eq('occupant_user_id', actorUserId)
      .eq('controller_type', 'human')
      .maybeSingle();
    if (!currentSeat || currentSeat.seat_index !== actorSeat.seatIndex) {
      throw new Error('seat_required');
    }
    const { data: acceptedCommand } = await admin
      .from('match_commands')
      .select(
        'actor_user_id, command_hash, command_payload, resulting_revision, resulting_state_fingerprint',
      )
      .eq('match_id', body.matchId)
      .eq('client_idempotency_key', body.idempotencyKey)
      .maybeSingle();
    if (acceptedCommand) {
      if (
        acceptedCommand.actor_user_id !== actorUserId ||
        acceptedCommand.command_hash !== commandHash ||
        stableStringify(acceptedCommand.command_payload) !==
          stableStringify(action)
      ) {
        throw new Error('idempotency_conflict');
      }
      return response(200, {
        acceptedRevision: acceptedCommand.resulting_revision,
        stateFingerprint: acceptedCommand.resulting_state_fingerprint,
        duplicate: true,
      });
    }
    if (match.status === 'completed') throw new Error('match_completed');
    if (match.status !== 'active') throw new Error('match_not_active');
    if (match.revision !== body.expectedRevision)
      throw new Error('revision_conflict');
    if (!isMatchState(match.state_snapshot) || !match.planet_snapshot) {
      throw new Error('invalid_authoritative_state');
    }
    if (actorSeat.playerId !== match.state_snapshot.activePlayerId) {
      throw new Error('not_your_turn');
    }
    const transition = gameReducer(
      match.planet_snapshot as PlanetDefinition,
      match.state_snapshot as MatchState,
      action,
    );
    if (transition.error) {
      return response(422, {
        code: 'invalid_action',
        gameError: transition.error,
      });
    }
    const stateFingerprint = await sha256Fingerprint(transition.state);
    const winnerSeat = transition.state.winnerId
      ? (match.seat_order_snapshot as Array<Record<string, unknown>>).find(
          (seat) => seat.playerId === transition.state.winnerId,
        )
      : null;
    const { data: committed, error: commitError } = await admin.rpc(
      'authority_commit_match_command',
      {
        p_match_id: body.matchId,
        p_actor_user_id: actorUserId,
        p_expected_revision: body.expectedRevision,
        p_command_type: action.type,
        p_command_payload: action,
        p_command_hash: commandHash,
        p_client_idempotency_key: body.idempotencyKey,
        p_state_snapshot: transition.state,
        p_state_fingerprint: stateFingerprint,
        p_winner_player_id: transition.state.winnerId,
        p_winner_user_id:
          typeof winnerSeat?.userId === 'string' ? winnerSeat.userId : null,
      },
    );
    if (commitError) throw commitError;
    const result = Array.isArray(committed) ? committed[0] : committed;
    return response(200, {
      acceptedRevision: result.resulting_revision,
      stateFingerprint: result.resulting_state_fingerprint,
      duplicate: result.duplicate,
    });
  } catch (error) {
    const code = errorCode(error);
    return response(statusFor(code), { code });
  }
});
