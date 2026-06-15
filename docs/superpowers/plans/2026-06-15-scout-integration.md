# Scout ↔ Views Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the personal battlelog the Scout pulls flow into the Matchup map, Sub Recommend, Tiers/Bars, and the Scout table, gated by a single Personal-mode toggle, combining personal and global data via Beta-Binomial shrinkage.

**Architecture:** A shared "personal lens" in `web/scout.js` produces a personal shrunk matchup row (same `{opp: score}` shape as the global `combinedRow`, win-rate ÷ 10) and a personal encounter map. `web/app.js` adds `state.personalMode` + a toggle and `activeRow`/`activeUsage` selectors that return personal-or-global; each view swaps to the selectors. "Off" is byte-identical to today.

**Tech Stack:** Vanilla JS (no framework), Node for unit tests, pytest harness driving Node, Claude-in-Chrome for browser E2E.

**Spec:** `docs/superpowers/specs/2026-06-15-scout-integration-design.md`

**Branch/commit note:** Per the user's standing rule, work on a feature branch (`git checkout -b feat/scout-integration` before Task 1); commit after each task on that branch.

---

## File Structure

- `web/scout.js` — add `personalRow`, `personalEncounter` (pure, node-testable); export them.
- `web/app.js` — `state.personalMode`; toggle wiring + enable-on-load; `activeRow`/`activeUsage`/`activeEncounter` selectors; modify `renderThreats`, `renderSubs`, `renderMatch`/`barRowHtml`, `renderScout`.
- `web/index.html` — Personal-mode checkbox in the exclude-control group.
- `web/i18n.js` — toggle label/hint + caption/pocket/overlay strings (en + zh).
- `web/style.css` — overlay marker, pocket cell, disabled-toggle styles.
- `tests/personal_lens_harness.js` — Node harness exposing `personalRow`/`personalEncounter`/`combinedRow`.
- `tests/test_personal_lens.py` — pytest driving the harness.
- `README.md`, `README.zh-CN.md`, `docs/METHOD.md`, `docs/METHOD.zh-CN.md` — docs.
- `scripts/build_standalone.py` — already inlines `scout.js`/`app.js`; just rebuild.

---

### Task 1: Personal lens math (`personalRow` + `personalEncounter`)

**Files:**
- Modify: `web/scout.js` (add two functions + exports)
- Create: `tests/personal_lens_harness.js`
- Create: `tests/test_personal_lens.py`

- [ ] **Step 1: Write the failing test**

Create `tests/personal_lens_harness.js`:

```javascript
/* Node harness for test_personal_lens.py: exposes the personal lens from
   web/scout.js against the real matrix. scout.baselineWinrates/personalRow call
   the global combinedRow, so we install it from scoring.js before invoking. */
const fs = require('fs');
const path = require('path');
const scoring = require(path.join(__dirname, '..', 'web', 'scoring.js'));
const scout = require(path.join(__dirname, '..', 'web', 'scout.js'));
global.combinedRow = scoring.combinedRow;   // scout.js resolves this as a global

const [csvPath, mode, argJson] = process.argv.slice(2);
const arg = argJson ? JSON.parse(argJson) : {};
const csv = fs.readFileSync(csvPath, 'utf8');
const idx = scoring.buildIndex(csv);
const mw = scoring.monthWeights(scoring.availableMonths(csv), 'current', scoring.PATCH_MONTH);
const exclude = new Set(['INGRID']);
const tierW = scoring.DEFAULT_TIER_WEIGHTS;
let out;
if (mode === 'crow') {
  out = scoring.combinedRow(idx, arg.char, mw, exclude, tierW);
} else if (mode === 'prow') {
  out = scout.personalRow(idx, arg.char, mw, exclude, tierW, arg.agg || {});
} else if (mode === 'enc') {
  out = scout.personalEncounter(arg.rows, arg.char);
} else {
  throw new Error('unknown mode ' + mode);
}
console.log(JSON.stringify(out));
```

Create `tests/test_personal_lens.py`:

```python
"""The web Personal-mode lens (web/scout.js personalRow/personalEncounter) blends
your record with the global baseline via the already-parity-tested classify().
These tests assert the key invariants through Node against the real matrix."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / 'tests' / 'personal_lens_harness.js'
MATRIX = ROOT / 'output' / 'matrix.csv'

pytestmark = [
    pytest.mark.skipif(shutil.which('node') is None, reason='node not installed'),
    pytest.mark.skipif(not MATRIX.exists(), reason='matrix.csv not built'),
]


def run(mode, arg):
    out = subprocess.run(['node', str(HARNESS), str(MATRIX), mode, json.dumps(arg)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_personal_row_empty_equals_global():
    # with no personal games, the shrunk row equals the global COMB row exactly
    crow = run('crow', {'char': 'TERRY'})
    prow = run('prow', {'char': 'TERRY', 'agg': {}})
    assert set(prow) == set(crow)
    for opp in crow:
        assert prow[opp] == pytest.approx(crow[opp], abs=1e-9)


def test_personal_row_shrinks_a_loss_below_baseline_not_to_zero():
    crow = run('crow', {'char': 'TERRY'})
    opp = next(iter(crow))
    prow = run('prow', {'char': 'TERRY', 'agg': {opp: [0, 2]}})
    assert prow[opp] < crow[opp]          # a 0-2 record pulls you below baseline
    assert prow[opp] > 0.0                # but shrinkage keeps it well above 0%
    other = [o for o in crow if o != opp][0]
    assert prow[other] == pytest.approx(crow[other], abs=1e-9)   # untouched


def test_personal_encounter_counts():
    rows = [
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W'},
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'L'},
        {'your_char': 'TERRY', 'opp_char': 'RYU', 'result': 'W'},
        {'your_char': 'CAMMY', 'opp_char': 'KEN', 'result': 'W'},   # different main
    ]
    enc = run('enc', {'rows': rows, 'char': 'TERRY'})
    assert enc == {'KEN': 2, 'RYU': 1}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_personal_lens.py -q`
Expected: FAIL — `personalRow`/`personalEncounter` are not yet exported (TypeError: not a function).

- [ ] **Step 3: Add the two functions to `web/scout.js`**

Insert immediately after the existing `baselineWinrates` function:

```javascript
// {opp: shrunk win-rate × 10} on the 5.0-centered scale — a drop-in for
// combinedRow. Each opponent's wins/losses (from aggregate) are shrunk toward the
// global baseline by classify(); zero personal games returns the exact baseline,
// so Personal mode degrades to the global row wherever you have no data.
function personalRow(idx, char, monthW, exclude, tierW, agg) {
  const base = baselineWinrates(idx, char, monthW, exclude, tierW);   // {opp: 0..1}
  const out = {};
  for (const opp of Object.keys(base)) {
    const [w, l] = agg[opp] || [0, 0];
    out[opp] = classify(base[opp], w, l).shrunk * 10.0;
  }
  return out;
}

// {opp: games you played as `char` against them} — your personal encounter counts.
function personalEncounter(rows, char) {
  const out = {};
  for (const r of rows) {
    if (r.your_char !== char) continue;
    out[r.opp_char] = (out[r.opp_char] || 0) + 1;
  }
  return out;
}
```

Add both to the `module.exports` block (extend the `classify, aggregate, ...` line):

```javascript
    classify, aggregate, mostPlayed, baselineWinrates, scout,
    personalRow, personalEncounter,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_personal_lens.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: Verify no regressions + syntax**

Run: `node --check web/scout.js && python3 -m pytest -q`
Expected: `node` prints nothing (OK); pytest all green.

- [ ] **Step 6: Commit**

```bash
git add web/scout.js tests/personal_lens_harness.js tests/test_personal_lens.py
git commit -m "feat: personal lens (personalRow + personalEncounter) for scout integration"
```

---

### Task 2: Personal-mode toggle + selectors (no view changes yet)

**Files:**
- Modify: `web/app.js` (state, selectors, toggle wiring, enable-on-load)
- Modify: `web/index.html` (checkbox in exclude-control)
- Modify: `web/i18n.js` (toggle label/hint, en + zh)

- [ ] **Step 1: Add the checkbox to `web/index.html`**

In the `#exclude-control` group, directly after the existing usage-toggle label, add:

```html
        <label class="usage-toggle personal-toggle"><input type="checkbox" id="personal-toggle" disabled>
          <span data-i18n="personalMode">Personal mode</span></label>
```

(It sits next to "Weight by usage"; `disabled` until a battlelog loads.)

- [ ] **Step 2: Add i18n strings to `web/i18n.js`**

In the `en` block (near `usageWeight`/`usageHint`):

```javascript
    personalMode: 'Personal mode',
    personalModeHint: 'Blend your loaded battlelog into the views (shrunk toward the global baseline). Load a log in the Scout tab to enable.',
    personalOn: 'Personal',
    personalNoGames: 'No personal games as {char} — showing global.',
```

In the `zh` block (mirror placement):

```javascript
    personalMode: '个人模式',
    personalModeHint: '将你导入的战斗记录融入各视图（向全球基准收缩）。在「个人侦察」标签页导入记录后即可启用。',
    personalOn: '个人',
    personalNoGames: '没有使用 {char} 的对局记录 —— 显示全球数据。',
```

- [ ] **Step 3: Add state + selectors to `web/app.js`**

Add `personalMode: false,` to the `state` object (after `useUsage: true,`).

Add these helpers right after the existing `usageMap()` function:

```javascript
// is the personal lens active? (toggle on AND a battlelog is loaded)
function personalActive() { return state.personalMode && state.personalRows.length > 0; }

// the matchup row a view should use: personal shrunk row when Personal mode is on,
// else the global COMB row. Same {opp: score} shape either way.
function activeRow(char) {
  if (personalActive()) {
    return personalRow(idx, char, state.monthW, exclude(), state.tierW,
                       aggregate(state.personalRows, char));
  }
  return combinedRow(idx, char, state.monthW, exclude(), state.tierW);
}

// {opp: count} of how often you faced each opponent as `char` (empty when off)
function activeEncounter(char) {
  return personalActive() ? personalEncounter(state.personalRows, char) : {};
}

// opponent usage-weight map: personal encounter weights when Personal mode is on,
// else the existing global usageMap(). Manual overrides (state.usageW) still win.
function activeUsage(char) {
  if (personalActive()) {
    return { ...usageWeights(activeEncounter(char)), ...state.usageW };
  }
  return usageMap();
}
```

- [ ] **Step 4: Wire the toggle + enable-on-load**

In `wireControls()`, after the `#usage-toggle` listener, add:

```javascript
  $('#personal-toggle').addEventListener('change', e => { state.personalMode = e.target.checked; render(); });
```

In `loadParsedRows()` (in the scout section), after `state.personalRows = mergeRows(...)`, add a line to enable the control:

```javascript
  const tgl = $('#personal-toggle'); if (tgl) tgl.disabled = false;
```

In `clearScoutData()`, after `state.personalRows = []`, add:

```javascript
  state.personalMode = false;
  const tgl = $('#personal-toggle'); if (tgl) { tgl.checked = false; tgl.disabled = true; }
```

In `resetDefaults()`, after `state.useUsage = true;`, add:

```javascript
  state.personalMode = false;
  const ptgl = $('#personal-toggle'); if (ptgl) ptgl.checked = false;
```

- [ ] **Step 5: Browser verification (toggle only; views unchanged)**

Serve from repo root (`python3 -m http.server 8731`), open `/web/index.html`.
In the Chrome JS console via the tool, run:

```javascript
const t = document.getElementById('personal-toggle');
JSON.stringify({ exists: !!t, disabledBeforeData: t.disabled });
```

Expected: `{"exists":true,"disabledBeforeData":true}`.
Then load the fixture log in the Scout tab (paste flow) and re-check `t.disabled` → `false`.

- [ ] **Step 6: Commit**

```bash
git add web/app.js web/index.html web/i18n.js
git commit -m "feat: Personal-mode toggle + activeRow/activeUsage selectors"
```

---

### Task 3: Personalize the Matchup map (`renderThreats`)

**Files:**
- Modify: `web/app.js` (`renderThreats`)
- Modify: `web/i18n.js` (already has `personalNoGames` from Task 2)

- [ ] **Step 1: Replace the data assembly in `renderThreats`**

Current `renderThreats` builds points from the global `charTable` + global `rates`. Replace its body (from `const ex = exclude();` through the `pts.push(...)` loop) with:

```javascript
  const ex = exclude();
  const personal = personalActive();
  const row = activeRow(state.char);                 // {opp: score} personal-or-global
  const enc = activeEncounter(state.char);           // {opp: count} (empty when off)
  const globalRates = usageCsv ? usageRates(usageCsv, state.monthW, state.tierW) : {};
  const totalGames = Object.values(enc).reduce((s, n) => s + n, 0);
  const table = charTable(idx, state.char, state.monthW, ex, state.tierW, PATCH_MONTH);
  const relById = Object.fromEntries(table.map(r => [r.opp, reliability(r.nmo, r.nranks, r.spread).score]));
  const pts = [];
  for (const opp of Object.keys(row)) {
    const win = row[opp] * 10;
    // x = how often you face them: your encounter share (%) when personal, else global usage
    const x = personal ? (totalGames ? enc[opp] / totalGames * 100 : 0) : globalRates[opp];
    if (x == null) continue;
    // dot size: personal sample size (normalized later) when personal, else reliability
    const size = personal ? (enc[opp] || 0) : (relById[opp] ?? 0);
    pts.push({
      char: opp, x, y: win, size, cls: winCls(win),
      title: personal
        ? `${cn(opp)} · ${enc[opp] || 0} ${t('scoutMatches')} · ${win.toFixed(2)}% ${t('ccWin')}`
        : `${cn(opp)} · ${x.toFixed(1)}% ${t('threatFaced')} · ${win.toFixed(2)}% ${t('ccWin')}`,
    });
  }
  if (personal) {   // normalize personal sample-size to 0..1 for dot radius
    const maxN = Math.max(1, ...pts.map(p => p.size));
    pts.forEach(p => { p.size = p.size / maxN; });
  }
```

Then keep the existing summary/caption/empty-guard/`buildScatter` call, but change the caption line to note personal fallback:

```javascript
  $('#hero-summary').innerHTML = '';
  $('#caption').innerHTML = t('threatCaption', { char: cn(state.char) })
    + (personal && totalGames === 0 ? ` <b>${t('personalNoGames', { char: cn(state.char) })}</b>` : '');
  if (pts.length < 2) { $('#lanes').innerHTML = `<div class="lane-empty">${t('scatterEmpty')}</div>`; return; }
  buildScatter(pts, {
    axisX: 'threatAxisUsage', axisY: 'threatAxisWin', aria: 'labelThreats',
    quadTR: 'quadComfort', quadTL: 'quadFree', quadBR: 'quadPriority', quadBL: 'quadMinor',
  });
```

- [ ] **Step 2: Browser verification — off is unchanged, on personalizes**

With the fixture log loaded and on the Matchup map view, run in the page:

```javascript
state.personalMode = false; render();
const off = document.querySelectorAll('#lanes .pt').length;
state.personalMode = true; render();
const on = document.querySelectorAll('#lanes .pt').length;
const firstTitle = document.querySelector('#lanes .pt title')?.textContent;
state.personalMode = false; render();
JSON.stringify({ off, on, firstTitle });
```

Expected: `off` matches current behavior; `on` ≥ 1 and `firstTitle` contains "matches" (the personal title form). No console errors.

- [ ] **Step 3: Commit**

```bash
git add web/app.js
git commit -m "feat: personalize Matchup map (your encounters × your shrunk win-rate)"
```

---

### Task 4: Annotate Tiers + Bars with your record

**Files:**
- Modify: `web/app.js` (`renderMatch`, `matchChip`, `renderBars`, `barRowHtml`)
- Modify: `web/i18n.js` (add `personalDelta` tooltip)
- Modify: `web/style.css` (`.chip-personal`, `.row-personal` markers)

- [ ] **Step 1: Add a personal-annotation helper to `web/app.js`**

Add near the top of the rendering section (after `const fmt`/`sfmt` definitions):

```javascript
// personal annotation for one opponent: {wl, delta, dir} or null when no games /
// Personal mode off. delta = your shrunk win-rate − the global baseline (score units).
function personalAnno(opp) {
  if (!personalActive()) return null;
  const agg = aggregate(state.personalRows, state.char);
  const rec = agg[opp];
  if (!rec) return null;
  const [w, l] = rec;
  const base = combinedRow(idx, state.char, state.monthW, exclude(), state.tierW)[opp];
  if (base == null) return null;
  const shrunk = personalRow(idx, state.char, state.monthW, exclude(), state.tierW, agg)[opp];
  const delta = shrunk - base;
  return { wl: `${w}–${l}`, delta, dir: delta >= 0.1 ? 'up' : delta <= -0.1 ? 'dn' : 'even' };
}
```

- [ ] **Step 2: Render the annotation in `matchChip`**

In `matchChip`, before the closing `</button>`, insert a personal badge:

```javascript
  const anno = personalAnno(r.opp);
  const annoHtml = anno
    ? `<span class="chip-personal ${anno.dir}" title="${t('personalDelta')}">${anno.wl} ${anno.dir === 'up' ? '↑' : anno.dir === 'dn' ? '↓' : '·'}</span>`
    : '';
```

and add `${annoHtml}` immediately before `${trend}${pip}` in the returned template.

- [ ] **Step 3: Render the annotation in `barRowHtml`**

In `barRowHtml`, inside the `.nums` div, add a personal cell after `col-sub`:

```javascript
  const anno = personalAnno(r.opp);
  const annoHtml = anno
    ? `<span class="col-personal ${anno.dir}">${anno.wl} ${anno.dir === 'up' ? '↑' : anno.dir === 'dn' ? '↓' : '·'}</span>`
    : '';
```

and append `${annoHtml}` after the `col-sub` span inside `.nums`.

- [ ] **Step 4: Add i18n + CSS**

`web/i18n.js` en: `personalDelta: 'Your record · shrunk vs the global baseline',`
`web/i18n.js` zh: `personalDelta: '你的战绩 · 相对全球基准收缩后',`

Append to `web/style.css`:

```css
/* personal-mode annotations on tiers/bars */
.chip-personal { font-family: var(--font-mono); font-size: 0.64rem; font-weight: 700; margin-left: 0.2rem; }
.chip-personal.up, .col-personal.up { color: var(--t-adv); }
.chip-personal.dn, .col-personal.dn { color: var(--t-dis); }
.chip-personal.even, .col-personal.even { color: var(--text-dim); }
.bars .nums .col-personal { font-family: var(--font-mono); font-size: 0.74rem; text-align: right; }
```

Note: the bars `.nums` grid is `3rem 5.4rem`; add a third column so the personal cell lays out. In `web/style.css` change `.bars .nums { ... grid-template-columns: 3rem 5.4rem; ... }` to `grid-template-columns: 3rem 5.4rem 4rem;`.

- [ ] **Step 5: Browser verification**

Load fixture, Matchups view, toggle on: confirm chips for opponents you played show a `W–L ↑/↓` badge and others don't; toggle off: no badges (identical to today). Repeat on Bars view. Run:

```javascript
state.personalMode = true; render();
const badges = document.querySelectorAll('#lanes .chip-personal').length;
state.personalMode = false; render();
const badgesOff = document.querySelectorAll('#lanes .chip-personal').length;
JSON.stringify({ badges, badgesOff });
```

Expected: `badges` ≥ 1, `badgesOff` === 0.

- [ ] **Step 6: Commit**

```bash
git add web/app.js web/i18n.js web/style.css
git commit -m "feat: annotate Tiers/Bars with your W-L and shrink delta in Personal mode"
```

---

### Task 5: Personalize Sub Recommend (`renderSubs`)

**Files:**
- Modify: `web/app.js` (`renderSubs`)
- Modify: `web/scoring.js` (`subTable` — accept an optional precomputed `mainRow`)

- [ ] **Step 1: Let `subTable` accept an override main row**

In `web/scoring.js`, change the `subTable` signature and its first line so callers can pass a personal main row (default keeps current behavior):

```javascript
function subTable(idx, char, mw, exclude, tierWeights, oppWeights, usage, mainRowOverride) {
  const mainRow = mainRowOverride || combinedRow(idx, char, mw, exclude, tierWeights);
```

(Everything else in `subTable` is unchanged — candidate rows are still `combinedRow(idx, sub, ...)`, which is the intended global-candidate behavior.)

- [ ] **Step 2: Pass personal main row + usage from `renderSubs`**

In `web/app.js` `renderSubs`, replace the `subTable(...)` call:

```javascript
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW, exclude(),
    state.tierW, state.oppW, activeUsage(state.char), personalActive() ? activeRow(state.char) : undefined);
```

Add a personal note to the caption (after the existing `$('#caption').innerHTML = t('headSubs', {...})` block):

```javascript
  if (personalActive() && !Object.keys(aggregate(state.personalRows, state.char)).length) {
    $('#caption').innerHTML += ` <b>${t('personalNoGames', { char: cn(state.char) })}</b>`;
  }
```

- [ ] **Step 3: Parity guard — global path unchanged**

Run: `python3 -m pytest tests/test_js_parity.py -q`
Expected: PASS — `subTable` with no override still equals the Python `recommend` path (the new param defaults to the same `combinedRow`).

- [ ] **Step 4: Browser verification**

Load fixture, Sub Recommend view. Toggle on vs off and confirm the ranking/`worst3` change (personal weakness profile) and that "off" reproduces the current leaderboard. Run:

```javascript
state.personalMode = false; render();
const offTop = document.querySelector('#lanes .lb-row')?.dataset.char;
state.personalMode = true; render();
const onTop = document.querySelector('#lanes .lb-row')?.dataset.char;
state.personalMode = false; render();
JSON.stringify({ offTop, onTop });
```

Expected: both defined, no console errors (values may differ — that's the point).

- [ ] **Step 5: Commit**

```bash
git add web/app.js web/scoring.js
git commit -m "feat: personalize Sub Recommend weakness profile + usage in Personal mode"
```

---

### Task 6: Scout → pocket bridge (`renderScout`)

**Files:**
- Modify: `web/app.js` (`scoutTableHtml`, add `bestPocket`, wire jump)
- Modify: `web/i18n.js` (`scoutPocket`, `scoutNoPocket`)
- Modify: `web/style.css` (`.sc-pocket`)

- [ ] **Step 1: Add a `bestPocket` helper to `web/app.js`**

Add near the scout render helpers:

```javascript
// best pocket vs one opponent = the character with the highest GLOBAL matchup
// score against `opp` (an actual edge, > 5.0), excluding your main + excluded set.
function bestPocket(opp) {
  const ex = exclude();
  let best = null, bestScore = 5.0;
  for (const sub of Object.keys(idx)) {
    if (sub === state.char || ex.has(sub)) continue;
    const sc = combinedRow(idx, sub, state.monthW, ex, state.tierW)[opp];
    if (sc != null && sc > bestScore) { bestScore = sc; best = sub; }
  }
  return best ? { sub: best, score: bestScore } : null;
}
```

- [ ] **Step 2: Render the pocket cell in `scoutTableHtml`**

In `scoutTableHtml`, add a header cell after `sc-verd`:

```javascript
    <span class="sc-pocket">${t('scoutPocket')}</span>
```

In the row template, after the verdict cell, add (only where you underperform: `shrunk < baseline`):

```javascript
      ${(() => {
        if (r.shrunk >= r.baseline) return `<span class="sc-pocket">—</span>`;
        const p = bestPocket(r.opp);
        return p
          ? `<span class="sc-pocket"><button class="sc-pocket-go" data-pocket="${p.sub}">${cn(p.sub)} <i>${(p.score).toFixed(2)}</i> →</button></span>`
          : `<span class="sc-pocket">${t('scoutNoPocket')}</span>`;
      })()}
```

Update the `.sc-row` grid in CSS (Task adds a column — see Step 4).

- [ ] **Step 3: Wire the jump in `renderScout`**

After the existing `wireScoutInputs(); wireChips();` in the loaded branch, add:

```javascript
  document.querySelectorAll('#lanes .sc-pocket-go').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      const sub = b.dataset.pocket;
      state.view = 'subs';
      document.querySelectorAll('.view-switch button').forEach(x => {
        const on = x.dataset.view === 'subs';
        x.classList.toggle('active', on); x.setAttribute('aria-selected', on);
      });
      $('#view-label').textContent = t(VIEW_LABEL.subs);
      render();
      const card = idx[sub]; if (card) { /* highlight handled by Sub view */ }
    }));
```

- [ ] **Step 4: i18n + CSS**

`web/i18n.js` en: `scoutPocket: 'Best pocket', scoutNoPocket: 'none',`
`web/i18n.js` zh: `scoutPocket: '推荐副角', scoutNoPocket: '无',`

In `web/style.css`, extend the `.sc-row` grid template (it currently ends at the verdict column) to add a final `minmax(6rem,1fr)` column, and add:

```css
.sc-pocket { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); }
.sc-pocket-go { font-family: var(--font-display); font-size: 0.72rem; font-weight: 600; color: var(--accent); background: rgba(110,139,255,0.1); border: 1px solid rgba(110,139,255,0.35); border-radius: 5px; padding: 0.15rem 0.4rem; cursor: pointer; }
.sc-pocket-go i { font-style: normal; color: var(--t-adv); }
.sc-pocket-go:hover { background: rgba(110,139,255,0.2); }
```

Update the `.sc-row` grid-template-columns (current: `minmax(8rem,1.4fr) 3.4rem 3.4rem minmax(8.5rem,1.3fr) 3.8rem minmax(7rem,1fr)`) to append ` minmax(6rem,1fr)`, and the 720px media query row template to add one more column or hide `.sc-pocket` on narrow screens (`.sc-pocket { display:none }` in the 720px block).

- [ ] **Step 5: Browser verification**

Load fixture, Scout tab. Confirm losing rows show a "best pocket" button, clicking it switches to Sub Recommend with that character selected. Run:

```javascript
const pockets = document.querySelectorAll('#lanes .sc-pocket-go').length;
JSON.stringify({ pockets });
```

Expected: `pockets` ≥ 0 (≥ 1 if the active char has any underperforming matchup with a counter in the cast); no console errors.

- [ ] **Step 6: Commit**

```bash
git add web/app.js web/i18n.js web/style.css
git commit -m "feat: Scout pocket bridge — best counter-pick per losing matchup"
```

---

### Task 7: Docs + standalone rebuild

**Files:**
- Modify: `README.md`, `README.zh-CN.md` (Personal-mode paragraph)
- Modify: `docs/METHOD.md`, `docs/METHOD.zh-CN.md` (shrinkage-blend note)
- Run: `scripts/build_standalone.py`

- [ ] **Step 1: README (EN + ZH)**

In the web-app section of `README.md`, add a sentence after the six-tabs paragraph:

```markdown
With a battlelog loaded in the Scout tab, the **Personal mode** toggle reads the
Matchup map, Sub Recommend, and Tiers/Bars through your own ladder — each matchup
is your record shrunk toward the global baseline (so it falls back to global where
you have no games). The Scout table also surfaces your best pocket per losing matchup.
```

Mirror in `README.zh-CN.md`:

```markdown
在「个人侦察」标签页导入战斗记录后，**个人模式** 开关会让对位地图、副角推荐与
相性表/柱状图按你自己的天梯数据呈现 —— 每个对位都是你的战绩向全球基准收缩的结果
（没有对局数据的对位会回退到全球数据）。个人侦察表还会为每个劣势对位给出推荐副角。
```

- [ ] **Step 2: METHOD note (EN + ZH)**

Add a short subsection to `docs/METHOD.md` describing the blend: Personal mode replaces the global COMB row with `shrunk × 10`, where `shrunk` is the Beta-Binomial posterior mean (`κ = 20` pseudo-games of the global prior); zero games ⇒ exactly the baseline. Mirror in `docs/METHOD.zh-CN.md`.

- [ ] **Step 3: Rebuild standalone + verify**

Run: `python3 scripts/build_standalone.py && grep -c "personalRow" standalone/sf6-matchup.html`
Expected: prints size line and `1` (personalRow inlined).

- [ ] **Step 4: Full test suite + final E2E**

Run: `python3 -m pytest -q`
Expected: all green.
Browser: open `/standalone/sf6-matchup.html`, load fixture, flip Personal mode across all four views — no console errors, off == global everywhere.

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md docs/METHOD.md docs/METHOD.zh-CN.md standalone/sf6-matchup.html
git commit -m "docs: Personal mode (views integration) + rebuild standalone"
```

---

## Self-Review notes

- **Spec coverage:** shrinkage blend (Task 1) · single toggle, default off, disabled-until-loaded (Task 2) · `activeRow`/`activeUsage` selectors (Task 2) · Matchup map (Task 3) · Tiers/Bars annotate (Task 4) · Sub Recommend personal main, global candidates (Task 5) · pocket bridge (Task 6) · edge cases (no-games caption in Tasks 3/5; reset/clear in Task 2) · docs + standalone (Task 7). All spec sections map to a task.
- **Off == identical:** every view guards on `personalActive()`; with the toggle off the selectors return the exact pre-existing global calls.
- **Naming consistency:** `personalActive`, `activeRow`, `activeEncounter`, `activeUsage`, `personalRow`, `personalEncounter`, `personalAnno`, `bestPocket` used identically across tasks.
