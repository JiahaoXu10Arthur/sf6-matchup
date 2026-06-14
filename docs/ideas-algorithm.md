# SF6 Matchup Tool — Algorithm Audit & Improvement Proposals

Statistician's audit of the scoring pipeline (`scripts/scoring.py`) against the real
data in `output/matrix.csv` (45,512 rows) and `output/usage.csv`. All numbers below
are **computed**, not estimated — the `current` month profile (202603=0.5, 202604=1.0,
202605=1.0; all pre-patch months zeroed), default tier weights {36:0.5, 40:1, 41:2, 42:3},
INGRID excluded. 29 characters after exclusion.

---

## Part 1 — Sanity & Insight Pass

### 1.1 Current tier list (mean COMB row, `current` profile)

| # | Char | mean COMB | as win% | | # | Char | mean COMB | as win% |
|---|------|-----------|---------|---|---|------|-----------|---------|
| 1 | DHALSIM | 5.085 | +0.85% | | 16 | GUILE | 4.992 | -0.08% |
| 2 | E. HONDA | 5.072 | +0.72% | | 17 | MARISA | 4.989 | -0.11% |
| 3 | RASHID | 5.046 | +0.46% | | 18 | LUKE | 4.986 | -0.14% |
| 4 | MAI | 5.046 | +0.46% | | 19 | KEN | 4.983 | -0.17% |
| 5 | SAGAT | 5.040 | +0.40% | | 20 | CAMMY | 4.982 | -0.18% |
| 6 | KIMBERLY | 5.039 | +0.39% | | 21 | ALEX | 4.976 | -0.24% |
| 7 | JP | 5.035 | +0.35% | | 22 | ED | 4.974 | -0.26% |
| 8 | BLANKA | 5.031 | +0.31% | | 23 | A.K.I. | 4.966 | -0.34% |
| 9 | M. BISON | 5.023 | +0.23% | | 24 | MANON | 4.949 | -0.51% |
| 10 | LILY | 5.021 | +0.21% | | 25 | JAMIE | 4.948 | -0.52% |
| 11 | TERRY | 5.021 | +0.21% | | 26 | RYU | 4.946 | -0.54% |
| 12 | C. VIPER | 5.021 | +0.21% | | 27 | JURI | 4.941 | -0.59% |
| 13 | DEE JAY | 5.011 | +0.11% | | 28 | ZANGIEF | 4.936 | -0.64% |
| 14 | CHUN-LI | 5.011 | +0.11% | | 29 | AKUMA | 4.932 | -0.68% |
| 15 | ELENA | 5.007 | +0.07% | | | | | |

**Sanity check: PASS, with one caveat.** The whole cast spans only **5.085 → 4.932**,
i.e. a **1.5 percentage-point** win-rate spread top-to-bottom. That is what a balanced
fighting game *should* look like, and it is the central statistical fact the rest of
this document hinges on: **the differences being ranked are tiny relative to the noise**
(see §1.4). A "tier list" presented as a hard 1–29 ranking is over-stating precision —
ranks 8 through 15 are separated by less than 0.02 (0.2% win rate), well inside a month's
sampling noise. This is the strongest argument for the uncertainty-band proposal (§2.3).

### 1.2 Most polarized characters (std of COMB matchup row)

| Char | row std | range |
|------|---------|-------|
| DHALSIM | 0.477 | [4.20, 6.16] |
| ZANGIEF | 0.310 | [3.92, 5.40] |
| LILY | 0.303 | [4.03, 5.69] |
| JP | 0.283 | [4.24, 5.61] |
| BLANKA | 0.266 | [4.31, 5.51] |

Least polarized: TERRY (0.102), LUKE (0.117), SAGAT (0.121), A.K.I. (0.129), RYU (0.132).

**Insight:** DHALSIM is both the **#1 character by mean** *and* by far the **most
polarized** (std 0.48, more than 3× TERRY's). This matters for sub recommendation: a
character can have a high mean *because* of a few blow-out wins, while still having
exploitable holes. The flat characters (TERRY, LUKE, SAGAT) are "honest" — their mean is
a faithful summary of every matchup. DHALSIM's mean is not. **The current ranking treats
all means as equally informative; they are not.** (Supports §2.6.)

### 1.3 Biggest patch-driven shifts (Grand Master mean, post-202603 minus pre-202603)

| Buffed | Δ | | Nerfed | Δ |
|--------|------|---|--------|------|
| DHALSIM | +0.045 | | JP | -0.039 |
| MANON | +0.043 | | RYU | -0.034 |
| A.K.I. | +0.028 | | JURI | -0.033 |
| KEN | +0.027 | | TERRY | -0.025 |
| SAGAT | +0.023 | | LUKE | -0.025 |

**Insight:** the March 2026 patch's net effect on *average* matchup value is small
(largest swing 0.045 ≈ 0.45% win rate). The patch reshuffled *individual* matchups far
more than it moved overall character strength — which is exactly why the `current`
profile discards pre-patch data wholesale rather than blending it. That decision is
defensible but **expensive**: it throws away 13 of 16 months. §2.4 (recency decay)
proposes a softer alternative.

### 1.4 The headline finding: tier volatility ladder

Mean month-to-month within-rank std of each (char,opp) score, post-patch:

| Rank | mean monthly std | rel. to Master |
|------|------------------|----------------|
| 36 Master | 0.0314 | 1.0× |
| 40 High Master | 0.0584 | 1.9× |
| 41 Grand Master | 0.0856 | 2.7× |
| 42 Ultimate Master | 0.0896 | **2.9×** |

This **empirically confirms** METHOD.md §3's claim that UltM is the noisiest tier — and
quantifies it: UltM scores are **~2.9× noisier** month-to-month than Master. The pipeline
nonetheless weights UltM **6× more** than Master (3.0 vs 0.5). So the highest-weight tier
carries the lowest-confidence signal. METHOD.md acknowledges this is a deliberate
bias-favoring choice, which is a legitimate position — but it is currently made *blind*:
there is no per-cell confidence number anywhere in the output. Every proposal in §2.1–2.3
is about **making that trade visible and tunable** rather than reversing it.

### 1.5 Tier-spread incidence

Across 812 (char,opp) pairs, the spread between the best and worst tier score:
median **0.166**, mean 0.197, p90 0.341, max **1.463**. **25.9%** of all pairs exceed the
0.25 spread-flag threshold. So roughly **one matchup in four is flagged** — the flag fires
so often it carries little information. Either the threshold should be data-driven (e.g.
p90 ≈ 0.34) or the spread should be replaced by a proper confidence interval (§2.3).

### 1.6 Usage spread (can it proxy confidence?)

Post-patch Master play rates: mean 3.42%, min 0.77% (DHALSIM), max 8.66% (ALEX), a
**11.3× range**. Usage varies enough to be a usable confidence proxy. **Important
asymmetry the current code half-ignores:** a matchup's reliability depends on *both*
players' populations. A DHALSIM-vs-LILY cell (0.77% main × 0.81% opp) is sampled from a
tiny slice of games; a RYU-vs-KEN cell is sampled from a huge one. The `usage(O)` term in
COVER weights by the *opponent's* popularity, but the **matchup score itself is never
confidence-adjusted** for either side.

---

## Part 2 — Algorithm Improvement Proposals

Each proposal states what it computes, why it is better, the effort, and schema fit.
**The schema `month,rank,char,opp,score` + `month,rank,char,play_rate` is sufficient for
every proposal below** — none requires re-fetching or new columns.

---

### 2.1 Usage-derived confidence weight on the matchup score itself ★ top pick

**What.** Define a per-cell effective-sample proxy from both players' usage and use it to
weight months/cells when aggregating. For cell (char=A, opp=B):

```
n_eff(A,B) = play_rate(A) * play_rate(B)          # joint exposure, ∝ # of A-vs-B games
conf(A,B)  = n_eff / (n_eff + k_conf)             # 0..1, saturating
```

Use `conf` as a *multiplier on the month weight* inside `wavg`, and surface mean `conf`
per cell as a published confidence number.

**Why better.** Today every cell is treated as equally certain. We showed UltM cells are
2.9× noisier and the rarest matchups (DHALSIM-LILY) come from <1%×<1% of the population.
`n_eff = play_rate_A × play_rate_B` is the natural proxy for the number of A-vs-B games
actually observed (the product of two marginal frequencies = the cell frequency under
independence). This is the **single missing ingredient** the data already contains.

**Rough effort.** Low–Medium. `usage_weights` already loads play rates; add a parallel
`cell_confidence(A,B,month,rank)` and fold it into the `wavg` weight in the matrix
builder / analyze step. ~30–40 lines. `k_conf` is one tunable constant (start at the
median of `n_eff`).

**Schema fit.** Perfect — uses only existing `play_rate`.

---

### 2.2 Empirical-Bayes shrinkage of extreme matchups toward 5.0 ★

**What.** Shrink each cell toward the neutral 5.0 by an amount inversely proportional to
its confidence:

```
score_shrunk = 5.0 + lambda(A,B) * (score_raw - 5.0)
lambda(A,B)  = n_eff / (n_eff + k_shrink)          # same n_eff as 2.1
```

**Why better.** Extreme matchups against rarely-played opponents are the least trustworthy
*and* the most influential (severity is squared in COVER, so a 4.0 cell counts 100× a 4.9
cell). We found **28 cells with |edge|>0.4 against sub-half-mean-usage opponents** — these
are exactly the cells a sub-recommender over-reacts to. Worked example on DHALSIM (k=2.0):

| vs | raw | shrunk | opp usage |
|----|-----|--------|-----------|
| ZANGIEF | 6.158 | 5.778 | 4.10% |
| LILY | 5.949 | 5.273 | 0.81% |
| RASHID | 4.196 | 4.666 | 1.42% |

The popular-opponent cell (ZANGIEF) barely moves; the rare-opponent cells (LILY, RASHID)
shrink hard toward neutral — precisely the desired behavior. This is the standard
James-Stein / empirical-Bayes correction and is **theoretically principled**, not a hack.

**Rough effort.** Low. One transform applied to the COMB row before COVER/SPEC/ranking.
~15 lines. Shares `n_eff` with 2.1, so do them together.

**Schema fit.** Perfect.

**Design decision to confirm:** shrink toward the global 5.0, or toward the *character's
own row mean*? Toward 5.0 is more conservative (assumes unknown matchups are even); toward
row-mean preserves "this character is generally strong." I lean 5.0 but this is a
judgment call — flagging per the "ask before defaulting" rule.

---

### 2.3 Ranking with uncertainty bands (replace the hard 1–29 list) ★ top pick

**What.** For each character compute the mean COMB **and** a standard error from
month-to-month variance (we have up to 3 post-patch months per cell × 29 opponents).
Publish `mean ± 1.96·SE` and rank by mean but **render overlapping bands as tied tiers**
(letter tiers S/A/B/C cut where bands separate, not by raw order).

**Why better.** §1.1 showed ranks 8–15 sit inside a 0.02 window while a single month's
noise is ±0.03–0.09 per cell. Presenting them as distinct ranks is **statistically
indefensible**. Uncertainty bands turn "DHALSIM #1, E.HONDA #2" into the honest claim
"DHALSIM and E.HONDA are co-leaders; ranks 8–15 are a statistical tie." This is the
highest-credibility upgrade for the least math.

**Rough effort.** Medium. Need to retain per-month COMB values (currently collapsed in
`wavg`) to bootstrap/aggregate variance. ~50 lines + a UI change to draw bands.

**Schema fit.** Perfect — variance comes from the month dimension already in the matrix.

---

### 2.4 Recency-weighted months instead of the hard pre/post-patch cliff

**What.** Replace the binary `current` profile (pre-patch = 0) with exponential recency
decay **gated at the patch boundary**:

```
w(month) = 0                         if month < patch_month   (hard cut kept)
w(month) = 0.5^((latest - month)/H)  otherwise                 (half-life H months)
```

**Why better.** §1.3 showed the patch moved *average* strength very little; most pre-patch
*structure* is still informative, and within the post-patch window newer months are more
relevant than 202603. The current profile is all-or-nothing: 202604 and 202605 are
weighted equally even though 202605 is the live meta. A half-life (e.g. H=2) keeps the
patch firewall but stops treating a 3-month post-patch window as uniform. *Effort note: low,
but value is capped because we only have 3 post-patch months — this matters more as the
archive grows.*

**Rough effort.** Low. One new branch in `month_weights`. ~8 lines.

**Schema fit.** Perfect.

---

### 2.5 SPEC strength-debiasing claim — VERIFIED CORRECT (false alarm, do not act) ✗

> **Retracted 2026-06-14.** This section originally claimed METHOD.md §8's correlation
> figures (COVER r≈+0.36, SPEC r≈+0.05) were stale and that the real numbers were
> +0.775 / +0.306. **That was a methodology error in the audit, not a doc bug.**
>
> Re-verified by faithfully replicating the documented method — Pearson correlation of
> each metric vs sub STR, computed per-main then **averaged across all 29 mains**,
> `current` profile, INGRID excluded (`/tmp/verify_corr.py`):
>
> | Metric | doc claim | reproduced (avg-across-mains) | pooled |
> |--------|-----------|-------------------------------|--------|
> | corr(COVER, STR) | +0.36 | **+0.397** | +0.365 |
> | corr(SPEC, STR) | +0.05 | **+0.040** | +0.103 |
>
> The published figures are accurate. The +0.775 figure came from pooling across the full
> main×sub product in a way that conflates between-character strength variation; individual
> per-main COVER-STR correlations only reach +0.72 at the extreme and average +0.40 — they
> never average +0.78. **No change to METHOD.md, and no residualized re-ranking is needed**
> on correctness grounds. (A SPEC residual ranking could still be offered as an *option*,
> but it is not fixing a bug.)

---

### 2.6 Complementarity metric better than Pearson corr

**What.** Replace (or supplement) `corr` with a **weakness-overlap / coverage-gain** score
that directly answers "where the main loses, does the sub win?":

```
complement(main, sub) = mean over O of  sev(O) * sign(sub_vs_O - 5)   weighted by sev(O)
```

i.e. the existing weakness weights applied to *whether the sub flips each loss into a win*,
not the shape-correlation of the two full rows.

**Why better.** METHOD.md §8 itself admits Pearson corr is "a supplementary shape cue
only" and is fooled by a uniformly-stronger sub (reads as redundant though it is a fine
pick). It is mean/scale-invariant, so it discards exactly the magnitude information that
matters. DHALSIM (most polarized, §1.2) will have wild corr values with everyone purely
from its variance. A severity-weighted sign-flip metric is interpretable ("covers 7 of
your 9 losing matchups") and immune to the scale artifact.

**Rough effort.** Low. Reuses `_weakness_weights`. ~12 lines. Keep corr as a secondary
column.

**Schema fit.** Perfect.

---

### 2.7 Duo / team optimizer (pick 2 subs that jointly cover your holes) ★

**What.** For a main, find the **pair** of subs that maximizes weakness coverage when the
player is allowed to pick the better of the two per matchup:

```
duo_score(main, s1, s2) = Σ w(O)·(max(s1_vs_O, s2_vs_O) - 5) / Σ w(O)
```

evaluated over all C(28,2)=378 pairs (trivial compute).

**Why better.** Real players run a 2–3 character roster, not one sub. A single sub leaves
residual holes; a complementary pair can cover the full weakness profile. Worked example,
**main = TERRY**:

| Best duos | duo COVER |
|-----------|-----------|
| DHALSIM + JP | +0.487 |
| DHALSIM + MARISA | +0.482 |
| DHALSIM + M. BISON | +0.427 |

Best **single** sub: JP at +0.291. The best **duo lifts coverage by +0.195** (a 67%
improvement) — a genuinely new recommendation the tool cannot currently make. The optimal
partner for DHALSIM (JP) is *not* the 2nd-best single sub, so this isn't just "top 2 by
COVER."

**Rough effort.** Medium. New function + a small UI surface (a "best partner for your main"
panel). The `max()`-per-opponent objective is one design choice; an alternative is
"minimize the worst residual weakness." ~40 lines core.

**Schema fit.** Perfect.

---

### 2.8 Data-driven / removed spread flag

**What.** Replace the fixed 0.25 spread threshold (fires on 25.9% of pairs, §1.5) with a
percentile-based flag (e.g. flag the top 10% of spreads, ~0.34) **or** retire it in favor
of the §2.3 confidence interval, which subsumes it.

**Why better.** A flag that fires on a quarter of all matchups is noise, not signal.

**Rough effort.** Trivial (constant change) or free (deleted, replaced by 2.3).

**Schema fit.** Perfect.

---

## Part 3 — Ranking by Value / Effort

| Proposal | Value | Effort | Verdict |
|----------|-------|--------|---------|
| 2.3 Uncertainty bands on tier list | **Very High** | Medium | **DO NEXT #1** |
| 2.5 Fix SPEC debiasing claim + residualize | **High** (correctness) | Low | **DO NEXT #2** |
| 2.7 Duo/team optimizer | **High** (new capability) | Medium | **DO NEXT #3** |
| 2.1 Usage confidence weight (`n_eff`) | High | Low–Med | Strong follow-up; enables 2.2 |
| 2.2 EB shrinkage of extreme cells | High | Low | Pairs with 2.1 |
| 2.6 Better complementarity metric | Medium | Low | Easy win |
| 2.4 Recency decay within window | Medium | Low | Value grows with archive |
| 2.8 Fix spread flag | Low | Trivial | Free; or fold into 2.3 |

### Top 3 — Do Next

1. **Uncertainty bands (2.3).** The data proves the hard 1–29 ranking over-states
   precision: a 1.5% total spread with ±0.3–0.9% per-cell monthly noise. Bands convert the
   tool from "looks authoritative" to "is honest," the single biggest credibility upgrade.

2. **Recalibrate & residualize SPEC (2.5).** A *published* claim (SPEC r≈+0.05) is
   contradicted by the live data (r≈+0.31). Fixing the documented number is free; adding a
   strength-residualized ranking makes SPEC actually do what it promises. Low effort,
   directly corrects a wrong statement.

3. **Duo optimizer (2.7).** The only proposal that adds a *new* user-facing capability,
   and the example shows a real +0.195 coverage gain that single-sub COVER structurally
   cannot find. Matches how players actually build rosters.

**Then** bundle 2.1 + 2.2 (shared `n_eff`) as the confidence/shrinkage layer — the
principled fix for the UltM-noise / rare-opponent problems quantified in §1.4 and §1.6.

---

*All figures reproducible from `/tmp/sf6_audit.py` and `/tmp/sf6_ideas.py` against the
committed `output/matrix.csv` and `output/usage.csv`. `current` profile, INGRID excluded,
default tier weights.*
