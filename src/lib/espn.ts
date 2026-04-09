/**
 * ESPN API — Masters Tournament score fetcher
 *
 * Endpoint: https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard
 *
 * ACTUAL live structure (verified via curl during 2026 tournament):
 *
 *   competitor.linescores[]           — one entry per round played / in-progress
 *     .period                         — round number (1–4)
 *     .value                          — running stroke total for that round (raw strokes)
 *     .displayValue                   — score vs par for that round  e.g. "-2", "E", "+1"
 *     .linescores[]                   — hole-by-hole scores; .length = holes completed (0–18)
 *
 *   competitor.status.period          — NULL (do not use)
 *   competitor.status.thru            — NULL (do not use)
 *   competitor.status.type.name       — "STATUS_ACTIVE" | "STATUS_CUT" | "STATUS_WD" | "STATUS_DQ"
 *   competitor.status.type.shortDetail — tee time string if not yet started (e.g. "10:48 AM")
 *   competitor.score                  — overall score vs par string "-11" | "E" | "+3" | "CUT"
 *
 * NOTE: If the parser breaks, log `rawCompetitors[0]` and compare to the types below.
 */

export interface ScoreUpsertRow {
  name: string;
  position: string;
  score_vs_par: number | null;
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  round_4: number | null;
  total_strokes: number | null;
  thru: string | null;
  today: number | null;
  status: "active" | "cut" | "wd" | "dq";
}

// ---------------------------------------------------------------------------
// ESPN response types (partial — only fields we use)
// ---------------------------------------------------------------------------

/** One hole's score inside a round linescore. */
interface EspnHoleScore {
  value?: number;
  displayValue?: string;
}

/**
 * One round's linescore block.
 * NOTE: The nested `.linescores` array contains hole-by-hole scores.
 * Its length tells us how many holes the player has completed.
 */
interface EspnRoundLinescore {
  period?: number;           // which round (1–4)
  value?: number;            // running raw stroke total for this round
  displayValue?: string;     // score vs par for this round: "-2", "E", "+1", "70", etc.
  linescores?: EspnHoleScore[]; // hole-by-hole scores; length = holes completed
}

interface EspnStatusType {
  name?: string;          // "STATUS_ACTIVE" | "STATUS_CUT" | "STATUS_WD" | "STATUS_DQ" | "STATUS_FINAL"
  description?: string;   // "In Progress" | "Cut" | "Withdrawn" | "Disqualified" | "Final"
  shortDetail?: string;   // tee time "10:48 AM" when not yet started; "F" when finished; or holes thru
  state?: string;         // "in" | "post" | "pre"
}

interface EspnStatus {
  type?: EspnStatusType;
  period?: number;        // NULL in live feed — do not rely on this
  thru?: number;          // NULL in live feed — do not rely on this
}

interface EspnAthlete {
  displayName?: string;
  shortName?: string;
}

interface EspnCompetitor {
  athlete?: EspnAthlete;
  score?: string;              // "-11", "E", "+3", "CUT", or absent
  status?: EspnStatus;
  linescores?: EspnRoundLinescore[];  // outer array = rounds; inner array = holes
}

interface EspnCompetition {
  competitors?: EspnCompetitor[];
}

interface EspnEvent {
  name?: string;
  competitions?: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAR = 72; // Augusta National par

/** Parse ESPN score-vs-par string → integer. "E" → 0, null/CUT/absent → null. */
function parseScoreVsPar(raw: string | undefined | null): number | null {
  if (raw == null || raw === "" || raw === "-") return null;
  const upper = raw.toUpperCase();
  if (upper === "E" || upper === "EVEN") return 0;
  if (upper === "CUT" || upper === "WD" || upper === "DQ" || upper === "MDF") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

/** Map ESPN status type name → our pool status enum. */
function parseStatus(statusType: EspnStatusType | undefined): "active" | "cut" | "wd" | "dq" {
  const name = (statusType?.name ?? "").toUpperCase();
  const desc = (statusType?.description ?? "").toUpperCase();

  if (name.includes("CUT") || desc.includes("CUT")) return "cut";
  if (name.includes("WD") || desc.includes("WITHDRAWN") || desc.includes("WITHDRAW")) return "wd";
  if (name.includes("DQ") || desc.includes("DISQUALIF")) return "dq";
  return "active";
}

/**
 * Parse round data from the nested linescores structure.
 *
 * Returns the per-round vs-par scores (null if round not yet reached),
 * thru holes for the current round, and today's score vs par.
 *
 * A round's score is set to the vs-par value from displayValue regardless of
 * whether the round is complete or still in progress — so the R1 column shows
 * the current running score while play is ongoing, and switches to the final
 * score once the round is complete. This matches what players expect to see.
 */
function parseRoundData(
  competitor: EspnCompetitor,
  poolStatus: "active" | "cut" | "wd" | "dq"
): {
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  round_4: number | null;
  total_strokes: number | null;
  thru: string | null;
  today: number | null;
} {
  const nullResult = {
    round_1: null, round_2: null, round_3: null, round_4: null,
    total_strokes: null, thru: null, today: null,
  };

  if (poolStatus !== "active") {
    // For cut/wd/dq players: still record completed round scores
    // but set thru/today to null
    const roundScores = extractRoundScores(competitor.linescores);
    return { ...roundScores, thru: null, today: null };
  }

  const outerLinescores = competitor.linescores ?? [];

  if (outerLinescores.length === 0) {
    // Player hasn't started — show tee time in thru if available
    const teeTime = competitor.status?.type?.shortDetail ?? null;
    return { ...nullResult, thru: teeTime };
  }

  // Find which round is currently active (most recent / in-progress):
  // The active round is the one with the fewest holes played (< 18),
  // or the last round entry if all are complete.
  let currentRound: EspnRoundLinescore | null = null;
  let currentHolesPlayed = 0;

  // Sort by period to ensure we process rounds in order
  const sorted = [...outerLinescores].sort((a, b) => (a.period ?? 0) - (b.period ?? 0));

  for (const ls of sorted) {
    const holes = ls.linescores?.length ?? 0;
    if (holes < 18) {
      // This round is in progress (or not started = 0 holes)
      currentRound = ls;
      currentHolesPlayed = holes;
      break;
    }
    // holes === 18: completed round, keep going to find next
    currentRound = ls; // will be overwritten if there's a later in-progress round
    currentHolesPlayed = 18;
  }

  // Build round-by-round vs-par scores
  const roundScores = extractRoundScores(competitor.linescores);

  // Determine thru display
  let thru: string | null = null;
  if (currentRound) {
    if (currentHolesPlayed === 18) {
      thru = "F";
    } else if (currentHolesPlayed > 0) {
      thru = String(currentHolesPlayed);
    } else {
      // 0 holes played — check for tee time in shortDetail
      thru = competitor.status?.type?.shortDetail ?? null;
    }
  }

  // Today's score = current round's vs-par (in-progress or just finished)
  let today: number | null = null;
  if (currentRound) {
    today = parseScoreVsPar(currentRound.displayValue);
    // Fallback: compute from raw strokes and holes played
    if (today === null && currentRound.value != null && currentHolesPlayed > 0) {
      // Approximate: running strokes minus par for holes played
      const parPerHole = PAR / 18;
      today = Math.round(currentRound.value - parPerHole * currentHolesPlayed);
    }
  }

  return { ...roundScores, thru, today };
}

/**
 * Extract per-round vs-par scores from the outer linescores array.
 * Each outer entry corresponds to one round (identified by .period).
 * Score is taken from displayValue (vs par), falling back to value - par_proportion.
 */
function extractRoundScores(outerLinescores: EspnRoundLinescore[] | undefined): {
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  round_4: number | null;
  total_strokes: number | null;
} {
  const scores: Record<number, number | null> = { 1: null, 2: null, 3: null, 4: null };

  for (const ls of outerLinescores ?? []) {
    const period = ls.period;
    if (!period || period < 1 || period > 4) continue;

    const holes = ls.linescores?.length ?? 0;
    if (holes === 0) {
      // No holes played in this round yet
      scores[period] = null;
      continue;
    }

    // Parse the vs-par score from displayValue
    const vsPar = parseScoreVsPar(ls.displayValue);
    if (vsPar !== null) {
      scores[period] = vsPar;
    } else if (ls.value != null) {
      // displayValue wasn't a vs-par string — try treating value as raw strokes
      // Only do this if > 50 (looks like stroke total, not vs par)
      if (ls.value > 50) {
        scores[period] = ls.value - PAR;
      } else {
        scores[period] = ls.value; // might already be vs par
      }
    }
  }

  // Compute total raw strokes (sum of all rounds where we have a completed score)
  // We don't have reliable raw strokes from displayValue alone, so set to null
  // (the DB column exists but isn't displayed directly to users)
  const total_strokes: number | null = null;

  return {
    round_1: scores[1],
    round_2: scores[2],
    round_3: scores[3],
    round_4: scores[4],
    total_strokes,
  };
}

/**
 * After all rows are built, assign T1/T2/T3 style positions to active players
 * based on their score_vs_par, handling ties correctly.
 * Cut/WD/DQ players get their status label as position.
 */
function assignPositions(rows: ScoreUpsertRow[]): void {
  // Separate active players with a score from those without
  const activeWithScore = rows.filter(
    (r) => r.status === "active" && r.score_vs_par !== null
  );

  // Sort ascending (lowest = best)
  activeWithScore.sort((a, b) => (a.score_vs_par ?? 0) - (b.score_vs_par ?? 0));

  let rankCounter = 1;
  for (let i = 0; i < activeWithScore.length; i++) {
    if (i > 0 && activeWithScore[i].score_vs_par !== activeWithScore[i - 1].score_vs_par) {
      rankCounter = i + 1;
    }
    // Check if anyone else shares this score (tie)
    const tied = activeWithScore.some(
      (r, j) => j !== i && r.score_vs_par === activeWithScore[i].score_vs_par
    );
    activeWithScore[i].position = tied ? `T${rankCounter}` : String(rankCounter);
  }

  // Active players with no score yet (not started tournament)
  rows
    .filter((r) => r.status === "active" && r.score_vs_par === null)
    .forEach((r) => {
      r.position = "--";
    });

  // Non-active players
  rows.filter((r) => r.status !== "active").forEach((r) => {
    if (r.status === "cut") r.position = "CUT";
    else if (r.status === "wd") r.position = "WD";
    else if (r.status === "dq") r.position = "DQ";
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

export async function fetchMastersScores(): Promise<ScoreUpsertRow[]> {
  const res = await fetch(ESPN_URL, {
    cache: "no-store",
    headers: {
      "User-Agent": "masters-pool-app/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`ESPN API responded ${res.status}: ${res.statusText}`);
  }

  const data: EspnScoreboardResponse = await res.json();

  // Find the Masters event (or fall back to the first event)
  const event =
    data.events?.find((e) => e.name?.toLowerCase().includes("masters")) ??
    data.events?.[0];

  if (!event) {
    throw new Error("ESPN response contained no events");
  }

  const competitors = event.competitions?.[0]?.competitors ?? [];

  if (competitors.length === 0) {
    throw new Error(
      "ESPN event contained no competitors — tournament may not have started"
    );
  }

  const rows: ScoreUpsertRow[] = [];

  for (const c of competitors) {
    const name = c.athlete?.displayName?.trim();
    if (!name) continue;

    const poolStatus = parseStatus(c.status?.type);
    const scoreVsPar = parseScoreVsPar(c.score);

    const { round_1, round_2, round_3, round_4, total_strokes, thru, today } =
      parseRoundData(c, poolStatus);

    rows.push({
      name,
      position: "", // assigned below after sorting
      score_vs_par: scoreVsPar,
      round_1,
      round_2,
      round_3,
      round_4,
      total_strokes,
      thru,
      today,
      status: poolStatus,
    });
  }

  // Compute T1/T2/T3 positions from the full sorted list
  assignPositions(rows);

  return rows;
}
