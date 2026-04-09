"use server";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData) {
  const password = formData.get("password") as string;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return { success: false, error: "ADMIN_PASSWORD env var not configured" };
  }

  if (password !== adminPassword) {
    return { success: false, error: "Incorrect password" };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, adminPassword, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/admin",
  });

  return { success: true };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return session === adminPassword;
}

// ---------------------------------------------------------------------------
// Supabase admin client (service role)
// ---------------------------------------------------------------------------

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Pool settings
// ---------------------------------------------------------------------------

export interface PoolSettingsData {
  projected_cut: number;
  par: number;
  tournament_name: string;
  entry_fee: number;
}

export async function getPoolSettings(): Promise<PoolSettingsData | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("pool_settings")
    .select("projected_cut, par, tournament_name, entry_fee")
    .single();

  if (error || !data) return null;
  return data as PoolSettingsData;
}

export async function updateProjectedCut(formData: FormData) {
  const cut = parseInt(formData.get("projected_cut") as string, 10);
  if (isNaN(cut)) return { success: false, error: "Invalid cut value" };

  const supabase = getAdminClient();
  const { error } = await supabase
    .from("pool_settings")
    .update({ projected_cut: cut, updated_at: new Date().toISOString() })
    .eq("singleton", true);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Sync stats from tournament_scores
// ---------------------------------------------------------------------------

export interface SyncStats {
  total_golfers: number;
  last_updated: string | null;
  active_count: number;
  cut_count: number;
  wd_dq_count: number;
}

export async function getSyncStats(): Promise<SyncStats> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("tournament_scores")
    .select("status, updated_at");

  if (error || !data) {
    return { total_golfers: 0, last_updated: null, active_count: 0, cut_count: 0, wd_dq_count: 0 };
  }

  const dates = data.map((r) => r.updated_at).filter(Boolean).sort().reverse();

  return {
    total_golfers: data.length,
    last_updated: dates[0] ?? null,
    active_count: data.filter((r) => r.status === "active").length,
    cut_count: data.filter((r) => r.status === "cut").length,
    wd_dq_count: data.filter((r) => r.status === "wd" || r.status === "dq").length,
  };
}
