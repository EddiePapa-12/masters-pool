-- =============================================================================
-- Masters Pool 2026 — Scoring & Leaderboard Functions
-- Run this file AFTER schema.sql in Supabase SQL Editor.
-- =============================================================================


-- =============================================================================
-- HELPER: adjusted_golfer_score(golfer_id)
--
-- Returns the pool-adjusted score for a single golfer:
--   - Active / not yet started: their score_vs_par (null if pre-tournament)
--   - Cut / WD / DQ (treated identically per pool rules): R1 + R2 + cut_penalty
--     Round scores are stored as vs-par integers (e.g. -2, 0, +3).
--     If R1 or R2 is null (WD before playing), treat missing rounds as 0 (even par).
--
-- The function reads cut_penalty from pool_settings.
-- =============================================================================
create or replace function adjusted_golfer_score(p_golfer_id uuid)
returns integer
language sql
stable
as $$
  select
    case ts.status
      when 'active' then ts.score_vs_par  -- may be null if player hasn't teed off
      else
        -- cut / wd / dq: sum vs-par round scores + penalty
        -- rounds are stored as vs-par (not raw strokes), so just add them directly
        coalesce(ts.round_1, 0) +
        coalesce(ts.round_2, 0) +
        ps.cut_penalty        -- add the pool penalty (default 20)
    end
  from tournament_scores ts
  cross join pool_settings ps
  where ts.golfer_id = p_golfer_id
  limit 1;
$$;


-- =============================================================================
-- calculate_leaderboard()
--
-- Returns all entries ranked by team score (ascending — lower is better).
-- Tiebreaker: lower team_key wins (earlier submission).
--
-- Team score = sum of the 8 lowest adjusted golfer scores across all 13 picks.
-- Null scores (golfer not yet started) are excluded from the sum; the best 8
-- non-null scores are used. If fewer than 8 picks have scores yet, the sum
-- covers however many are available.
--
-- Returns one row per entry with:
--   rank, team_key, team_name, entrant_name,
--   team_score, golfers_thru_cut, predicted_score, payout
-- =============================================================================
create or replace function calculate_leaderboard()
returns table (
  rank            bigint,
  team_key        integer,
  team_name       text,
  entrant_name    text,
  team_score      integer,
  golfers_thru_cut integer,
  predicted_score integer,
  payout          integer
)
language sql
stable
as $$
  with

  -- 1. Attach adjusted score to every pick
  pick_scores as (
    select
      p.entry_id,
      p.golfer_id,
      adjusted_golfer_score(p.golfer_id) as adj_score
    from picks p
  ),

  -- 2. For each entry, rank the picks by score (null scores go last)
  ranked_picks as (
    select
      entry_id,
      adj_score,
      row_number() over (
        partition by entry_id
        order by adj_score asc nulls last  -- best (most negative) first
      ) as pick_rank
    from pick_scores
  ),

  -- 3. Sum the best N (scoring_picks) non-null scores per entry
  team_totals as (
    select
      rp.entry_id,
      sum(rp.adj_score) filter (where rp.pick_rank <= ps.scoring_picks and rp.adj_score is not null)::integer as team_score
    from ranked_picks rp
    cross join pool_settings ps
    group by rp.entry_id
  ),

  -- 4. Count how many of each team's golfers made the cut.
  --    Mirrors TeamsClient.tsx "Made Cut" badge logic:
  --      active + has scores + NOT (R2 done, R3 not started, score > projected cut)
  cut_counts as (
    select
      p.entry_id,
      count(*) filter (
        where ts.status = 'active'
          and ts.score_vs_par is not null   -- has played at least one round
          and not (                         -- not projected to miss cut
            ts.round_2 is not null
            and ts.round_3 is null
            and ts.score_vs_par > (select projected_cut from pool_settings limit 1)
          )
      )::integer as golfers_thru_cut
    from picks p
    left join tournament_scores ts on ts.golfer_id = p.golfer_id
    group by p.entry_id
  ),

  -- 5. Join everything and rank
  ranked as (
    select
      e.team_key,
      e.team_name,
      e.entrant_name,
      e.predicted_score,
      tt.team_score,
      coalesce(cc.golfers_thru_cut, 0) as golfers_thru_cut,
      -- Rank ascending by score; break ties by team_key ascending (lower = earlier = wins)
      rank() over (
        order by tt.team_score asc nulls last, e.team_key asc
      ) as rank
    from entries e
    left join team_totals tt  on tt.entry_id  = e.id
    left join cut_counts  cc  on cc.entry_id  = e.id
  ),

  -- 6. Total entry count for identifying last place
  entry_count as (
    select count(*)::integer as total from entries
  )

  -- 7. Attach payout
  select
    r.rank,
    r.team_key,
    r.team_name,
    r.entrant_name,
    r.team_score,
    r.golfers_thru_cut,
    r.predicted_score,
    coalesce(
      -- Named rank prize (1st, 2nd, 3rd, 4th)
      (select p.amount from payouts p where p.rank = r.rank),
      -- Last place prize
      case when r.rank = ec.total
        then (select p.amount from payouts p where p.is_last_place = true)
      end
    ) as payout
  from ranked r
  cross join entry_count ec
  order by r.rank asc, r.team_key asc;
$$;


-- =============================================================================
-- get_team_detail(p_team_key)
--
-- Returns all 13 picks for a single team with per-golfer scoring details.
-- is_counting = true if this pick is in the best 8 (contributes to team score).
-- =============================================================================
create or replace function get_team_detail(p_team_key integer)
returns table (
  pick_number       integer,
  pick_category     pick_category,
  golfer_name       text,
  tier              integer,
  adj_score         integer,
  score_vs_par      integer,
  finish_position   text,
  thru              text,
  today             integer,
  round_1           integer,
  round_2           integer,
  round_3           integer,
  round_4           integer,
  status            golfer_status,
  is_counting       boolean
)
language sql
stable
as $$
  with

  entry as (
    select id from entries where team_key = p_team_key limit 1
  ),

  pick_with_scores as (
    select
      p.pick_number,
      p.pick_category,
      g.name                               as golfer_name,
      g.tier,
      adjusted_golfer_score(g.id)          as adj_score,
      ts.score_vs_par,
      ts.position   as finish_position,
      ts.thru,
      ts.today,
      ts.round_1,
      ts.round_2,
      ts.round_3,
      ts.round_4,
      ts.status
    from picks p
    join entry   e  on e.id    = p.entry_id
    join golfers g  on g.id    = p.golfer_id
    left join tournament_scores ts on ts.golfer_id = g.id
  ),

  ranked as (
    select
      *,
      row_number() over (
        order by adj_score asc nulls last
      ) as score_rank
    from pick_with_scores
  )

  select
    r.pick_number,
    r.pick_category,
    r.golfer_name,
    r.tier,
    r.adj_score,
    r.score_vs_par,
    r.finish_position,
    r.thru,
    r.today,
    r.round_1,
    r.round_2,
    r.round_3,
    r.round_4,
    coalesce(r.status, 'active') as status,
    (r.score_rank <= (select scoring_picks from pool_settings limit 1)
      and r.adj_score is not null) as is_counting
  from ranked r
  order by r.pick_number asc;
$$;


-- =============================================================================
-- upsert_tournament_scores(scores jsonb)
--
-- Called by admin when pasting new ESPN data.
-- Input: JSON array of score objects keyed by golfer name.
-- Matches by golfer name; skips unknown golfers (log them manually).
--
-- Example input:
-- '[
--   {"name": "Rory McIlroy", "position": "1", "score_vs_par": -11,
--    "round_1": 72, "round_2": 66, "round_3": 66, "round_4": 73,
--    "total_strokes": 277, "thru": "F", "today": -3, "status": "active"},
--   ...
-- ]'::jsonb
-- =============================================================================
create or replace function upsert_tournament_scores(scores jsonb)
returns table (
  golfer_name  text,
  result       text
)
language plpgsql
as $$
declare
  s    jsonb;
  gid  uuid;
begin
  for s in select * from jsonb_array_elements(scores) loop
    select id into gid from golfers where name = (s->>'name') limit 1;

    if gid is null then
      golfer_name := s->>'name';
      result      := 'skipped — golfer not found in database';
      return next;
      continue;
    end if;

    insert into tournament_scores (
      golfer_id, position, score_vs_par,
      round_1, round_2, round_3, round_4,
      total_strokes, thru, today, status, updated_at
    )
    values (
      gid,
      s->>'position',
      case when s->>'score_vs_par' = 'E' then 0
           else (s->>'score_vs_par')::integer end,
      (s->>'round_1')::integer,
      (s->>'round_2')::integer,
      (s->>'round_3')::integer,
      (s->>'round_4')::integer,
      (s->>'total_strokes')::integer,
      s->>'thru',
      (s->>'today')::integer,
      coalesce((s->>'status')::golfer_status, 'active'),
      now()
    )
    on conflict (golfer_id) do update set
      position      = excluded.position,
      score_vs_par  = excluded.score_vs_par,
      round_1       = excluded.round_1,
      round_2       = excluded.round_2,
      -- R3/R4: once a golfer is cut, lock in the +10 penalty display values.
      -- ESPN sends null for these rounds; we store +10 so the Team Status page
      -- shows the correct per-round penalty without needing hardcoded placeholders.
      round_3       = case
                        when tournament_scores.status in ('cut', 'wd', 'dq') then coalesce(tournament_scores.round_3, 10)
                        when excluded.status in ('cut', 'wd', 'dq')          then 10
                        when excluded.round_1 is not null
                          and excluded.round_2 is not null
                          and excluded.round_3 is null
                          and (excluded.round_1 + excluded.round_2) > (select projected_cut from pool_settings limit 1)
                        then 10
                        else excluded.round_3
                      end,
      round_4       = case
                        when tournament_scores.status in ('cut', 'wd', 'dq') then coalesce(tournament_scores.round_4, 10)
                        when excluded.status in ('cut', 'wd', 'dq')          then 10
                        when excluded.round_1 is not null
                          and excluded.round_2 is not null
                          and excluded.round_3 is null
                          and (excluded.round_1 + excluded.round_2) > (select projected_cut from pool_settings limit 1)
                        then 10
                        else excluded.round_4
                      end,
      total_strokes = excluded.total_strokes,
      thru          = excluded.thru,
      today         = excluded.today,
      -- Never overwrite a confirmed cut/wd/dq status back to active.
      -- Once a golfer is cut, they stay cut regardless of what ESPN sends.
      status        = case
                        -- 1. Never downgrade a confirmed cut/wd/dq back to active
                        when tournament_scores.status in ('cut', 'wd', 'dq') then tournament_scores.status
                        -- 2. Accept cut/wd/dq if ESPN explicitly sends it
                        when excluded.status in ('cut', 'wd', 'dq') then excluded.status
                        -- 3. Auto-cut rule: both rounds completed, no R3 yet, score at or over cut line
                        when excluded.round_1 is not null
                          and excluded.round_2 is not null
                          and excluded.round_3 is null
                          and (excluded.round_1 + excluded.round_2) > (select projected_cut from pool_settings limit 1)
                        then 'cut'::golfer_status
                        -- 4. Otherwise trust ESPN
                        else excluded.status
                      end,
      updated_at    = now();

    golfer_name := s->>'name';
    result      := 'upserted';
    return next;
  end loop;
end;
$$;
