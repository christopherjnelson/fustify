export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      match_commands: {
        Row: {
          actor_seat_index: number;
          actor_user_id: string;
          client_idempotency_key: string;
          command_hash: string;
          command_payload: Json;
          command_type: string;
          created_at: string;
          id: number;
          match_id: string;
          previous_revision: number;
          resulting_revision: number;
          resulting_state_fingerprint: string;
          sequence: number;
        };
        Insert: {
          actor_seat_index: number;
          actor_user_id: string;
          client_idempotency_key: string;
          command_hash: string;
          command_payload: Json;
          command_type: string;
          created_at?: string;
          id?: never;
          match_id: string;
          previous_revision: number;
          resulting_revision: number;
          resulting_state_fingerprint: string;
          sequence: number;
        };
        Update: {
          actor_seat_index?: number;
          actor_user_id?: string;
          client_idempotency_key?: string;
          command_hash?: string;
          command_payload?: Json;
          command_type?: string;
          created_at?: string;
          id?: never;
          match_id?: string;
          previous_revision?: number;
          resulting_revision?: number;
          resulting_state_fingerprint?: string;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'match_commands_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      match_event_reactions: {
        Row: {
          created_at: string;
          event_id: string;
          match_id: string;
          reaction: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          match_id: string;
          reaction: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          match_id?: string;
          reaction?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_event_reactions_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      matches: {
        Row: {
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
        Insert: {
          created_at?: string;
          generator_metadata: Json;
          id?: string;
          last_command_type?: string | null;
          planet_snapshot?: Json | null;
          revision?: number;
          room_id: string;
          seat_order_snapshot: Json;
          setup_snapshot: Json;
          state_fingerprint?: string | null;
          state_snapshot?: Json | null;
          status?: string;
          updated_at?: string;
          winner_player_id?: string | null;
          winner_user_id?: string | null;
        };
        Update: {
          created_at?: string;
          generator_metadata?: Json;
          id?: string;
          last_command_type?: string | null;
          planet_snapshot?: Json | null;
          revision?: number;
          room_id?: string;
          seat_order_snapshot?: Json;
          setup_snapshot?: Json;
          state_fingerprint?: string | null;
          state_snapshot?: Json | null;
          status?: string;
          updated_at?: string;
          winner_player_id?: string | null;
          winner_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'matches_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: true;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      room_members: {
        Row: {
          display_name: string;
          joined_at: string;
          last_active_at: string;
          role: string;
          room_id: string;
          user_id: string;
        };
        Insert: {
          display_name: string;
          joined_at?: string;
          last_active_at?: string;
          role?: string;
          room_id: string;
          user_id: string;
        };
        Update: {
          display_name?: string;
          joined_at?: string;
          last_active_at?: string;
          role?: string;
          room_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_members_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      room_seats: {
        Row: {
          claimed_at: string | null;
          controller_type: string;
          occupant_user_id: string | null;
          ready: boolean;
          room_id: string;
          seat_index: number;
        };
        Insert: {
          claimed_at?: string | null;
          controller_type?: string;
          occupant_user_id?: string | null;
          ready?: boolean;
          room_id: string;
          seat_index: number;
        };
        Update: {
          claimed_at?: string | null;
          controller_type?: string;
          occupant_user_id?: string | null;
          ready?: boolean;
          room_id?: string;
          seat_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'room_seats_member_fk';
            columns: ['room_id', 'occupant_user_id'];
            isOneToOne: false;
            referencedRelation: 'room_members';
            referencedColumns: ['room_id', 'user_id'];
          },
          {
            foreignKeyName: 'room_seats_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      rooms: {
        Row: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        Insert: {
          assignment_mode?: string;
          continent_count?: number;
          created_at?: string;
          generator_version?: number;
          host_user_id: string;
          id?: string;
          join_code: string;
          max_seats?: number;
          name?: string;
          revision?: number;
          seed?: string;
          status?: string;
          territory_count?: number;
          thumbnail_path?: string | null;
          thumbnail_version?: number;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          assignment_mode?: string;
          continent_count?: number;
          created_at?: string;
          generator_version?: number;
          host_user_id?: string;
          id?: string;
          join_code?: string;
          max_seats?: number;
          name?: string;
          revision?: number;
          seed?: string;
          status?: string;
          territory_count?: number;
          thumbnail_path?: string | null;
          thumbnail_version?: number;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      authority_commit_match_command: {
        Args: {
          p_actor_user_id: string;
          p_client_idempotency_key: string;
          p_command_hash: string;
          p_command_payload: Json;
          p_command_type: string;
          p_expected_revision: number;
          p_match_id: string;
          p_state_fingerprint: string;
          p_state_snapshot: Json;
          p_winner_player_id: string;
          p_winner_user_id: string;
        };
        Returns: {
          duplicate: boolean;
          match_status: string;
          resulting_revision: number;
          resulting_state_fingerprint: string;
          winner_player_id: string;
          winner_user_id: string;
        }[];
      };
      authority_initialize_room_match: {
        Args: {
          p_actor_user_id: string;
          p_generator_metadata: Json;
          p_match_id: string;
          p_planet_snapshot: Json;
          p_room_id: string;
          p_seat_order_snapshot: Json;
          p_setup_snapshot: Json;
          p_state_fingerprint: string;
          p_state_snapshot: Json;
        };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'matches';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_room_seat: {
        Args: { room_id: string; seat_index: number };
        Returns: {
          claimed_at: string | null;
          controller_type: string;
          occupant_user_id: string | null;
          ready: boolean;
          room_id: string;
          seat_index: number;
        };
        SetofOptions: {
          from: '*';
          to: 'room_seats';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      close_room: {
        Args: { room_id: string };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_room: {
        Args: {
          assignment_mode?: string;
          continent_count?: number;
          display_name: string;
          game_name?: string;
          max_seats?: number;
          room_visibility?: string;
          seed?: string;
          territory_count?: number;
        };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ensure_own_profile: {
        Args: never;
        Returns: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      join_public_room: {
        Args: { p_room_id: string };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      join_room: {
        Args: { display_name: string; join_code: string };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      leave_room: { Args: { room_id: string }; Returns: undefined };
      list_public_rooms: {
        Args: never;
        Returns: {
          created_at: string;
          current_players: number;
          host_avatar_url: string | null;
          host_display_name: string;
          maximum_players: number;
          players: Json;
          room_id: string;
          room_name: string;
          room_state: string;
          thumbnail_path: string | null;
          thumbnail_version: number;
        }[];
      };
      publish_room_thumbnail: {
        Args: { p_room_id: string; p_thumbnail_path: string };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      release_room_seat: { Args: { room_id: string }; Returns: undefined };
      set_match_event_reaction: {
        Args: {
          p_event_id: string;
          p_match_id: string;
          p_reaction: string | null;
        };
        Returns: undefined;
      };
      start_room_match: {
        Args: { room_id: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'matches';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_own_profile: {
        Args: { p_avatar_url: string | null; p_display_name: string };
        Returns: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_room_settings: {
        Args: {
          assignment_mode: string;
          continent_count: number;
          max_seats: number;
          room_id: string;
          seed: string;
          territory_count: number;
        };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          generator_version: number;
          host_user_id: string;
          id: string;
          join_code: string;
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
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
