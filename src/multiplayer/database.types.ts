export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface ApplicationTables {
  match_event_reactions: {
    created_at: string;
    event_id: string;
    match_id: string;
    reaction: string;
    updated_at: string;
    user_id: string;
  };
  matches: {
    created_at: string;
    generator_metadata: Json;
    id: string;
    last_command_type: string | null;
    planet_snapshot: Json | null;
    revision: number;
    room_id: string;
    seat_order_snapshot: Json;
    setup_snapshot: Json;
    state_fingerprint: string | null;
    state_snapshot: Json | null;
    status: string;
    updated_at: string;
    winner_player_id: string | null;
    winner_user_id: string | null;
  };
  room_members: {
    display_name: string;
    joined_at: string;
    last_active_at: string;
    role: string;
    room_id: string;
    user_id: string;
  };
  room_seats: {
    claimed_at: string | null;
    controller_type: string;
    occupant_user_id: string | null;
    ready: boolean;
    room_id: string;
    seat_index: number;
  };
  rooms: {
    assignment_mode: string;
    continent_count: number;
    created_at: string;
    generator_version: number;
    host_user_id: string;
    id: string;
    join_code: string | null;
    max_seats: number;
    name: string;
    revision: number;
    seed: string;
    status: string;
    territory_count: number;
    thumbnail_path: string | null;
    thumbnail_version: number;
    updated_at: string;
    visibility: string;
  };
}

export interface Database {
  public: { Tables: ApplicationTables };
}

export type Tables<Name extends keyof ApplicationTables> =
  ApplicationTables[Name];
