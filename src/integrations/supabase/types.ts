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
          {
            foreignKeyName: "blocked_dates_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
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
          custom_color: string | null
          custom_title: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          ends_at: string
          id: string
          is_custom: boolean
          notes: string | null
          notify_customer: boolean
          payment_status: string
          price_cents: number
          service_id: string | null
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
          custom_color?: string | null
          custom_title?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          ends_at: string
          id?: string
          is_custom?: boolean
          notes?: string | null
          notify_customer?: boolean
          payment_status?: string
          price_cents?: number
          service_id?: string | null
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
          custom_color?: string | null
          custom_title?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          ends_at?: string
          id?: string
          is_custom?: boolean
          notes?: string | null
          notify_customer?: boolean
          payment_status?: string
          price_cents?: number
          service_id?: string | null
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
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
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
      business_hour_periods: {
        Row: {
          business_id: string
          close_time: string
          created_at: string
          id: string
          open_time: string
          weekday: number
        }
        Insert: {
          business_id: string
          close_time: string
          created_at?: string
          id?: string
          open_time: string
          weekday: number
        }
        Update: {
          business_id?: string
          close_time?: string
          created_at?: string
          id?: string
          open_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hour_periods_business_id_fkey"
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
          address: string | null
          auth_user_id: string | null
          avatar_url: string | null
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
          address?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
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
          address?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
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
      inventory_items: {
        Row: {
          brand: string | null
          business_id: string
          cost_cents: number | null
          created_at: string
          current_stock: number
          id: string
          low_stock_threshold: number | null
          name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          business_id: string
          cost_cents?: number | null
          created_at?: string
          current_stock?: number
          id?: string
          low_stock_threshold?: number | null
          name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          business_id?: string
          cost_cents?: number | null
          created_at?: string
          current_stock?: number
          id?: string
          low_stock_threshold?: number | null
          name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_business_id_fkey"
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
      professional_invitations: {
        Row: {
          accepted_at: string | null
          accepted_business_id: string | null
          agreement_end: string | null
          agreement_start: string | null
          chair_label: string | null
          commission_percent: number | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          message: string | null
          rent_amount_cents: number | null
          rent_due_day: number | null
          rent_mode: string
          salon_business_id: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_business_id?: string | null
          agreement_end?: string | null
          agreement_start?: string | null
          chair_label?: string | null
          commission_percent?: number | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          message?: string | null
          rent_amount_cents?: number | null
          rent_due_day?: number | null
          rent_mode?: string
          salon_business_id: string
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_business_id?: string | null
          agreement_end?: string | null
          agreement_start?: string | null
          chair_label?: string | null
          commission_percent?: number | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          message?: string | null
          rent_amount_cents?: number | null
          rent_due_day?: number | null
          rent_mode?: string
          salon_business_id?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_invitations_accepted_business_id_fkey"
            columns: ["accepted_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_invitations_salon_business_id_fkey"
            columns: ["salon_business_id"]
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
      rent_payments: {
        Row: {
          amount_cents: number
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          paid_at: string | null
          paid_method: string | null
          period_end: string
          period_start: string
          salon_professional_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_method?: string | null
          period_end: string
          period_start: string
          salon_professional_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_method?: string | null
          period_end?: string
          period_start?: string
          salon_professional_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_payments_salon_professional_id_fkey"
            columns: ["salon_professional_id"]
            isOneToOne: false
            referencedRelation: "salon_professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_professionals: {
        Row: {
          agreement_end: string | null
          agreement_start: string | null
          chair_label: string | null
          color: string | null
          commission_percent: number | null
          created_at: string
          display_order: number
          id: string
          permissions: Json
          pro_business_id: string
          rent_amount_cents: number | null
          rent_due_day: number | null
          rent_mode: string
          salon_business_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agreement_end?: string | null
          agreement_start?: string | null
          chair_label?: string | null
          color?: string | null
          commission_percent?: number | null
          created_at?: string
          display_order?: number
          id?: string
          permissions?: Json
          pro_business_id: string
          rent_amount_cents?: number | null
          rent_due_day?: number | null
          rent_mode?: string
          salon_business_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agreement_end?: string | null
          agreement_start?: string | null
          chair_label?: string | null
          color?: string | null
          commission_percent?: number | null
          created_at?: string
          display_order?: number
          id?: string
          permissions?: Json
          pro_business_id?: string
          rent_amount_cents?: number | null
          rent_due_day?: number | null
          rent_mode?: string
          salon_business_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_professionals_pro_business_id_fkey"
            columns: ["pro_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_professionals_salon_business_id_fkey"
            columns: ["salon_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_recipe_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          inventory_item_id: string
          quantity: number
          service_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity?: number
          service_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_recipe_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_recipe_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_recipe_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "service_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          archived_at: string | null
          buffer_after_min: number
          buffer_before_min: number
          business_id: string
          category: string | null
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
          archived_at?: string | null
          buffer_after_min?: number
          buffer_before_min?: number
          business_id: string
          category?: string | null
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
          archived_at?: string | null
          buffer_after_min?: number
          buffer_before_min?: number
          business_id?: string
          category?: string | null
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
          {
            foreignKeyName: "staff_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      blocked_dates_public: {
        Row: {
          business_id: string | null
          ends_at: string | null
          id: string | null
          kind: string | null
          staff_id: string | null
          starts_at: string | null
        }
        Insert: {
          business_id?: string | null
          ends_at?: string | null
          id?: string | null
          kind?: string | null
          staff_id?: string | null
          starts_at?: string | null
        }
        Update: {
          business_id?: string | null
          ends_at?: string | null
          id?: string | null
          kind?: string | null
          staff_id?: string | null
          starts_at?: string | null
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
          {
            foreignKeyName: "blocked_dates_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_public: {
        Row: {
          active: boolean | null
          bio: string | null
          bookable: boolean | null
          business_id: string | null
          id: string | null
          name: string | null
          photo_url: string | null
          role: string | null
        }
        Insert: {
          active?: boolean | null
          bio?: string | null
          bookable?: boolean | null
          business_id?: string | null
          id?: string | null
          name?: string | null
          photo_url?: string | null
          role?: string | null
        }
        Update: {
          active?: boolean | null
          bio?: string | null
          bookable?: boolean | null
          business_id?: string | null
          id?: string | null
          name?: string | null
          photo_url?: string | null
          role?: string | null
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
    }
    Functions: {
      create_public_booking: {
        Args: {
          p_business_id: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_ends_at: string
          p_notes: string
          p_service_id: string
          p_staff_id: string
          p_starts_at: string
        }
        Returns: string
      }
      current_user_email: { Args: never; Returns: string }
      ensure_business_hours: {
        Args: { _business_id: string }
        Returns: undefined
      }
      is_business_owner: { Args: { _business_id: string }; Returns: boolean }
      is_linked_pro_of: {
        Args: { _salon_business_id: string }
        Returns: boolean
      }
      is_salon_owner_of_pro: {
        Args: { _pro_business_id: string }
        Returns: boolean
      }
      merge_customers: {
        Args: { _loser: string; _winner: string }
        Returns: undefined
      }
      reassign_staff_bookings: {
        Args: { _from_staff: string; _only_future?: boolean; _to_staff: string }
        Returns: number
      }
      salon_pro_permission: {
        Args: { _perm: string; _pro_business_id: string }
        Returns: boolean
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
