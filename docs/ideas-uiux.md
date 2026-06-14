# SF6 Matchup Lab — UX/UI Improvement Plan

A prioritized, product-design review of the two frontends (`web/` "bar view" v1
and `web-v2/` "tier view" v2), evaluated against hierarchy, onboarding,
discoverability, mobile/responsive, color/contrast, motion, empty/loading
states, and keyboard accessibility. Findings are specific to the actual elements
in these builds. Effort is rough engineering time (S ≤ half day, M ≈ 1–2 days,
L ≈ 3+ days).

---

## The single biggest problem

**A first-time visitor has no idea what they are looking at.** Both apps drop
the user straight into TERRY's matchup table with no explanation of:

- what COMB / COVER / SPEC / STR / W3% / CORR / ⚠ / Δpatch mean (METHOD.md
  explains all of this, but none of it reaches the UI beyond a `title=` tooltip
  that is invisible on touch and on first read);
- why scores center on 5.0 (the only hint is a 0.7rem footer line);
- that the dense left rail in v1 is *optional* tuning — defaults are already good;
- the difference in purpose between "Matchups" and "Sub finder", or between the
  "bar view" and "tier view" apps.

The data and methodology are genuinely strong; the presentation assumes the
visitor already read METHOD.md. Closing that gap is the highest-leverage work.

---

## P0 — Critical (do first)

### P0-1. No onboarding / glossary for a first-time visitor
- **Problem:** COVER, SPEC, STR, COMB, Δpatch, W3%, CORR, the ⚠ flag, and the
  5.0 center are never explained in-product. Tooltips (`title=`) carry the only
  definitions and are unreachable on mobile and easy to miss on desktop. A new
  player cannot tell whether 4.8 is good or bad without external context.
- **Fix:** Add a dismissable first-visit explainer + a persistent "?" help
  affordance:
  - A one-time intro card/overlay (store dismissal in `localStorage`, same
    pattern as `sf6lab-lang`) that explains in 3–4 sentences: "Scores are win
    rates centered on 5.0 — above 5.0 you win the matchup, below you lose. This
    table is sorted worst-first. COMB blends four skill brackets."
  - A small "?" button in the masthead/topbar opening a glossary panel that
    defines every column and tier, sourced from the METHOD.md tables (e.g. the
    Buckler legend ≥5.3 Advantage … <4.7 Disadvantage). Strings go through the
    existing `i18n.js` `STRINGS` dict so EN/中 both work.
  - Promote the in-page legend: render the Buckler tier legend as a always-visible
    color key (it doubles as the color-blind aid in P0-3).
- **Effort:** M

### P0-2. The two apps' relationship is unclear and switching is a full page nav
- **Problem:** v1 links to v2 via a tiny `tier view ↪` text link (top-right,
  0.66rem) and v2 links back with `↩ bar view`. A visitor does not know these
  are two *views of the same data* vs two different tools. The link is a hard
  navigation that throws away all tuned state (selected character, month/tier
  weights, exclusions, sort) — switching to compare is punishing.
- **Fix:** Decide the product story (this is a design decision — see Open
  Questions). Minimum viable improvement regardless of direction: make the
  switch a labeled, obviously-paired toggle ("Bars / Tiers") styled like the
  existing `.view-switch`, and **carry state across** via URL params (see P1-1)
  so the same character/weights survive the jump.
- **Effort:** S (toggle styling) + depends on P1-1 for state carry

### P0-3. Color is the only signal for advantage/disadvantage (color-blind fail)
- **Problem:** Both apps encode the entire core meaning (winning vs losing) in
  hue. v1 uses cyan `--adv` vs orange-red `--dis`; v2 uses a red→teal diverging
  scale (`--t-dis #FF4D5E` … `--t-adv #36C2CE`). A red/green-equivalent or
  cyan/orange-confusing user cannot read the tier bands at all — the v2 tier
  lanes are *named* (so they survive), but the v1 bars and all the numeric
  cells rely purely on `.adv`/`.dis` color classes plus the bar's left/right
  direction. The chip scores in v2 (`.chip-score` colored by tier) carry no
  redundant text cue.
- **Fix:** Add a non-color channel everywhere the sign matters:
  - Bars already diverge left/right (good) — keep, but add a +/− sign or a small
    glyph to the numeric value so the cell reads without color.
  - In v2 chips, append the tier initial or a shape (already have the band
    grouping; add the score's sign so a chip reads "−0.3" not just a teal "4.7").
  - Verify contrast: `--text-dim` (`#8A93A8` on `#0B0E16`) and v1's
    `oklch(64% …)` dim text on dark surfaces should be checked against WCAG AA
    (4.5:1 for the 0.6–0.7rem label text, which is both small and low-contrast —
    likely failing). Bump dim-text lightness or size.
- **Effort:** M

### P0-4. Mobile experience drops data and breaks the dense rail
- **Problem:**
  - v1 at ≤640px **hides the entire `.col-sub` column and row avatars**
    (`display:none`) and shrinks `--num-col` to 4rem. On a phone the Sub finder
    loses SPEC/STR/W3/CORR/SHARED — i.e. most of the table's value — silently.
  - v1's 300px rail stacks above the canvas at ≤880px, so a phone user scrolls
    through the entire intimidating control stack (char, ranks, 16 month
    steppers, 4 tier sliders, 30 opponent steppers) *before* reaching any data.
  - v2's `.controls-card` collapses to one column but the 30-chip opponent
    weight grid and month list still push the actual tier lanes far down.
- **Fix:**
  - Collapse the control rail into an expandable "Filters / Tuning" drawer or
    `<details>` on mobile, collapsed by default, so data is the first thing
    seen. Defaults are already sensible per METHOD.md, so hiding tuning by
    default is safe.
  - Instead of `display:none` on mobile columns, make the Sub finder row
    tap-to-expand (show COVER + name collapsed, reveal SPEC/STR/etc. on tap), or
    horizontally scroll the numeric block — don't silently delete columns.
  - Restore avatars on mobile (they are the fastest way to recognize a
    character); they're only ~37px tall.
- **Effort:** M–L

---

## P1 — High (strong ROI, do next)

### P1-1. No shareable links / no persisted state
- **Problem:** Every interaction is ephemeral. A user who tunes weights and
  picks a character cannot bookmark or share that exact view; a refresh resets
  to TERRY/current. There is zero `location`/`URLSearchParams`/`history` usage
  in either app (confirmed by grep). For a community tool that people will want
  to link in Discord/forums, this is a major miss.
- **Fix:** Serialize the meaningful state (`char`, `view`, `rank`, `subSort`,
  `useUsage`, non-default `monthW`/`tierW`/`oppW`, preset) into the URL query
  string and restore on load. Keep it compact (only non-defaults). This also
  unlocks P0-2 state-carry between the two apps and makes "Reset to defaults"
  meaningful (clear the query).
- **Effort:** M

### P1-2. The full NxN matrix / heatmap is missing — the data's best asset is unused
- **Problem:** The dataset is a 30×30 matchup matrix (METHOD.md §1), but both
  apps only ever show **one character's row at a time**. The most compelling and
  shareable visualization for matchup data — a full grid heatmap — does not
  exist. Power users and content creators specifically want the whole-cast view.
- **Fix:** Add a third view: a **matrix heatmap** (30×30, rows = main, cols =
  opponent, cell color = COMB score on the existing diverging scale, with the
  numeric value on hover/large cells). Reuse `charTable`/`combinedRow` from
  scoring.js across all rows. Clicking a cell drills into that pairing; clicking
  a row header selects that character (consistent with existing drill-in).
  Add row/column sort (by mean strength) to reveal tier structure visually.
  This is the single most "compelling visualization" upgrade available and plays
  to the data's strength.
- **Effort:** L

### P1-3. Tier-list export image + the v2 app is begging to be a shareable card
- **Problem:** v2 is literally a tier list — the canonical shareable artifact in
  fighting-game communities — yet there is no way to export it as an image. No
  `canvas`/`toBlob`/`navigator.share` anywhere.
- **Fix:** Add an "Export image" button on v2 that renders the current tier
  lanes (or the P1-2 heatmap) to a PNG via canvas (or `html-to-image`-style
  capture) with the character name, metric, and a small "buckler data · month
  range" caption baked in for attribution. Pair with `navigator.share` on
  mobile. This is the feature most likely to drive organic sharing.
- **Effort:** M

### P1-4. The v1 control rail is intimidating and undifferentiated
- **Problem:** The rail presents Character, Rank view, Month weights (up to 16
  steppers), Tier weights (4 sliders), and Opponent weights (30 steppers +
  usage toggle) as five visually-equal `.control` cards. A new user cannot tell
  that Character is essential while the 30 opponent steppers are an advanced
  power feature. Everything has the same weight, so the whole thing reads as
  "expert tool, not for me." The "Exclude characters" label in the HTML even
  mismatches the i18n string "Opponent weights" — the section actually does
  per-opponent 0/1/2-3 weighting, not just exclusion.
- **Fix:**
  - Establish hierarchy: keep Character + View + Rank as a always-visible
    primary cluster; move Month/Tier/Opponent weights into a collapsed
    "Advanced tuning" section (the defaults are good, per METHOD.md, so most
    users never need to open it).
  - Fix the label: HTML `data-i18n="exclude"` placeholder text says "Exclude
    characters" but resolves to "Opponent weights" — make the static fallback
    match, and add a one-line "what is this" inline help.
  - Show "modified" affordance: when weights deviate from defaults, badge the
    Advanced section so users know tuning is active (ties into Reset becoming
    meaningful with P1-1).
- **Effort:** M

### P1-5. Loading and error states are bare; no empty-state guidance
- **Problem:** Loading is a single dim line "Loading matrix…"; on fetch failure
  v1 shows raw "Could not load ../output/matrix.csv — run build_matrix.py
  first." (a developer message shown to end users). There is no skeleton, and
  on a slow connection the user stares at one gray line. v2 Sub finder empty
  state is just "none" (`tierEmpty`) with no explanation of *why* (e.g. all
  opponents excluded).
- **Fix:**
  - Replace the loading line with a lightweight skeleton of the rows/lanes
    (the layout is known ahead of data).
  - Make the error message user-facing ("Couldn't load matchup data. Refresh to
    try again.") and keep the technical detail in console only.
  - Give empty states a reason + recovery ("No subs to rank — you've excluded
    every opponent. Reset opponent weights.").
- **Effort:** S–M

### P1-6. Keyboard & screen-reader accessibility gaps
- **Problem:**
  - In v1 the data rows are clickable `<div class="row">` with no `role`,
    `tabindex`, or keyboard handler — drill-in (click a row to scout that
    character) is **mouse-only**. v2 uses `<button class="chip">` and
    `<button class="lb-row">` (good — keyboard reachable), so v1 regressed here.
  - Sort headers: v1 axis headers get `role="button" tabindex="0"` and a keydown
    handler (good); fine.
  - The rank tabs use `role="tab"` but there is no `tablist`/`tabpanel`
    arrow-key roving tabindex; each tab is a separate tab stop. Acceptable but
    not ideal.
  - `aria-live="polite"` is on the rows container — good — but the whole table
    re-renders on every slider tick, which will spam a screen reader. Consider
    debouncing announcements or moving live region to a summary.
- **Fix:** Make v1 rows real buttons (or add role/tabindex/keydown mirroring
  v2). Add `aria-pressed`/`aria-selected` consistently. Debounce the live-region
  churn. Audit focus-visible (already defined — good).
- **Effort:** S–M

---

## P2 — Medium (polish / depth)

### P2-1. Win-rate distribution / spread visualization
- **Problem:** The ⚠ spread flag (tiers disagree >0.25) is a single glyph; the
  per-tier values (Master/High/Grand/Ult) are only in a `title=` tooltip on v2
  chips and not surfaced in v1 at all unless you switch rank tabs. The
  bias/variance story (METHOD.md §3) is invisible.
- **Fix:** On row/chip expand or hover, show a tiny sparkline or 4-dot strip of
  the four tier scores so the user sees the spread and direction at a glance
  (e.g. UltM low, HighM high). Makes the ⚠ flag meaningful instead of mysterious.
- **Effort:** M

### P2-2. Δpatch is unexplained and easy to misread
- **Problem:** v1 shows "Δ +0.12" in a column headed "ΔPATCH"; v2 shows a bare
  ↑/↓ trend arrow on chips. The sign convention (positive = matchup got *harder*
  after the patch, per METHOD.md §5) is counterintuitive and undocumented in-UI.
- **Fix:** Tooltip/legend entry clarifying direction; consider coloring Δpatch
  by "harder/easier for you" rather than raw sign, and only showing it when a
  post-patch month is actually in the active window (otherwise it's noise).
- **Effort:** S

### P2-3. Motion is mostly good but has rough edges
- **Problem:** v1 bar animation (`scaleX` from 0 via double-rAF) is
  compositor-friendly and respects `prefers-reduced-motion` — good. But every
  control change calls full `render()`, and `buildMonthSliders()` rebuilds the
  entire list on each stepper click (with manual focus restoration) — janky and
  fragile. v2 re-`innerHTML`s all lanes on every interaction, so chip hover
  transitions restart and there's no enter animation continuity.
- **Fix:** Debounce slider-driven `render()`; in v2 consider keyed updates like
  v1's `syncRows` so chips don't fully rebuild. Low user-visible priority but
  improves perceived quality and battery.
- **Effort:** M

### P2-4. Typography / hierarchy refinements
- **Problem:** Lots of 0.58–0.66rem all-caps wide-tracked labels create a busy,
  uniform "HUD" texture where nothing dominates. v1 KPI strip is good hierarchy;
  the rail labels are not. v2 hero `char-name` gradient text
  (`-webkit-text-fill-color: transparent`) can fail contrast and disappears for
  forced-colors/high-contrast users.
- **Fix:** Reduce the number of competing label styles; ensure the gradient
  headline has a solid-color fallback (`@media (forced-colors: active)` and a
  base `color`). Establish one clear scale step between section labels and
  values.
- **Effort:** S

### P2-5. Stale data attribution in v1 HTML
- **Problem:** `web/index.html` footer static text still reads "Data:
  kakuhanapp.com mirror of official Buckler diagrams" while METHOD.md and the
  i18n `footer` string say it now uses the **official Capcom Buckler API**. The
  i18n string overwrites it at runtime, but the static HTML is wrong and would
  show if JS fails.
- **Fix:** Update the static fallback text to match the corrected i18n string.
- **Effort:** S (trivial)

### P2-6. SEO / social preview / PWA
- **Problem:** No Open Graph/Twitter card meta, so links pasted in Discord/forums
  render as bare URLs — a miss for a community tool. No favicon/manifest noted.
- **Fix:** Add OG/Twitter meta (title, description, a generated preview image —
  pairs with P1-3), favicon, and a minimal web manifest for "add to home
  screen." Pre-render a static OG image per deploy or generate per-share.
- **Effort:** S–M

### P2-7. Discoverability of drill-in and sort
- **Problem:** "Click a character to scout them" exists (`chipHint`) but is only
  in a tooltip; the row/chip cursor is `pointer` but there's no visible "you can
  click this" affordance beyond hover. Sortable columns (v1 axis, v2 leaderboard
  headers) are only discoverable via the ▾ marker on the *active* column.
- **Fix:** Add a subtle persistent affordance (e.g. a hover hint row, or an
  inline "tap a character to view their matchups" caption the first time), and
  show a faint sort glyph on all sortable headers, not just the active one.
- **Effort:** S

---

## Suggested sequencing

1. **P0 batch** — onboarding/glossary (P0-1), view-switch clarity (P0-2),
   color-blind redundancy + contrast (P0-3), mobile rail drawer (P0-4). These
   make the tool usable by someone who isn't already an expert.
2. **P1 batch** — URL state (P1-1, unblocks sharing + cross-app state), then the
   two big wins: matrix heatmap (P1-2) and tier-list image export (P1-3),
   alongside rail hierarchy (P1-4), loading/error/empty states (P1-5), and v1
   keyboard a11y (P1-6).
3. **P2 batch** — distribution viz, Δpatch clarity, motion polish, typography,
   stale text, SEO/PWA, discoverability.

---

## Open design questions (need a decision before building)

1. **Two apps or one?** Are `web/` and `web-v2/` meant to be (a) two permanent
   alternative views the user toggles between, (b) v2 is the successor and v1
   will be retired, or (c) A/B experiment? This determines whether P0-2 becomes
   a unified in-app view toggle (merge into one app with Bars/Tiers/Heatmap
   tabs) or stays two linked sites. Recommendation leans toward **one app, three
   view modes** (bars, tiers, matrix) sharing the rail — but this is your call.
2. **Default landing view & character?** Currently TERRY + bar view + "current"
   preset. Is TERRY intentional (the repo's documented main) or should it be a
   neutral "pick a character" empty state for first-time visitors?
3. **Audience priority:** competitive players tuning weights vs. casual visitors
   wanting a quick read. This drives whether the rail is advanced-by-default
   (current) or simple-by-default (P1-4 recommendation).
4. **Heatmap scope (P1-2):** COMB-only, or selectable metric? Full 30×30 may be
   tight on mobile — acceptable to make it desktop-first with a simplified
   mobile fallback?
