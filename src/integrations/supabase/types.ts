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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action_type: string
          batch_id: string | null
          batch_name: string
          created_at: string
          description: string
          id: string
          mod_id: string
          mod_name: string
        }
        Insert: {
          action_type: string
          batch_id?: string | null
          batch_name?: string
          created_at?: string
          description: string
          id?: string
          mod_id: string
          mod_name?: string
        }
        Update: {
          action_type?: string
          batch_id?: string | null
          batch_name?: string
          created_at?: string
          description?: string
          id?: string
          mod_id?: string
          mod_name?: string
        }
        Relationships: []
      }
      announcement_poll_options: {
        Row: {
          announcement_id: string
          id: string
          option_text: string
          position: number
        }
        Insert: {
          announcement_id: string
          id?: string
          option_text: string
          position?: number
        }
        Update: {
          announcement_id?: string
          id?: string
          option_text?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "announcement_poll_options_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_votes: {
        Row: {
          announcement_id: string
          option_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          announcement_id: string
          option_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          announcement_id?: string
          option_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_votes_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "announcement_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          archived: boolean
          body: string | null
          created_at: string
          created_by: string
          has_poll: boolean
          id: string
          target_type: string
          title: string
        }
        Insert: {
          archived?: boolean
          body?: string | null
          created_at?: string
          created_by: string
          has_poll?: boolean
          id?: string
          target_type?: string
          title: string
        }
        Update: {
          archived?: boolean
          body?: string | null
          created_at?: string
          created_by?: string
          has_poll?: boolean
          id?: string
          target_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          absence_category: string | null
          absence_note: string | null
          batch_id: string
          id: string
          session_index: number
          state: string
          student_id: string
        }
        Insert: {
          absence_category?: string | null
          absence_note?: string | null
          batch_id: string
          id?: string
          session_index: number
          state?: string
          student_id: string
        }
        Update: {
          absence_category?: string | null
          absence_note?: string | null
          batch_id?: string
          id?: string
          session_index?: number
          state?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          id: string
          mod_id: string
          month: number
          name: string
          start_date: string | null
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          mod_id: string
          month: number
          name: string
          start_date?: string | null
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          mod_id?: string
          month?: number
          name?: string
          start_date?: string | null
          year?: number
        }
        Relationships: []
      }
      demo_days: {
        Row: {
          batch_id: string
          date: string | null
          day_number: number
          id: string
          title: string
        }
        Insert: {
          batch_id: string
          date?: string | null
          day_number: number
          id?: string
          title: string
        }
        Update: {
          batch_id?: string
          date?: string | null
          day_number?: number
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_days_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_feedback: {
        Row: {
          created_at: string
          demo_day_id: string
          feedback: string
          id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          demo_day_id: string
          feedback?: string
          id?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          demo_day_id?: string
          feedback?: string
          id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_feedback_demo_day_id_fkey"
            columns: ["demo_day_id"]
            isOneToOne: false
            referencedRelation: "demo_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_scores: {
        Row: {
          criterion: string
          demo_day_id: string
          id: string
          makeup_date: string | null
          makeup_note: string | null
          score: number
          student_id: string
        }
        Insert: {
          criterion: string
          demo_day_id: string
          id?: string
          makeup_date?: string | null
          makeup_note?: string | null
          score?: number
          student_id: string
        }
        Update: {
          criterion?: string
          demo_day_id?: string
          id?: string
          makeup_date?: string | null
          makeup_note?: string | null
          score?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_scores_demo_day_id_fkey"
            columns: ["demo_day_id"]
            isOneToOne: false
            referencedRelation: "demo_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      houston_query_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          question: string | null
          response_chars: number | null
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          question?: string | null
          response_chars?: number | null
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          question?: string | null
          response_chars?: number | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      mod_invites: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          revoked_at: string | null
          token: string
          uses: number
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          revoked_at?: string | null
          token: string
          uses?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          revoked_at?: string | null
          token?: string
          uses?: number
        }
        Relationships: []
      }
      moderator_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          id: string
          mod_id: string | null
          temp_password: string | null
          used: boolean
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          id?: string
          mod_id?: string | null
          temp_password?: string | null
          used?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          id?: string
          mod_id?: string | null
          temp_password?: string | null
          used?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          last_sign_in: string | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          last_sign_in?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_sign_in?: string | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      rescheduled_sessions: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string
          day_name: string
          from_day: string | null
          from_week: number | null
          id: string
          new_date: string
          original_date: string | null
          reason: string | null
          to_date: string | null
          to_week: number | null
          week_number: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by: string
          day_name: string
          from_day?: string | null
          from_week?: number | null
          id?: string
          new_date: string
          original_date?: string | null
          reason?: string | null
          to_date?: string | null
          to_week?: number | null
          week_number: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string
          day_name?: string
          from_day?: string | null
          from_week?: number | null
          id?: string
          new_date?: string
          original_date?: string | null
          reason?: string | null
          to_date?: string | null
          to_week?: number | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rescheduled_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      student_action_snoozes: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          reason: string | null
          snooze_type: string
          snoozed_at: string
          snoozed_by: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          reason?: string | null
          snooze_type: string
          snoozed_at?: string
          snoozed_by?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          reason?: string | null
          snooze_type?: string
          snoozed_at?: string
          snoozed_by?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_action_snoozes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_viewed_at: string | null
          revoked_at: string | null
          slug: string
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          slug: string
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          slug?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_share_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          name: string
          status: string
          status_changed_at: string | null
          status_reason: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
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
      week_status: {
        Row: {
          batch_id: string
          closed_at: string | null
          created_at: string
          finalised_at: string | null
          finalised_by: string | null
          id: string
          reopened_at: string | null
          reopened_by: string | null
          status: string
          updated_at: string
          week_number: number
        }
        Insert: {
          batch_id: string
          closed_at?: string | null
          created_at?: string
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          reopened_at?: string | null
          reopened_by?: string | null
          status?: string
          updated_at?: string
          week_number: number
        }
        Update: {
          batch_id?: string
          closed_at?: string | null
          created_at?: string
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          reopened_at?: string | null
          reopened_by?: string | null
          status?: string
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "week_status_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_status_finalised_by_fkey"
            columns: ["finalised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_status_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_invite_token: { Args: { p_token: string }; Returns: boolean }
      exec_select_query: { Args: { query: string }; Returns: Json }
      get_student_share_data: { Args: { p_slug: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      setup_invite_account: { Args: { p_token: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator"],
    },
  },
} as const
