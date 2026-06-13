# SF6 Matchup Pipeline — Methodology

## 1. Data source

Matchup scores are drawn from **kakuhanapp.com**, specifically the endpoint
`https://kakuhanapp.com/matchup/master/?month={M}&rank={R}&tool={slug}`.
The site renders server-side HTML that mirrors Capcom's official Buckler battle
diagrams. Each matchup score is a win-rate expressed on a 5.0-centered scale:
a score of 5.237 means a 52.37% win rate for the displayed character against
that opponent.

The site's own tier legend is:

| Score | Label |
|-------|-------|
| ≥ 5.3 | Advantage |
| ≥ 5.1 | Slight advantage |
| ≥ 4.9 | Even |
| ≥ 4.7 | Slight disadvantage |
| < 4.7 | Disadvantage |

**Why kakuhanapp rather than the official Buckler site?** Capcom's `dia_master`
endpoint returns HTTP 403 to scripts because it requires a login session and
has bot-protection. It also provides no monthly archive. kakuhanapp mirrors the
same official Capcom numbers and exposes them with a stable monthly URL
structure, giving 16 months of archive across the 202502–202605 window. The
current pipeline covers 202601–202605.

Scores are parsed from matchup card elements matching the HTML pattern:
`alt="([^"]+)">\s*<div class="card-body[^>]*>\s*<div class="text-muted small">([\d.]+)</div>`.
A valid page yields exactly 29 opponents. The page's own `<option selected>`
values (month, rank, slug) are extracted and cross-checked against the filename
at ingest time; any mismatch means the server served a fallback page and the
file is discarded rather than ingested as mislabeled data.

## 2. Roster and slug mapping

The roster covers **30 characters**. URL slugs are lowercase; page alt-text
names are uppercase display names. Most slugs map trivially (e.g. `ryu` →
`RYU`) but five require explicit mapping:

| Slug | Display name |
|------|-------------|
| `aki` | A.K.I. |
| `deejay` | DEE JAY |
| `honda` | E.HONDA |
| `chunli` | CHUN-LI |
| `cviper` | C.VIPER |

Each character's page lists 29 opponents (every other character).

## 3. Rank tiers and population weights

kakuhanapp provides matchup data for four ranks: 36 (Master), 40 (High Master),
41 (Grand Master), and 42 (Ultimate Master). This pipeline uses the three
highest tiers — 40, 41, 42 — combined with population weights **3 : 2 : 1**
(HighM : GrandM : UltM).

The weighting reflects a population pyramid: High Master has the largest player
pool and is therefore the most statistically stable source; Ultimate Master has
the smallest pool and is the noisiest. The site does not publish sample sizes —
the 件 counts visible on the page are forum-post counts, not match counts — so
3:2:1 is the best available proxy for population proportion.

## 4. Balance timeline and the month archive

Two events in the Jan–May 2026 window drive all weight decisions:

- **2026-03-17**: Major all-character balance patch, released alongside ALEX.
  This is the principal meta boundary. Data from 202601 and 202602 reflects the
  pre-patch meta; data from 202604 and 202605 reflects the post-patch meta.
  202603 is a mixed month: the patch landed on 17 March, so roughly half the
  month's match history is pre-patch and half post-patch.

- **2026-05-27/28**: INGRID release, accompanied by only a minor system patch.
  INGRID has at most a few days of data in 202605 — far too little for stable
  matchup estimates — and is excluded by default (`--exclude INGRID`).

ALEX was released with the March patch and therefore has data starting from
202603 (three months of the five-month window). INGRID has data only in 202605.

kakuhanapp returns HTTP 500 for (character, month) combinations that predate a
character's release. The downloader treats persistent HTTP errors as
no-data events and writes empty marker files, keeping re-runs idempotent.
Eighteen such empty files exist (ALEX × {202601, 202602} and
INGRID × {202601–202604}, each across three ranks). The matrix builder skips
them and reports each skip.

## 5. Month weight profiles

Two named profiles are provided, plus fully custom weights:

**`all`** — equal weight (1.0) across every requested month. This is the
"full-window combined" view; it includes the pre-patch meta and is useful for
seeing the overall Jan–May picture without patch-period emphasis.

**`current`** (recommended for competitive rankings) — pre-patch months
(202601, 202602) receive weight 0.0; the patch month (202603) receives 0.5;
post-patch months (202604, 202605) receive 1.0. This privileges the current
meta while giving partial credit to the transitional March data. If every
requested month falls before the patch (i.e. all weights would be zero), the
profile falls back to equal weights automatically to avoid an empty result.

**Custom weights** — `--weights 202601=0,202603=0.5,202604=1,202605=1` overrides
the named profile entirely. Internally every function takes a plain
`{month: weight}` dict; this is the recalculation API intended for a future
interactive web frontend: adjust sliders → new dict → recompute from
`matrix.csv` without re-fetching any data.

**Δpatch column** in the analysis table shows meta drift: the Grand Master
post-patch average minus the Grand Master pre-patch average for that opponent.
A positive Δpatch means the matchup got harder for the main character after the
patch; a negative value means it improved.

## 6. Score aggregation

For each (character, opponent) pair, the pipeline computes:

1. **Per-rank monthly average**: for each of the three tiers, a weighted
   average over the requested months using the active weight profile.
2. **Tier-combined score**: the 3:2:1 weighted average over whichever tiers
   have a non-null monthly average. If a tier has no data for the requested
   months it is simply omitted from the denominator rather than contributing
   zero.
3. **Spread flag ⚠**: emitted when the maximum spread across available tier
   scores exceeds 0.25, indicating the matchup assessment diverges meaningfully
   across skill levels.
4. **Months coverage** (e.g. `3/5`): the count of distinct months contributing
   at least one score row, shown as a fraction of the total months requested.
   ALEX shows 3/5; all other non-INGRID characters show 5/5.

## 7. Anti-symmetry validation

In a perfectly symmetric dataset, A-vs-B + B-vs-A = 10.0 exactly. However,
the Buckler diagrams are computed per main-character player population: A-vs-B
scores come from match records where A was the "main" (or more-played) character,
while B-vs-A scores come from a different, overlapping population where B was
the main. These are not the same sample, so the two numbers need not sum to
exactly 10.0.

`build_matrix.py` pairs every (month, rank, A, B) cell with its symmetric
counterpart (month, rank, B, A) and computes the absolute deviation from 10.0
for each pair. The pass criterion is **median deviation < 0.05**. The
actual result over the Jan–May 2026 matrix: **6,009 pairs, median 0.0250, max
0.3050**. The maximum is not a pass/fail criterion; it is printed for awareness.
Worst deviations concentrate on low-population characters (INGRID, LILY, A.K.I.).
Pairs with deviation > 0.2 are printed to the console.

## 8. Sub recommendation

The complementary sub recommendation ranks all candidate characters by their
ability to cover the main character's worst matchups.

**Coverage score (COVER)**:

```
COVER = Σ w(O) · (sub_vs_O − 5.0) / Σ w(O)
where w(O) = max(0, 5.0 − main_vs_O)²
```

Only opponents where the main loses (main_vs_O < 5.0) contribute positive
weight. The squared weighting concentrates attention on the worst matchups:
an opponent at 4.0 receives weight 1.0 while an opponent at 4.9 receives only
0.01. A positive COVER means the sub wins, on average, against the main's
trouble opponents; a negative COVER means the sub shares or worsens those
weaknesses.

**Complementarity columns**:

- **corr**: Pearson correlation of the main's and sub's full matchup-score
  vectors over shared opponents. A negative value means the sub and main have
  opposite win/loss profiles — the strongest signal for complementarity.
- **shared**: count of opponents where both characters score below 4.9. Fewer
  shared weaknesses is better.
- **w3win%**: average win rate of the sub against the main's three worst
  opponents (the COMB-derived worst-3). Displayed as a percentage (×10).
- **COVER@HighM / COVER@GrandM / COVER@UltM**: COVER recomputed using only
  that tier's matchup vector for the sub, while the main's weakness weights
  remain derived from the tier-combined COMB row.

## 9. Methodology fine print

Four known edge cases that are intentional and conservative:

**(a) Sub candidate is one of the main's worst-3 opponents.** If the sub
itself appears in the main's worst-3 (e.g. JP for TERRY), then the sub-vs-sub
mirror matchup (JP vs JP) does not exist in the data and neutral-fills to 5.0
in the COVER calculation. This is intentional: 5.0 is the most neutral
assumption and avoids inflating or deflating the score.

**(b) Missing opponents in a sub's row.** If a sub has no data for a given
opponent (most common with ALEX, which only has three months of data), that
opponent fills to 5.0 in the COVER numerator. This slightly deflates COVER for
sparse-data characters because a genuinely favorable matchup will be replaced by
neutral, never by a favorable score.

**(c) Per-tier COVER divergence.** The COVER@tier columns use only that tier's
sub matchup vector. Because different tiers can disagree on individual matchup
scores, a per-tier COVER value can diverge from the all-tier COVER in direction,
not just magnitude. This is informative rather than a consistency problem.

**(d) Worst-3 derivation.** The main's three worst opponents are identified from
the tier-combined COMB row. A character that is a meaningful weakness at only
one tier (e.g. rated 4.6 at UltM but 5.1 at HighM) may not appear in the
worst-3 after tier combination, so the worst-3 list reflects the aggregate
rather than any single tier's perspective.

## 10. Limitations

- **No sample sizes.** The 件 figures visible on kakuhanapp pages are
  forum-post counts, not match counts. No sample-size weighting is possible;
  3:2:1 tier weighting is the only available proxy for data volume.
- **INGRID data is minimal.** INGRID was released on 2026-05-27. The 202605
  matchup data covers only a few days of matches and is highly unstable. INGRID
  is excluded by default; re-including her (`--exclude` without INGRID) should
  be done with caution.
- **March 2026 is a mixed month.** The 2026-03-17 patch splits the month
  roughly in half. The `current` profile assigns it weight 0.5 as a compromise;
  no intra-month separation is available from the data source.
- **Ultimate Master noise.** UltM has the smallest player population and
  therefore the highest variance. The 1-weight in the 3:2:1 scheme limits its
  influence, but outlier scores at UltM remain possible and are flagged by the
  spread warning.
- **Per-population asymmetry.** As described in Section 7, A-vs-B and B-vs-A
  scores are drawn from different player populations and are not guaranteed to
  sum to 10.0. This is a property of the source data, not a pipeline artifact.
