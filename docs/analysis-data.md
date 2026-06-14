# SF6 Matchup Data — New Analysis (2026-06-14)

Data-driven companion to `docs/ideas-algorithm.md` (which covered the ~1.5% win-rate
spread, uncertainty bands, n_eff confidence, EB shrinkage, recency decay, duo optimizer,
SPEC residualization, and the corrected COVER/SPEC-vs-strength correlations). This report
deliberately avoids re-deriving those and instead surfaces **new, quantified findings**.

All numbers computed from the committed `output/matrix.csv` (45,512 rows) and
`output/usage.csv` via stdlib-only scripts (`/tmp/sf6_data.py`, `sf6_data2.py`,
`sf6_data3.py`). INGRID excluded (29 characters). Months 202502–202605; patch month =
202603. Pre = 13 months 202502–202602, Post = 3 months 202603–202605. "Strength" = mean of
a character's matchup (COMB) row at the stated rank.

---

## Finding 1 — Characters violently re-rank across skill tiers (the headline)

**Method.** Compute each character's mean matchup-row strength post-patch separately at
Master (rank 36) and Ultimate Master (rank 42); convert each to a 1–29 ordering; take the
rank delta.

| Climbs hardest (Master → UltM) | Master rank | UltM rank | Δ |
|---|---|---|---|
| MAI | #25 | **#1** | +24 |
| LILY | #24 | #6 | +18 |
| ED | #29 | #14 | +15 |
| ZANGIEF | #28 | #17 | +11 |
| CHUN-LI | #17 | #8 | +9 |

| Falls hardest (Master → UltM) | Master rank | UltM rank | Δ |
|---|---|---|---|
| A.K.I. | #10 | **#28** | −18 |
| E. HONDA | **#1** | #15 | −14 |
| LUKE | #9 | #22 | −13 |
| DEE JAY | #5 | #16 | −11 |
| KIMBERLY | #2 | #12 | −10 |

**Insight.** This is far larger than anything the patch did (Finding 4: cast-wide
char-level patch shift std is only 0.021). The *same balance patch* produces nearly
opposite tier lists depending on rank. MAI is the **single best character at UltM but
near-bottom at Master**; E. HONDA is the reverse. The prior audit established that UltM is
2.9× noisier month-to-month, but this shows the rank-to-rank signal is **structural, not
noise** — execution-heavy characters (MAI, LILY, ZANGIEF, CHUN-LI) reward high-skill play;
"fraud-friendly" characters (E. HONDA, A.K.I., LUKE) farm low-skill opponents. A single
default tier list is actively misleading for ~10 of 29 characters.

The global mean of (UltM − Master) across all 406 cells is **−0.005** — there is *no*
systematic high-rank bias. The divergence is entirely character-specific redistribution,
not a tierwide drift.

---

## Finding 2 — Players flock to familiar characters, not strong ones (inverse usage–strength)

**Method.** Per-character post-patch mean strength vs mean play_rate, Pearson + Spearman,
at two ranks. Also a flock/lag test on month-over-month deltas at Master.

| Rank | corr(usage, strength) Pearson | Spearman | n |
|---|---|---|---|
| Master (36) | **−0.426** | −0.429 | 29 |
| UltMaster (42) | −0.100 | −0.197 | 29 |

Removing the two extremes (E. HONDA, DHALSIM) keeps Master at **−0.345** — the negative
relationship is robust, not an outlier artifact. The five **strongest** Master characters
are among the **least played**: E. HONDA 5.241 str / 1.0% used, KIMBERLY 5.104 / 1.2%,
RASHID 5.071 / 1.4%, DHALSIM 5.069 / 0.8%. The five **most played** are middling-to-weak:
AKUMA 8.6% / 4.902, RYU 8.4% / 4.951, ALEX 8.0% / 5.021.

**Flock-vs-lag (Master, month-over-month):**

| Test | corr | n |
|---|---|---|
| Δusage_t vs Δwinrate_t (contemporaneous) | +0.223 | 404 |
| Δusage_t vs Δwinrate_{t−1} (lagged 1 month) | **+0.290** | 375 |

**Insight.** Two things at once: (a) in *levels*, the playerbase ignores strength entirely
and picks shonen-familiar characters (RYU/KEN/AKUMA), so usage is a **negative** proxy for
strength at Master; (b) in *changes*, players do chase winners but with a **one-month lag**
(lagged +0.29 > contemporaneous +0.22) — the meta reacts late. The negative level-corr
collapses to −0.10 at UltM: stronger players pick much closer to merit. Usage is therefore
a **skill-dependent** signal, not a strength signal — important because the COVER metric
already uses opponent usage as a weight.

---

## Finding 3 — Cross-rank matchup disagreement dwarfs patch effects; E. HONDA vs DHALSIM swings 1.45

**Method.** Post-patch cell-by-cell (UltM − Master) for all 406 matchups.

Per-cell |UltM − Master|: mean **0.147**, median 0.115, p90 0.301 — i.e. the *typical*
matchup disagrees across ranks by ~1.5% win rate, and 10% of matchups disagree by >3%.
Compare to the patch's typical cell shift of 0.067 (Finding 4): **rank disagreement is ~2×
the patch's effect.**

Top cross-rank disagreements:

| Matchup | Master | UltM | Δ |
|---|---|---|---|
| E. HONDA vs DHALSIM | 6.406 | 4.960 | **−1.446** |
| DHALSIM vs E. HONDA | 3.642 | 5.029 | +1.387 |
| E. HONDA vs LILY | 5.589 | 4.776 | −0.812 |
| E. HONDA vs BLANKA | 6.118 | 5.492 | −0.626 |
| M. BISON vs DHALSIM | 5.961 | 5.407 | −0.553 |

**Insight.** E. HONDA vs DHALSIM is a **64% win at Master but a coin-flip (49.6%) at
UltM** — a 14.5-point swing in the *same* matchup. The characters whose matchups disagree
most by rank are exactly the ones that re-rank in Finding 1 (E. HONDA, DHALSIM, LILY). Any
"matchup chart" shown without a rank selector is wrong for a large fraction of cells.

---

## Finding 4 — The March 2026 patch barely moved averages but flipped a handful of cells

**Method.** Per-rank, pre→post mean change of every (char,opp) cell; flag cells crossing
5.0 with both endpoints >0.1 from neutral.

| Rank | mean cell \|Δ\| | p90 | max | side-flips |
|---|---|---|---|---|
| Master (36) | 0.033 | 0.064 | 0.278 | 2 |
| GrandMaster (41) | 0.067 | 0.140 | 0.377 | 1 |
| UltMaster (42) | 0.075 | 0.157 | 0.314 | 4 |

Largest single shift, GM: **C. VIPER vs DHALSIM 5.367 → 4.990 (−0.377)**, mirrored by
DHALSIM vs C. VIPER 4.666 → 5.036 (+0.370) — a clean two-sided swing (DHALSIM/C. Viper
interaction). Cast-wide character-level shift std is only **0.021** (≈0.2% win rate): the
patch reshuffled *individual* matchups, not overall power. Biggest character movers at GM:
buffed DHALSIM +0.044, MANON +0.040, A.K.I. +0.034; nerfed JP −0.034, RYU −0.030,
CHUN-LI −0.028. (Consistent with the prior audit's §1.3.)

**Verified side-flips (UltM):** LILY vs MAI (4.899→5.189), BLANKA↔JURI (a two-sided flip:
BLANKA vs JURI 5.104→4.828 while JURI vs BLANKA 4.894→5.137), CAMMY vs SAGAT
(5.101→4.891). These ~7 cells are the *only* qualitative matchup-outcome changes the patch
produced — everything else was sub-1% tuning.

---

## Finding 5 — Anti-symmetry outliers cluster on rare/asymmetric-population characters

**Method.** For each unordered pair, s(A,B)+s(B,A) should = 10 if both cells are drawn from
the same game population. Deviation flags sampling/aggregation artifacts.

| Rank | pairs | mean \|dev\| | p90 | max |
|---|---|---|---|---|
| Master (36) | 406 | 0.013 | 0.025 | 0.065 |
| UltMaster (42) | 406 | 0.027 | 0.054 | 0.140 |

Worst UltM pairs: **DHALSIM/MANON 9.860 (−0.140)**, MARISA/MANON 9.871, C. VIPER/MANON
9.873, LILY/JURI 10.101. The largest deviations all involve **MANON, DHALSIM** — the
rarest characters (DHALSIM 0.8%, MANON among the lowest). Tiny populations on one side make
the two halves of a pair sample different player pools, breaking anti-symmetry.

Separately, **every** top anti-symmetry slot at Master is an **E. HONDA** pair (vs
KIMBERLY +0.065, JAMIE +0.051, M. BISON +0.051, DHALSIM +0.048) — E. HONDA's cells are
consistently ~0.05 "too favorable" relative to its opponents' mirror cells at Master. Given
E. HONDA is simultaneously rank #1 at Master / #15 at UltM and 1.0% usage, its Master
numbers are the **least trustworthy in the dataset** and should carry a low-confidence flag.

UltM anti-symmetry is **2× noisier than Master** (0.027 vs 0.013 mean dev) — independent
confirmation of the prior audit's "UltM is the noisy tier" via a completely different
statistic.

---

## Finding 6 — Polarization is negatively correlated with usage, positively with strength

**Method.** Post-patch UltM matchup-row std per character; correlate with usage and
strength.

Most polarized: DHALSIM 0.436, ZANGIEF 0.292, LILY 0.274, GUILE 0.255, BLANKA 0.241, JP
0.234. Least: SAGAT 0.138, A.K.I. 0.139, TERRY 0.140, LUKE 0.140, MAI 0.143, DEE JAY 0.155.

- corr(polarization, usage) = **−0.426**
- corr(polarization, strength) = **+0.320**

**Insight.** Polarized characters are both **less played** (people avoid feast-or-famine
matchup spreads) and **score higher on mean strength** (their few blow-out matchups inflate
the average). This re-confirms the prior audit's DHALSIM caveat with a population-level
correlation: the mean-strength ranking is partly an artifact of polarization, and the
playerbase already implicitly discounts it (the polarized winners go unplayed). Note MAI is
an exception — high UltM strength with *low* polarization (0.143), i.e. an "honest" top
tier, unlike DHALSIM.

---

## Product implications

| # | Finding | Concrete tool / UI / algorithm change |
|---|---|---|
| 1 | Characters re-rank ±24 spots across tiers | **Make rank the primary selector on the tier list, not a footnote.** Default the tier list to the user's own rank; show a "rank-volatility" badge on characters whose Master↔UltM rank delta >8 (MAI, E. HONDA, A.K.I., LILY, LUKE…). Add a "best at YOUR rank" vs "best at top rank" toggle so a Master player isn't told to pick MAI. |
| 2 | Usage is a negative strength proxy at Master, +lagged at top | **Stop using raw usage as a quality signal; relabel it "popularity."** In COVER, the opponent-usage weight is justified for "who you'll actually face," but do **not** let it leak into strength ranking. Surface a "sleeper" tag for high-strength/low-usage chars (E. HONDA, KIMBERLY, RASHID at Master) — these are the highest-EV pocket picks the meta hasn't caught onto. Optionally show a "meta lags 1 month" note where lagged corr (+0.29) beats contemporaneous. |
| 3 | Cross-rank cell disagreement (~2× patch effect; up to 14.5pts) | **Every matchup cell needs a rank context.** Never render a matchup number without the rank it came from. Add an inline "varies by rank" warning + sparkline across the 4 ranks for cells whose cross-rank range >0.3 (the p90). |
| 4 | Patch moved averages <0.2% but flipped ~7 cells | **Add a "what the patch actually changed" view:** list only the side-flipped cells (C.VIPER↔DHALSIM, BLANKA↔JURI, LILY vs MAI, CAMMY vs SAGAT) instead of a noisy full diff. Validates the `current` profile's hard pre-patch cut: per-character power barely moved, so blending pre-patch data is safe for *strength* but not for the flipped *cells*. |
| 5 | Anti-symmetry breaks on rare chars (MANON/DHALSIM), E. HONDA suspicious at Master | **Compute s(A,B)+s(B,A)−10 per pair and flag cells where \|dev\|>p90 (0.054 UltM / 0.025 Master) as low-confidence.** This is a free data-quality QA layer (no new columns) and directly feeds the prior audit's n_eff confidence proposal. Specifically badge E. HONDA's Master row as low-confidence (rare + asymmetric). |
| 6 | Polarization ↑ inflates mean strength, ↓ usage | **Show row-std (polarization) as a first-class column next to mean.** Pair the tier list with a "consistency" axis: a 2-D plot (mean strength × polarization) separates "honest top tier" (MAI: high mean, low std) from "feast-or-famine" (DHALSIM: high mean, high std). Sub-recommender should down-weight high-polarization mains' mean and rely on the per-cell matchup instead. |

---

*Reproducible from `/tmp/sf6_data.py`, `/tmp/sf6_data2.py`, `/tmp/sf6_data3.py` against the
committed `output/matrix.csv` and `output/usage.csv`. INGRID excluded; post-patch =
202603–202605; strength = mean matchup row at the stated rank.*
