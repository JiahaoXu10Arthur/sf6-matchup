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
pipeline ingests the full 202502–202605 archive; `matrix.csv` and the web app
carry all 16 months, and any sub-range can be selected at analysis time.

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

## 3. Rank tiers and skill-depth weights

kakuhanapp provides matchup data for four ranks: 36 (Master), 40 (High Master),
41 (Grand Master), and 42 (Ultimate Master). This pipeline uses the three
highest tiers — 40, 41, 42 — combined with weights **1 : 2 : 3**
(HighM : GrandM : UltM), i.e. **Ultimate Master is weighted most**.

The rationale is *skill depth*, not sample size: the higher the rank, the deeper
the players' understanding of the game, and the closer their matchup outcomes
sit to the matchup's "true" character-vs-character value rather than to
execution errors or gaps in matchup knowledge. Weighting Ultimate Master highest
therefore privileges the most informed signal.

This is a deliberate **bias/variance trade-off, made in favor of bias**. The
trade is real and runs against pure variance-minimization: Ultimate Master has
the smallest player pool and the highest month-to-month variance (empirically
~2× High Master's), yet receives the largest weight — the opposite of what
inverse-variance weighting would do. We accept the extra noise to track the most
skilled population's read on each matchup. The spread flag (§6.3) surfaces cases
where the tiers disagree enough that this noise matters. The site does not
publish match-count sample sizes (the 件 counts on the page are forum-post
counts), so true inverse-variance weighting is not available regardless.

## 4. Balance timeline and the month archive

The archive spans 202502–202605 (16 months). Two events drive all weight
decisions:

- **2026-03-17**: Major all-character balance patch, released alongside ALEX.
  This is the principal meta boundary. Every month before 202603 (202502–202602)
  reflects the pre-patch meta; 202604 onward reflects the post-patch meta.
  202603 is a mixed month: the patch landed on 17 March, so roughly half the
  month's match history is pre-patch and half post-patch.

- **2026-05-27/28**: INGRID release, accompanied by only a minor system patch.
  INGRID has at most a few days of data in 202605 — far too little for stable
  matchup estimates — and is excluded by default (`--exclude INGRID`).

ALEX was released with the March patch and therefore has data starting from
202603. INGRID has data only in 202605.

kakuhanapp returns HTTP 500 for (character, month) combinations that predate a
character's release. The downloader treats persistent HTTP errors as
no-data events and writes empty marker files, keeping re-runs idempotent. Over
the full 16-month archive 136 such empty files exist — DLC characters before
their release month, across the three ranks (e.g. INGRID, ALEX, C.VIPER, ELENA,
SAGAT in the months preceding each one's launch). The matrix builder skips them
and reports each skip.

## 5. Month weight profiles

Two named profiles are provided, plus fully custom weights:

**`all`** — equal weight (1.0) across every requested month. This is the
"full-window combined" view; it includes the pre-patch meta and is useful for
seeing the overall multi-month picture without patch-period emphasis.

**`current`** (recommended for competitive rankings) — every month before the
patch receives weight 0.0; the patch month (202603) receives 0.5; every
post-patch month receives 1.0. Over the full 16-month archive this means all of
202502–202602 (13 months) are zeroed — discarding pre-patch data is intentional,
since a major all-character balance patch makes older matchups poor evidence for
the current meta. It privileges the current meta while giving partial credit to
the transitional March data. If every requested month falls before the patch
(i.e. all weights would be zero), the profile falls back to equal weights
automatically to avoid an empty result.

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
2. **Tier-combined score**: the 1:2:3 weighted average over whichever tiers
   have a non-null monthly average. If a tier has no data for the requested
   months it is simply omitted from the denominator rather than contributing
   zero.
3. **Spread flag ⚠**: emitted when the maximum spread across available tier
   scores exceeds 0.25, indicating the matchup assessment diverges meaningfully
   across skill levels.
4. **Months coverage** (e.g. `14/16`): the count of distinct months contributing
   at least one score row, shown as a fraction of the total months requested.
   Characters released mid-archive (ALEX from 202603, INGRID from 202605) show a
   reduced numerator; characters present for the whole requested range show the
   full count (e.g. `16/16` over the full archive).

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
actual result over the full 202502–202605 matrix: **17,067 pairs, median 0.0230,
max 0.3050**. The maximum is not a pass/fail criterion; it is printed for
awareness. Worst deviations concentrate on low-population characters (INGRID,
LILY, A.K.I.). Pairs with deviation > 0.2 are printed to the console.

The median is the right robust statistic here: roughly a fifth of pairs
legitimately exceed 0.05 because of the per-population asymmetry described above,
so a mean or max criterion would fail on clean data. Note the test is blind to
*directional* bias — because each pair is counted from both sides, the signed
deviations cancel by construction. It validates that the two sides agree
*on average*, not that any single character's numbers are unbiased.

## 8. Sub recommendation

The complementary sub recommendation ranks all candidate characters by their
ability to cover the main character's worst matchups.

**Coverage score (COVER)**:

```
COVER = Σ w(O) · (sub_vs_O − 5.0) / Σ w(O)
where w(O) = u(O) · sev(O) + max(0, u(O) − 1) · TARGET_INJECT
      sev(O) = max(0, 5.0 − main_vs_O)²
```

`sev(O)` is the main's weakness severity against opponent O: only opponents
where the main loses (main_vs_O < 5.0) have positive severity. The squared
weighting concentrates attention on the worst matchups — an opponent at 4.0 has
severity 1.0 while an opponent at 4.9 has only 0.01. A positive COVER means the
sub wins, on average, against the main's trouble opponents; a negative COVER
means the sub shares or worsens those weaknesses.

`u(O)` is a per-opponent **user weight** (default 1.0), exposed in the web app
as a stepper per opponent:

- **u = 1** (default) reproduces the plain weakness-weighted score exactly — the
  injection term is zero, so normal rankings are undistorted.
- **u = 0** drops the opponent entirely (e.g. low-sample characters like E.HONDA
  or DHALSIM that few players have meaningful data against). This is the
  "exclude a character" mechanism: a zero-weight opponent is removed from the
  main's weakness profile *and* from every sub's coverage sum *and* from the
  candidate list.
- **u > 1** *targets* the opponent. The `max(0, u−1) · TARGET_INJECT` term adds
  weight even when O is not a current weakness (sev = 0), so the user can ask
  "find me a sub strong against this specific matchup" regardless of whether the
  main already wins it. `TARGET_INJECT = 0.25` — the severity of a 4.5 "slight
  disadvantage" — so targeting always counts an opponent as at least one
  moderate weakness, a fixed amount independent of how bad the main's worst
  matchup happens to be.

**Specialization (SPEC) — strength-adjusted coverage**:

```
SPEC = Σ w(O) · (sub_vs_O − sub_mean) / Σ w(O)
where sub_mean = mean of the sub's combined matchup row (its overall "strength")
```

COVER has a known bias: it rewards globally-strong characters. A character who
beats the *entire* cast covers *any* main's weaknesses by construction, so COVER
tends to recommend the same few top-tier subs (JP, RASHID, DHALSIM) for almost
everyone. An empirical study across all 29 mains
([docs/findings-sub-bias.md](findings-sub-bias.md)) measured COVER's correlation
with raw sub strength at r ≈ +0.36.

SPEC removes that bias by centering each sub's row on its own mean: it asks "does
this sub over-perform *specifically* against your weaknesses, relative to how it
does against the field?" A uniformly-strong character nets ≈ 0 (it beats your
weaknesses no more than it beats anyone); a genuine counter scores high. SPEC's
correlation with raw strength is r ≈ +0.05 (strength-neutral), and it does **not**
recommend losers — across all mains its top pick wins the worst-3 as often as
COVER's. The sub table can be sorted by COVER (default) or SPEC, and shows each
sub's overall strength as the **STR** column for transparency. Note: a
rarity-inflation correction was investigated and rejected — the most-recommended
subs are not uniformly low-variance (DHALSIM is the *most* polarized character),
so there is no clean signature isolating "unfamiliar-matchup" inflation; the
per-opponent exclude (u = 0) covers that case if a user wants it.

**STR (strength)**: the sub's overall mean matchup score (its `sub_mean` above),
a tier proxy. High STR = strong against the whole cast; pairing STR with SPEC
distinguishes "this sub is just strong" from "this sub specifically counters me."

**Complementarity columns**:

- **corr**: Pearson correlation of the main's and sub's full matchup-score
  vectors over shared opponents. This measures the *shape* of the two matchup
  spreads, **not** coverage: a negative value means the sub and main have
  opposite win/loss profiles (the sub tends to win where the main loses), which
  is the signal used to surface the "most complementary" character. Because
  Pearson correlation is mean/scale-invariant, a sub that is uniformly *better*
  than the main but with the same profile shape will read as highly correlated
  (apparently "redundant") even though it is a fine pick — so corr is a
  supplementary shape cue only. COVER, not corr, is the actual coverage ranking.
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
  forum-post counts, not match counts. No sample-size or inverse-variance
  weighting is possible; the 1:2:3 tier weighting is a deliberate skill-depth
  choice (§3), not a data-volume estimate.
- **INGRID data is minimal.** INGRID was released on 2026-05-27. The 202605
  matchup data covers only a few days of matches and is highly unstable. INGRID
  is excluded by default; re-including her (`--exclude` without INGRID) should
  be done with caution.
- **March 2026 is a mixed month.** The 2026-03-17 patch splits the month
  roughly in half. The `current` profile assigns it weight 0.5 as a compromise;
  no intra-month separation is available from the data source.
- **Ultimate Master noise.** UltM has the smallest player population and
  therefore the highest variance, yet the 1:2:3 scheme weights it *most* (§3) —
  a deliberate bias toward the most skilled population at the cost of higher
  variance. Outlier scores at UltM are correspondingly amplified; the spread
  warning (§6.3) flags matchups where the tiers disagree enough for this to
  matter.
- **Per-population asymmetry.** As described in Section 7, A-vs-B and B-vs-A
  scores are drawn from different player populations and are not guaranteed to
  sum to 10.0. This is a property of the source data, not a pipeline artifact.
