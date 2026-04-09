/**
 * ESPN API — Masters Tournament score fetcher
 *
 * Endpoint: https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard
 *
 * The ESPN response structure (as observed from their public API):
 *   response.events[0].competitions[0].competitors[]
 *     .athlete.displayName   — full golfer name
 *     .score                 — score vs par as string: "-11", "E", "+3", "CUT"
 *     .status.type.name      — "STATUS_ACTIVE", "STATUS_CUT", "STATUS_WD", "STATUS_DQ", "STATUS_FINAL"
 *     .status.type.shortDetail — "F" (finished), "14" (thru 14 holes), "10:48 AM" (tee time)
 *     .status.period         — current round (1–4)
 *     .status.thru           — holes completed in current round (0–18)
 *     .linescores[]          — per-round raw stroke totals
 *       .value               — numeric strokes (e.g. 68)
 *       .displayValue        — string version
 *
 * NOTE: If the parser breaks during the tournament, log `rawCompetitors[0]`
 * and compare to the type shapes below to find the mismatch.
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

interface EspnLinescore {
  value?: number;
  displayValue?: string;
}

interface EspnStatusType {
  name?: string;          // "STATUS_ACTIVE" | "STATUS_CUT" | "STATUS_WD" | "STATUS_DQ" | "STATUS_FINAL"
  description?: string;   // "In Progress" | "Cut" | "Withdrawn" | "Disqualified" | "Final"
  shortDetail?: string;   // "F" | "14" | "10:48 AM" etc.
  state?: string;         // "in" | "post" | "pre"
}

interface EspnStatus {
  type?: EspnStatusType;
  period?: number;        // current round
  thru?: number;          // holes completed
}

interface EspnAthlete {
  displayName?: string;
  shortName?: string;
}

interface EspnStatistic {
  name?: string;
  displayValue?: string;
  value?: number;
}

interface EspnCompetitor {
  athlete?: EspnAthlete;
  score?: string;         // "-11", "E", "+3", "CUT", or absent
  status?: EspnStatus;
  linescores?: EspnLinescore[];
  statistics?: EspnStatistic[];
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

/** Parse ESPN score string → integer vs par. "E" → 0, null/absent → null. */
function parseScoreVsPar(raw: string | undefined): number | null {
  if (raw == null || raw === "" || raw === "-") return null;
  if (raw.toUpperCase() === "E") return 0;
  if (raw.toUpperCase() === "CUT") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

/** Map ESPN status type name to our pool status enum. */
function parseStatus(statusType: EspnStatusType | undefined): "active" | "cut" | "wd" | "dq" {
  const name = (statusType?.name ?? "").toUpperCase();
  const desc = (statusType?.description ?? "").toUpperCase();

  if (name.includes("CUT") || desc.includes("CUT")) return "cut";
  if (name.includes("WD") || desc.includes("WITHDRAWN") || desc.includes("WITHDRAW")) return "wd";
  if (name.includes("DQ") || desc.includes("DISQUALIF")) return "dq";
  return "active";
}

/**
 * Parse the "thru" display value for the database.
 * - If player is finished: "F"
 * - If in progress: "14" (holes completed)
 * - If not started: "10:48 AM" (tee time from shortDetail) or null
 */
function parseThru(
  status: EspnStatus | undefined,
  poolStatus: "active" | "cut" | "wd" | "dq"
): string | null {
  if (poolStatus !== "active") return null;

  const thruHoles = status?.thru;
  const shortDetail = status?.type?.shortDetail ?? "";
  const state = status?.type?.state ?? "";

  // Completed round
  if (shortDetail === "F" || shortDetail.toUpperCase() === "FINAL") return "F";

  // In progress — holes completed is a number 1–17
  if (typeof thruHoles === "number" && thruHoles > 0) return String(thruHoles);

  // Not yet started — shortDetail may contain tee time like "10:48 AM"
  if (state === "pre" && shortDetail) return shortDetail;

  // Fallback
  return shortDetail || null;
}

/**
 * Determine today's round score vs par.
 * ESPN sometimes puts it in statistics[], otherwise we derive it from
 * the current round's linescore minus par (72).
 */
function parseToday(
  competitor: EspnCompetitor,
  par: number,
  poolStatus: "active" | "cut" | "wd" | "dq"
): number | null {
  if (poolStatus !== "active") return null;

  // Try statistics array first
  const todayStat = competitor.statistics?.find(
    (s) => s.name === "todaysRound" || s.name === "today"
  );
  if (todayStat?.value != null) return todayStat.value;
  if (todayStat?.displayValue != null) {
    const v = parseScoreVsPar(todayStat.displayValue);
    if (v != null) return v;
  }

  // Fallback: current round linescore minus par
  const currentRound = competitor.status?.period ?? 0;
  if (currentRound > 0) {
    const ls = competitor.linescores?.[currentRound - 1];
    if (ls?.value != null) return ls.value - par;
  }

  return null;
}

/** Extract a round's raw strokes from linescores[idx]. Null if not played. */
function roundStrokes(linescores: EspnLinescore[] | undefined, idx: number): number | null {
  const ls = linescores?.[idx];
  if (ls?.value != null) return ls.value;
  // displayValue fallback
  if (ls?.displayValue) {
    const n = parseInt(ls.displayValue, 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const PAR = 72; // Augusta National — also in pool_settings; hardcoded here as fallback

export async function fetchMastersScores(): Promise<ScoreUpsertRow[]> {
  const res = await fetch(ESPN_URL, {
    // No cache: we always want the freshest data on each server call
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
    data.events?.find((e) =>
      e.name?.toLowerCase().includes("masters")
    ) ?? data.events?.[0];

  if (!event) {
    throw new Error("ESPN response contained no events");
  }

  const competitors = event.competitions?.[0]?.competitors ?? [];

  if (competitors.length === 0) {
    throw new Error("ESPN event contained no competitors — tournament may not have started");
  }

  const rows: ScoreUpsertRow[] = [];

  for (const c of competitors) {
    const name = c.athlete?.displayName?.trim();
    if (!name) continue;

    const poolStatus = parseStatus(c.status?.type);
    const scoreVsPar = parseScoreVsPar(c.score);

    const r1 = roundStrokes(c.linescores, 0);
    const r2 = roundStrokes(c.linescores, 1);
    const r3 = roundStrokes(c.linescores, 2);
    const r4 = roundStrokes(c.linescores, 3);

    const totalStrokes =
      [r1, r2, r3, r4].reduce<number | null>((acc, r) => {
        if (r == null) return acc;
        return (acc ?? 0) + r;
      }, null);

    // Position: prefer ESPN's provided value, fall back to status description
    const positionRaw =
      poolStatus !== "active"
        ? poolStatus.toUpperCase()
        : (c.status?.type?.shortDetail ?? "");

    // ESPN sometimes puts position in a separate field; this is a best-effort parse.
    // The actual finishing position isn't always in the scoreboard response —
    // it may need to be inferred from sort order or fetched from event details.
    // For our leaderboard, pool rank is calculated from team scores so raw position
    // is display-only (shown on team detail page).
    const position = derivePosition(c, poolStatus);

    rows.push({
      name,
      position,
      score_vs_par: poolStatus === "active" ? scoreVsPar : scoreVsPar,
      round_1: r1,
      round_2: r2,
      round_3: r3,
      round_4: r4,
      total_strokes: totalStrokes,
      thru: parseThru(c.status, poolStatus),
      today: parseToday(c, PAR, poolStatus),
      status: poolStatus,
    });
  }

  return rows;
}

/** Best-effort position string for display. */
function derivePosition(c: EspnCompetitor, poolStatus: "active" | "cut" | "wd" | "dq"): string {
  if (poolStatus === "cut") return "CUT";
  if (poolStatus === "wd") return "WD";
  if (poolStatus === "dq") return "DQ";

  // ESPN doesn't always include a structured position field on the scoreboard
  // endpoint; it may appear in a nested object. Return score as position proxy
  // until a richer endpoint is integrated.
  const scoreStr = c.score ?? "";
  if (scoreStr === "E") return "E";
  return scoreStr; // e.g. "-11" — admin can see this is approximate
}
