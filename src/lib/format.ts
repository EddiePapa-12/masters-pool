/** Score display helpers — used across all pages */

export function formatScore(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  if (val === 0) return "E";
  return val > 0 ? `+${val}` : String(val);
}

/** CSS class for pool leaderboard score cells */
export function poolScoreClass(val: number | null | undefined): string {
  if (val == null) return "score-even";
  if (val < 0) return "score-negative";
  if (val > 0) return "score-positive";
  return "score-even";
}

/** CSS class for golf leaderboard score cells */
export function golfScoreClass(val: number | null | undefined): string {
  if (val == null) return "golf-score-even";
  if (val < 0) return "golf-score-neg";
  if (val > 0) return "golf-score-pos";
  return "golf-score-even";
}

/** CSS class for team roster score cells */
export function golferScoreClass(val: number | null | undefined): string {
  if (val == null) return "";
  if (val < 0) return "golfer-score-negative";
  if (val > 0) return "golfer-score-positive";
  return "";
}

export function formatCut(cut: number): string {
  if (cut === 0) return "E";
  return cut > 0 ? `+${cut}` : String(cut);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
