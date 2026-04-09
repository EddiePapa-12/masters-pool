/**
 * POST /api/sync-scores
 *
 * Fetches live scores from ESPN, matches golfer names to the database,
 * and upserts tournament_scores via the Postgres function.
 *
 * Auth: requires Authorization: Bearer <CRON_SECRET> header.
 * Called by Vercel Cron (vercel.json) and optionally by the admin page.
 *
 * Returns:
 *   { updated: number, unmatched: string[], timestamp: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMastersScores } from "@/lib/espn";
import type { Database } from "@/types/database";

// Use service role so this route can write regardless of RLS policies
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET env var not set" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch ESPN scores ─────────────────────────────────────────────────────
  let espnRows;
  try {
    espnRows = await fetchMastersScores();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync-scores] ESPN fetch failed:", message);
    return NextResponse.json({ error: `ESPN fetch failed: ${message}` }, { status: 502 });
  }

  if (espnRows.length === 0) {
    return NextResponse.json({
      updated: 0,
      unmatched: [],
      timestamp: new Date().toISOString(),
      note: "ESPN returned 0 competitors — tournament may not have started",
    });
  }

  // ── Match ESPN names to golfers table ─────────────────────────────────────
  const supabase = getAdminClient();

  const { data: golfers, error: golferErr } = await supabase
    .from("golfers")
    .select("id, name");

  if (golferErr) {
    console.error("[sync-scores] Failed to load golfers:", golferErr.message);
    return NextResponse.json({ error: golferErr.message }, { status: 500 });
  }

  // Build a normalised name → id map (lowercase, trim)
  const golferMap = new Map<string, string>();
  for (const g of golfers ?? []) {
    golferMap.set(normalise(g.name), g.id);
  }

  const matched: Array<typeof espnRows[0] & { golfer_id: string }> = [];
  const unmatched: string[] = [];

  for (const row of espnRows) {
    const id = golferMap.get(normalise(row.name));
    if (!id) {
      unmatched.push(row.name);
      continue;
    }
    matched.push({ ...row, golfer_id: id });
  }

  if (unmatched.length > 0) {
    console.warn("[sync-scores] Unmatched golfer names (fix spelling in DB or ESPN):", unmatched);
  }

  if (matched.length === 0) {
    return NextResponse.json({
      updated: 0,
      unmatched,
      timestamp: new Date().toISOString(),
      note: "No golfers matched — check golfer names in database",
    });
  }

  // ── Call upsert_tournament_scores Postgres function ───────────────────────
  //
  // The function accepts a JSONB array with shape:
  //   [{ name, position, score_vs_par, round_1..4, total_strokes, thru, today, status }, ...]
  // It matches by name internally, but we've already resolved IDs above and
  // pass the full row so both code paths are covered.

  const payload = matched.map((r) => ({
    name: r.name,          // function uses this for its own lookup
    position: r.position,
    score_vs_par: r.score_vs_par,
    round_1: r.round_1,
    round_2: r.round_2,
    round_3: r.round_3,
    round_4: r.round_4,
    total_strokes: r.total_strokes,
    thru: r.thru,
    today: r.today,
    status: r.status,
  }));

  const { data: upsertResults, error: upsertErr } = await supabase.rpc(
    "upsert_tournament_scores",
    { scores: payload }
  );

  if (upsertErr) {
    console.error("[sync-scores] upsert_tournament_scores error:", upsertErr.message);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const updatedCount = (upsertResults as Array<{ result: string }> | null)
    ?.filter((r) => r.result === "upserted").length ?? matched.length;

  const timestamp = new Date().toISOString();

  console.log(
    `[sync-scores] ${timestamp} — updated=${updatedCount} unmatched=${unmatched.length}`
  );

  return NextResponse.json({ updated: updatedCount, unmatched, timestamp });
}

// Vercel Cron sends GET requests; proxy to POST logic using the cron secret
// injected automatically via the CRON_SECRET env var.
export async function GET(req: NextRequest) {
  // Vercel Cron authenticates via the Authorization header with the CRON_SECRET.
  // Reuse the POST handler so the cron and the admin trigger are identical.
  return POST(req);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise a golfer name for fuzzy matching:
 * lowercase, trim, collapse whitespace, strip trailing "(a)" amateur marker.
 * This handles minor ESPN vs. DB spelling drift.
 */
function normalise(name: string): string {
  return name
    .normalize("NFD")                          // decompose accented chars (é → e + ́)
    .replace(/[\u0300-\u036f]/g, "")           // strip the accent marks (Välimäki → Valimaki)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(a\)\s*$/i, "")             // strip "(a)" amateur marker
    .replace(/\s*\(amateur\)\s*$/i, "");
}
