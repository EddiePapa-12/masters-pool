"use client";

import { useState, useTransition } from "react";
import { updateProjectedCut } from "./actions";

interface SyncResult {
  updated: number;
  unmatched: string[];
  timestamp: string;
  error?: string;
  note?: string;
}

interface SyncStats {
  total_golfers: number;
  last_updated: string | null;
  active_count: number;
  cut_count: number;
  wd_dq_count: number;
}

interface PoolSettings {
  projected_cut: number;
  par: number;
  tournament_name: string;
  entry_fee: number;
}

interface Props {
  initialStats: SyncStats;
  initialSettings: PoolSettings | null;
}

export default function AdminClient({ initialStats, initialSettings }: Props) {
  const [stats, setStats] = useState<SyncStats>(initialStats);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cutSaved, setCutSaved] = useState(false);
  const [cutError, setCutError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Manual score sync ────────────────────────────────────────────────────
  // Calls /api/admin/sync (not /api/sync-scores directly) so the CRON_SECRET
  // never touches the browser. The proxy endpoint validates the admin session
  // cookie and injects the secret server-side.
  async function handleSync() {
    setSyncing(true);
    setLastSync(null);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const json: SyncResult = await res.json();
      setLastSync(json);

      // Refresh stats
      const statsRes = await fetch("/api/admin/stats");
      if (statsRes.ok) {
        const newStats: SyncStats = await statsRes.json();
        setStats(newStats);
      }
    } catch (err) {
      setLastSync({
        updated: 0,
        unmatched: [],
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  }

  // ── Projected cut update ─────────────────────────────────────────────────
  function handleCutSubmit(formData: FormData) {
    setCutSaved(false);
    setCutError(null);
    startTransition(async () => {
      const result = await updateProjectedCut(formData);
      if (result.success) {
        setCutSaved(true);
        setTimeout(() => setCutSaved(false), 3000);
      } else {
        setCutError(result.error ?? "Failed to update");
      }
    });
  }

  return (
    <div className="space-y-8">

      {/* ── Score Sync ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Score Sync</h2>
        <p className="text-sm text-gray-500 mb-4">
          Vercel Cron runs automatically every minute. Use this button to force an immediate update.
        </p>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Golfers in DB", value: stats.total_golfers },
            { label: "Active", value: stats.active_count },
            { label: "Cut", value: stats.cut_count },
            { label: "WD / DQ", value: stats.wd_dq_count },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {stats.last_updated && (
          <p className="text-xs text-gray-400 mb-4">
            Last updated: {new Date(stats.last_updated).toLocaleString()}
          </p>
        )}

        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 bg-[#006747] hover:bg-[#005238] disabled:opacity-50
                     text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {syncing ? (
            <>
              <Spinner />
              Syncing…
            </>
          ) : (
            "Sync Scores Now"
          )}
        </button>

        {/* Sync result */}
        {lastSync && (
          <div className="mt-4 rounded-lg border p-4 text-sm space-y-2">
            {lastSync.error ? (
              <p className="text-red-600 font-medium">Error: {lastSync.error}</p>
            ) : (
              <>
                <p className="text-green-700 font-medium">
                  ✓ {lastSync.updated} golfer scores updated
                </p>
                {lastSync.note && (
                  <p className="text-amber-600">{lastSync.note}</p>
                )}
                <p className="text-gray-400 text-xs">
                  Synced at {new Date(lastSync.timestamp).toLocaleTimeString()}
                </p>
              </>
            )}

            {lastSync.unmatched && lastSync.unmatched.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="font-medium text-amber-700 mb-1">
                  ⚠ {lastSync.unmatched.length} ESPN name{lastSync.unmatched.length !== 1 ? "s" : ""}{" "}
                  not found in database:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                  {lastSync.unmatched.map((name) => (
                    <li key={name} className="font-mono text-xs">{name}</li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-2">
                  Fix: update the golfer name in the <code>golfers</code> table to match ESPN exactly,
                  or update the ESPN name mapping in <code>src/lib/espn.ts</code>.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Projected Cut ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Projected Cut</h2>
        <p className="text-sm text-gray-500 mb-4">
          Update on Friday afternoon once the cut is confirmed. Negative = under par (e.g. -1), positive = over par (e.g. +2 → enter 2).
        </p>

        <form action={handleCutSubmit} className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor="projected_cut" className="text-sm font-medium text-gray-700">
              Cut score (vs par):
            </label>
            <input
              id="projected_cut"
              name="projected_cut"
              type="number"
              defaultValue={initialSettings?.projected_cut ?? 0}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center text-sm
                         focus:outline-none focus:ring-2 focus:ring-[#006747] focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white
                       font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          {cutSaved && <span className="text-green-600 text-sm">✓ Saved</span>}
          {cutError && <span className="text-red-600 text-sm">{cutError}</span>}
        </form>

        {initialSettings && (
          <p className="text-xs text-gray-400 mt-2">
            Current: {initialSettings.projected_cut >= 0 ? "+" : ""}
            {initialSettings.projected_cut} | Par {initialSettings.par} | {initialSettings.tournament_name}
          </p>
        )}
      </section>

      {/* ── Quick links ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { href: "/api/leaderboard", label: "GET /api/leaderboard" },
            { href: "/api/sync-scores", label: "POST /api/sync-scores" },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-[#006747] hover:underline bg-green-50 px-3 py-1.5 rounded-md"
            >
              {label} ↗
            </a>
          ))}
        </div>
      </section>

    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

