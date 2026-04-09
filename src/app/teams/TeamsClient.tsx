"use client";

import { useState, useEffect } from "react";
import { formatScore, golferScoreClass } from "@/lib/format";

interface EntryOption {
  team_key: number;
  team_name: string;
  entrant_name: string;
}

interface PickRow {
  pick_number: number;
  pick_category: "regular" | "legend" | "amateur";
  golfer_name: string;
  tier: number | null;
  adj_score: number | null;
  score_vs_par: number | null;
  finish_position: string | null;
  thru: string | null;
  today: number | null;
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  round_4: number | null;
  status: "active" | "cut" | "wd" | "dq";
  is_counting: boolean;
}

interface TeamDetail {
  team_key: number;
  team_name: string;
  entrant_name: string;
  predicted_score: number | null;
  picks: PickRow[];
}

interface Props {
  entries: EntryOption[];
  initialTeamKey: number | null;
}

export default function TeamsClient({ entries, initialTeamKey }: Props) {
  const [selectedKey, setSelectedKey] = useState<number | null>(initialTeamKey);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/team/${selectedKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: TeamDetail = await res.json();
        if (!cancelled) setDetail(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load team");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedKey]);

  // Compute team score from is_counting picks
  const teamScore = detail?.picks
    .filter((p) => p.is_counting && p.adj_score !== null)
    .reduce((sum, p) => sum + (p.adj_score ?? 0), 0) ?? null;

  const scoreClass =
    teamScore === null ? "" : teamScore < 0 ? "score-negative" : teamScore > 0 ? "score-positive" : "";

  return (
    <div className="container">
      {/* ── Team selector ─────────────────────────────────────── */}
      <div className="team-selector">
        <label htmlFor="team-select">Select Team to View</label>
        <select
          id="team-select"
          value={selectedKey ?? ""}
          onChange={(e) => setSelectedKey(parseInt(e.target.value, 10))}
        >
          {entries.map((e) => (
            <option key={e.team_key} value={e.team_key}>
              {e.team_name} — {e.entrant_name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Team card ─────────────────────────────────────────── */}
      {loading && (
        <div className="empty-state">Loading…</div>
      )}

      {error && (
        <div className="error-state">{error}</div>
      )}

      {detail && !loading && (
        <div>
          {/* Green header */}
          <div className="team-card-header">
            <div className="team-card-header-info">
              <h3>{detail.team_name}</h3>
              <div className="entrant-label">Entrant: {detail.entrant_name}</div>
            </div>
            <div className="team-card-header-score">
              <span className="score-label">Total Score</span>
              <span className={`score-value ${scoreClass}`}>
                {teamScore === null ? "-" : formatScore(teamScore)}
              </span>
            </div>
          </div>

          {/* Golfer table */}
          <div className="team-details-table-wrap" style={{ overflowX: "auto" }}>
            <table className="team-details-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "center" }}>Tier</th>
                  <th>Golfer</th>
                  <th>Total</th>
                  <th>R1</th>
                  <th>R2</th>
                  <th>R3</th>
                  <th>R4</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.picks.map((pick) => (
                  <tr
                    key={pick.pick_number}
                    className={!pick.is_counting ? "dropped-pick" : ""}
                  >
                    <td className="tier-cell">{pick.pick_number}</td>
                    <td>
                      <strong>{pick.golfer_name}</strong>
                    </td>
                    <td
                      className={`totals-cell ${golferScoreClass(pick.adj_score)}`}
                    >
                      <strong>{formatScore(pick.adj_score)}</strong>
                    </td>
                    <td className={golferScoreClass(pick.round_1 ?? (pick.round_2 === null && pick.status === "active" ? pick.today : null))}>
                      {formatScore(pick.round_1 ?? (pick.round_2 === null && pick.status === "active" ? pick.today : null))}
                    </td>
                    <td className={golferScoreClass(pick.round_2 ?? (pick.round_3 === null && pick.round_1 !== null && pick.status === "active" ? pick.today : null))}>
                      {formatScore(pick.round_2 ?? (pick.round_3 === null && pick.round_1 !== null && pick.status === "active" ? pick.today : null))}
                    </td>
                    <td className={golferScoreClass(pick.round_3 ?? (pick.round_4 === null && pick.round_2 !== null && pick.status === "active" ? pick.today : null))}>
                      {formatScore(pick.round_3 ?? (pick.round_4 === null && pick.round_2 !== null && pick.status === "active" ? pick.today : null))}
                    </td>
                    <td className={golferScoreClass(pick.round_4 ?? (pick.round_3 !== null && pick.status === "active" ? pick.today : null))}>
                      {formatScore(pick.round_4 ?? (pick.round_3 !== null && pick.status === "active" ? pick.today : null))}
                    </td>
                    <td>
                      {pick.status === "active" ? (
                        <span className="golfer-made-cut">Made Cut</span>
                      ) : (
                        <span className="golfer-cut">
                          {pick.status === "wd"
                            ? "WD"
                            : pick.status === "dq"
                            ? "DQ"
                            : "Missed Cut"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#888" }}>
            Dimmed rows are not counting toward the team score (dropped picks).
          </p>
        </div>
      )}

      {!detail && !loading && !error && entries.length === 0 && (
        <div className="empty-state">No entries found.</div>
      )}
    </div>
  );
}
