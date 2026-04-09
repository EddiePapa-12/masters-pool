/**
 * Seed script — populates pool_settings and golfers.
 *
 * Usage:
 *   npm run seed
 *
 * Requires a .env.local with SUPABASE_SERVICE_ROLE_KEY set.
 * Uses the service role key so it can bypass Row Level Security.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 1. Seed pool_settings
// ---------------------------------------------------------------------------

async function seedPoolSettings() {
  console.log("Seeding pool_settings...");

  const { error } = await supabase.from("pool_settings").upsert(
    {
      tournament_year: 2026,
      tournament_name: "2026 Masters Tournament — Augusta National Golf Club",
      par: 72,
      projected_cut: 0,   // update manually on Friday afternoon
      entry_fee: 25,
      cut_penalty: 20,
      picks_count: 13,
      scoring_picks: 8,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "singleton" }
  );

  if (error) {
    console.error("pool_settings error:", error.message);
  } else {
    console.log("  pool_settings seeded.");
  }
}

// ---------------------------------------------------------------------------
// 2. Seed golfers from the 2026 Player Tiers
// ---------------------------------------------------------------------------
//
// Data sourced from the Player Tiers sheet in the Excel workbook.
// Odds are +American format (e.g. 500 = +500).
//
// To load from CSV instead, call seedGolfersFromCsv(filePath) below.
// ---------------------------------------------------------------------------

const GOLFERS_2026: Array<{ name: string; tier: number; odds: number }> = [
  // Tier 1
  { name: "Scottie Scheffler",    tier: 1,  odds: 500 },
  { name: "Bryson DeChambeau",    tier: 1,  odds: 1000 },
  { name: "Jon Rahm",             tier: 1,  odds: 1000 },
  { name: "Rory McIlroy",         tier: 1,  odds: 1200 },
  // Tier 2
  { name: "Xander Schauffele",    tier: 2,  odds: 1600 },
  { name: "Ludvig Åberg",         tier: 2,  odds: 1600 },
  { name: "Matt Fitzpatrick",     tier: 2,  odds: 2200 },
  { name: "Cameron Young",        tier: 2,  odds: 2200 },
  { name: "Tommy Fleetwood",      tier: 2,  odds: 2200 },
  // Tier 3
  { name: "Justin Rose",          tier: 3,  odds: 3000 },
  { name: "Robert MacIntyre",     tier: 3,  odds: 3300 },
  { name: "Patrick Reed",         tier: 3,  odds: 3300 },
  { name: "Collin Morikawa",      tier: 3,  odds: 3500 },
  { name: "Hideki Matsuyama",     tier: 3,  odds: 4000 },
  { name: "Jordan Spieth",        tier: 3,  odds: 4000 },
  { name: "Brooks Koepka",        tier: 3,  odds: 4000 },
  { name: "Min Woo Lee",          tier: 3,  odds: 4000 },
  // Tier 4
  { name: "Si Woo Kim",           tier: 4,  odds: 4500 },
  { name: "Chris Gotterup",       tier: 4,  odds: 5000 },
  { name: "Viktor Hovland",       tier: 4,  odds: 5000 },
  { name: "Russell Henley",       tier: 4,  odds: 5500 },
  { name: "Shane Lowry",          tier: 4,  odds: 6000 },
  { name: "Akshay Bhatia",        tier: 4,  odds: 6000 },
  { name: "Adam Scott",           tier: 4,  odds: 6500 },
  { name: "Justin Thomas",        tier: 4,  odds: 6500 },
  // Tier 5
  { name: "Sepp Straka",          tier: 5,  odds: 7000 },
  { name: "Tyrrell Hatton",       tier: 5,  odds: 7000 },
  { name: "Patrick Cantlay",      tier: 5,  odds: 7000 },
  { name: "Jason Day",            tier: 5,  odds: 7000 },
  { name: "Jake Knapp",           tier: 5,  odds: 8000 },
  { name: "Jacob Bridgeman",      tier: 5,  odds: 8000 },
  { name: "Marco Penge",          tier: 5,  odds: 8000 },
  // Tier 6
  { name: "Sungjae Im",           tier: 6,  odds: 10000 },
  { name: "Sam Burns",            tier: 6,  odds: 10000 },
  { name: "Harris English",       tier: 6,  odds: 10000 },
  { name: "Corey Conners",        tier: 6,  odds: 10000 },
  { name: "J.J. Spaun",           tier: 6,  odds: 10000 },
  { name: "Daniel Berger",        tier: 6,  odds: 12500 },
  // Tier 7
  { name: "Cameron Smith",        tier: 7,  odds: 10000 },
  { name: "Nicolai Højgaard",     tier: 7,  odds: 10000 },
  { name: "Maverick McNealy",     tier: 7,  odds: 10000 },
  { name: "Gary Woodland",        tier: 7,  odds: 10000 },
  { name: "Max Homa",             tier: 7,  odds: 10000 },
  { name: "Ben Griffin",          tier: 7,  odds: 12500 },
  // Tier 8
  { name: "Rasmus Højgaard",      tier: 8,  odds: 15000 },
  { name: "Kurt Kitayama",        tier: 8,  odds: 15000 },
  { name: "Aaron Rai",            tier: 8,  odds: 15000 },
  { name: "Wyndham Clark",        tier: 8,  odds: 15000 },
  { name: "Ryan Gerard",          tier: 8,  odds: 15000 },
  { name: "Brian Harman",         tier: 8,  odds: 15000 },
  // Tier 9
  { name: "Sam Stevens",          tier: 9,  odds: 17500 },
  { name: "Max Greyserman",       tier: 9,  odds: 17500 },
  { name: "Ryan Fox",             tier: 9,  odds: 17500 },
  { name: "Jarvis Casey",         tier: 9,  odds: 17500 },
  { name: "Keegan Bradley",       tier: 9,  odds: 17500 },
  { name: "Haotong Li",           tier: 9,  odds: 17500 },
  { name: "Dustin Johnson",       tier: 9,  odds: 17500 },
  { name: "Alex Noren",           tier: 9,  odds: 17500 },
  { name: "Harry Hall",           tier: 9,  odds: 17500 },
  { name: "Nicolas Echavarria",   tier: 9,  odds: 17500 },
  // Tier 10
  { name: "Sami Valimaki",        tier: 10, odds: 22500 },
  { name: "Nick Taylor",          tier: 10, odds: 22500 },
  { name: "Sergio Garcia",        tier: 10, odds: 22500 },
  { name: "Carlos Ortiz",         tier: 10, odds: 22500 },
  { name: "Kristoffer Reitan",    tier: 10, odds: 25000 },
  { name: "Matt McCarty",         tier: 10, odds: 25000 },
  { name: "Rasmus Neergaard-Petersen", tier: 10, odds: 25000 },
  { name: "Andrew Novak",         tier: 10, odds: 25000 },
  { name: "Aldrich Potgieter",    tier: 10, odds: 25000 },
  { name: "Tom McKibbin",         tier: 10, odds: 25000 },
  // Tier 11 — long shots / ceremonial (regular picks)
  { name: "Michael Brennan",      tier: 11, odds: 35000 },
  { name: "Michael Kim",          tier: 11, odds: 35000 },
  { name: "Davis Riley",          tier: 11, odds: 50000 },
  { name: "Bubba Watson",         tier: 11, odds: 50000 },
  { name: "John Keefer",          tier: 11, odds: 50000 },
  { name: "Zach Johnson",         tier: 11, odds: 50000 },
  { name: "Charl Schwartzel",     tier: 11, odds: 75000 },
  { name: "Brian Campbell",       tier: 11, odds: 100000 },
  { name: "Naoyuki Kataoka",      tier: 11, odds: 100000 },
  // Tier 12 — Legends
  { name: "Fred Couples",         tier: 12, odds: 100000 },
  { name: "Danny Willett",        tier: 12, odds: 100000 },
  { name: "Mike Weir",            tier: 12, odds: 100000 },
  { name: "Angel Cabrera",        tier: 12, odds: 100000 },
  { name: "Vijay Singh",          tier: 12, odds: 100000 },
  { name: "José María Olazábal",  tier: 12, odds: 100000 },
  // Tier 13 — Amateurs
  { name: "Mason Howell",         tier: 13, odds: 100000 },
  { name: "Fifa Laopakdee",       tier: 13, odds: 100000 },
  { name: "Ethan Fang",           tier: 13, odds: 100000 },
  { name: "Mateo Pulcini",        tier: 13, odds: 100000 },
  { name: "Brandon Holtz",        tier: 13, odds: 100000 },
  { name: "Jackson Herrington",   tier: 13, odds: 100000 },
];

async function seedGolfers() {
  console.log(`Seeding ${GOLFERS_2026.length} golfers...`);

  const { error } = await supabase
    .from("golfers")
    .upsert(GOLFERS_2026, { onConflict: "name" });

  if (error) {
    console.error("golfers error:", error.message);
  } else {
    console.log(`  ${GOLFERS_2026.length} golfers seeded.`);
  }
}

// ---------------------------------------------------------------------------
// 3. (Optional) Seed golfers from a CSV file
//
// CSV format (no BOM, UTF-8):
//   name,tier,odds
//   Scottie Scheffler,1,500
//   ...
// ---------------------------------------------------------------------------

async function seedGolfersFromCsv(csvPath: string) {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    return;
  }

  const golfers: Array<{ name: string; tier: number; odds: number }> = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  for await (const line of rl) {
    if (isFirstLine) { isFirstLine = false; continue; } // skip header
    const [name, tier, odds] = line.split(",").map((v) => v.trim());
    if (!name) continue;
    golfers.push({
      name,
      tier: parseInt(tier, 10),
      odds: parseInt(odds, 10),
    });
  }

  console.log(`Seeding ${golfers.length} golfers from CSV...`);
  const { error } = await supabase
    .from("golfers")
    .upsert(golfers, { onConflict: "name" });

  if (error) {
    console.error("golfers CSV error:", error.message);
  } else {
    console.log(`  ${golfers.length} golfers seeded from CSV.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  await seedPoolSettings();

  if (args.includes("--csv") && args[args.indexOf("--csv") + 1]) {
    const csvFile = path.resolve(args[args.indexOf("--csv") + 1]);
    await seedGolfersFromCsv(csvFile);
  } else {
    await seedGolfers();
  }

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
