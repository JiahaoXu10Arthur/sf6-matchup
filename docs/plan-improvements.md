# SF6 Matchup Lab — Improvement Execution Plan (2026-06-14)

Synthesis of `docs/ideas-{algorithm,uiux,social}.md` into a sequenced, verifiable plan.
User decisions (this session):
- **App structure:** merge `web/` + `web-v2/` into one app with view tabs. v2 (tier UI) is the home.
- **Uncertainty UI:** reliability dots + keep rank (not letter tiers, not error bars).
- **Build priority:** delegated to me — sequence by value ÷ risk.

## Verified corrections (done)
- ✅ `web/index.html` footer "kakuhanapp.com mirror" → "official Capcom Buckler battle diagrams (Master+)".
- ✅ METHOD.md §8 correlation figures (+0.36/+0.05): **verified CORRECT** via `/tmp/verify_corr.py`
  (reproduced +0.397/+0.040 avg-across-mains). The audit's "+0.78/+0.31" claim was a pooling
  error. No change to METHOD.md. Retraction noted in `docs/ideas-algorithm.md` §2.5.

## Convergent finding (all 3 docs)
The tool overstates precision: ~1.5% total win-rate spread, ±0.3–0.9% per-cell monthly noise.
Sample-size reliability is the community's #1 complaint and the algorithm team's #1 pick.
The source does not publish sample sizes → reliability must come from **data depth (months),
rank coverage, and cross-rank spread** that we already track.

## Increment 1 — Reliability dots on matchup rows  [VALUE: high, RISK: low]
- `charTable` already returns `nmonths` + `spread` per opponent row.
- Add pure `reliability({nmonths, nranks, spread})` → `{level:'high'|'med'|'low', score}` to
  **scoring.js AND scoring.py** (parity-tested).
- Enhance `charTable` rows with `nranks` (count of present tiers) so reliability has full input.
- Wire a confidence dot (●●● / ●●○ / ●○○) into the v2 matchup view, with i18n tooltip.
- Exit check: `pytest tests/ -v` green (incl. JS↔Python parity for `reliability`).

## Increment 2 — Usage-vs-viability scatter (new view)  [VALUE: high diff, RISK: med]
- x = usage rate (usage.csv), y = overall win-rate (mean COMB = `strength(combinedRow)`).
- Quadrants: strong&popular / strong&slept-on / weak&overplayed / weak&rare.
- New view-mode tab in the merged app; SVG, no deps. Reliability dot per point.
- Exit check: renders for the default month profile; points match `strength`/usage values.

## Increment 3 — Merge into one app, view tabs  [VALUE: enabler, RISK: high]
- v2 becomes home: add a view-mode switcher (Tiers / Bars / Scatter) above the content.
- Port v1 bar-table rendering into v2 as the "Bars" mode (reuse charTable rows).
- Shared rail + state; later: URL state (UIUX P1-1) for shareable links.
- Exit check: all existing features (weights, exclude, usage toggle, sub finder, editable
  inputs) work in every view mode; both standalone builds still build.

## Deferred / needs its own decision
- Duo/team optimizer (algorithm 2.7) — new capability, medium effort.
- Coverage-% sub reframe + Capcom real-sub sanity check (social #9–11).
- Full 30×30 heatmap (UIUX P1-2), tier-list PNG export (UIUX P1-3).
- EB shrinkage / n_eff confidence layer (algorithm 2.1+2.2).
