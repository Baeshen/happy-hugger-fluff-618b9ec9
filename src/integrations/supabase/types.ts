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
      appointment_audit: {
        Row: {
          appointment_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_notes: string | null
          new_status: Database["public"]["Enums"]["appointment_status"] | null
          old_notes: string | null
          old_status: Database["public"]["Enums"]["appointment_status"] | null
          reason: string | null
        }
        Insert: {
          appointment_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_notes?: string | null
          new_status?: Database["public"]["Enums"]["appointment_status"] | null
          old_notes?: string | null
          old_status?: Database["public"]["Enums"]["appointment_status"] | null
          reason?: string | null
        }
        Update: {
          appointment_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_notes?: string | null
          new_status?: Database["public"]["Enums"]["appointment_status"] | null
          old_notes?: string | null
          old_status?: Database["public"]["Enums"]["appointment_status"] | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_audit_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          created_at: string
          doctor_id: string | null
          gender: string | null
          id: string
          national_id: string | null
          notes: string | null
          patient_name: string
          patient_phone: string
          reason: string | null
          reminder_24h: boolean
          reminder_2h: boolean
          specialty_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          created_at?: string
          doctor_id?: string | null
          gender?: string | null
          id?: string
          national_id?: string | null
          notes?: string | null
          patient_name: string
          patient_phone: string
          reason?: string | null
          reminder_24h?: boolean
          reminder_2h?: boolean
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          created_at?: string
          doctor_id?: string | null
          gender?: string | null
          id?: string
          national_id?: string | null
          notes?: string | null
          patient_name?: string
          patient_phone?: string
          reason?: string | null
          reminder_24h?: boolean
          reminder_2h?: boolean
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          created_at: string
          doctor_id: string
          end_time: string
          id: string
          slot_minutes: number
          start_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          doctor_id: string
          end_time: string
          id?: string
          slot_minutes?: number
          start_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          doctor_id?: string
          end_time?: string
          id?: string
          slot_minutes?: number
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          bio_ar: string | null
          bio_en: string | null
          created_at: string
          id: string
          is_active: boolean
          languages: string[] | null
          name_ar: string
          name_en: string
          photo_url: string | null
          sort_order: number
          specialty_id: string | null
          title_ar: string | null
          title_en: string | null
        }
        Insert: {
          bio_ar?: string | null
          bio_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          languages?: string[] | null
          name_ar: string
          name_en: string
          photo_url?: string | null
          sort_order?: number
          specialty_id?: string | null
          title_ar?: string | null
          title_en?: string | null
        }
        Update: {
          bio_ar?: string | null
          bio_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          languages?: string[] | null
          name_ar?: string
          name_en?: string
          photo_url?: string | null
          sort_order?: number
          specialty_id?: string | null
          title_ar?: string | null
          title_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_orders: {
        Row: {
          address: string | null
          created_at: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          district: string | null
          id: string
          items_text: string | null
          notes: string | null
          patient_name: string
          patient_phone: string
          prescription_image_url: string | null
          status: Database["public"]["Enums"]["medicine_order_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          district?: string | null
          id?: string
          items_text?: string | null
          notes?: string | null
          patient_name: string
          patient_phone: string
          prescription_image_url?: string | null
          status?: Database["public"]["Enums"]["medicine_order_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          district?: string | null
          id?: string
          items_text?: string | null
          notes?: string | null
          patient_name?: string
          patient_phone?: string
          prescription_image_url?: string | null
          status?: Database["public"]["Enums"]["medicine_order_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reminder_preference_audit: {
        Row: {
          appointment_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_value: boolean | null
          old_value: boolean | null
          reason: string | null
          reminder_kind: string
          source: string
        }
        Insert: {
          appointment_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: boolean | null
          old_value?: boolean | null
          reason?: string | null
          reminder_kind: string
          source: string
        }
        Update: {
          appointment_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: boolean | null
          old_value?: boolean | null
          reason?: string | null
          reminder_kind?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_preference_audit_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          action: string
          actor: string | null
          appointment_id: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json | null
          reason: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          appointment_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          appointment_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          to_status?: string | null
        }
        Relationships: []
      }
      specialties: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          icon: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      cancel_appointment_by_ref: {
        Args: { _phone: string; _reason?: string; _ref: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_reminder_preferences_by_ref: {
        Args: { _phone: string; _ref: string }
        Returns: {
          changed_at: string
          id: string
          new_value: boolean
          old_value: boolean
          reason: string
          reminder_kind: string
          source: string
        }[]
      }
      log_security_event: {
        Args: {
          _action: string
          _appointment_id?: string
          _from_status?: string
          _metadata?: Json
          _reason?: string
          _to_status?: string
        }
        Returns: undefined
      }
      lookup_appointment: {
        Args: { _phone: string; _ref: string }
        Returns: {
          appointment_date: string
          appointment_time: string
          cancel_reason: string
          cancelled_at: string
          created_at: string
          doctor_id: string
          doctor_name_ar: string
          doctor_name_en: string
          id: string
          notes: string
          patient_name: string
          patient_phone: string
          reason: string
          reminder_24h: boolean
          reminder_2h: boolean
          specialty_id: string
          specialty_name_ar: string
          specialty_name_en: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      my_appointments: {
        Args: never
        Returns: {
          appointment_date: string
          appointment_time: string
          created_at: string
          doctor_name_ar: string
          doctor_name_en: string
          id: string
          notes: string
          patient_name: string
          patient_phone: string
          reason: string
          specialty_name_ar: string
          specialty_name_en: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      my_reminder_preference_audit: {
        Args: { _appointment_id: string }
        Returns: {
          changed_at: string
          id: string
          new_value: boolean
          old_value: boolean
          reason: string
          reminder_kind: string
          source: string
        }[]
      }
      normalize_reason: { Args: { _raw: string }; Returns: string }
      reschedule_appointment_by_ref: {
        Args: {
          _new_date: string
          _new_time: string
          _phone: string
          _reason?: string
          _ref: string
        }
        Returns: boolean
      }
      update_appointment_notes: {
        Args: { _id: string; _notes: string; _reason?: string }
        Returns: undefined
      }
      update_appointment_status: {
        Args: {
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: undefined
      }
      update_reminders_by_ref:
        | {
            Args: {
              _phone: string
              _ref: string
              _reminder_24h: boolean
              _reminder_2h: boolean
            }
            Returns: boolean
          }
        | {
            Args: {
              _phone: string
              _reason?: string
              _ref: string
              _reminder_24h: boolean
              _reminder_2h: boolean
            }
            Returns: boolean
          }
    }
    Enums: {
      app_role: "admin" | "reception" | "pharmacy"
      appointment_status:
        | "new"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      delivery_type: "pickup" | "delivery"
      medicine_order_status:
        | "new"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
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
      app_role: ["admin", "reception", "pharmacy"],
      appointment_status: [
        "new",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      delivery_type: ["pickup", "delivery"],
      medicine_order_status: [
        "new",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
