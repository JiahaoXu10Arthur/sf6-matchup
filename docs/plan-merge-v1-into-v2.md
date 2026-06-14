# Merge v1 (Bar view) into v2, make v2 the canonical `/web/`

**User decisions (this session):**
- Fold v1's diverging-bar table into v2 as a **"Bars"** view tab.
- **"Make v2 as web"** — the merged v2 app becomes the canonical `/web/`; `/web-v2/` redirects to it.

**Current dependency facts (verified):**
- `web-v2/index.html` borrows `../web/i18n.js` + `../web/scoring.js` (v2 has no own copy). Shared math/strings live in `web/`.
- `web-v2` is at repo-root depth 1, same as `web` → relative `../output/*.csv` fetches stay valid after promotion.
- `build_standalone.py` builds both: `web/`→`sf6-matchup-bars.html`, `web-v2/`→`sf6-matchup-tierlist.html`, with cross-link rewrites.
- v2 already calls the same `charTable(...)` v1's bar table uses, and has a working `.view-switch` (match / subs / scatter) via `state.view` + `VIEW_LABEL`.

## Phase 1 — Add the "Bars" view to the v2 app (additive, reversible)
1. `web-v2/index.html`: add a `data-view="bars"` button to `.view-switch`; add a hidden bars container (rows/axis/kpis/canvas-head) used only in bars mode.
2. `web-v2/app.js`: port from `web/app.js` — `renderBars()` (v1's `renderMatchups`), plus helpers `syncRows`, `rowSkeleton`, `setBar`, `axisHtml`, `renderKpis`, and consts `COLS.match`, `BAR_HALF`. Wire dispatcher: `else if (state.view === 'bars') renderBars()`. Add `bars: 'labelBars'` to `VIEW_LABEL`.
3. `web/i18n.js`: add `labelBars` + any bar-only strings missing from v2 (headMatch, axis*, kHardest…, hScore/hDpatch/hMo) — keep keys identical to v1 so the port is verbatim.
4. `web-v2/style.css`: port v1's bar CSS (`.row`, `.bar-track`, `.bar.adv/.dis`, `.nums`, `.kpi*`, `.axis-bar`), scoped to the bars container so it can't disturb the tier view.
5. **Verify:** browser-load `/web-v2/`, click Bars → table renders, bars animate, weights/exclude/usage still drive it; other tabs unaffected. Commit.

## Phase 2 — Promote v2 to canonical `/web/`
1. Keep `web/scoring.js` + `web/i18n.js` (shared, unchanged).
2. Replace `web/index.html`, `web/app.js`, `web/style.css` with the merged v2 versions; fix the v2 index includes from `../web/i18n.js`→`i18n.js`, `../web/scoring.js`→`scoring.js`; drop the v1↔v2 alt-link.
3. `web-v2/index.html` → tiny redirect to `../web/` (preserve shared `/web-v2/` links).
4. `build_standalone.py`: build the one merged app from `web/` → a single `sf6-matchup.html` (keep the two old filenames as needed for the release, or note the change); fix cross-link rewrites.
5. `README.md` + `README.zh-CN.md`: collapse the two-view table into one app with view tabs; update URLs.
6. **Verify (exit criteria):**
   - `python3 -m pytest tests/ -q` green (JS↔Py parity unaffected — `web/scoring.js` unchanged).
   - Browser: `/web/` renders all four tabs (Tiers / Bars / Sub finder / Usage×Win); `/web-v2/` redirects.
   - `python3 scripts/build_standalone.py` produces working offline file(s).

## Notes
- Separate in-flight work: Personal Scout Tasks 1–5 committed; `tests/fixtures/battlelog_sample.json` captured (untracked) for Tasks 6–7.
- 5 scout commits + these are unpushed; push is a separate explicit step.
