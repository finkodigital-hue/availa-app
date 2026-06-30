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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blocked_dates: {
        Row: {
          business_id: string
          ends_at: string
          id: string
          kind: string | null
          reason: string | null
          staff_id: string | null
          starts_at: string
          title: string | null
        }
        Insert: {
          business_id: string
          ends_at: string
          id?: string
          kind?: string | null
          reason?: string | null
          staff_id?: string | null
          starts_at: string
          title?: string | null
        }
        Update: {
          business_id?: string
          ends_at?: string
          id?: string
          kind?: string | null
          reason?: string | null
          staff_id?: string | null
          starts_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_dates_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          amount_refunded_cents: number
          business_id: string
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          ends_at: string
          id: string
          notes: string | null
          notify_customer: boolean
          payment_status: string
          price_cents: number
          service_id: string
          source: string
          staff_id: string
          starts_at: string
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_due_cents?: number
          amount_paid_cents?: number
          amount_refunded_cents?: number
          business_id: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          notify_customer?: boolean
          payment_status?: string
          price_cents?: number
          service_id: string
          source?: string
          staff_id: string
          starts_at: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          amount_refunded_cents?: number
          business_id?: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          notify_customer?: boolean
          payment_status?: string
          price_cents?: number
          service_id?: string
          source?: string
          staff_id?: string
          starts_at?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      business_goals: {
        Row: {
          bookings_target: number
          business_id: string
          created_at: string
          customers_target: number
          id: string
          month: string
          revenue_cents_target: number
          updated_at: string
        }
        Insert: {
          bookings_target?: number
          business_id: string
          created_at?: string
          customers_target?: number
          id?: string
          month: string
          revenue_cents_target?: number
          updated_at?: string
        }
        Update: {
          bookings_target?: number
          business_id?: string
          created_at?: string
          customers_target?: number
          id?: string
          month?: string
          revenue_cents_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_goals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          business_id: string
          close_time: string | null
          closed: boolean
          id: string
          open_time: string | null
          weekday: number
        }
        Insert: {
          business_id: string
          close_time?: string | null
          closed?: boolean
          id?: string
          open_time?: string | null
          weekday: number
        }
        Update: {
          business_id?: string
          close_time?: string | null
          closed?: boolean
          id?: string
          open_time?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_media: {
        Row: {
          business_id: string
          created_at: string
          id: string
          kind: string
          path: string
          sort_order: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          kind: string
          path: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_media_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          accent_color: string | null
          address: string | null
          booking_instructions: string | null
          border_radius: number
          brand_color: string | null
          browser_title: string | null
          button_style: string
          cancellation_policy: string | null
          cancellation_window_hours: number
          cover_image_url: string | null
          created_at: string
          currency: string
          custom_domain: string | null
          deposit_percent: number
          description: string | null
          email: string | null
          email_footer: string | null
          email_logo_url: string | null
          emergency_active: boolean
          emergency_message: string | null
          facebook: string | null
          faq: Json
          favicon_url: string | null
          font: string
          hide_powered_by: boolean
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          owner_id: string
          payment_mode: string
          phone: string | null
          plan: string
          secondary_color: string | null
          show_durations: boolean
          show_prices: boolean
          show_staff: boolean
          slug: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          terms: string | null
          theme: string
          tiktok: string | null
          timezone: string
          twitter: string | null
          updated_at: string
          website: string | null
          welcome_message: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          booking_instructions?: string | null
          border_radius?: number
          brand_color?: string | null
          browser_title?: string | null
          button_style?: string
          cancellation_policy?: string | null
          cancellation_window_hours?: number
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          custom_domain?: string | null
          deposit_percent?: number
          description?: string | null
          email?: string | null
          email_footer?: string | null
          email_logo_url?: string | null
          emergency_active?: boolean
          emergency_message?: string | null
          facebook?: string | null
          faq?: Json
          favicon_url?: string | null
          font?: string
          hide_powered_by?: boolean
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          payment_mode?: string
          phone?: string | null
          plan?: string
          secondary_color?: string | null
          show_durations?: boolean
          show_prices?: boolean
          show_staff?: boolean
          slug: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          terms?: string | null
          theme?: string
          tiktok?: string | null
          timezone?: string
          twitter?: string | null
          updated_at?: string
          website?: string | null
          welcome_message?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          booking_instructions?: string | null
          border_radius?: number
          brand_color?: string | null
          browser_title?: string | null
          button_style?: string
          cancellation_policy?: string | null
          cancellation_window_hours?: number
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          custom_domain?: string | null
          deposit_percent?: number
          description?: string | null
          email?: string | null
          email_footer?: string | null
          email_logo_url?: string | null
          emergency_active?: boolean
          emergency_message?: string | null
          facebook?: string | null
          faq?: Json
          favicon_url?: string | null
          font?: string
          hide_powered_by?: boolean
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          payment_mode?: string
          phone?: string | null
          plan?: string
          secondary_color?: string | null
          show_durations?: boolean
          show_prices?: boolean
          show_staff?: boolean
          slug?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          terms?: string | null
          theme?: string
          tiktok?: string | null
          timezone?: string
          twitter?: string | null
          updated_at?: string
          website?: string | null
          welcome_message?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          auth_user_id: string | null
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_closures: {
        Row: {
          business_id: string
          created_at: string
          ends_on: string
          id: string
          label: string
          starts_on: string
        }
        Insert: {
          business_id: string
          created_at?: string
          ends_on: string
          id?: string
          label: string
          starts_on: string
        }
        Update: {
          business_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          label?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_closures_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string | null
          business_id: string
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          description: string | null
          error_message: string | null
          id: string
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          business_id: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          status: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          business_id?: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_staff: {
        Row: {
          business_id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          business_id: string
          service_id: string
          staff_id: string
        }
        Update: {
          business_id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          buffer_after_min: number
          buffer_before_min: number
          business_id: string
          color: string | null
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number
          id: string
          image_url: string | null
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          buffer_after_min?: number
          buffer_before_min?: number
          business_id: string
          color?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          image_url?: string | null
          name: string
          price_cents?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          buffer_after_min?: number
          buffer_before_min?: number
          business_id?: string
          color?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          image_url?: string | null
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          bio: string | null
          bookable: boolean
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bio?: string | null
          bookable?: boolean
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bio?: string | null
          bookable?: boolean
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_hours: {
        Row: {
          business_id: string
          close_time: string | null
          closed: boolean
          id: string
          open_time: string | null
          staff_id: string
          weekday: number
        }
        Insert: {
          business_id: string
          close_time?: string | null
          closed?: boolean
          id?: string
          open_time?: string | null
          staff_id: string
          weekday: number
        }
        Update: {
          business_id?: string
          close_time?: string | null
          closed?: boolean
          id?: string
          open_time?: string | null
          staff_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_email: { Args: never; Returns: string }
      is_business_owner: { Args: { _business_id: string }; Returns: boolean }
      merge_customers: {
        Args: { _loser: string; _winner: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
