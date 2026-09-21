// Generated from the live schema -- do not edit by hand.
//
// Regenerate whenever a migration changes a table, view or function the
// client touches, in the same PR as that migration:
//
//   supabase gen types typescript --project-id fostmbhpnhjzhulphxzp
//
// (or, from an agent with the Supabase MCP server attached,
// `generate_typescript_types` against the same project, which is how
// this first copy was produced -- the CLI needs a login the MCP server
// doesn't).
//
// This is the only description of the database the client has. Before
// it, every hook carried its own hand-written row type, which agreed
// with the schema only as long as someone remembered to update it: the
// observation log's `photo_metadata: string | null` and the queue's
// `source: 'chat_scan' | 'photo' | ...` were both written from memory of
// a migration rather than from the migration.

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
      app_status: {
        Row: {
          id: boolean
          maintenance: boolean
          message: string | null
        }
        Insert: {
          id?: boolean
          maintenance?: boolean
          message?: string | null
        }
        Update: {
          id?: boolean
          maintenance?: boolean
          message?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          pending_write_id: string | null
          producer_id: string
          reverted_at: string | null
          row_id: string
          table_name: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          pending_write_id?: string | null
          producer_id: string
          reverted_at?: string | null
          row_id: string
          table_name: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          pending_write_id?: string | null
          producer_id?: string
          reverted_at?: string | null
          row_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_pending_write_id_fkey"
            columns: ["pending_write_id"]
            isOneToOne: false
            referencedRelation: "pending_writes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_embeddings: {
        Row: {
          chunk_text: string
          conversation_id: string
          created_at: string
          embedding: string | null
          id: string
          producer_id: string
        }
        Insert: {
          chunk_text: string
          conversation_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          producer_id: string
        }
        Update: {
          chunk_text?: string
          conversation_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          producer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_embeddings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_embeddings_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          embedded_at: string | null
          id: string
          mode: string
          producer_id: string
          scanned_at: string | null
          transcript: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedded_at?: string | null
          id?: string
          mode: string
          producer_id: string
          scanned_at?: string | null
          transcript?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedded_at?: string | null
          id?: string
          mode?: string
          producer_id?: string
          scanned_at?: string | null
          transcript?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      data_providers: {
        Row: {
          category: string
          context: string | null
          created_at: string
          enabled: boolean
          id: string
          name: string
        }
        Insert: {
          category: string
          context?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
        }
        Update: {
          category?: string
          context?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          backfill_cursor: string | null
          backfill_start: string | null
          backfill_status: string | null
          config: Json | null
          context: string | null
          created_at: string
          enabled: boolean
          external_id: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          last_warning: string | null
          name: string
          producer_id: string
          provider_id: string
          vault_secret_id: string | null
        }
        Insert: {
          backfill_cursor?: string | null
          backfill_start?: string | null
          backfill_status?: string | null
          config?: Json | null
          context?: string | null
          created_at?: string
          enabled?: boolean
          external_id: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          last_warning?: string | null
          name: string
          producer_id: string
          provider_id: string
          vault_secret_id?: string | null
        }
        Update: {
          backfill_cursor?: string | null
          backfill_start?: string | null
          backfill_status?: string | null
          config?: Json | null
          context?: string | null
          created_at?: string
          enabled?: boolean
          external_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          last_warning?: string | null
          name?: string
          producer_id?: string
          provider_id?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_sources_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "data_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_candidates: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          note: string | null
          observed_date: string | null
          photo_location: unknown
          photo_location_accuracy_m: number | null
          photo_path: string | null
          planting_id: string | null
          producer_id: string
          reviewed_at: string | null
          source: string
          status: string
          summary: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          observed_date?: string | null
          photo_location?: unknown
          photo_location_accuracy_m?: number | null
          photo_path?: string | null
          planting_id?: string | null
          producer_id: string
          reviewed_at?: string | null
          source?: string
          status?: string
          summary: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          observed_date?: string | null
          photo_location?: unknown
          photo_location_accuracy_m?: number | null
          photo_path?: string | null
          planting_id?: string | null
          producer_id?: string
          reviewed_at?: string | null
          source?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_candidates_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_candidates_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_candidates_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting_readable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_candidates_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "position_status"
            referencedColumns: ["planting_id"]
          },
          {
            foreignKeyName: "observation_candidates_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          note: string
          observed_date: string | null
          photo_location: unknown
          photo_location_accuracy_m: number | null
          photo_metadata: string | null
          planting_id: string | null
          producer_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          note: string
          observed_date?: string | null
          photo_location?: unknown
          photo_location_accuracy_m?: number | null
          photo_metadata?: string | null
          planting_id?: string | null
          producer_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          note?: string
          observed_date?: string | null
          photo_location?: unknown
          photo_location_accuracy_m?: number | null
          photo_metadata?: string | null
          planting_id?: string | null
          producer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting_readable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "position_status"
            referencedColumns: ["planting_id"]
          },
          {
            foreignKeyName: "observations_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      parcels: {
        Row: {
          created_at: string
          id: string
          name: string
          producer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          producer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          producer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcels_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_writes: {
        Row: {
          created_at: string
          id: string
          producer_id: string
          query: string
          status: string
          summary: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          producer_id: string
          query: string
          status?: string
          summary?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          producer_id?: string
          query?: string
          status?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_writes_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_types: {
        Row: {
          common_name: string | null
          created_at: string
          id: string
          kind: string
          name: string
          proposed_by_producer_id: string | null
          status: string
        }
        Insert: {
          common_name?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          proposed_by_producer_id?: string | null
          status?: string
        }
        Update: {
          common_name?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          proposed_by_producer_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_types_proposed_by_producer_id_fkey"
            columns: ["proposed_by_producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      planting: {
        Row: {
          category: string | null
          created_at: string
          dead_date: string | null
          id: string
          location: unknown
          nickname: string | null
          parcel_id: string
          planted_date: string | null
          plot_id: string | null
          plot_row_id: string | null
          position: number | null
          producer_id: string
          removed_date: string | null
          removed_reason: string | null
          rootstock_variety_id: string | null
          scion_variety_id: string | null
          variety_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          dead_date?: string | null
          id?: string
          location?: unknown
          nickname?: string | null
          parcel_id: string
          planted_date?: string | null
          plot_id?: string | null
          plot_row_id?: string | null
          position?: number | null
          producer_id: string
          removed_date?: string | null
          removed_reason?: string | null
          rootstock_variety_id?: string | null
          scion_variety_id?: string | null
          variety_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          dead_date?: string | null
          id?: string
          location?: unknown
          nickname?: string | null
          parcel_id?: string
          planted_date?: string | null
          plot_id?: string | null
          plot_row_id?: string | null
          position?: number | null
          producer_id?: string
          removed_date?: string | null
          removed_reason?: string | null
          rootstock_variety_id?: string | null
          scion_variety_id?: string | null
          variety_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planting_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_plot_row_id_fkey"
            columns: ["plot_row_id"]
            isOneToOne: false
            referencedRelation: "plot_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_rootstock_variety_id_fkey"
            columns: ["rootstock_variety_id"]
            isOneToOne: false
            referencedRelation: "plant_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_scion_variety_id_fkey"
            columns: ["scion_variety_id"]
            isOneToOne: false
            referencedRelation: "plant_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "plant_types"
            referencedColumns: ["id"]
          },
        ]
      }
      plot_rows: {
        Row: {
          created_at: string
          end_post_count: number | null
          id: string
          length_meters: number | null
          number: number
          plot_id: string
          producer_id: string
          spacing_meters: number | null
        }
        Insert: {
          created_at?: string
          end_post_count?: number | null
          id?: string
          length_meters?: number | null
          number: number
          plot_id: string
          producer_id: string
          spacing_meters?: number | null
        }
        Update: {
          created_at?: string
          end_post_count?: number | null
          id?: string
          length_meters?: number | null
          number?: number
          plot_id?: string
          producer_id?: string
          spacing_meters?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plot_rows_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_rows_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      plots: {
        Row: {
          created_at: string
          id: string
          name: string
          parcel_id: string
          producer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parcel_id: string
          producer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parcel_id?: string
          producer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plots_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plots_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_memory: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          producer_id: string
          source: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          producer_id: string
          source?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          producer_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_memory_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      producers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          last_seen_release: string | null
          producer_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          last_seen_release?: string | null
          producer_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          last_seen_release?: string | null
          producer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_observations: {
        Row: {
          air_temperature: number | null
          battery_voltage: number | null
          created_at: string
          id: string
          illuminance: number | null
          lightning_strike_avg_distance: number | null
          observed_at: string
          precip: number | null
          precip_type: number | null
          producer_id: string
          relative_humidity: number | null
          report_interval: number | null
          solar_radiation: number | null
          source_id: string
          station_pressure: number | null
          strike_count: number | null
          uv: number | null
          wind_avg: number | null
          wind_direction: number | null
          wind_gust: number | null
          wind_lull: number | null
          wind_sample_interval: number | null
        }
        Insert: {
          air_temperature?: number | null
          battery_voltage?: number | null
          created_at?: string
          id?: string
          illuminance?: number | null
          lightning_strike_avg_distance?: number | null
          observed_at: string
          precip?: number | null
          precip_type?: number | null
          producer_id: string
          relative_humidity?: number | null
          report_interval?: number | null
          solar_radiation?: number | null
          source_id: string
          station_pressure?: number | null
          strike_count?: number | null
          uv?: number | null
          wind_avg?: number | null
          wind_direction?: number | null
          wind_gust?: number | null
          wind_lull?: number | null
          wind_sample_interval?: number | null
        }
        Update: {
          air_temperature?: number | null
          battery_voltage?: number | null
          created_at?: string
          id?: string
          illuminance?: number | null
          lightning_strike_avg_distance?: number | null
          observed_at?: string
          precip?: number | null
          precip_type?: number | null
          producer_id?: string
          relative_humidity?: number | null
          report_interval?: number | null
          solar_radiation?: number | null
          source_id?: string
          station_pressure?: number | null
          strike_count?: number | null
          uv?: number | null
          wind_avg?: number | null
          wind_direction?: number | null
          wind_gust?: number | null
          wind_lull?: number | null
          wind_sample_interval?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_observations_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      planting_readable: {
        Row: {
          category: string | null
          created_at: string | null
          dead_date: string | null
          id: string | null
          label: string | null
          latitude: number | null
          longitude: number | null
          nickname: string | null
          parcel: string | null
          planted_date: string | null
          plot: string | null
          position: number | null
          producer_id: string | null
          removed_date: string | null
          removed_reason: string | null
          rootstock: string | null
          row_number: number | null
          scion: string | null
          variety: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planting_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      position_status: {
        Row: {
          planting_id: string | null
          plot_row_id: string | null
          position: number | null
          producer_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planting_plot_row_id_fkey"
            columns: ["plot_row_id"]
            isOneToOne: false
            referencedRelation: "plot_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planting_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_data_source: {
        Args: {
          p_backfill_start?: string
          p_config?: Json
          p_external_id: string
          p_name: string
          p_provider_id: string
          p_secret?: string
        }
        Returns: string
      }
      confirm_observation_candidate: {
        Args: { p_candidate_id: string }
        Returns: string
      }
      confirm_write: { Args: { p_proposal_id: string }; Returns: Json }
      create_observation_candidate: {
        Args: {
          p_conversation_id?: string
          p_note?: string
          p_observed_date?: string
          p_photo_accuracy_m?: number
          p_photo_latitude?: number
          p_photo_longitude?: number
          p_photo_path?: string
          p_planting_id?: string
          p_source?: string
          p_summary: string
        }
        Returns: string
      }
      create_producer_and_profile: {
        Args: { p_full_name?: string; p_producer_name: string }
        Returns: string
      }
      execute_readonly_query: { Args: { query: string }; Returns: Json[] }
      get_conversations_for_memory_embedding: {
        Args: { p_limit?: number; p_trigger_secret: string }
        Returns: {
          id: string
          producer_id: string
          transcript: Json
        }[]
      }
      get_conversations_for_observation_scan: {
        Args: { p_limit?: number; p_trigger_secret: string }
        Returns: {
          id: string
          producer_id: string
          transcript: Json
        }[]
      }
      get_decrypted_source_secret: {
        Args: { p_source_id: string }
        Returns: string
      }
      get_enabled_weather_sources_for_sync: {
        Args: { p_trigger_secret: string }
        Returns: {
          api_key: string
          backfill_cursor: string
          backfill_start: string
          backfill_status: string
          external_id: string
          id: string
          last_synced_at: string
          producer_id: string
        }[]
      }
      get_pending_memory_entries: {
        Args: { p_limit?: number; p_trigger_secret: string }
        Returns: {
          content: string
          id: string
        }[]
      }
      parcel_lookup_counts: {
        Args: { target_parcel: string }
        Returns: {
          count: number
          plot: string
        }[]
      }
      propose_write_query: {
        Args: { query: string }
        Returns: {
          proposal_id: string
          summary: Json
        }[]
      }
      replace_conversation_embeddings: {
        Args: {
          p_chunks: string[]
          p_conversation_id: string
          p_embeddings: string[]
          p_producer_id: string
          p_trigger_secret: string
        }
        Returns: undefined
      }
      revert_audit_entry: { Args: { p_audit_id: string }; Returns: Json }
      search_memory_by_embedding: {
        Args: { p_limit?: number; p_query_embedding: string }
        Returns: {
          content: string
          id: string
          similarity: number
          source_table: string
        }[]
      }
      set_memory_embedding: {
        Args: { p_embedding: string; p_id: string; p_trigger_secret: string }
        Returns: undefined
      }
      variety_lookup_counts: {
        Args: { search: string }
        Returns: {
          count: number
          parcel: string
          plot: string
        }[]
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
    Enums: {},
  },
} as const
