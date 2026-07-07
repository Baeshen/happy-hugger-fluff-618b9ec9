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
      about_sections: {
        Row: {
          body_ar: string | null
          body_en: string | null
          created_at: string
          id: string
          is_active: boolean
          section_key: string
          sort_order: number
          title_ar: string | null
          title_en: string | null
          updated_at: string
        }
        Insert: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          section_key: string
          sort_order?: number
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          section_key?: string
          sort_order?: number
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
          branch_id: string | null
          created_at: string
          doctor_id: string | null
          gender: string | null
          id: string
          national_id: string | null
          notes: string | null
          patient_email: string | null
          patient_id: string | null
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
          branch_id?: string | null
          created_at?: string
          doctor_id?: string | null
          gender?: string | null
          id?: string
          national_id?: string | null
          notes?: string | null
          patient_email?: string | null
          patient_id?: string | null
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
          branch_id?: string | null
          created_at?: string
          doctor_id?: string | null
          gender?: string | null
          id?: string
          national_id?: string | null
          notes?: string | null
          patient_email?: string | null
          patient_id?: string | null
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
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
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
          branch_id: string | null
          created_at: string
          doctor_id: string
          end_time: string
          id: string
          slot_minutes: number
          start_time: string
          weekday: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doctor_id: string
          end_time: string
          id?: string
          slot_minutes?: number
          start_time: string
          weekday: number
        }
        Update: {
          branch_id?: string | null
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
            foreignKeyName: "availability_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_mrn_counter: {
        Row: {
          branch_id: string
          last_value: number
        }
        Insert: {
          branch_id: string
          last_value?: number
        }
        Update: {
          branch_id?: string
          last_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_mrn_counter_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address_ar: string | null
          address_en: string | null
          city_ar: string | null
          city_en: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name_ar: string
          name_en: string
          phone: string | null
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          city_ar?: string | null
          city_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name_ar: string
          name_en: string
          phone?: string | null
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          city_ar?: string | null
          city_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name_ar?: string
          name_en?: string
          phone?: string | null
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinic_settings: {
        Row: {
          address_ar: string
          address_country: string
          address_en: string
          address_locality: string
          address_region: string
          branch_id: string | null
          created_at: string
          currencies_accepted: string | null
          email: string | null
          id: number
          lat: number
          lng: number
          maps_url: string | null
          medical_specialties: string[]
          mobile: string | null
          mobile_display: string | null
          name_ar: string
          name_en: string
          opening_hours: Json
          payment_accepted: string | null
          phone: string
          phone_display: string | null
          postal_code: string | null
          price_range: string | null
          same_as: string[]
          street_address: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address_ar: string
          address_country?: string
          address_en: string
          address_locality: string
          address_region: string
          branch_id?: string | null
          created_at?: string
          currencies_accepted?: string | null
          email?: string | null
          id?: number
          lat: number
          lng: number
          maps_url?: string | null
          medical_specialties?: string[]
          mobile?: string | null
          mobile_display?: string | null
          name_ar: string
          name_en: string
          opening_hours?: Json
          payment_accepted?: string | null
          phone: string
          phone_display?: string | null
          postal_code?: string | null
          price_range?: string | null
          same_as?: string[]
          street_address: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address_ar?: string
          address_country?: string
          address_en?: string
          address_locality?: string
          address_region?: string
          branch_id?: string | null
          created_at?: string
          currencies_accepted?: string | null
          email?: string | null
          id?: number
          lat?: number
          lng?: number
          maps_url?: string | null
          medical_specialties?: string[]
          mobile?: string | null
          mobile_display?: string | null
          name_ar?: string
          name_en?: string
          opening_hours?: Json
          payment_accepted?: string | null
          phone?: string
          phone_display?: string | null
          postal_code?: string | null
          price_range?: string | null
          same_as?: string[]
          street_address?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_leaves: {
        Row: {
          all_day: boolean
          branch_id: string | null
          created_at: string
          created_by: string | null
          doctor_id: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_leaves_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_leaves_doctor_id_fkey"
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
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          languages: string[] | null
          name_ar: string
          name_en: string
          photo_url: string | null
          slug: string | null
          sort_order: number
          specialty_id: string | null
          title_ar: string | null
          title_en: string | null
        }
        Insert: {
          bio_ar?: string | null
          bio_en?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          languages?: string[] | null
          name_ar: string
          name_en: string
          photo_url?: string | null
          slug?: string | null
          sort_order?: number
          specialty_id?: string | null
          title_ar?: string | null
          title_en?: string | null
        }
        Update: {
          bio_ar?: string | null
          bio_en?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          languages?: string[] | null
          name_ar?: string
          name_en?: string
          photo_url?: string | null
          slug?: string | null
          sort_order?: number
          specialty_id?: string | null
          title_ar?: string | null
          title_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer_ar: string
          answer_en: string | null
          created_at: string
          id: string
          is_active: boolean
          question_ar: string
          question_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer_ar: string
          answer_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question_ar: string
          question_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer_ar?: string
          answer_en?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question_ar?: string
          question_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      health_articles: {
        Row: {
          author_name: string | null
          category_id: string | null
          content_ar: string
          content_en: string | null
          cover_image_url: string | null
          created_at: string
          excerpt_ar: string
          excerpt_en: string | null
          id: string
          is_published: boolean
          keywords: string[]
          published_at: string | null
          reading_minutes: number
          season: string | null
          slug: string
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          category_id?: string | null
          content_ar: string
          content_en?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt_ar: string
          excerpt_en?: string | null
          id?: string
          is_published?: boolean
          keywords?: string[]
          published_at?: string | null
          reading_minutes?: number
          season?: string | null
          slug: string
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          category_id?: string | null
          content_ar?: string
          content_en?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt_ar?: string
          excerpt_en?: string | null
          id?: string
          is_published?: boolean
          keywords?: string[]
          published_at?: string | null
          reading_minutes?: number
          season?: string | null
          slug?: string
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "health_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      health_categories: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      medicine_orders: {
        Row: {
          address: string | null
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "medicine_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string | null
          audience: string
          body: string | null
          branch_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          kind: string
          last_error: string | null
          metadata: Json | null
          read_at: string | null
          recipient: string | null
          send_status: Database["public"]["Enums"]["notification_send_status"]
          sent_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          audience: string
          body?: string | null
          branch_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          metadata?: Json | null
          read_at?: string | null
          recipient?: string | null
          send_status?: Database["public"]["Enums"]["notification_send_status"]
          sent_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          audience?: string
          body?: string | null
          branch_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          metadata?: Json | null
          read_at?: string | null
          recipient?: string | null
          send_status?: Database["public"]["Enums"]["notification_send_status"]
          sent_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          allergen: string
          created_at: string
          id: string
          noted_on: string | null
          notes: string | null
          patient_id: string
          reaction: string | null
          recorded_by: string | null
          severity: Database["public"]["Enums"]["allergy_severity"]
          updated_at: string
        }
        Insert: {
          allergen: string
          created_at?: string
          id?: string
          noted_on?: string | null
          notes?: string | null
          patient_id: string
          reaction?: string | null
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          updated_at?: string
        }
        Update: {
          allergen?: string
          created_at?: string
          id?: string
          noted_on?: string | null
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_attachments: {
        Row: {
          category: Database["public"]["Enums"]["attachment_category"]
          created_at: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          patient_id: string
          size_bytes: number | null
          title: string
          updated_at: string
          uploaded_by: string | null
          visit_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["attachment_category"]
          created_at?: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_id: string
          size_bytes?: number | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["attachment_category"]
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_id?: string
          size_bytes?: number | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_history: {
        Row: {
          category: Database["public"]["Enums"]["medical_history_category"]
          condition: string
          created_at: string
          id: string
          notes: string | null
          onset_date: string | null
          patient_id: string
          recorded_by: string | null
          resolution_date: string | null
          status: Database["public"]["Enums"]["medical_history_status"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["medical_history_category"]
          condition: string
          created_at?: string
          id?: string
          notes?: string | null
          onset_date?: string | null
          patient_id: string
          recorded_by?: string | null
          resolution_date?: string | null
          status?: Database["public"]["Enums"]["medical_history_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["medical_history_category"]
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          onset_date?: string | null
          patient_id?: string
          recorded_by?: string | null
          resolution_date?: string | null
          status?: Database["public"]["Enums"]["medical_history_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          medication_name: string
          notes: string | null
          patient_id: string
          prescribed_by_name: string | null
          recorded_by: string | null
          route: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["medication_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medication_name: string
          notes?: string | null
          patient_id: string
          prescribed_by_name?: string | null
          recorded_by?: string | null
          route?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          medication_name?: string
          notes?: string | null
          patient_id?: string
          prescribed_by_name?: string | null
          recorded_by?: string | null
          route?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_qr_scans: {
        Row: {
          id: string
          patient_id: string
          scanned_at: string
          scanned_by: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          id?: string
          patient_id: string
          scanned_at?: string
          scanned_by?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          id?: string
          patient_id?: string
          scanned_at?: string
          scanned_by?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_qr_scans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_ratings: {
        Row: {
          appointment_ref: string | null
          branch_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          id: string
          patient_name: string | null
          patient_phone: string | null
          rating: number
          source: string
          staff_reply: string | null
          staff_reply_at: string | null
          staff_reply_by: string | null
        }
        Insert: {
          appointment_ref?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          patient_name?: string | null
          patient_phone?: string | null
          rating: number
          source?: string
          staff_reply?: string | null
          staff_reply_at?: string | null
          staff_reply_by?: string | null
        }
        Update: {
          appointment_ref?: string | null
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          patient_name?: string | null
          patient_phone?: string | null
          rating?: number
          source?: string
          staff_reply?: string | null
          staff_reply_at?: string | null
          staff_reply_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_ratings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_ratings_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_surgeries: {
        Row: {
          complications: string | null
          created_at: string
          hospital: string | null
          id: string
          notes: string | null
          outcome: string | null
          patient_id: string
          procedure_name: string
          recorded_by: string | null
          surgeon_name: string | null
          surgery_date: string | null
          updated_at: string
        }
        Insert: {
          complications?: string | null
          created_at?: string
          hospital?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          patient_id: string
          procedure_name: string
          recorded_by?: string | null
          surgeon_name?: string | null
          surgery_date?: string | null
          updated_at?: string
        }
        Update: {
          complications?: string | null
          created_at?: string
          hospital?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          patient_id?: string
          procedure_name?: string
          recorded_by?: string | null
          surgeon_name?: string | null
          surgery_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_surgeries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_visits: {
        Row: {
          appointment_id: string | null
          assessment: string | null
          chief_complaint: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          follow_up_date: string | null
          id: string
          objective: string | null
          patient_id: string
          plan: string | null
          subjective: string | null
          updated_at: string
          visit_date: string
          vitals: Json | null
        }
        Insert: {
          appointment_id?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          follow_up_date?: string | null
          id?: string
          objective?: string | null
          patient_id: string
          plan?: string | null
          subjective?: string | null
          updated_at?: string
          visit_date?: string
          vitals?: Json | null
        }
        Update: {
          appointment_id?: string | null
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          follow_up_date?: string | null
          id?: string
          objective?: string | null
          patient_id?: string
          plan?: string | null
          subjective?: string | null
          updated_at?: string
          visit_date?: string
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          blood_type: string | null
          branch_id: string
          city: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name_ar: string
          full_name_en: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          marital_status: string | null
          mrn: string
          national_id: string | null
          nationality: string | null
          notes: string | null
          notify_email: boolean
          notify_sms: boolean
          notify_whatsapp: boolean
          phone: string
          profile_id: string | null
          secondary_phone: string | null
          status: Database["public"]["Enums"]["patient_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          address?: string | null
          blood_type?: string | null
          branch_id: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name_ar: string
          full_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_active?: boolean
          marital_status?: string | null
          mrn: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          phone: string
          profile_id?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["patient_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          address?: string | null
          blood_type?: string | null
          branch_id?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name_ar?: string
          full_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_active?: boolean
          marital_status?: string | null
          mrn?: string
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          phone?: string
          profile_id?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["patient_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
          branch_id: string | null
          created_at: string
          from_status: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          reason: string | null
          record_id: string | null
          table_name: string | null
          to_status: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string | null
          to_status?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string | null
          to_status?: string | null
          user_agent?: string | null
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
      transition_alert_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          is_shared: boolean
          label: string | null
          scope: string
          status: string
          threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          is_shared?: boolean
          label?: string | null
          scope: string
          status: string
          threshold: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          is_shared?: boolean
          label?: string | null
          scope?: string
          status?: string
          threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assert_staff: { Args: never; Returns: undefined }
      _emit_appointment_notification: {
        Args: {
          _appt: Database["public"]["Tables"]["appointments"]["Row"]
          _body: string
          _kind: string
          _title: string
        }
        Returns: undefined
      }
      assign_user_role: {
        Args: {
          _branch_id?: string
          _ip?: string
          _role: Database["public"]["Enums"]["app_role"]
          _ua?: string
          _user_id: string
        }
        Returns: undefined
      }
      can_access_patient: { Args: { _patient_id: string }; Returns: boolean }
      can_write_patient_clinical: {
        Args: { _patient_id: string }
        Returns: boolean
      }
      cancel_appointment_by_ref: {
        Args: { _phone: string; _reason?: string; _ref: string }
        Returns: boolean
      }
      dashboard_appointments_daily: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          cancelled: number
          confirmed: number
          day: string
          no_show: number
          total: number
        }[]
      }
      dashboard_by_specialty: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          count: number
          name_ar: string
          name_en: string
          specialty_id: string
        }[]
      }
      dashboard_kpis: { Args: { _branch_id?: string }; Returns: Json }
      dashboard_peak_hours: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          count: number
          hour: number
        }[]
      }
      dashboard_recent_activity: {
        Args: { _branch_id?: string; _limit?: number }
        Returns: {
          appointment_id: string
          changed_at: string
          id: string
          new_status: Database["public"]["Enums"]["appointment_status"]
          old_status: Database["public"]["Enums"]["appointment_status"]
          patient_name: string
          reason: string
        }[]
      }
      dashboard_status_breakdown: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          count: number
          status: string
        }[]
      }
      dashboard_upcoming: {
        Args: { _branch_id?: string; _limit?: number }
        Returns: {
          appointment_date: string
          appointment_time: string
          doctor_name_ar: string
          id: string
          patient_name: string
          patient_phone: string
          specialty_name_ar: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      doctor_occupancy: {
        Args: { _branch_id?: string; _days?: number }
        Returns: {
          booked: number
          branch_id: string
          capacity: number
          doctor_id: string
          is_active: boolean
          leave_days: number
          name_ar: string
          name_en: string
          occupancy_pct: number
          specialty_id: string
          specialty_name_ar: string
        }[]
      }
      generate_mrn: { Args: { _branch_id: string }; Returns: string }
      get_ratings_summary: {
        Args: { _branch_id?: string; _days?: number; _doctor_id?: string }
        Returns: {
          avg_rating: number
          entity_id: string
          entity_name: string
          ratings_count: number
          scope: string
          stars_1: number
          stars_2: number
          stars_3: number
          stars_4: number
          stars_5: number
        }[]
      }
      has_branch_access: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_doctor_leaves: {
        Args: {
          _branch_id?: string
          _doctor_id?: string
          _from: string
          _to: string
        }
        Returns: {
          all_day: boolean
          branch_id: string
          created_at: string
          doctor_id: string
          doctor_name_ar: string
          end_date: string
          id: string
          reason: string
          start_date: string
        }[]
      }
      list_public_branches_for_rating: {
        Args: never
        Returns: {
          id: string
          name_ar: string
          name_en: string
        }[]
      }
      list_public_doctors_for_rating: {
        Args: { _branch_id?: string }
        Returns: {
          branch_id: string
          id: string
          name_ar: string
          name_en: string
          specialty_name_ar: string
        }[]
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
      list_users_with_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          phone: string
          roles: Json
          user_id: string
        }[]
      }
      log_auth_event: {
        Args: {
          _action: string
          _email?: string
          _ip?: string
          _metadata?: Json
          _ua?: string
          _user_id?: string
        }
        Returns: undefined
      }
      log_security_event:
        | {
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
        | {
            Args: {
              _action: string
              _appointment_id?: string
              _from_status?: string
              _ip_address?: string
              _metadata?: Json
              _reason?: string
              _to_status?: string
              _user_agent?: string
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
      my_appointments_with_reminders: {
        Args: never
        Returns: {
          appointment_date: string
          appointment_time: string
          doctor_name_ar: string
          doctor_name_en: string
          id: string
          patient_name: string
          patient_phone: string
          reminder_24h: boolean
          reminder_2h: boolean
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
      patient_qr_scan_stats: {
        Args: { _patient_ids: string[] }
        Returns: {
          last_scanned_at: string
          patient_id: string
          scan_count: number
        }[]
      }
      reply_to_rating: {
        Args: { _id: string; _reply: string }
        Returns: undefined
      }
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
      revoke_user_role: {
        Args: {
          _ip?: string
          _role: Database["public"]["Enums"]["app_role"]
          _ua?: string
          _user_id: string
        }
        Returns: undefined
      }
      submit_public_rating: {
        Args: {
          _appointment_ref?: string
          _branch_id: string
          _comment?: string
          _doctor_id: string
          _patient_name?: string
          _patient_phone?: string
          _rating: number
        }
        Returns: string
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
      update_reminders_by_ref: {
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
      allergy_severity: "mild" | "moderate" | "severe" | "life_threatening"
      app_role: "admin" | "reception" | "pharmacy" | "super_admin" | "doctor"
      appointment_status:
        | "new"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      attachment_category:
        | "lab"
        | "imaging"
        | "report"
        | "prescription"
        | "insurance"
        | "other"
      delivery_type: "pickup" | "delivery"
      gender_type: "male" | "female" | "other"
      medical_history_category: "chronic" | "past" | "family" | "surgical_note"
      medical_history_status: "active" | "resolved" | "managed"
      medication_status: "active" | "paused" | "stopped" | "completed"
      medicine_order_status:
        | "new"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      notification_channel: "in_app" | "sms" | "whatsapp" | "email"
      notification_send_status:
        | "pending"
        | "queued"
        | "sent"
        | "failed"
        | "skipped"
      patient_status: "active" | "inactive" | "archived" | "deceased"
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
      allergy_severity: ["mild", "moderate", "severe", "life_threatening"],
      app_role: ["admin", "reception", "pharmacy", "super_admin", "doctor"],
      appointment_status: [
        "new",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      attachment_category: [
        "lab",
        "imaging",
        "report",
        "prescription",
        "insurance",
        "other",
      ],
      delivery_type: ["pickup", "delivery"],
      gender_type: ["male", "female", "other"],
      medical_history_category: ["chronic", "past", "family", "surgical_note"],
      medical_history_status: ["active", "resolved", "managed"],
      medication_status: ["active", "paused", "stopped", "completed"],
      medicine_order_status: [
        "new",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      notification_channel: ["in_app", "sms", "whatsapp", "email"],
      notification_send_status: [
        "pending",
        "queued",
        "sent",
        "failed",
        "skipped",
      ],
      patient_status: ["active", "inactive", "archived", "deceased"],
    },
  },
} as const
