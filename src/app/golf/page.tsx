import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatScore, golfScoreClass } from "@/lib/format";

export const revalidate = 60;

interface GolfRow {
  golfer_name: string;
  score_vs_par: number | null;
  position: string | null;
  thru: string | null;
  today: number | null;
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  round_4: number | null;
  status: string | null;
}

async function getGolfLeaderboard(): Promise<{
  rows: GolfRow[];
  projectedCut: number;
  error: string | null;
}> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const [scoresRes, settingsRes] = await Promise.all([
      supabase
        .from("tournament_scores")
        .select(
          `score_vs_par, position, thru, today, round_1, round_2, round_3, round_4, status, golfers ( name )`
        )
        .order("score_vs_par", { ascending: true, nullsFirst: false }),
      supabase.from("pool_settings").select("projected_cut").single(),
    ]);

    if (scoresRes.error) throw scoresRes.error;

    const rows: GolfRow[] = (scoresRes.data ?? []).map((row) => ({
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

    return {
      rows,
      projectedCut: settingsRes.data?.projected_cut ?? 0,
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      projectedCut: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default async function GolfLeaderboardPage() {
  const { rows, projectedCut, error } = await getGolfLeaderboard();

  const cutLabel =
    projectedCut === 0
      ? "E"
      : projectedCut > 0
      ? `+${projectedCut}`
      : String(projectedCut);

  // Insert cut divider after last "active" player (status !== cut/wd/dq)
  // Players are sorted by score; cut players appear after active ones
  const cutInsertIndex = rows.findIndex(
    (r) => r.status === "cut" || r.status === "wd" || r.status === "dq"
  );

  return (
    <div className="golf-leaderboard-container">
      <div className="leaderboard-frame">
        <div className="golf-lb-header">
          <h1>⛳ 2026 Masters Tournament Leaderboard</h1>
        </div>

        <div className="golf-lb-badges">
          <span className="projected-cut-badge">Projected Cut: {cutLabel}</span>
          <span style={{ fontSize: "0.9rem", color: "#555", fontWeight: 600 }}>
            Augusta National Golf Club &bull; April 2026
          </span>
        </div>

        <div className="golf-lb-table-wrap">
          {error && (
            <div className="error-state">
              Unable to load scores — please refresh
            </div>
          )}

          {!error && rows.length === 0 ? (
            <div className="empty-state">Tournament hasn&apos;t started yet.</div>
          ) : (
            <table className="golf-lb-table">
              <thead>
                <tr>
                  <th>POS</th>
                  <th>PLAYER</th>
                  <th>SCORE</th>
                  <th>THRU</th>
                  <th>TODAY</th>
                  <th>R1</th>
                  <th>R2</th>
                  <th>R3</th>
                  <th>R4</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <>
                    {cutInsertIndex !== -1 && idx === cutInsertIndex && (
                      <tr key="cut-line" className="projected-cut-row">
                        <td colSpan={9}>
                          &mdash;&mdash; Projected Cut: {cutLabel} &mdash;&mdash;
                        </td>
                      </tr>
                    )}
                    <tr key={row.golfer_name}>
                      <td className="pos-td">{row.position ?? "-"}</td>
                      <td className="player-name-td">{row.golfer_name}</td>
                      <td className={golfScoreClass(row.score_vs_par)}>
                        {formatScore(row.score_vs_par)}
                      </td>
                      <td>{row.thru ?? "-"}</td>
                      <td className={golfScoreClass(row.today)}>
                        {formatScore(row.today)}
                      </td>
                      <td className={golfScoreClass(row.round_1)}>
                        {formatScore(row.round_1)}
                      </td>
                      <td className={golfScoreClass(row.round_2)}>
                        {formatScore(row.round_2)}
                      </td>
                      <td className={golfScoreClass(row.round_3)}>
                        {formatScore(row.round_3)}
                      </td>
                      <td className={golfScoreClass(row.round_4)}>
                        {formatScore(row.round_4)}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="leaderboard-footer">- Augusta National Golf Club -</div>
      </div>
    </div>
  );
}
