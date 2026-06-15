# Scout ↔ Views Integration — Design Spec

**Date:** 2026-06-15
**Status:** approved-for-planning
**Builds on:** `2026-06-14-personal-matchup-scout-design.md` (the Personal Matchup
Scout, now shipped in `web/scout.js` + the Scout view), `web/scoring.js`,
`web/app.js`.

## Goal

Let the personal battlelog the Scout already pulls flow into the rest of the web
app, so the existing views can be read through *your own* ladder instead of only
the global average — gated behind a single **Personal mode** toggle, with personal
and global data combined by the Scout's Beta-Binomial shrinkage.

Four integrations, all reading one shared lens:

1. **Matchup map → fully personal** — your encounter frequency × your shrunk
   win-rate, dot size = your sample size.
2. **Sub Recommend → personal weakness profile, global candidates** — rank pockets
   against the matchups you actually lose to opponents you actually face.
3. **Tiers / Bars → annotate** — keep the global baseline, add your W–L and an
   over/under-perform marker where you have games.
4. **Scout → pocket bridge** — for each losing/weakness row, name your best pocket
   and jump to Sub Recommend.

## Decisions (locked with user)

| Choice | Decision | Why |
|--------|----------|-----|
| Combine model | **Beta-Binomial shrinkage blend** | Reuses the Scout's `classify`; one honest number per matchup; degrades to exactly global where you have no games |
| On/off | **Single global "Personal mode" toggle** | One control drives all four views; "off" leaves current behavior byte-identical |
| Default | **Off; toggle disabled until a battlelog is loaded** | No surprises; zero risk to existing users |
| Architecture | **Shared "personal lens" layer + selectors** | Each view changes ~one line; maximal reuse; no per-view shrinkage duplication |
| Sub candidates | **Stay global** | You usually have no personal data for a pocket you don't play |
| Tiers/Bars | **Annotate, don't replace** | The point there is seeing global baseline *and* your delta side by side |

## Scale convention (unchanged)

Every view consumes a row shaped `{opponent: score}` where `score` is win-rate ÷ 10,
centered at 5.0 (`combinedRow` in `web/scoring.js`). The personal row is produced on
the **same** scale so it is a drop-in replacement; win-% for display is `score × 10`.

## Architecture: the personal lens

New, pure, in `web/scout.js` (UI-free, node-testable):

- `personalRow(idx, char, monthW, exclude, tierW, agg)` → `{opp: shrunkWinRate × 10}`.
  For each opponent in the **global** row `combinedRow(idx, char, monthW, exclude, tierW)`,
  read `[wins, losses]` from `agg` (the `aggregate(rows, char)` already in `scout.js`),
  run the existing `classify(baseline/10, wins, losses)`, and emit `shrunk × 10`.
  Opponents with zero personal games return the exact global score (`classify` with
  0/0 yields the prior mean = baseline). Iterating the global opponent set means
  unknown/excluded opponents are dropped by construction — same join rule as `scout()`.
- `personalEncounter(rows, char)` → `{opp: gamesFaced}` for opponents you played as
  `char`. Fed through the existing `usageWeights()` wherever global usage plugs in;
  a raw `{opp: count}` is also kept for the Matchup-map x-axis and sample-size sizing.

New, in `web/app.js`:

- `state.personalMode` (bool, default `false`).
- A **Personal mode** checkbox in the controls card next to "Weight by usage",
  `disabled` while `state.personalRows.length === 0`.
- Selectors used by every view in place of direct data access:
  - `activeRow(char)` → `personalRow(...)` when `state.personalMode`, else `combinedRow(...)`.
  - `activeUsage()` → personal encounter weights when on, else `usageRates(...)`-derived.
- Toggling re-renders. `resetDefaults()` sets `personalMode = false` but does **not**
  clear `state.personalRows` (only Scout's "Clear" does).

## Per-view behavior

### 1. Matchup map (`renderThreats`)
- x: `personalEncounter` count → share of your games (comparable to the usage %).
- y: `personalRow` value × 10 (your shrunk win-rate).
- dot size: your personal sample size `n` (replaces reliability).
- Quadrant meaning unchanged; lower-right is now "common & losing **for you**".
- Zero personal games as `char`: falls back to the global map + caption note.

### 2. Sub Recommend (`renderSubs` / `subTable`)
- Main's weakness profile = `activeRow(char)` (personal shrunk row when on).
- Usage weighting = `activeUsage()` (your encounter weights when on).
- Candidate sub rows: **global** `combinedRow` (unchanged).
- `worst3` becomes your personal worst 3. Coverage/specialization/correlation math
  in `web/scoring.js` is untouched — it just receives a different `mainRow`/`usage`.

### 3. Tiers (`renderMatch`) & Bars (`renderBars`)
- Row stays the **global** `charTable` (bands don't move).
- When Personal mode is on, for each opponent with `n > 0`: append your `W–L` and a
  marker from `shrunk − baseline` (↑ over-perform / ↓ under-perform, colored by sign).
- No annotation where `n === 0`.

### 4. Scout → pocket bridge (`renderScout`)
- Trigger: every verdict row where you underperform expectation, i.e. `shrunk < baseline`.
- "Best pocket vs `opp`" = the candidate character with the highest **global** matchup
  score against that opponent: `argmax over sub of combinedRow(idx, sub, monthW, exclude, tierW)[opp]`,
  excluding the active main and the `exclude` set, and only where that score > 5.0
  (an actual edge). Reuses `combinedRow`; no `subTable` change needed.
- Render a "best pocket: X (5.4)" cell with a jump button that switches to the Sub
  Recommend view and opens X's character card.
- If no candidate has an edge vs `opp`, show "—" (no pocket beats them either).

## Edge cases

- No battlelog loaded → toggle disabled, everything global.
- Personal mode on, zero games as active char → personal row == global; map/sub show
  global with a caption note; no tier/bar annotations.
- Opponent in your log but absent from the matrix (or excluded) → dropped (join rule).
- Excluded opponents / `oppW = 0` → the same `exclude` set flows into `personalRow`,
  so personal and global stay consistent.
- Language switch / reset → Personal mode off on reset; loaded data survives reset.

## Testing

- **Node unit test** (`tests/test_personal_lens.*`, driven like the parity harness):
  `personalRow` equals the global row where `n = 0`; a 0–2 record shrinks **below**
  baseline but well above 0%; `personalEncounter` counts are correct. Relies on the
  already-parity-tested `classify`.
- **Browser E2E** (Claude-in-Chrome): load the fixture battlelog, flip Personal mode,
  confirm each of the four views changes, and that **off is byte-identical** to current
  output. Screenshots at 320 / 768 / 1024 / 1440.
- **Full pytest stays green** — no Python is modified.

## Build order

1. Foundation: `personalRow` + `personalEncounter` (scout.js); `activeRow`/`activeUsage`
   selectors + Personal-mode toggle (app.js); node unit test.
2. Matchup map (smallest consumer; validates the lens end to end).
3. Tiers / Bars annotation.
4. Sub Recommend personalization.
5. Scout → pocket bridge.
6. Docs: README EN/ZH (Personal-mode toggle, the four personalized views) + a METHOD
   note on the shrinkage blend; rebuild the standalone bundle.

## Out of scope (YAGNI)

- Adjustable κ / blend slider (fixed prior strength, as in the Scout).
- Personalizing the cast-wide Usage × Win scatter (it's a meta map, not per-you).
- Persisting personal data across reloads (stays in-memory, as today).
- Any Python/CLI change.
