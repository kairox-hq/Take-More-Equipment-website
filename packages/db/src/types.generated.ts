/**
 * GENERATED — do not edit.
 *
 *   npm run db:types
 *
 * Regenerate after every migration. A stale file here is a type system that
 * confidently describes a schema that no longer exists.
 *
 * Two things the generator cannot know, both handled in the schema rather than
 * worked around at call sites:
 *   - trigger-populated NOT NULL columns look required on insert, which is why
 *     items.sku and items.slug carry column defaults;
 *   - a view's nullability is unknowable, so every column of public_items
 *     arrives as `T | null`. Narrow once, in a typed query helper.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          outcome: string
          settled_at: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          outcome: string
          settled_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          outcome?: string
          settled_at?: string | null
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          summary: string | null
        }
        ComputedFields: never
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          summary?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          summary?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          blurb: string | null
          division_id: string
          icon: string
          id: string
          name: string
          position: number
          slug: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          blurb?: string | null
          division_id: string
          icon?: string
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          blurb?: string | null
          division_id?: string
          icon?: string
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          job: string
          ok: boolean | null
          result: Json | null
          started_at: string
        }
        ComputedFields: never
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: never
          job: string
          ok?: boolean | null
          result?: Json | null
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: never
          job?: string
          ok?: boolean | null
          result?: Json | null
          started_at?: string
        }
        Relationships: []
      }
      divisions: {
        Row: {
          active: boolean
          blurb: string | null
          id: string
          name: string
          position: number
          slug: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          blurb?: string | null
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          blurb?: string | null
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      item_costs: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          incurred_on: string
          item_id: string
          kind: Database["public"]["Enums"]["cost_kind"]
          labour_hours: number | null
          note: string | null
        }
        ComputedFields: never
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_on?: string
          item_id: string
          kind: Database["public"]["Enums"]["cost_kind"]
          labour_hours?: number | null
          note?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_on?: string
          item_id?: string
          kind?: Database["public"]["Enums"]["cost_kind"]
          labour_hours?: number | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_media: {
        Row: {
          alt_text: string | null
          created_at: string
          duration_seconds: number | null
          external_url: string | null
          height: number | null
          id: string
          is_placeholder: boolean
          item_id: string
          kind: Database["public"]["Enums"]["media_kind"]
          position: number
          storage_path: string | null
          width: number | null
        }
        ComputedFields: never
        Insert: {
          alt_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          height?: number | null
          id?: string
          is_placeholder?: boolean
          item_id: string
          kind?: Database["public"]["Enums"]["media_kind"]
          position?: number
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          height?: number | null
          id?: string
          is_placeholder?: boolean
          item_id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          position?: number
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["item_status"]
          label: string
          min_role: Database["public"]["Enums"]["app_role"]
          to_status: Database["public"]["Enums"]["item_status"]
        }
        ComputedFields: never
        Insert: {
          from_status: Database["public"]["Enums"]["item_status"]
          label: string
          min_role: Database["public"]["Enums"]["app_role"]
          to_status: Database["public"]["Enums"]["item_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["item_status"]
          label?: string
          min_role?: Database["public"]["Enums"]["app_role"]
          to_status?: Database["public"]["Enums"]["item_status"]
        }
        Relationships: []
      }
      item_tags: {
        Row: {
          item_id: string
          tag_id: string
        }
        ComputedFields: never
        Insert: {
          item_id: string
          tag_id: string
        }
        Update: {
          item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      item_units: {
        Row: {
          code: string
          current_order_line_id: string | null
          id: string
          item_id: string
          retired_at: string | null
          sale_price_cents: number | null
          sold_at: string | null
          status: Database["public"]["Enums"]["item_status"]
          unit_number: number
        }
        ComputedFields: never
        Insert: {
          code: string
          current_order_line_id?: string | null
          id?: string
          item_id: string
          retired_at?: string | null
          sale_price_cents?: number | null
          sold_at?: string | null
          status: Database["public"]["Enums"]["item_status"]
          unit_number: number
        }
        Update: {
          code?: string
          current_order_line_id?: string | null
          id?: string
          item_id?: string
          retired_at?: string | null
          sale_price_cents?: number | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          unit_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_units_current_order_line_id_fkey"
            columns: ["current_order_line_id"]
            isOneToOne: true
            referencedRelation: "order_line_economics"
            referencedColumns: ["line_id"]
          },
          {
            foreignKeyName: "item_units_current_order_line_id_fkey"
            columns: ["current_order_line_id"]
            isOneToOne: true
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          arrived_at: string
          available_quantity: number
          brand: string | null
          capacity: string | null
          category_id: string | null
          condition_grade: Database["public"]["Enums"]["condition_grade"] | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          depth_mm: number | null
          description: string | null
          featured: boolean
          height_mm: number | null
          id: string
          list_price_cents: number | null
          model: string | null
          power: string | null
          published_at: string | null
          reserved_until: string | null
          retail_price_cents: number | null
          sale_price_cents: number | null
          sku: string
          slug: string
          sold_at: string | null
          specs: NonNullable<Json>
          status: Database["public"]["Enums"]["item_status"]
          stock_quantity: number | null
          subcategory_id: string | null
          title: string
          updated_at: string
          website_availability: string
          weight_kg: number | null
          width_mm: number | null
          workshop_notes: string[]
        }
        ComputedFields: never
        Insert: {
          arrived_at?: string
          available_quantity?: number
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          condition_grade?:
            | Database["public"]["Enums"]["condition_grade"]
            | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          depth_mm?: number | null
          description?: string | null
          featured?: boolean
          height_mm?: number | null
          id?: string
          list_price_cents?: number | null
          model?: string | null
          power?: string | null
          published_at?: string | null
          reserved_until?: string | null
          retail_price_cents?: number | null
          sale_price_cents?: number | null
          sku?: string
          slug?: string
          sold_at?: string | null
          specs?: NonNullable<Json>
          status?: Database["public"]["Enums"]["item_status"]
          stock_quantity?: number | null
          subcategory_id?: string | null
          title?: string
          updated_at?: string
          website_availability?: string
          weight_kg?: number | null
          width_mm?: number | null
          workshop_notes?: string[]
        }
        Update: {
          arrived_at?: string
          available_quantity?: number
          brand?: string | null
          capacity?: string | null
          category_id?: string | null
          condition_grade?:
            | Database["public"]["Enums"]["condition_grade"]
            | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          depth_mm?: number | null
          description?: string | null
          featured?: boolean
          height_mm?: number | null
          id?: string
          list_price_cents?: number | null
          model?: string | null
          power?: string | null
          published_at?: string | null
          reserved_until?: string | null
          retail_price_cents?: number | null
          sale_price_cents?: number | null
          sku?: string
          slug?: string
          sold_at?: string | null
          specs?: NonNullable<Json>
          status?: Database["public"]["Enums"]["item_status"]
          stock_quantity?: number | null
          subcategory_id?: string | null
          title?: string
          updated_at?: string
          website_availability?: string
          weight_kg?: number | null
          width_mm?: number | null
          workshop_notes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_subcategory_matches_category"
            columns: ["subcategory_id", "category_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id", "category_id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          item_id: string | null
          kind: Database["public"]["Enums"]["lead_event_kind"]
          lead_id: string
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          kind: Database["public"]["Enums"]["lead_event_kind"]
          lead_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          kind?: Database["public"]["Enums"]["lead_event_kind"]
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lead_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lead_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lead_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_demand"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interest_tags: {
        Row: {
          interest_id: string
          tag_id: string
        }
        ComputedFields: never
        Insert: {
          interest_id: string
          tag_id: string
        }
        Update: {
          interest_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interest_tags_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "lead_demand"
            referencedColumns: ["interest_id"]
          },
          {
            foreignKeyName: "lead_interest_tags_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "lead_interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interest_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interests: {
        Row: {
          active: boolean
          budget_max_cents: number | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          fulfilled_at: string | null
          fulfilled_by_item_id: string | null
          id: string
          item_id: string | null
          lead_id: string
          min_grade: Database["public"]["Enums"]["condition_grade"] | null
          search_vector: unknown
          subcategory_id: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          budget_max_cents?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          fulfilled_at?: string | null
          fulfilled_by_item_id?: string | null
          id?: string
          item_id?: string | null
          lead_id: string
          min_grade?: Database["public"]["Enums"]["condition_grade"] | null
          search_vector?: never
          subcategory_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          budget_max_cents?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          fulfilled_at?: string | null
          fulfilled_by_item_id?: string | null
          id?: string
          item_id?: string | null
          lead_id?: string
          min_grade?: Database["public"]["Enums"]["condition_grade"] | null
          search_vector?: never
          subcategory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_fulfilled_by_item_id_fkey"
            columns: ["fulfilled_by_item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lead_interests_fulfilled_by_item_id_fkey"
            columns: ["fulfilled_by_item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lead_interests_fulfilled_by_item_id_fkey"
            columns: ["fulfilled_by_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_fulfilled_by_item_id_fkey"
            columns: ["fulfilled_by_item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lead_interests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "lead_interests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_demand"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_interests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_subcategory_matches_category"
            columns: ["subcategory_id", "category_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id", "category_id"]
          },
        ]
      }
      leads: {
        Row: {
          billing_address: string | null
          birthday: string | null
          business_name: string | null
          consent_source: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          email_consent_at: string | null
          extra: NonNullable<Json>
          full_name: string | null
          id: string
          last_contacted_at: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          phone_e164: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
          whatsapp_consent_at: string | null
        }
        ComputedFields: never
        Insert: {
          billing_address?: string | null
          birthday?: string | null
          business_name?: string | null
          consent_source?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_consent_at?: string | null
          extra?: NonNullable<Json>
          full_name?: string | null
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_e164?: never
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          whatsapp_consent_at?: string | null
        }
        Update: {
          billing_address?: string | null
          birthday?: string | null
          business_name?: string | null
          consent_source?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_consent_at?: string | null
          extra?: NonNullable<Json>
          full_name?: string | null
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_e164?: never
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          whatsapp_consent_at?: string | null
        }
        Relationships: []
      }
      order_invoices: {
        Row: {
          balance_cents: number | null
          document: NonNullable<Json>
          id: string
          issued_at: string
          issued_by: string | null
          kind: string
          number: string
          order_id: string
          received_cents: number | null
          share_token: string
          supersedes: string | null
          total_cents: number
        }
        ComputedFields: never
        Insert: {
          balance_cents?: never
          document: NonNullable<Json>
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind: string
          number: string
          order_id: string
          received_cents?: never
          share_token?: string
          supersedes?: string | null
          total_cents: number
        }
        Update: {
          balance_cents?: never
          document?: NonNullable<Json>
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind?: string
          number?: string
          order_id?: string
          received_cents?: never
          share_token?: string
          supersedes?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_economics"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_invoices_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "order_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          created_at: string
          held_from_status: Database["public"]["Enums"]["item_status"] | null
          id: string
          item_id: string
          item_unit_id: string
          list_price_cents: number
          order_id: string
          position: number
          retail_price_cents: number | null
          sold_price_cents: number | null
          unit_code: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          held_from_status?: Database["public"]["Enums"]["item_status"] | null
          id?: string
          item_id: string
          item_unit_id: string
          list_price_cents: number
          order_id: string
          position?: number
          retail_price_cents?: number | null
          sold_price_cents?: number | null
          unit_code: string
        }
        Update: {
          created_at?: string
          held_from_status?: Database["public"]["Enums"]["item_status"] | null
          id?: string
          item_id?: string
          item_unit_id?: string
          list_price_cents?: number
          order_id?: string
          position?: number
          retail_price_cents?: number | null
          sold_price_cents?: number | null
          unit_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_economics"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_unit_listing_fk"
            columns: ["item_unit_id", "item_id"]
            isOneToOne: false
            referencedRelation: "item_units"
            referencedColumns: ["id", "item_id"]
          },
          {
            foreignKeyName: "order_lines_unit_listing_fk"
            columns: ["item_unit_id", "item_id"]
            isOneToOne: false
            referencedRelation: "unit_costs"
            referencedColumns: ["id", "item_id"]
          },
        ]
      }
      order_receipts: {
        Row: {
          amount_cents: number
          entry_kind: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          received_on: string
          recorded_at: string
          recorded_by: string | null
          reference: string
          request_id: string
        }
        ComputedFields: never
        Insert: {
          amount_cents: number
          entry_kind: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          received_on: string
          recorded_at?: string
          recorded_by?: string | null
          reference: string
          request_id: string
        }
        Update: {
          amount_cents?: number
          entry_kind?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          received_on?: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_economics"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          charged_total_cents: number | null
          code: string
          created_at: string
          created_by: string | null
          delivery: boolean
          delivery_address: string | null
          delivery_fee_cents: number
          delivery_km: number | null
          delivery_km_source: string | null
          hire_end: string | null
          hire_returned_at: string | null
          hire_start: string | null
          id: string
          installation_accepted: boolean
          installation_quote_cents: number | null
          kind: string
          lead_id: string | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          plan_confirmed_at: string | null
          plan_deposit_cents: number | null
          plan_final_due: string | null
          plan_months: number | null
          plan_payment_day: number | null
          plan_start: string | null
          purchase_option: string | null
          sale_plan: string | null
          sold_by: string | null
          sold_total_cents: number | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        ComputedFields: never
        Insert: {
          charged_total_cents?: never
          code?: string
          created_at?: string
          created_by?: string | null
          delivery?: boolean
          delivery_address?: string | null
          delivery_fee_cents?: number
          delivery_km?: number | null
          delivery_km_source?: string | null
          hire_end?: string | null
          hire_returned_at?: string | null
          hire_start?: string | null
          id?: string
          installation_accepted?: boolean
          installation_quote_cents?: number | null
          kind?: string
          lead_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          plan_confirmed_at?: string | null
          plan_deposit_cents?: number | null
          plan_final_due?: string | null
          plan_months?: number | null
          plan_payment_day?: number | null
          plan_start?: string | null
          purchase_option?: string | null
          sale_plan?: string | null
          sold_by?: string | null
          sold_total_cents?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          charged_total_cents?: never
          code?: string
          created_at?: string
          created_by?: string | null
          delivery?: boolean
          delivery_address?: string | null
          delivery_fee_cents?: number
          delivery_km?: number | null
          delivery_km_source?: string | null
          hire_end?: string | null
          hire_returned_at?: string | null
          hire_start?: string | null
          id?: string
          installation_accepted?: boolean
          installation_quote_cents?: number | null
          kind?: string
          lead_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          plan_confirmed_at?: string | null
          plan_deposit_cents?: number | null
          plan_final_due?: string | null
          plan_months?: number | null
          plan_payment_day?: number | null
          plan_start?: string | null
          purchase_option?: string | null
          sale_plan?: string | null
          sold_by?: string | null
          sold_total_cents?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_demand"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          audience: NonNullable<Json>
          channel: Database["public"]["Enums"]["outreach_channel"]
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          intro: string | null
          item_ids: string[]
          name: string
          recipient_count: number | null
          sent_at: string | null
          sent_by: string | null
          state: Database["public"]["Enums"]["campaign_state"]
          subject: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          audience?: NonNullable<Json>
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          intro?: string | null
          item_ids?: string[]
          name: string
          recipient_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          state?: Database["public"]["Enums"]["campaign_state"]
          subject: string
          updated_at?: string
        }
        Update: {
          audience?: NonNullable<Json>
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          intro?: string | null
          item_ids?: string[]
          name?: string
          recipient_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          state?: Database["public"]["Enums"]["campaign_state"]
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      outreach_messages: {
        Row: {
          body: string | null
          campaign_id: string | null
          channel: Database["public"]["Enums"]["outreach_channel"]
          claimed_at: string | null
          created_at: string
          error: string | null
          id: string
          interest_id: string | null
          item_id: string | null
          lead_id: string
          match_score: number | null
          reason: string | null
          sent_at: string | null
          sent_by: string | null
          skipped_reason: string | null
          state: Database["public"]["Enums"]["outreach_state"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          body?: string | null
          campaign_id?: string | null
          channel: Database["public"]["Enums"]["outreach_channel"]
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          interest_id?: string | null
          item_id?: string | null
          lead_id: string
          match_score?: number | null
          reason?: string | null
          sent_at?: string | null
          sent_by?: string | null
          skipped_reason?: string | null
          state?: Database["public"]["Enums"]["outreach_state"]
          updated_at?: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          interest_id?: string | null
          item_id?: string | null
          lead_id?: string
          match_score?: number | null
          reason?: string | null
          sent_at?: string | null
          sent_by?: string | null
          skipped_reason?: string | null
          state?: Database["public"]["Enums"]["outreach_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "lead_demand"
            referencedColumns: ["interest_id"]
          },
          {
            foreignKeyName: "outreach_messages_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "lead_interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "outreach_messages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "outreach_messages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_demand"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "outreach_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          active: boolean
          approved_at: string | null
          created_at: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          approved_at?: string | null
          created_at?: string
          full_name: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          created_at?: string
          full_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          active: boolean
          category_id: string
          id: string
          name: string
          position: number
          slug: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          category_id: string
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          category_id?: string
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          active: boolean
          id: string
          name: string
          position: number
          slug: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          id?: string
          name: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      item_analytics: {
        Row: {
          arrived_at: string | null
          category: string | null
          category_id: string | null
          cost_auction_cents: number | null
          cost_cents: number | null
          cost_delivery_cents: number | null
          cost_labour_cents: number | null
          cost_other_cents: number | null
          cost_parts_cents: number | null
          cost_premium_cents: number | null
          cost_workshop_cents: number | null
          created_at: string | null
          days_on_shelf: number | null
          days_to_sale: number | null
          is_sold: boolean | null
          item_id: string | null
          labour_hours: number | null
          margin_cents: number | null
          price_cents: number | null
          published_at: string | null
          revenue_cents: number | null
          sku: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          subcategory: string | null
          subcategory_id: string | null
          tied_up_cents: number | null
          title: string | null
          unrealised_margin_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      item_economics: {
        Row: {
          arrived_at: string | null
          days_to_sale: number | null
          item_id: string | null
          list_price_cents: number | null
          margin_cents: number | null
          margin_percent: number | null
          sale_price_cents: number | null
          sku: string | null
          slug: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          title: string | null
          total_cost_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      lead_demand: {
        Row: {
          budget_max_cents: number | null
          category: string | null
          category_id: string | null
          contactable: boolean | null
          interest_id: string | null
          is_customer: boolean | null
          last_contacted_at: string | null
          lead_created_at: string | null
          lead_id: string | null
          lead_source: Database["public"]["Enums"]["lead_source"] | null
          lead_status: Database["public"]["Enums"]["lead_status"] | null
          subcategory: string | null
          subcategory_id: string | null
          unsubscribed: boolean | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "lead_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interests_subcategory_matches_category"
            columns: ["subcategory_id", "category_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id", "category_id"]
          },
        ]
      }
      money_by_category: {
        Row: {
          avg_days_to_sale: number | null
          category: string | null
          category_id: string | null
          cost_cents: number | null
          margin_cents: number | null
          revenue_cents: number | null
          sell_through_percent: number | null
          tied_up_cents: number | null
          units_in_stock: number | null
          units_sold: number | null
          units_total: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      money_by_month: {
        Row: {
          avg_days_to_sale: number | null
          cost_cents: number | null
          margin_cents: number | null
          margin_percent: number | null
          month: string | null
          revenue_cents: number | null
          units_sold: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      money_position: {
        Row: {
          aged_stock_cents: number | null
          aged_units: number | null
          avg_days_to_sale: number | null
          margin_30d_cents: number | null
          margin_all_time_cents: number | null
          revenue_all_time_cents: number | null
          tied_up_cents: number | null
          units_in_stock: number | null
          units_sold_30d: number | null
          units_sold_all_time: number | null
          unrealised_margin_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      order_economics: {
        Row: {
          charged_total_cents: number | null
          code: string | null
          cost_other_cents: number | null
          cost_purchase_cents: number | null
          cost_refurb_cents: number | null
          cost_total_cents: number | null
          delivery_fee_cents: number | null
          line_count: number | null
          list_total_cents: number | null
          margin_cents: number | null
          order_id: string | null
          retail_total_cents: number | null
          sold_total_cents: number | null
          status: Database["public"]["Enums"]["order_status"] | null
        }
        ComputedFields: never
        Relationships: []
      }
      order_line_economics: {
        Row: {
          cost_other_cents: number | null
          cost_purchase_cents: number | null
          cost_refurb_cents: number | null
          cost_total_cents: number | null
          item_id: string | null
          line_id: string | null
          list_price_cents: number | null
          order_id: string | null
          position: number | null
          retail_price_cents: number | null
          sku: string | null
          sold_price_cents: number | null
          status: Database["public"]["Enums"]["item_status"] | null
          title: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_economics"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      public_categories: {
        Row: {
          blurb: string | null
          division_name: string | null
          division_position: number | null
          division_slug: string | null
          icon: string | null
          id: string | null
          item_count: number | null
          name: string | null
          position: number | null
          slug: string | null
        }
        ComputedFields: never
        Relationships: []
      }
      public_item_media: {
        Row: {
          alt_text: string | null
          duration_seconds: number | null
          external_url: string | null
          height: number | null
          id: string | null
          item_id: string | null
          kind: Database["public"]["Enums"]["media_kind"] | null
          position: number | null
          storage_path: string | null
          width: number | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
      public_items: {
        Row: {
          availability: string | null
          available_quantity: number | null
          brand: string | null
          capacity: string | null
          category_name: string | null
          category_slug: string | null
          condition_grade: Database["public"]["Enums"]["condition_grade"] | null
          depth_mm: number | null
          description: string | null
          division_name: string | null
          division_slug: string | null
          featured: boolean | null
          height_mm: number | null
          id: string | null
          list_price_cents: number | null
          model: string | null
          power: string | null
          primary_image_path: string | null
          primary_image_url: string | null
          published_at: string | null
          retail_price_cents: number | null
          sale_price_cents: number | null
          sku: string | null
          slug: string | null
          sold: boolean | null
          sold_at: string | null
          specs: Json | null
          status: Database["public"]["Enums"]["item_status"] | null
          subcategory_name: string | null
          subcategory_slug: string | null
          tag_slugs: string[] | null
          title: string | null
          weight_kg: number | null
          width_mm: number | null
          workshop_notes: string[] | null
        }
        ComputedFields: never
        Relationships: []
      }
      unit_costs: {
        Row: {
          auction: number | null
          delivery: number | null
          id: string | null
          item_id: string | null
          labour: number | null
          labour_hours: number | null
          other: number | null
          parts: number | null
          premium: number | null
          total: number | null
          workshop: number | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_analytics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_economics"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "public_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_order_line: {
        Args: {
          p_code?: string
          p_item_id?: string
          p_order_id: string
          p_quantity?: number
        }
        Returns: Json
      }
      capture_lead: {
        Args: {
          p_budget_max_cents?: number
          p_category_slug?: string
          p_email: string
          p_email_consent?: boolean
          p_from_product?: boolean
          p_item_slug?: string
          p_message?: string
          p_name?: string
          p_phone?: string
          p_whatsapp_consent?: boolean
        }
        Returns: undefined
      }
      choose_purchase_option: {
        Args: { p_option: string; p_order_id: string }
        Returns: undefined
      }
      claim_access_request: {
        Args: { p_email: string; p_ip_hash?: string }
        Returns: {
          outcome: string
          request_id: string
        }[]
      }
      confirm_hire_paid: {
        Args: {
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_reference?: string
        }
        Returns: Json
      }
      confirm_order_paid: {
        Args: {
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_reference?: string
          p_sold_total_cents: number
        }
        Returns: Json
      }
      delivery_fee_cents: { Args: { p_km: number }; Returns: number }
      hire_daily_rate_cents: { Args: { p_list_cents: number }; Returns: number }
      hire_fee_cents: {
        Args: { p_days: number; p_list_cents: number }
        Returns: number
      }
      issue_invoice: {
        Args: { p_issuer: Json; p_kind: string; p_order_id: string }
        Returns: Json
      }
      leads_wanting_item: {
        Args: { p_item_id: string }
        Returns: {
          can_email: boolean
          description: string
          email: string
          full_name: string
          interest_id: string
          lead_id: string
          phone: string
          score: number
        }[]
      }
      match_item_to_leads: { Args: { p_item_id: string }; Returns: number }
      record_item_cost: {
        Args: {
          p_amount_cents: number
          p_incurred_on?: string
          p_item_id: string
          p_kind: Database["public"]["Enums"]["cost_kind"]
          p_labour_hours?: number
          p_note?: string
        }
        Returns: undefined
      }
      record_order_receipt: {
        Args: {
          p_amount: number
          p_date: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_reference: string
          p_refund?: boolean
          p_request_id: string
        }
        Returns: Json
      }
      remove_order_line: {
        Args: { p_item_id: string; p_line_id?: string; p_order_id: string }
        Returns: Json
      }
      reopen_order: { Args: { p_order_id: string }; Returns: Json }
      return_hire: { Args: { p_order_id: string }; Returns: Json }
      run_stock_match: { Args: Record<PropertyKey, never>; Returns: number }
      save_sale_plan: {
        Args: {
          p_day?: number
          p_deposit?: number
          p_due?: string
          p_months?: number
          p_order_id: string
          p_plan: string
          p_start?: string
          p_total?: number
        }
        Returns: undefined
      }
      search_everything: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          badge: string
          id: string
          kind: string
          rank: number
          subtitle: string
          title: string
        }[]
      }
      search_sellable_items: {
        Args: { p_limit?: number; p_order_id?: string; p_query: string }
        Returns: {
          available_quantity: number
          id: string
          list_price_cents: number
          on_order: string
          rank: number
          retail_price_cents: number
          sku: string
          status: string
          subtitle: string
          title: string
        }[]
      }
      set_item_cost: {
        Args: {
          p_amount_cents: number
          p_item_id: string
          p_kind: Database["public"]["Enums"]["cost_kind"]
        }
        Returns: undefined
      }
      set_order_installation: {
        Args: { p_accepted?: boolean; p_order_id: string; p_quote?: number }
        Returns: undefined
      }
      settle_access_request: {
        Args: { p_request_id: string; p_succeeded: boolean }
        Returns: undefined
      }
      stock_matching_interest: {
        Args: { p_interest_id: string }
        Returns: {
          already_told: boolean
          brand: string
          condition_grade: Database["public"]["Enums"]["condition_grade"]
          item_id: string
          list_price_cents: number
          score: number
          slug: string
          title: string
        }[]
      }
      unsubscribe: { Args: { p_token: string }; Returns: boolean }
      void_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
    }
    Enums: {
      activity_action:
        | "created"
        | "updated"
        | "status_changed"
        | "published"
        | "unpublished"
        | "price_changed"
        | "deleted"
      app_role: "staff" | "manager" | "owner"
      campaign_state: "draft" | "sending" | "sent" | "failed"
      condition_grade: "N" | "A" | "B" | "C"
      cost_kind:
        | "auction"
        | "workshop"
        | "buyers_premium"
        | "transport"
        | "parts"
        | "labour"
        | "other"
      item_status:
        | "intake"
        | "refurbishing"
        | "ready"
        | "listed"
        | "reserved"
        | "sold"
        | "handed_over"
      lead_event_kind:
        | "note"
        | "enquiry"
        | "call"
        | "visit"
        | "email_sent"
        | "whatsapp_sent"
        | "match_sent"
        | "purchased"
        | "consent_given"
        | "unsubscribed"
      lead_source:
        | "walk_in"
        | "phone"
        | "whatsapp"
        | "website_product"
        | "website_general"
        | "referral"
        | "auction"
        | "import"
        | "marketplace"
        | "social_media"
        | "google"
        | "website"
      lead_status: "new" | "working" | "customer" | "dormant"
      media_kind: "photo" | "video"
      order_status: "draft" | "paid" | "void"
      outreach_channel: "email" | "whatsapp"
      outreach_state: "queued" | "sent" | "skipped" | "failed"
      payment_method: "card_machine" | "bank_transfer" | "payjustnow" | "cash"
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
      activity_action: [
        "created",
        "updated",
        "status_changed",
        "published",
        "unpublished",
        "price_changed",
        "deleted",
      ],
      app_role: ["staff", "manager", "owner"],
      campaign_state: ["draft", "sending", "sent", "failed"],
      condition_grade: ["N", "A", "B", "C"],
      cost_kind: [
        "auction",
        "workshop",
        "buyers_premium",
        "transport",
        "parts",
        "labour",
        "other",
      ],
      item_status: [
        "intake",
        "refurbishing",
        "ready",
        "listed",
        "reserved",
        "sold",
        "handed_over",
      ],
      lead_event_kind: [
        "note",
        "enquiry",
        "call",
        "visit",
        "email_sent",
        "whatsapp_sent",
        "match_sent",
        "purchased",
        "consent_given",
        "unsubscribed",
      ],
      lead_source: [
        "walk_in",
        "phone",
        "whatsapp",
        "website_product",
        "website_general",
        "referral",
        "auction",
        "import",
        "marketplace",
        "social_media",
        "google",
        "website",
      ],
      lead_status: ["new", "working", "customer", "dormant"],
      media_kind: ["photo", "video"],
      order_status: ["draft", "paid", "void"],
      outreach_channel: ["email", "whatsapp"],
      outreach_state: ["queued", "sent", "skipped", "failed"],
      payment_method: ["card_machine", "bank_transfer", "payjustnow", "cash"],
    },
  },
} as const
