/**
 * POST /api/admin/sync
 *
 * Admin-only proxy: validates the session cookie, then runs the same
 * score sync logic as /api/sync-scores without exposing CRON_SECRET to
 * the browser.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { fetchMastersScores } from "@/lib/espn";
import type { Database } from "@/types/database";

const SESSION_COOKIE = "admin_session";

function isAdmin(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return session === adminPassword;
}

function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST() {
  const cookieStore = await cookies();
  if (!isAdmin(cookieStore)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch ESPN scores
  let espnRows;
  try {
    espnRows = await fetchMastersScores();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `ESPN fetch failed: ${message}` }, { status: 502 });
  }

  if (espnRows.length === 0) {
    return NextResponse.json({
      updated: 0,
      unmatched: [],
      timestamp: new Date().toISOString(),
      note: "ESPN returned 0 competitors",
    });
  }

  const supabase = getAdminClient();

  // Resolve golfer names to IDs
  const { data: golfers } = await supabase.from("golfers").select("id, name");
  const golferMap = new Map<string, string>();
  for (const g of golfers ?? []) {
    golferMap.set(normalise(g.name), g.id);
  }

  const matched = [];
  const unmatched: string[] = [];

  for (const row of espnRows) {
    if (golferMap.has(normalise(row.name))) {
      matched.push(row);
    } else {
      unmatched.push(row.name);
    }
  }

  if (matched.length === 0) {
    return NextResponse.json({ updated: 0, unmatched, timestamp: new Date().toISOString() });
  }

  const { data: upsertResults, error } = await supabase.rpc("upsert_tournament_scores", {
    scores: matched,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated =
    (upsertResults as Array<{ result: string }> | null)?.filter((r) => r.result === "upserted")
      .length ?? matched.length;

  return NextResponse.json({ updated, unmatched, timestamp: new Date().toISOString() });
}

function normalise(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/\s*\(a\)\s*$/i, "");
}
