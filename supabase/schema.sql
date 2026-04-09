-- =============================================================================
-- Masters Pool 2026 — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";


-- =============================================================================
-- GOLFERS
-- Reference list of all eligible players, sourced from Player Tiers sheet.
-- Tiers 1–11 = regular picks, Tier 12 = Legends, Tier 13 = Amateurs.
-- =============================================================================
create table if not exists golfers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,       -- exact name as it appears in ESPN feed
  tier        integer check (tier between 1 and 13),
  odds        integer,                    -- e.g. 1200 means +1200
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists golfers_name_idx on golfers (name);
create index if not exists golfers_tier_idx on golfers (tier);


-- =============================================================================
-- TOURNAMENT_SCORES
-- One row per golfer. Replaced in full each time admin pastes ESPN data.
-- status: 'active' | 'cut' | 'wd' | 'dq'
--   - 'cut'  = missed the 36-hole cut → pool penalty applies (R1+R2+20)
--   - 'wd'   = withdrawal before R1 OR mid-tournament → treated same as cut
--   - 'dq'   = disqualification → treated same as cut
-- =============================================================================
create type golfer_status as enum ('active', 'cut', 'wd', 'dq');

create table if not exists tournament_scores (
  id              uuid primary key default gen_random_uuid(),
  golfer_id       uuid not null references golfers (id) on delete cascade,
  position        text,           -- "1", "T5", "CUT", "WD", etc. (display only)
  score_vs_par    integer,        -- signed integer; "E" from ESPN = 0; null if not yet started
  round_1         integer,        -- raw strokes (e.g. 68), null if not played
  round_2         integer,
  round_3         integer,
  round_4         integer,
  total_strokes   integer,        -- raw total (e.g. 277), null if not yet complete
  thru            text,           -- "18", "F", "9", "10:48 AM", etc.
  today           integer,        -- today's round vs par; null if not started
  status          golfer_status not null default 'active',
  updated_at      timestamptz not null default now(),

  unique (golfer_id)              -- one live row per golfer
);

create index if not exists tournament_scores_golfer_id_idx on tournament_scores (golfer_id);
create index if not exists tournament_scores_status_idx    on tournament_scores (status);
create index if not exists tournament_scores_score_idx     on tournament_scores (score_vs_par);


-- =============================================================================
-- POOL_SETTINGS
-- Single-row configuration table. Use the constraint to enforce one row.
-- projected_cut is updated manually by admin on Friday afternoon.
-- =============================================================================
create table if not exists pool_settings (
  id                uuid primary key default gen_random_uuid(),
  singleton         boolean not null default true unique,  -- enforces single row
  tournament_year   integer not null,
  tournament_name   text    not null,
  par               integer not null default 72,
  projected_cut     integer not null default 0,  -- strokes vs par (e.g. +2 = 2, -5 = -5)
  entry_fee         integer not null default 25, -- dollars
  cut_penalty       integer not null default 20, -- strokes added on top of 36-hole total
  picks_count       integer not null default 13, -- total picks per entry
  scoring_picks     integer not null default 8,  -- best N picks that count
  updated_at        timestamptz not null default now(),

  check (singleton = true)                       -- only value allowed is true
);


-- =============================================================================
-- ENTRIES
-- One row per pool entry. team_key matches the sequential key from the
-- Google Form (starts at 101). Multiple entries per person are allowed;
-- each gets its own team_key and is ranked independently.
-- =============================================================================
create table if not exists entries (
  id              uuid primary key default gen_random_uuid(),
  team_key        integer not null unique,    -- 101, 102, 103 …
  team_name       text    not null,
  entrant_name    text    not null,
  email           text,
  venmo_handle    text,
  paid            boolean not null default false,
  predicted_score integer,                    -- informational only; admin breaks ties manually
  submitted_at    timestamptz,               -- timestamp from Google Form
  created_at      timestamptz not null default now()
);

create index if not exists entries_team_key_idx     on entries (team_key);
create index if not exists entries_entrant_name_idx on entries (entrant_name);
create index if not exists entries_paid_idx         on entries (paid);


-- =============================================================================
-- PICKS
-- 13 rows per entry (picks 1–11 = regular, 12 = legend, 13 = amateur).
-- pick_category is denormalized for display convenience.
-- =============================================================================
create type pick_category as enum ('regular', 'legend', 'amateur');

create table if not exists picks (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references entries (id) on delete cascade,
  golfer_id       uuid not null references golfers (id),
  pick_number     integer not null check (pick_number between 1 and 13),
  pick_category   pick_category not null,
  created_at      timestamptz not null default now(),

  unique (entry_id, pick_number),    -- one pick per slot per team
  unique (entry_id, golfer_id)       -- a team can't pick the same golfer twice
);

create index if not exists picks_entry_id_idx  on picks (entry_id);
create index if not exists picks_golfer_id_idx on picks (golfer_id);


-- =============================================================================
-- PAYOUTS
-- Data-driven prize table. rank = finish position (1-based).
-- is_last_place = true means this payout goes to whoever finishes last,
-- regardless of total entry count (resolved at payout time by admin).
-- A row can have either rank OR is_last_place = true, not both.
-- =============================================================================
create table if not exists payouts (
  id            uuid primary key default gen_random_uuid(),
  rank          integer unique,           -- null if this is the last-place prize
  is_last_place boolean not null default false,
  amount        integer not null,         -- dollars
  label         text,                     -- e.g. "1st Place", "Last Place"

  check (
    (rank is not null and is_last_place = false) or
    (rank is null     and is_last_place = true)
  )
);

create index if not exists payouts_rank_idx on payouts (rank);


-- =============================================================================
-- SEED: PAYOUTS
-- Based on 2025 pool structure. Admin can update amounts once final entry
-- count and pot are confirmed.
-- =============================================================================
insert into payouts (rank, is_last_place, amount, label) values
  (1,    false, 850,  '1st Place'),
  (2,    false, 375,  '2nd Place'),
  (3,    false, 200,  '3rd Place'),
  (4,    false, 100,  '4th Place'),
  (null, true,  50,   'Last Place')
on conflict do nothing;
