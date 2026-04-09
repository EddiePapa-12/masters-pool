/**
 * GET /api/golf-leaderboard
 *
 * Returns all rows from tournament_scores joined with golfers,
 * ordered by adj_score ascending (best score first), then by golfer name.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const revalidate = 60;

export async function GET() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role: anon lacks SELECT grants
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("tournament_scores")
    .select(
      `
      golfer_id,
      score_vs_par,
      position,
      thru,
      today,
      round_1,
      round_2,
      round_3,
      round_4,
      status,
      golfers ( name )
    `
    )
    .order("score_vs_par", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((row) => ({
    golfer_name: (row.golfers as unknown as { name: string } | null)?.name ?? "",
    score_vs_par: row.score_vs_par,
    position: row.position,
    thru: row.thru,
    today: row.today,
    round_1: row.round_1,
    round_2: row.round_2,
    round_3: row.round_3,
    round_4: row.round_4,
    status: row.status,
  }));

  return NextResponse.json({ data: rows, cached_at: new Date().toISOString() });
}
