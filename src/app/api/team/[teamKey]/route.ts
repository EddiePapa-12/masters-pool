/**
 * GET /api/team/[teamKey]
 *
 * Returns all 13 golfer picks for an entry with per-golfer scoring details.
 * Calls the get_team_detail(p_team_key) Postgres function.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const revalidate = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: { teamKey: string } }
) {
  const teamKey = parseInt(params.teamKey, 10);
  if (isNaN(teamKey)) {
    return NextResponse.json({ error: "Invalid team key" }, { status: 400 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.rpc("get_team_detail", {
    p_team_key: teamKey,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch entry metadata (team name, entrant, score)
  const { data: entry } = await supabase
    .from("entries")
    .select("team_name, entrant_name, predicted_score")
    .eq("team_key", teamKey)
    .single();

  return NextResponse.json({
    team_key: teamKey,
    team_name: entry?.team_name ?? "",
    entrant_name: entry?.entrant_name ?? "",
    predicted_score: entry?.predicted_score ?? null,
    picks: data ?? [],
  });
}
