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
  thruthCutByTeam: Record<number, number>;
  error: string | null;
}> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role: anon lacks SELECT grants on these tables
      { auth: { persistSession: false } }
    );

    const [lbRes, settingsRes, scoresRes, picksRes, entriesRes] = await Promise.all([
      supabase.rpc("calculate_leaderboard"),
      supabase.from("pool_settings").select("projected_cut, entry_fee").single(),
      supabase.from("tournament_scores").select("golfer_id, status, round_2, round_3, score_vs_par"),
      supabase.from("picks").select("entry_id, golfer_id"),
      supabase.from("entries").select("id, team_key"),
    ]);

    if (lbRes.error) throw lbRes.error;

    const rows = (lbRes.data as LeaderboardRow[]) ?? [];
    const entryFee = settingsRes.data?.entry_fee ?? 25;
    const projectedCut = settingsRes.data?.projected_cut ?? 0;

    // Compute golfers_thru_cut from raw data (the DB function counts all 13 picks).
    // A golfer made the cut if: status is active AND NOT (R3 null + R2 present + score > cut line).
    const madeCutIds = new Set<string>(
      (scoresRes.data ?? [])
        .filter((s) =>
          s.status !== "cut" &&
          s.status !== "wd" &&
          s.status !== "dq" &&
          !(
            s.round_3 === null &&
            s.round_2 !== null &&
            s.score_vs_par !== null &&
            s.score_vs_par > projectedCut
          )
        )
        .map((s) => s.golfer_id)
    );

    // Map entry uuid -> team_key
    const entryToTeam: Record<string, number> = {};
    for (const e of entriesRes.data ?? []) entryToTeam[e.id] = e.team_key;

    // Count made-cut golfers per team
    const thruthCutByTeam: Record<number, number> = {};
    for (const pick of picksRes.data ?? []) {
      const teamKey = entryToTeam[pick.entry_id];
      if (teamKey !== undefined && madeCutIds.has(pick.golfer_id)) {
        thruthCutByTeam[teamKey] = (thruthCutByTeam[teamKey] ?? 0) + 1;
      }
    }

    return {
      rows,
      entryCount: rows.length,
      prizePool: rows.length * entryFee,
      projectedCut,
      thruthCutByTeam,
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      entryCount: 0,
      prizePool: 0,
      projectedCut: 0,
      thruthCutByTeam: {},
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default async function PoolLeaderboardPage() {
  const { rows, entryCount, prizePool, projectedCut, thruthCutByTeam, error } =
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
                      <td>{thruthCutByTeam[entry.team_key] ?? 0}</td>
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
