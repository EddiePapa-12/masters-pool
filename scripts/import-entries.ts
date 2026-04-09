/**
 * Import entries from a CSV exported from Google Sheets.
 *
 * Usage (run Thursday morning after exporting the Google Form responses):
 *   npm run seed -- import-entries --file /path/to/responses.csv
 *   or directly:
 *   npx tsx scripts/import-entries.ts --file /path/to/responses.csv
 *
 * CSV column order expected (matches Form Responses sheet):
 *   Timestamp, Email Address, Your Name, Team Entry Name, Your Venmo Name,
 *   1st Pick, 2nd Pick, 3rd Pick, 4th Pick, 5th Pick, 6th Pick, 7th Pick,
 *   8th Pick, 9th Pick, 10th Pick, 11th Pick, 12th Pick (Legends),
 *   13th Pick (Amateurs), Prediction on the Winning Score, Team Key
 *
 * The script:
 *   1. Upserts entries (idempotent — safe to re-run)
 *   2. Upserts picks (resolves golfer names to IDs)
 *   3. Logs any golfer names that don't match the database
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Column indices in the CSV (0-based after removing BOM)
const COL = {
  timestamp:       0,
  email:           1,
  entrant_name:    2,
  team_name:       3,
  venmo_handle:    4,
  picks_start:     5,   // columns 5–17 = 13 picks
  picks_end:       17,
  predicted_score: 18,
  team_key:        19,
};

const PICK_CATEGORIES = [
  // pick_number 1–11 = regular
  ...Array.from({ length: 11 }, (_, i) => ({ number: i + 1, category: "regular" as const })),
  // pick_number 12 = legend
  { number: 12, category: "legend" as const },
  // pick_number 13 = amateur
  { number: 13, category: "amateur" as const },
];

async function importFromCsv(csvPath: string) {
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  // Load all golfers into a name→id map for fast lookup
  const { data: golferRows, error: gErr } = await supabase
    .from("golfers")
    .select("id, name");
  if (gErr) { console.error("Failed to load golfers:", gErr.message); process.exit(1); }

  const golferMap = new Map<string, string>();
  for (const g of golferRows ?? []) {
    golferMap.set(g.name.trim().toLowerCase(), g.id);
  }

  const unknownGolfers = new Set<string>();
  let entriesImported = 0;
  let picksImported = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  for await (const rawLine of rl) {
    if (isFirstLine) { isFirstLine = false; continue; }

    // Handle quoted CSV fields
    const cols = parseCSVLine(rawLine);
    if (cols.length < 20) continue;

    const teamKey = parseInt(cols[COL.team_key], 10);
    if (isNaN(teamKey)) continue;

    const predictedRaw = cols[COL.predicted_score]?.trim();
    const predictedScore = predictedRaw ? parseInt(predictedRaw, 10) : null;

    // Upsert entry
    const { data: entryData, error: entryErr } = await supabase
      .from("entries")
      .upsert(
        {
          team_key:       teamKey,
          team_name:      cols[COL.team_name].trim(),
          entrant_name:   cols[COL.entrant_name].trim(),
          email:          cols[COL.email].trim() || null,
          venmo_handle:   cols[COL.venmo_handle].trim() || null,
          predicted_score: isNaN(predictedScore as number) ? null : predictedScore,
          submitted_at:   cols[COL.timestamp] ? new Date(cols[COL.timestamp]).toISOString() : null,
        },
        { onConflict: "team_key" }
      )
      .select("id")
      .single();

    if (entryErr) {
      console.error(`  Entry ${teamKey} error: ${entryErr.message}`);
      continue;
    }

    entriesImported++;
    const entryId = entryData.id;

    // Upsert picks
    for (const { number, category } of PICK_CATEGORIES) {
      const golferName = cols[COL.picks_start + number - 1]?.trim();
      if (!golferName) continue;

      const golferKey = golferName.toLowerCase();
      const golferId = golferMap.get(golferKey);

      if (!golferId) {
        unknownGolfers.add(golferName);
        continue;
      }

      const { error: pickErr } = await supabase.from("picks").upsert(
        {
          entry_id:      entryId,
          golfer_id:     golferId,
          pick_number:   number,
          pick_category: category,
        },
        { onConflict: "entry_id,pick_number" }
      );

      if (pickErr) {
        console.error(`  Pick ${number} for team ${teamKey}: ${pickErr.message}`);
      } else {
        picksImported++;
      }
    }
  }

  console.log(`\nImport complete.`);
  console.log(`  Entries upserted : ${entriesImported}`);
  console.log(`  Picks upserted   : ${picksImported}`);

  if (unknownGolfers.size > 0) {
    console.warn(`\nUnknown golfer names (not in database — fix spelling or add to golfers table):`);
    for (const name of unknownGolfers) {
      console.warn(`  "${name}"`);
    }
  }
}

// Minimal RFC-4180 CSV parser (handles double-quoted fields with commas)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Entry point
const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
if (fileIdx === -1 || !args[fileIdx + 1]) {
  console.error("Usage: npx tsx scripts/import-entries.ts --file /path/to/responses.csv");
  process.exit(1);
}

importFromCsv(path.resolve(args[fileIdx + 1])).catch((err) => {
  console.error(err);
  process.exit(1);
});
