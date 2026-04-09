import { createClient } from "@supabase/supabase-js";
import type { Database, LeaderboardRow } from "@/types/database";
import { formatScore, poolScoreClass } from "@/lib/format";
import LeaderboardRefresher from "./LeaderboardRefresher";
import Link from "next/link";

export const revalidate = 60;

async function getLeaderboard(): Promise<{
  rows: LeaderboardRow[];
  entryCount: number;
  prizePool: number;
  projectedCut: number;
  error: string | null;
}> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role: anon lacks SELECT grants on these tables
      { auth: { persistSession: false } }
    );

    const [lbRes, settingsRes] = await Promise.all([
      supabase.rpc("calculate_leaderboard"),
      supabase.from("pool_settings").select("projected_cut, entry_fee").single(),
    ]);

    if (lbRes.error) throw lbRes.error;

    const rows = (lbRes.data as LeaderboardRow[]) ?? [];
    const entryFee = settingsRes.data?.entry_fee ?? 25;
    const projectedCut = settingsRes.data?.projected_cut ?? 0;

    return {
      rows,
      entryCount: rows.length,
      prizePool: rows.length * entryFee,
      projectedCut,
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      entryCount: 0,
      prizePool: 0,
      projectedCut: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default async function PoolLeaderboardPage() {
  const { rows, entryCount, prizePool, projectedCut, error } =
    await getLeaderboard();

  const cutLabel =
    projectedCut === 0
      ? "E"
      : projectedCut > 0
      ? `+${projectedCut}`
      : String(projectedCut);

  return (
    <>
      {/* Client component: triggers router.refresh() every 60s */}
      <LeaderboardRefresher />

      <div className="leaderboard-container">
        <div className="leaderboard-frame">
          <div className="leaderboard-title">
            <h1>2026 Masters Pool Leaderboard</h1>
          </div>

          <div className="leaderboard-stats">
            <span>Entries: {entryCount}</span>
            <span>
              Prize Pool: ${prizePool.toLocaleString()}
            </span>
            <span>Projected Cut: {cutLabel}</span>
          </div>

          <div className="leaderboard-table-container">
            {error && (
              <div className="error-state">
                Unable to load scores — please refresh
              </div>
            )}

            {!error && rows.length === 0 ? (
              <div className="empty-state">
                Tournament hasn&apos;t started yet.
              </div>
            ) : (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>Team Name</th>
                    <th>Entrant</th>
                    <th>Score</th>
                    <th>Golfers Thru Cut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.team_key}>
                      <td className="pos-cell">{entry.rank}</td>
                      <td className="team-name-cell">
                        <Link
                          href={`/teams?team=${entry.team_key}`}
                          className="team-name-link"
                        >
                          {entry.team_name}
                        </Link>
                      </td>
                      <td>{entry.entrant_name}</td>
                      <td
                        className={`score-cell ${poolScoreClass(
                          entry.team_score
                        )}`}
                      >
                        {formatScore(entry.team_score)}
                      </td>
                      <td>{entry.golfers_thru_cut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="leaderboard-footer">
            - Augusta National Golf Club -
          </div>
        </div>
      </div>
    </>
  );
}
