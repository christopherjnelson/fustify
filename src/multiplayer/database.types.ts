export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      matches: {
        Row: {
          created_at: string;
          generator_metadata: Json;
          id: string;
          revision: number;
          room_id: string;
          seat_order_snapshot: Json;
          setup_snapshot: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          generator_metadata: Json;
          id?: string;
          revision?: number;
          room_id: string;
          seat_order_snapshot: Json;
          setup_snapshot: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          generator_metadata?: Json;
          id?: string;
          revision?: number;
          room_id?: string;
          seat_order_snapshot?: Json;
          setup_snapshot?: Json;
          status?: string;
          updated_at?: string;
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
          host_user_id: string;
          id: string;
          join_code: string;
          max_seats: number;
          revision: number;
          seed: string;
          status: string;
          territory_count: number;
          updated_at: string;
        };
        Insert: {
          assignment_mode?: string;
          continent_count?: number;
          created_at?: string;
          host_user_id: string;
          id?: string;
          join_code: string;
          max_seats?: number;
          revision?: number;
          seed?: string;
          status?: string;
          territory_count?: number;
          updated_at?: string;
        };
        Update: {
          assignment_mode?: string;
          continent_count?: number;
          created_at?: string;
          host_user_id?: string;
          id?: string;
          join_code?: string;
          max_seats?: number;
          revision?: number;
          seed?: string;
          status?: string;
          territory_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
          host_user_id: string;
          id: string;
          join_code: string;
          max_seats: number;
          revision: number;
          seed: string;
          status: string;
          territory_count: number;
          updated_at: string;
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
          max_seats?: number;
          seed?: string;
          territory_count?: number;
        };
        Returns: {
          assignment_mode: string;
          continent_count: number;
          created_at: string;
          host_user_id: string;
          id: string;
          join_code: string;
          max_seats: number;
          revision: number;
          seed: string;
          status: string;
          territory_count: number;
          updated_at: string;
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
          host_user_id: string;
          id: string;
          join_code: string;
          max_seats: number;
          revision: number;
          seed: string;
          status: string;
          territory_count: number;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      leave_room: { Args: { room_id: string }; Returns: undefined };
      release_room_seat: { Args: { room_id: string }; Returns: undefined };
      start_room_match: {
        Args: { room_id: string };
        Returns: {
          created_at: string;
          generator_metadata: Json;
          id: string;
          revision: number;
          room_id: string;
          seat_order_snapshot: Json;
          setup_snapshot: Json;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'matches';
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
          host_user_id: string;
          id: string;
          join_code: string;
          max_seats: number;
          revision: number;
          seed: string;
          status: string;
          territory_count: number;
          updated_at: string;
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
