#!/usr/bin/env python3
"""
Import entries from the Google Form Excel export into Supabase.

Usage (run from the masters-pool directory):
  python3 scripts/import_xlsx.py "/path/to/2026 Masters Pool (Responses).xlsx"

What this script does:
  1. Reads the Excel file exported from Google Forms
  2. Auto-assigns team_keys starting at 101 (in row order — stable across re-runs)
  3. Normalises golfer names: strips the (a) amateur suffix, strips accents,
     lowercases for DB lookup — so "Ángel Cabrera (a)" matches "Angel Cabrera"
  4. Upserts entries + picks (safe to re-run; existing rows are updated, not duplicated)
  5. Reports any golfer names that don't match anything in the database

Requirements:
  - pandas + openpyxl:  pip3 install pandas openpyxl
  - .env.local in the project root with NEXT_PUBLIC_SUPABASE_URL
    and SUPABASE_SERVICE_ROLE_KEY set

ESPN name note:
  Golfer names in the DB (seeded via `npm run seed`) are the canonical names
  matched to the ESPN feed.  The normalise() function here handles:
    - "(a)" amateur suffix added by Google Forms
    - Accent differences (Ángel → Angel, etc.)
  If the ESPN sync ever reports an "unmatched" golfer, the fix is to add or
  rename that golfer in Supabase → Table Editor → golfers.
"""

import sys, os, re, json, unicodedata
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip3 install pandas openpyxl")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PICK_COLUMNS = [
    "1st Pick", "2nd Pick", "3rd Pick", "4th Pick", "5th Pick",
    "6th Pick", "7th Pick", "8th Pick", "9th Pick", "10th Pick",
    "11th Pick", "12th Pick (Legends)", "13th Pick (Amateurs)",
]

PICK_CATEGORIES = (
    ["regular"] * 11  # picks 1–11
    + ["legend"]      # pick 12
    + ["amateur"]     # pick 13
)

TEAM_KEY_START = 101

# ---------------------------------------------------------------------------
# Load .env.local
# ---------------------------------------------------------------------------

def load_env(env_path: Path) -> dict:
    env: dict = {}
    if not env_path.exists():
        return env
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


project_root = Path(__file__).parent.parent
env = load_env(project_root / ".env.local")

SUPABASE_URL  = env.get("NEXT_PUBLIC_SUPABASE_URL")  or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_KEY   = env.get("SUPABASE_SERVICE_ROLE_KEY")  or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
    sys.exit(1)

BASE_HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

# ---------------------------------------------------------------------------
# Supabase REST helpers
# ---------------------------------------------------------------------------

def sb_get(table: str, query: str = "") -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}{query}"
    req = Request(url, headers={**BASE_HEADERS, "Prefer": "return=representation"})
    try:
        with urlopen(req) as r:
            return json.loads(r.read())
    except HTTPError as e:
        print(f"  GET error {e.code}: {e.read().decode()}")
        return []


def sb_upsert(table: str, rows: list, on_conflict: str) -> list:
    if not rows:
        return []
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    body = json.dumps(rows).encode()
    headers = {
        **BASE_HEADERS,
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    req = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(req) as r:
            return json.loads(r.read())
    except HTTPError as e:
        msg = e.read().decode()
        print(f"  UPSERT error {e.code} on {table}: {msg}")
        return []

# ---------------------------------------------------------------------------
# Name normalisation + known aliases
# ---------------------------------------------------------------------------

# Maps normalised submission names → normalised DB/ESPN names.
# Add entries here whenever a common form submission uses a different spelling
# than what ESPN (and therefore the DB) uses.
NAME_ALIASES: dict[str, str] = {
    "jarvis casey":       "casey jarvis",       # form reverses first/last
    "john keefer":        "johnny keefer",       # ESPN uses "Johnny"
    "nicolas echavarria": "nico echavarria",     # ESPN uses "Nico"
}

def normalise(name: str) -> str:
    """
    Canonical key used for DB lookup.
    - Strips trailing '(a)' amateur suffix (Google Forms adds this)
    - Strips diacritics/accents  (Ángel → angel, Å → a, etc.)
    - Lowercases and collapses whitespace
    """
    name = re.sub(r"\s*\(a\)\s*$", "", str(name), flags=re.IGNORECASE).strip()
    name = "".join(
        c for c in unicodedata.normalize("NFD", name)
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(name.lower().split())

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/import_xlsx.py '/path/to/responses.xlsx'")
        sys.exit(1)

    xlsx_path = Path(sys.argv[1])
    if not xlsx_path.exists():
        print(f"ERROR: File not found: {xlsx_path}")
        sys.exit(1)

    print(f"Reading: {xlsx_path.name}")
    df = pd.read_excel(xlsx_path, sheet_name="Form Responses 1")
    print(f"  {len(df)} entries found in spreadsheet\n")

    # ------------------------------------------------------------------
    # 1. Load golfer name → UUID map from DB
    # ------------------------------------------------------------------
    print("Loading golfers from DB...")
    golfers_raw = sb_get("golfers", "?select=id,name")
    golfer_map: dict[str, str] = {}  # normalised_name → uuid
    for g in golfers_raw:
        golfer_map[normalise(g["name"])] = g["id"]
    print(f"  {len(golfer_map)} golfers loaded\n")

    # ------------------------------------------------------------------
    # 2. Process rows
    # ------------------------------------------------------------------
    entries_upserted = 0
    picks_upserted   = 0
    unknown_golfers: set[str] = set()

    for idx, row in df.iterrows():
        team_key = TEAM_KEY_START + int(idx)  # 101, 102, 103 …

        # Parse predicted score (may be blank or non-numeric)
        pred_raw = row.get("Prediction on the Winning Score\n\nExample Scores to Input should be -7, -9, -11", "")
        try:
            predicted_score = int(float(str(pred_raw))) if pd.notna(pred_raw) and str(pred_raw).strip() != "" else None
        except (ValueError, TypeError):
            predicted_score = None

        # Submitted timestamp
        ts_raw = row.get("Timestamp")
        submitted_at = ts_raw.isoformat() if pd.notna(ts_raw) else None

        entry_payload = {
            "team_key":       team_key,
            "team_name":      str(row.get("Team Entry Name", "")).strip() or f"Team {team_key}",
            "entrant_name":   str(row.get("Your Name", "")).strip(),
            "email":          str(row.get("Email Address", "")).strip() or None,
            "venmo_handle":   str(row.get("Your Venmo Name", "")).strip() or None,
            "predicted_score": predicted_score,
            "submitted_at":   submitted_at,
        }

        # Upsert entry and get back the entry UUID
        result = sb_upsert("entries", [entry_payload], "team_key")
        if not result:
            print(f"  SKIP team {team_key} — upsert failed")
            continue

        entry_id = result[0]["id"]
        entries_upserted += 1

        # Build picks
        pick_rows = []
        for pick_num, (col, category) in enumerate(zip(PICK_COLUMNS, PICK_CATEGORIES), start=1):
            raw_name = row.get(col, "")
            if pd.isna(raw_name) or str(raw_name).strip() == "":
                continue

            raw_name = str(raw_name).strip()
            key = normalise(raw_name)
            key = NAME_ALIASES.get(key, key)   # apply known alias if any
            golfer_id = golfer_map.get(key)

            if golfer_id is None:
                unknown_golfers.add(raw_name)
                continue

            pick_rows.append({
                "entry_id":      entry_id,
                "golfer_id":     golfer_id,
                "pick_number":   pick_num,
                "pick_category": category,
            })

        if pick_rows:
            upserted = sb_upsert("picks", pick_rows, "entry_id,pick_number")
            picks_upserted += len(upserted)

    # ------------------------------------------------------------------
    # 3. Summary
    # ------------------------------------------------------------------
    print("=" * 50)
    print(f"Import complete.")
    print(f"  Entries upserted : {entries_upserted}")
    print(f"  Picks upserted   : {picks_upserted}")

    if unknown_golfers:
        print(f"\n⚠️  UNMATCHED GOLFER NAMES ({len(unknown_golfers)}) — these picks were skipped:")
        for name in sorted(unknown_golfers):
            print(f'    "{name}"')
        print("\n  Fix: go to Supabase → Table Editor → golfers and add/rename these golfers,")
        print("  then re-run this script (it is safe to re-run).")
    else:
        print("\n  ✓ All golfer names matched — no skipped picks.")


if __name__ == "__main__":
    main()
