## 2026-06-14 (v1→v2 merge COMPLETE) — pending push/deploy

### Done this session (all committed locally, NOT pushed)
- **Personal Scout Tasks 1–5** (offline core): bayes.py, personal_scout.py, fixtures, 61 tests green.
- **Battlelog fixture captured** via Chrome (logged-in Buckler): tests/fixtures/battlelog_sample.json
  (10 real ranked replays, owner short_id 1993249284). UNTRACKED — commit with Task 6.
  Real schema confirmed (use this for parse_battlelog, the plan's guesses were partly wrong):
  - owner id: props.pageProps.fighter_banner_info.personal_info.short_id
  - replay_list[].player1_info/player2_info; .player.short_id (numeric), .character_id (stable int),
    .character_name (display, title-case w/ spaces e.g. "Dee Jay"), .round_results (array), .master_rating
  - WIN RULE: a round is won when round_results entry > 0 (values 1/5/6/7/8 = win-finish types, 0 = lost);
    match winner has more rounds-won. (NOT "== 1" as the plan guessed.)
  - char map: prefer character_id→official; ids seen: 10 Ken, 11 Dee Jay, 14 Rashid, 19 Ed, 25 Sagat, 27 Terry, 32 Ingrid
  - uploaded_at = unix epoch int; replay_id = string (e.g. "H8M7756GJ")
- **v1→v2 merge (Increment 3) DONE** — 2 commits (e11aa3a Bars view, 22d088b promote):
  - Bars tab added to the app (port of v1 diverging-bar table) — verified in browser.
  - v2 promoted to canonical /web/; /web-v2/ → redirect; one standalone (sf6-matchup.html);
    READMEs (en+zh) updated. 4 tabs work (Matchups/Bars/Sub finder/Usage×Win), avatars load,
    month+usage direct inputs present. 61 tests green, standalone builds. plan: docs/plan-merge-v1-into-v2.md

### Why the user thought a change "wasn't deployed"
Deployed /web/ was v1 (sliders + read-only usage badges); the direct inputs only existed in v2 (/web-v2/).
Now merged: after push+Pages rebuild, deployed /web/ will be the merged app WITH direct inputs.

### Next steps
- `git push origin main` — local main is ahead of origin by ~8 commits; deploy needs this.
- Personal Scout Tasks 6–8: write parse_battlelog (use real schema above), commit the fixture, Playwright glue, docs.

## 2026-06-14 (scout impl) — Tasks 1–5 DONE, blocked on login for 6–7

### Currently doing
Implemented the Personal Matchup Scout plan inline with TDD. Tasks 1–5 (the
entire pure/offline core) are built, tested, and committed: 5 commits, 61 tests
green (42 prior + 19 new). Stopped at Task 6 — it needs a REAL captured Buckler
`__NEXT_DATA__` fixture, which requires the user's Capcom login. Did NOT invent
the schema (plan's hard rule). Task 8 (docs) held until fetch_battlelog.py exists.

### Done (committed, local — not pushed)
- `scripts/bayes.py` + `tests/test_bayes.py` — incomplete-beta CDF, Beta-Binomial
  posterior, credible interval, prob-below (9 tests).
- `scripts/personal_scout.py` + `tests/test_personal_scout.py` — classify(),
  load_personal/aggregate, baseline_winrates (reuses analyze.combined_row /10),
  scout(), format_report(), main() CLI (10 tests).
- `tests/fixtures/personal_terry.csv` — scout fixture.
- Smoke-tested: report renders; shrinkage pulls 1-2 and 2-0 small samples toward
  baseline → both "small sample" verdicts. Correct.

### Next steps (login-gated — needs the user)
- Task 6 Step 1: capture a real battlelog `__NEXT_DATA__` page into
  `tests/fixtures/battlelog_sample.json` (needs Capcom login). Then record actual
  field names (player short_id, character label, W/L encoding) atop fetch_battlelog.py.
  Reconcile Buckler labels (Vega→M. BISON, E.Honda→E. HONDA, Gouki→AKUMA) via
  roster.NAME_BY_SLUG before writing parse_battlelog().
- Task 7: Playwright fetch glue + `.gitignore data/personal/`. Manual verification only.
- Task 8: document the tool in README.md + README.zh-CN.md once fetch exists.
- `git push origin main` — now ahead of origin by 6 commits (1 plan doc + 5 scout).

### Key files
- `docs/superpowers/plans/2026-06-14-personal-matchup-scout.md` — the 8-task plan (Tasks 6–8 remain)
- `scripts/bayes.py`, `scripts/personal_scout.py` — the finished core
- `tests/fixtures/personal_terry.csv` — scout fixture

### Open questions
- Capture the Buckler fixture now (proceed to Tasks 6–8), or push the 6 local commits first?

---

## 2026-06-14 18:07 (manual)

### Currently doing
Just finished planning a NEW sub-project, the **Personal Matchup Scout** (brainstorm → spec → 8-task TDD plan, all committed). Awaiting the user's choice of execution approach (subagent-driven vs inline) or a redirect. Separately, this session shipped 5 features to the existing matchup tool and released **v1.3.0**.

### Approaches tried
- Shipped to the matchup web app (all committed, deployed, released v1.3.0): per-matchup **confidence dots** (`reliability()`), **usage×win-rate scatter** view (point size = `polarization()`), **sub-pair "Best duo"** coverage + coverage-% reframe (`pair_coverage()`), directly-editable month + per-opponent usage weights. 42 tests pass (Python↔JS parity).
- Pushed `main` to origin and cut GitHub release `v1.3.0` with both standalone HTML bundles attached.
- Ran 6 research subagents → `docs/ideas-{algorithm,uiux,social,social-2}.md`, `docs/analysis-data.md`, `docs/feasibility/1-4.md`.
- **Dead end avoided:** an algorithm agent claimed METHOD.md §8 correlation figures (+0.36/+0.05) were stale and should be +0.78/+0.31. Verified via `/tmp/verify_corr.py` — the doc was CORRECT; the agent's "fix" was a pooling error. Did NOT change METHOD.md. (Retraction noted in `docs/ideas-algorithm.md` §2.5.)
- Feasibility of 4 candidate projects investigated — all RISKY, none blocked. Chose #1+#4 merged (personal scout + Bayesian core, local-first) as the spec target; #2 tournament tracker and #3 frame-data fusion parked (both need external data of poor quality/licensing).

### Next steps (3–5 actionable)
- `git push origin main` — `main` is ahead of origin by 1 (commit `3260a49`, the plan doc, is unpushed).
- Begin Personal Scout Task 1: create `scripts/bayes.py` `reg_incomplete_beta()` + `tests/test_bayes.py` per `docs/superpowers/plans/2026-06-14-personal-matchup-scout.md`. Tasks 1–5 are pure/offline (no login) — build those fully first.
- Before Task 6: capture a real Buckler `__NEXT_DATA__` battlelog page into `tests/fixtures/battlelog_sample.json` (requires the user's Capcom login) — the `replay_list` schema is undocumented; do NOT invent it. Reconcile Buckler character labels (e.g. "Vega","E.Honda") to matrix roster names ("M. BISON","E. HONDA").
- Alternatively resume the matchup-tool queue in `docs/plan-improvements.md`: app merge (`web/` → `web-v2/` view tabs — user's pick), then patch-diff view, then rank-volatility badge.

### Key files
- `docs/superpowers/plans/2026-06-14-personal-matchup-scout.md` — the 8-task plan to execute
- `docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md` — the approved design
- `docs/feasibility/1-personal-baseline.md` — Buckler battlelog access details (endpoints, login-gating)
- `scripts/scoring.py`, `scripts/analyze.py:33` (`combined_row`) — reused by the new tool as the baseline
- `docs/plan-improvements.md` — remaining matchup-tool queue (merge / patch-diff / rank-volatility)
- `docs/analysis-data.md`, `docs/ideas-social-2.md` — research findings driving future work

### Open questions
- Execution approach for the plan: subagent-driven (recommended) vs inline — user had not answered.
- Build the new scout next, or continue the matchup-tool merge/patch-diff/rank-volatility queue first?
