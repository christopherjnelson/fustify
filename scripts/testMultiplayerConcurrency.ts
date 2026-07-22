import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

const first = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const second = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let roomId: string | null = null;
try {
  const firstAuth = await first.auth.signInAnonymously();
  if (firstAuth.error) throw firstAuth.error;
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const secondAuth = await second.auth.signInAnonymously();
  if (secondAuth.error) throw secondAuth.error;

  const created = await first.rpc('create_room', {
    display_name: 'Concurrency A',
  });
  if (created.error) throw created.error;
  roomId = created.data.id;
  const joined = await second.rpc('join_room', {
    join_code: created.data.join_code,
    display_name: 'Concurrency B',
  });
  if (joined.error) throw joined.error;

  const results = await Promise.allSettled([
    first
      .rpc('claim_room_seat', { room_id: roomId, seat_index: 0 })
      .then(({ error }) => {
        if (error) throw error;
      }),
    second
      .rpc('claim_room_seat', { room_id: roomId, seat_index: 0 })
      .then(({ error }) => {
        if (error) throw error;
      }),
  ]);
  const winners = results.filter((result) => result.status === 'fulfilled');
  const conflicts = results.filter(
    (result) =>
      result.status === 'rejected' &&
      typeof result.reason === 'object' &&
      result.reason !== null &&
      'message' in result.reason &&
      result.reason.message === 'seat_conflict',
  );
  if (winners.length !== 1 || conflicts.length !== 1) {
    throw new Error(
      `Expected one winner and one seat_conflict: ${JSON.stringify(results)}`,
    );
  }

  const seats = await first
    .from('room_seats')
    .select('*')
    .eq('room_id', roomId);
  if (seats.error) throw seats.error;
  if (
    seats.data.filter((seat) => seat.occupant_user_id !== null).length !== 1
  ) {
    throw new Error('Concurrent claim produced invalid occupancy.');
  }
  console.log(
    'Concurrent seat claim: one winner, one stable conflict, valid occupancy.',
  );
} finally {
  if (roomId) {
    await first.rpc('close_room', { room_id: roomId });
    await Promise.all([
      first.rpc('leave_room', { room_id: roomId }),
      second.rpc('leave_room', { room_id: roomId }),
    ]);
  }
  await Promise.all([first.auth.signOut(), second.auth.signOut()]);
}
