/**
 * GET /api/admin/stats
 * Returns tournament_scores summary for the admin dashboard.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const SESSION_COOKIE = "admin_session";

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!process.env.ADMIN_PASSWORD || session !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .from("tournament_scores")
    .select("status, updated_at");

  const rows = data ?? [];
  const dates = rows.map((r) => r.updated_at).filter(Boolean).sort().reverse();

  return NextResponse.json({
    total_golfers: rows.length,
    last_updated: dates[0] ?? null,
    active_count: rows.filter((r) => r.status === "active").length,
    cut_count: rows.filter((r) => r.status === "cut").length,
    wd_dq_count: rows.filter((r) => r.status === "wd" || r.status === "dq").length,
  });
}
