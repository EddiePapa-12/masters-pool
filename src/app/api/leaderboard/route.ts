/**
 * GET /api/leaderboard
 *
 * Calls calculate_leaderboard() Postgres function and returns ranked standings.
 * Response is cached for 60 seconds (ISR) — aligns with the cron sync interval.
 *
 * Response shape:
 *   {
 *     data: LeaderboardRow[],
 *     cached_at: string,        // ISO timestamp when this response was generated
 *     entry_count: number
 *   }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, LeaderboardRow } from "@/types/database";

// Cache this route response for 60 seconds (Next.js ISR for Route Handlers)
export const revalidate = 60;

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Service role key: anon role lacks SELECT grants on tables created via SQL editor
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supabase = getClient();

    const { data, error } = await supabase.rpc("calculate_leaderboard");

    if (error) {
      console.error("[leaderboard] RPC error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as LeaderboardRow[]) ?? [];

    return NextResponse.json({
      data: rows,
      cached_at: new Date().toISOString(),
      entry_count: rows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[leaderboard] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
