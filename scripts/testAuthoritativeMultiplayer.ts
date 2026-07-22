import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/multiplayer/database.types';
import type { MatchState } from '../src/core/game/types';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

function player() {
  return createClient<Database>(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function invoke(
  client: SupabaseClient<Database>,
  body: Record<string, unknown>,
) {
  return client.functions.invoke('multiplayer-game', { body });
}

async function errorCode(error: unknown): Promise<string | null> {
  if (
    typeof error === 'object' &&
    error !== null &&
    'context' in error &&
    error.context instanceof Response
  ) {
    const body = (await error.context.clone().json()) as { code?: string };
    return body.code ?? null;
  }
  return null;
}

const host = player();
const guest = player();
const unseated = player();
const outsider = player();
let roomId: string | null = null;

try {
  for (const authorization of [null, 'Bearer invalid-token']) {
    const response = await fetch(`${url}/functions/v1/multiplayer-game`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ operation: 'start', roomId: crypto.randomUUID() }),
    });
    const body = (await response.json()) as { code?: string };
    if (response.status !== 401 || body.code !== 'not_authenticated') {
      throw new Error('Edge Function accepted a missing or invalid JWT.');
    }
  }

  for (const [index, client] of [host, guest, unseated, outsider].entries()) {
    const auth = await client.auth.signInAnonymously();
    if (auth.error) throw auth.error;
    if (index < 3) await new Promise((resolve) => setTimeout(resolve, 1_100));
  }

  const created = await host.rpc('create_room', {
    display_name: 'Authority Host',
    seed: 'remote-authority-test',
    territory_count: 12,
    continent_count: 2,
    assignment_mode: 'random',
    max_seats: 3,
  });
  if (created.error) throw created.error;
  roomId = created.data.id;
  for (const [client, name] of [
    [guest, 'Authority Guest'],
    [unseated, 'Unseated Member'],
  ] as const) {
    const joined = await client.rpc('join_room', {
      join_code: created.data.join_code,
      display_name: name,
    });
    if (joined.error) throw joined.error;
  }
  const claims = await Promise.all([
    host.rpc('claim_room_seat', { room_id: roomId, seat_index: 0 }),
    guest.rpc('claim_room_seat', { room_id: roomId, seat_index: 1 }),
  ]);
  if (claims.some(({ error }) => error))
    throw claims.find(({ error }) => error)!.error;

  const started = await invoke(host, { operation: 'start', roomId });
  if (started.error) throw started.error;
  const match = (
    started.data as { match: Database['public']['Tables']['matches']['Row'] }
  ).match;
  const initial = match.state_snapshot as unknown as MatchState;
  const target = Object.entries(initial.territories).find(
    ([, territory]) => territory.ownerId === initial.activePlayerId,
  )?.[0];
  if (!target) throw new Error('No reinforcement target in canonical state.');

  const directWrite = await host
    .from('matches')
    .update({
      revision: 99,
      winner_player_id: 'player-01',
      winner_user_id: (await host.auth.getUser()).data.user!.id,
    })
    .eq('id', match.id);
  if (!directWrite.error)
    throw new Error('Browser wrote canonical match state.');
  const fabricated = await host.from('match_commands').insert({
    match_id: match.id,
    sequence: 1,
    actor_user_id: (await host.auth.getUser()).data.user!.id,
    actor_seat_index: 0,
    command_type: 'ATTACK',
    command_payload: {},
    command_hash: 'a'.repeat(64),
    client_idempotency_key: crypto.randomUUID(),
    previous_revision: 0,
    resulting_revision: 1,
    resulting_state_fingerprint: 'a'.repeat(64),
  });
  if (!fabricated.error) throw new Error('Browser fabricated a command row.');

  const outsiderRead = await outsider
    .from('matches')
    .select('*')
    .eq('id', match.id);
  if (outsiderRead.error || outsiderRead.data.length !== 0) {
    throw new Error('Non-member match read was not denied by RLS.');
  }
  const outsiderCommand = await invoke(outsider, {
    operation: 'command',
    matchId: match.id,
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    action: { type: 'PLACE_REINFORCEMENT', territoryId: target, amount: 1 },
  });
  if ((await errorCode(outsiderCommand.error)) !== 'seat_required') {
    throw new Error('Non-member command was not rejected as seat_required.');
  }
  const unseatedCommand = await invoke(unseated, {
    operation: 'command',
    matchId: match.id,
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    action: { type: 'PLACE_REINFORCEMENT', territoryId: target, amount: 1 },
  });
  if ((await errorCode(unseatedCommand.error)) !== 'seat_required') {
    throw new Error('Unseated room member command was not rejected.');
  }
  const outOfTurn = await invoke(guest, {
    operation: 'command',
    matchId: match.id,
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    action: { type: 'PLACE_REINFORCEMENT', territoryId: target, amount: 1 },
  });
  if ((await errorCode(outOfTurn.error)) !== 'not_your_turn') {
    throw new Error('Out-of-turn seated player command was not rejected.');
  }

  const idempotencyKey = crypto.randomUUID();
  const command = {
    operation: 'command',
    matchId: match.id,
    expectedRevision: 0,
    idempotencyKey,
    action: { type: 'PLACE_REINFORCEMENT', territoryId: target, amount: 1 },
  };
  const duplicates = await Promise.all([
    invoke(host, command),
    invoke(host, command),
  ]);
  if (duplicates.some(({ error }) => error)) {
    throw duplicates.find(({ error }) => error)!.error;
  }
  const revisions = duplicates.map(
    ({ data }) => (data as { acceptedRevision: number }).acceptedRevision,
  );
  if (revisions.some((revision) => revision !== 1)) {
    throw new Error(`Duplicate revisions diverged: ${revisions.join(', ')}`);
  }
  const commands = await host
    .from('match_commands')
    .select('*')
    .eq('match_id', match.id)
    .eq('client_idempotency_key', idempotencyKey);
  if (commands.error || commands.data.length !== 1) {
    throw new Error('Duplicate idempotency key created multiple records.');
  }

  const reused = await invoke(host, {
    ...command,
    action: { type: 'PLACE_REINFORCEMENT', territoryId: target, amount: 2 },
  });
  if ((await errorCode(reused.error)) !== 'idempotency_conflict') {
    throw new Error('Reused key with another payload was not rejected.');
  }
  const suppliedCombat = await invoke(host, {
    operation: 'command',
    matchId: match.id,
    expectedRevision: 1,
    idempotencyKey: crypto.randomUUID(),
    action: {
      type: 'ATTACK',
      fromTerritoryId: target,
      toTerritoryId: target,
      diceCount: 1,
      diceResults: [6],
    },
  });
  if ((await errorCode(suppliedCombat.error)) !== 'invalid_action') {
    throw new Error('Client-supplied combat results were not rejected.');
  }
  const stale = await invoke(host, {
    ...command,
    idempotencyKey: crypto.randomUUID(),
  });
  if ((await errorCode(stale.error)) !== 'revision_conflict') {
    throw new Error('Stale revision was not rejected.');
  }

  console.log(
    'Authoritative remote security: JWT auth, RLS, direct-write denial, actor checks, server-owned combat, revision conflict, and idempotency passed.',
  );
} finally {
  if (roomId) {
    await host.rpc('close_room', { room_id: roomId });
    await Promise.all([
      host.rpc('leave_room', { room_id: roomId }),
      guest.rpc('leave_room', { room_id: roomId }),
      unseated.rpc('leave_room', { room_id: roomId }),
    ]);
  }
  await Promise.all(
    [host, guest, unseated, outsider].map((client) => client.auth.signOut()),
  );
}
