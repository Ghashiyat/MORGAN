export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      areeba_memories: {
        Row: {
          memory: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          memory?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          memory?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      capture_notes: {
        Row: {
          created_at: string
          duration_s: number
          id: string
          notes: string
          status: string
          title: string
          transcript: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_s?: number
          id?: string
          notes?: string
          status?: string
          title?: string
          transcript?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_s?: number
          id?: string
          notes?: string
          status?: string
          title?: string
          transcript?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_digest: {
        Row: {
          created_at: string
          day: string
          items: Json
        }
        Insert: {
          created_at?: string
          day: string
          items?: Json
        }
        Update: {
          created_at?: string
          day?: string
          items?: Json
        }
        Relationships: []
      }
      learned_profiles: {
        Row: {
          profile: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          profile?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          profile?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          importance: number
          kind: string
          pinned: boolean
          project: string | null
          source: string
          status: string
          superseded_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          importance?: number
          kind?: string
          pinned?: boolean
          project?: string | null
          source?: string
          status?: string
          superseded_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          importance?: number
          kind?: string
          pinned?: boolean
          project?: string | null
          source?: string
          status?: string
          superseded_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          reply_to: string | null
          role: string
          thread_id: string
          ui_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          reply_to?: string | null
          role: string
          thread_id: string
          ui_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          reply_to?: string | null
          role?: string
          thread_id?: string
          ui_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_logs: {
        Row: {
          created_at: string
          error_kind: string | null
          id: string
          latency_ms: number | null
          outcome: string
          provider: string
          request_id: string
          user_id: string
          won: boolean
        }
        Insert: {
          created_at?: string
          error_kind?: string | null
          id?: string
          latency_ms?: number | null
          outcome: string
          provider: string
          request_id: string
          user_id: string
          won?: boolean
        }
        Update: {
          created_at?: string
          error_kind?: string | null
          id?: string
          latency_ms?: number | null
          outcome?: string
          provider?: string
          request_id?: string
          user_id?: string
          won?: boolean
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          created_at: string
          query_key: string
          results: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          query_key: string
          results: Json
          user_id: string
        }
        Update: {
          created_at?: string
          query_key?: string
          results?: Json
          user_id?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_speak: boolean
          memory_enabled: boolean
          personality: Json
          search_blocked_until: string | null
          updated_at: string
          user_id: string
          voice_gender: string
          voice_input: boolean
          voice_name: string | null
          voice_output: boolean
          voice_settings: Json
          web_search: boolean
        }
        Insert: {
          auto_speak?: boolean
          memory_enabled?: boolean
          personality?: Json
          search_blocked_until?: string | null
          updated_at?: string
          user_id: string
          voice_gender?: string
          voice_input?: boolean
          voice_name?: string | null
          voice_output?: boolean
          voice_settings?: Json
          web_search?: boolean
        }
        Update: {
          auto_speak?: boolean
          memory_enabled?: boolean
          personality?: Json
          search_blocked_until?: string | null
          updated_at?: string
          user_id?: string
          voice_gender?: string
          voice_input?: boolean
          voice_name?: string | null
          voice_output?: boolean
          voice_settings?: Json
          web_search?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
