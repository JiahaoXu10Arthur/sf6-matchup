# Personal Matchup Scout — Design Spec

**Date:** 2026-06-14
**Status:** approved-for-planning
**Feasibility basis:** `docs/feasibility/1-personal-baseline.md` (+ `4-ml-predictor.md`)

## Goal

A **local-first CLI tool** that ingests *your own* Street Fighter 6 ranked battle
log from Capcom Buckler, computes your personal per-matchup win rates, and uses the
**global Buckler baseline** (already in `output/matrix.csv`) as a Bayesian prior to
produce a **shrunk, confidence-aware "real homework" report**:

> vs DHALSIM you're 9–15 (38%) over 24 games; shrunk toward the cast baseline your
> true rate is ~44% [38–51%], **credibly −9% below** where a TERRY should sit (52.4%).
> → real weakness.
> vs JP you're 2–6 (25%) over 8 games — too few games to call; not flagged.

The point is to separate **a real personal weakness** from **small-sample noise**,
using the global matchup expectation as the anchor. No existing tool connects
personal CFN results to the global Buckler matchup baseline with calibrated
confidence (feasibility doc §differentiation).

## Decisions (locked with user)

| Choice | Decision | Why |
|--------|----------|-----|
| Auth | **Headless browser login (Playwright)** | Persisted session; no password handling by our code; repeatable |
| Stats engine | **Conjugate Beta-Binomial, Python stdlib** | Closed-form, exact, zero-dep, unit-testable; keeps analysis layer dependency-free |
| Output v1 | **CLI markdown report** | Matches `analyze.py`/`recommend.py`; fully testable; web dashboard deferred to v2 |

## Scope

**In scope (v1):** one player, ranked matches, your currently-selected main(s) present
in the log; per-(your_char, opponent, rank) personal win rates; Beta-Binomial shrinkage
vs baseline with credible intervals; a ranked weakness report.

**Out of scope (v1):** web dashboard (v2), casual/Battle-Hub matches, round-level or
per-move analysis, auto-refresh/scheduling, multi-account, hierarchical PyMC model.

## Architecture

Three components with clean separation so the authenticated network part is isolated
and the analysis is fully offline-testable.

```
Capcom Buckler (your session)
        │  scripts/fetch_battlelog.py   (Playwright, auth, network)
        ▼
data/personal/{cfn_id}.csv             (gitignored: your_char,opp,result,mr,rank,date,replay_id)
        │  scripts/personal_scout.py    (offline: reads personal CSV + output/matrix.csv)
        │      └── scripts/bayes.py      (pure stdlib Beta-Binomial; no I/O)
        ▼
output/{cfn_id}_scout_{YYYYMMDD}.md     (ranked weakness report)
```

### 1. `scripts/fetch_battlelog.py` (auth + ingestion — the only networked part)

- Uses **Playwright (Chromium)**. First run opens Capcom ID login; the user logs in
  interactively; the session is saved to a gitignored `data/personal/.session.json`
  (Playwright `storage_state`). Subsequent runs reuse it; re-login only when expired.
- Reads the **player's own profile id** from a CLI arg (`--cfn <short_id>`) or the
  logged-in profile.
- Pages through `https://www.streetfighter.com/6/buckler/profile/{short_id}/battlelog/rank?page={n}`,
  extracting the `__NEXT_DATA__` `<script>` JSON from the **HTML** (not the rotating
  `_next/data/...` endpoint — the HTML hydration is the stable surface; see feasibility
  §risks) → `props.pageProps.replay_list`.
- Each replay yields: both players' `character_name` + `short_id`, win/loss for the
  target player, MR, datetime, replay id. Map opponent char → official roster name
  (reuse `roster.NAME_BY_SLUG`).
- Writes/append-dedupes to `data/personal/{cfn_id}.csv` (dedupe on replay_id, so
  re-running only fetches new matches). Polite delay (≥1s) between pages; `--pages N`
  cap; stop when a page repeats already-stored replay ids.
- **Never** commits cookies/session/personal CSV (`.gitignore` entries added).

### 2. `scripts/bayes.py` (pure stdlib statistics — fully testable, no I/O)

Closed-form conjugate Beta-Binomial. All functions pure; no network, no file access.

- `beta_posterior(p0, kappa, wins, losses)` → `(alpha, beta)` where the prior is
  `Beta(α0=p0·κ, β0=(1−p0)·κ)` (baseline `p0` as prior mean, `κ` = prior strength in
  pseudo-games) and the posterior is `Beta(α0+wins, β0+losses)`.
- `posterior_mean(alpha, beta)` → `alpha/(alpha+beta)` (the shrunk win-rate estimate).
- `reg_incomplete_beta(x, a, b)` → regularized incomplete beta `I_x(a,b)` via the
  Lentz continued-fraction expansion (Numerical-Recipes `betai`), using `math.lgamma`.
  Stdlib-only. This gives the Beta CDF.
- `beta_ppf(q, a, b)` → inverse CDF by bisection on `reg_incomplete_beta` (for credible
  interval endpoints).
- `credible_interval(alpha, beta, level=0.9)` → `(lo, hi)` via `beta_ppf`.
- `prob_below(alpha, beta, threshold)` → `reg_incomplete_beta(threshold, alpha, beta)`
  = posterior P(true rate < threshold). Used for the weakness verdict.

**`κ` (prior strength):** default `KAPPA = 20` (baseline worth ~20 games) — a named
constant, documented; the closed-form makes it trivial to expose as `--prior-strength`.

### 3. `scripts/personal_scout.py` (orchestration + report)

- Args: `--cfn <id>` (which personal CSV), `--char <YOUR_CHAR>` (filter to your main;
  default = your most-played char in the log), `--rank` (map MR → Buckler rank bucket
  36/40/41/42; default: use COMB baseline), `--min-games` (display threshold),
  `--exclude` (default INGRID), `--prior-strength`.
- For each opponent you have games against:
  - `p0` = baseline win-rate for (your_char vs opponent) from `matrix.csv` (reuse
    `analyze.combined_row`; convert score/10 → probability).
  - `(wins, losses)` = your aggregated record vs that opponent.
  - posterior = `bayes.beta_posterior(p0, κ, wins, losses)`; compute shrunk mean,
    90% credible interval, and `prob_below(·, p0)`.
  - **Verdict:**
    - `real weakness` — `prob_below(posterior, p0) ≥ 0.85` **and** shrunk mean is at
      least `DELTA=0.03` below `p0` (credibly and materially worse than baseline).
    - `overperforming` — symmetric: `prob_below(·, p0) ≤ 0.15` and shrunk ≥ `p0+DELTA`.
    - `small sample` — `n < MIN_TRUST` (default 10) and interval still straddles `p0`.
    - `on par` — otherwise.
- **Rank** the report by a "credible deficit" = `(p0 − shrunk_mean) · prob_below`, so the
  matchups that are *both* clearly and confidently below baseline rise to the top.
- Emit markdown to `output/{cfn_id}_scout_{YYYYMMDD}.md` and print: a table
  (Opponent | your W-L | raw% | shrunk% [CI] | baseline% | Δ | verdict) sorted
  weakness-first, plus a one-line headline (your top 3 real weaknesses).

## Data formats

`data/personal/{cfn_id}.csv` (gitignored):
```
replay_id,date,your_char,opp_char,rank_mr,result
abc123,2026-06-10T12:01:00Z,TERRY,DHALSIM,1480,L
```
`result` ∈ {W, L}. `rank_mr` is your MR at match time (bucketed to 36/40/41/42 for
baseline lookup; bucket thresholds documented in `personal_scout.py`).

## Error handling

- `fetch`: session expired → prompt re-login; empty `replay_list` / parse failure on a
  page → log and stop paging (don't crash); network error → retry ×3 then exit non-zero
  with a clear message. Never write a partial/corrupt CSV row.
- `scout`: opponent missing from baseline → skip with a note (can't compare); your_char
  absent from matrix → clear error listing valid chars; zero personal games → friendly
  "no ranked matches found for {char}".

## Testing

- `tests/test_bayes.py` (no network, no Playwright): conjugate correctness — uniform
  prior `Beta(1,1)` + 7W/3L → mean 0.667; `reg_incomplete_beta` against known values
  (e.g. `I_0.5(1,1)=0.5`, symmetry `I_x(a,b)=1−I_{1−x}(b,a)`); `beta_ppf` round-trips
  `reg_incomplete_beta`; credible interval brackets the mean and narrows as games rise;
  shrinkage: more games pulls the posterior mean from `p0` toward the raw rate.
- `tests/test_personal_scout.py`: feed a **fixture** personal CSV + the real
  `matrix.csv`; assert verdict logic (a 9–15 vs a strong-baseline opp → "real weakness";
  a 2–6 over 8 games → "small sample"); report rows sorted weakness-first.
- `tests/fixtures/battlelog_sample.json`: a saved `__NEXT_DATA__` payload; a parser unit
  test asserts it extracts the expected rows. **No live auth in tests.**
- Exit criterion: `pytest tests/ -v` green including the new files.

## Dependencies

- `fetch_battlelog.py` only: **Playwright** (documented in README as an optional extra
  for the personal-scout tool; `pip install playwright && playwright install chromium`).
- `bayes.py` + `personal_scout.py`: **stdlib only** — so the analysis + all tests run
  with no third-party install, preserving the repo's zero-dep core.

## Risks & mitigations

- **Buckler endpoint fragility / rotating `_next/data` token** → read `__NEXT_DATA__`
  from the HTML page (stable hydration), not the JSON data endpoint. Isolate all
  Buckler-shape assumptions in `fetch_battlelog.py` so a layout change touches one file.
- **ToS / personal authenticated data** → local-only, your own session, your own data;
  nothing hosted, nothing committed. Documented clearly.
- **Login fragility (Capcom ID)** → interactive first-login + persisted `storage_state`;
  re-prompt on expiry rather than storing credentials.
- **Small personal samples** → the entire point of the Beta-Binomial layer; the report
  never asserts a weakness the data can't support.

## Future (v2, not now)

- Web personal dashboard in the tier app (load personal CSV client-side).
- Feed the same shrinkage engine into the main tool's confidence dots / tier honesty.
- Opponent-player scouting (paste an opponent's CFN id before a set).
