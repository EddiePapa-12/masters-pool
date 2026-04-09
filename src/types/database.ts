// Auto-generated types matching the Supabase schema.
// Re-run `npx supabase gen types typescript` after schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Views: Record<string, never>;
    Tables: {
      golfers: {
        Row: {
          id: string;
          name: string;
          tier: number | null;
          odds: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          tier?: number | null;
          odds?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          tier?: number | null;
          odds?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      tournament_scores: {
        Row: {
          id: string;
          golfer_id: string;
          position: string | null;
          score_vs_par: number | null;
          round_1: number | null;
          round_2: number | null;
          round_3: number | null;
          round_4: number | null;
          total_strokes: number | null;
          thru: string | null;
          today: number | null;
          status: "active" | "cut" | "wd" | "dq";
          updated_at: string;
        };
        Insert: {
          id?: string;
          golfer_id: string;
          position?: string | null;
          score_vs_par?: number | null;
          round_1?: number | null;
          round_2?: number | null;
          round_3?: number | null;
          round_4?: number | null;
          total_strokes?: number | null;
          thru?: string | null;
          today?: number | null;
          status?: "active" | "cut" | "wd" | "dq";
          updated_at?: string;
        };
        Update: {
          id?: string;
          golfer_id?: string;
          position?: string | null;
          score_vs_par?: number | null;
          round_1?: number | null;
          round_2?: number | null;
          round_3?: number | null;
          round_4?: number | null;
          total_strokes?: number | null;
          thru?: string | null;
          today?: number | null;
          status?: "active" | "cut" | "wd" | "dq";
          updated_at?: string;
        };
        Relationships: [];
      };
      pool_settings: {
        Row: {
          id: string;
          singleton: boolean;
          tournament_year: number;
          tournament_name: string;
          par: number;
          projected_cut: number;
          entry_fee: number;
          cut_penalty: number;
          picks_count: number;
          scoring_picks: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          singleton?: boolean;
          tournament_year: number;
          tournament_name: string;
          par?: number;
          projected_cut?: number;
          entry_fee?: number;
          cut_penalty?: number;
          picks_count?: number;
          scoring_picks?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          singleton?: boolean;
          tournament_year?: number;
          tournament_name?: string;
          par?: number;
          projected_cut?: number;
          entry_fee?: number;
          cut_penalty?: number;
          picks_count?: number;
          scoring_picks?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          id: string;
          team_key: number;
          team_name: string;
          entrant_name: string;
          email: string | null;
          venmo_handle: string | null;
          paid: boolean;
          predicted_score: number | null;
          submitted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_key: number;
          team_name: string;
          entrant_name: string;
          email?: string | null;
          venmo_handle?: string | null;
          paid?: boolean;
          predicted_score?: number | null;
          submitted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_key?: number;
          team_name?: string;
          entrant_name?: string;
          email?: string | null;
          venmo_handle?: string | null;
          paid?: boolean;
          predicted_score?: number | null;
          submitted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      picks: {
        Row: {
          id: string;
          entry_id: string;
          golfer_id: string;
          pick_number: number;
          pick_category: "regular" | "legend" | "amateur";
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          golfer_id: string;
          pick_number: number;
          pick_category: "regular" | "legend" | "amateur";
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          golfer_id?: string;
          pick_number?: number;
          pick_category?: "regular" | "legend" | "amateur";
          created_at?: string;
        };
        Relationships: [];
      };
      payouts: {
        Row: {
          id: string;
          rank: number | null;
          is_last_place: boolean;
          amount: number;
          label: string | null;
        };
        Insert: {
          id?: string;
          rank?: number | null;
          is_last_place?: boolean;
          amount: number;
          label?: string | null;
        };
        Update: {
          id?: string;
          rank?: number | null;
          is_last_place?: boolean;
          amount?: number;
          label?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      calculate_leaderboard: {
        Args: Record<string, never>;
        Returns: LeaderboardRow[];
      };
      get_team_detail: {
        Args: { p_team_key: number };
        Returns: TeamDetailRow[];
      };
      upsert_tournament_scores: {
        Args: { scores: unknown };
        Returns: Array<{ golfer_name: string; result: string }>;
      };
    };
  };
}

export interface TeamDetailRow {
  pick_number: number;
  pick_category: "regular" | "legend" | "amateur";
  golfer_name: string;
  tier: number | null;
  adj_score: number | null;
  score_vs_par: number | null;
  finish_position: string | null;
  thru: string | null;
  today: number | null;
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  round_4: number | null;
  status: "active" | "cut" | "wd" | "dq" | null;
  is_counting: boolean | null;
}

export interface LeaderboardRow {
  rank: number;
  team_key: number;
  team_name: string;
  entrant_name: string;
  team_score: number | null;
  golfers_thru_cut: number;
  predicted_score: number | null;
  payout: number | null;
}
