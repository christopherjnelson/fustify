// Multiplayer error-message mapping.
//
// This module is deliberately dependency-free so that shared match UI (for
// example the local event log) can translate multiplayer errors without
// pulling the whole multiplayer room API — and therefore its Supabase and zod
// schema graph — into the local game chunk. See
// docs/operations/bundle-analysis.md.

export const MULTIPLAYER_ERRORS: Record<string, string> = {
  already_joined: 'You already belong to this room.',
  already_seated: 'Release your current seat before claiming another.',
  account_required: 'A registered account is required for multiplayer.',
  auth_rate_limited: 'Too many account requests. Wait a moment and try again.',
  closed_room: 'This room is closed.',
  full_room: 'This room is full.',
  host_only: 'Only the room host can do that.',
  invalid_code: 'That room code is invalid.',
  invalid_display_name: 'Use a display name between 1 and 32 characters.',
  invalid_seat: 'That seat is not available.',
  invalid_settings: 'Those room settings are not supported.',
  invalid_action: 'That action is no longer legal. The match was refreshed.',
  invalid_authoritative_state:
    'The authoritative match state is unavailable. Reconnect and try again.',
  invalid_event_reaction: 'That Activity reaction is not available.',
  invalid_profile_display_name:
    'Your username is invalid. Edit your profile and try again.',
  invalid_room_name: 'Use a game name between 1 and 60 characters.',
  invalid_public_room_configuration:
    'Review and save valid room settings before opening the public lobby.',
  idempotency_conflict:
    'That request key was already used for a different action.',
  invalid_thumbnail_path: 'That world preview path is not available.',
  invalid_visibility: 'Choose Public or Private for this game.',
  legacy_match_incomplete:
    'This earlier preview cannot become a playable match. Create a new room.',
  match_snapshot_immutable: 'The match setup snapshot cannot be changed.',
  match_completed: 'This match is complete. No more actions can be played.',
  match_event_not_found:
    'That Activity entry is no longer available for reactions.',
  match_not_active: 'This match is not active.',
  multiplayer_draft_unsupported:
    'Player draft is not available in multiplayer yet. Choose random assignment.',
  not_authenticated: 'Your account session expired. Sign in and try again.',
  not_enough_players: 'Claim at least two human seats before starting.',
  not_your_turn: 'It is another player’s turn.',
  profile_unavailable:
    'Your player profile could not be loaded. Please try again.',
  private_room_thumbnail: 'Private games do not publish world previews.',
  public_room_unavailable:
    'That public game is no longer available. Choose another game.',
  published_room_settings_locked:
    'Public lobby settings are permanently locked.',
  room_already_published:
    'This room is already public. Refresh to load its locked settings.',
  revision_conflict: 'The match changed before that action was accepted.',
  room_access_denied: 'This private room is unavailable to this player.',
  room_active: 'This room has already started.',
  room_not_waiting: 'This action is available only while the room is waiting.',
  server_configuration_error:
    'Match initialization is not configured on this server.',
  seat_conflict: 'Another player claimed that seat first.',
  seat_required: 'Claimed seat membership is required to play this match.',
  settings_conflict:
    'Release affected seats or members before reducing capacity.',
};

export function multiplayerError(error: unknown): Error {
  const message = multiplayerErrorText(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : null;
  if (status === 429 || /request rate limit reached/i.test(message)) {
    return new Error(MULTIPLAYER_ERRORS.auth_rate_limited);
  }
  if (Object.values(MULTIPLAYER_ERRORS).includes(message)) {
    return error instanceof Error ? error : new Error(message);
  }
  const key = Object.keys(MULTIPLAYER_ERRORS).find((candidate) =>
    message.includes(candidate),
  );
  return new Error(
    key ? MULTIPLAYER_ERRORS[key] : 'Multiplayer request failed.',
  );
}

function multiplayerErrorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
      ? error.message
      : String(error);
}
