# Algorithm / Statistics Review — SF6 Matchup Pipeline

Reviewer pass: read-only. Source of truth: `docs/METHOD.md`, `scripts/scoring.py`,
`scripts/analyze.py`, `scripts/recommend.py`, `scripts/build_matrix.py`, `web/scoring.js`.
All empirical numbers below were computed against `output/matrix.csv` (16 months,
202502–202605, ranks 40/41/42, 34,134 rows).

Summary verdict: the math is **mostly sound and the edge-case guards are correct**.
The most defensible parts are the COVER division guards, the u=1 reproduction of the
plain score, and the per-population anti-symmetry framing. The real weaknesses are
(1) the **tier weighting maximizes weight on the highest-variance tier** — confirmed
empirically — which is a deliberate but under-disclosed bias/variance choice, (2) the
**`inject` term scales with the worst weakness**, so "targeting" a matchup can inject a
full worst-weakness's worth of weight, contradicting the "one-weakness worth" docstring,
and (3) **Pearson correlation is offset-invariant**, so a strictly-better sub can read as
"redundant" (corr ≈ +1). None are crashes; they are interpretation hazards.

---

## CRITICAL

None. No division-by-zero, NaN, or data-corruption path was found. All guards verified
(see HIGH-3). The items below are correctness-of-interpretation, not failures.

---

## HIGH

### H1. Tier weighting {1,2,3} puts the MOST weight on the NOISIEST tier — empirically confirmed
`scripts/roster.py:13` — `TIER_WEIGHTS = {40: 1, 41: 2, 42: 3}` (HighM:GrandM:UltM).
METHOD.md §3, §10 acknowledge UltM is the smallest population and "noisiest," and the
maintainer deliberately chose skill-depth over sample size.

Empirical check (within-(char,opp) month-to-month score variance, ≥4 months, n=756 series each):

| Tier | mean within-series variance |
|------|------|
| HighM (40) | 0.00820 |
| GrandM (41) | 0.01637 |
| UltM (42) | 0.01782 |

UltM has **2.17× the temporal variance of HighM**. The scheme weights it **3×**. So the
estimator's weight ordering is the exact inverse of what variance-minimization (inverse-variance
/ precision weighting, the statistically optimal linear combination of noisy estimates of the
same quantity) would prescribe.

This is defensible ONLY if the three tiers estimate *different* quantities (true high-skill
matchup value differs from mid-skill matchup value) and the target estimand is the high-skill
one. That is the maintainer's actual position and it is a legitimate modeling stance — but then
the {3:2:1} blend is a **bias-toward-UltM** device, not a noise-reduction device, and combining
it with HighM/GrandM at all *adds* bias toward the lower-skill estimand it's trying to de-emphasize.
If the estimand is "true UltM matchup," the cleanest estimator is UltM alone (or UltM with a
shrinkage prior toward the GrandM value to control variance), not a fixed 3:2:1 mix.

Honest critique: the choice is intellectually coherent (depth over volume) but the documentation
frames 3:2:1 as a "proxy for population proportion" (METHOD.md §3 line 63, §10 line 211) which is
**backwards** — population proportion is 3:2:1 in favor of HighM (largest pool), and the code
weights in favor of UltM. The weights are the *inverse* of the population proxy the doc claims
they represent. Either the comment ("weight higher ranks more (closer to true matchup value)",
roster.py:13) or the METHOD prose is the real rationale; they contradict each other.

Suggestions (pick one, this is a design decision — present to maintainer, do not silently change):
- (a) Keep 3:2:1 but **re-document** it as a deliberate skill-depth bias, and delete the
  "population proportion proxy" framing in §3/§10, which describes the opposite ordering.
- (b) Offer an inverse-variance-weighted alternative profile for users who want the
  minimum-variance combined estimate.
- (c) Add a shrinkage option: UltM score pulled toward GrandM by a factor that grows with
  the observed spread, formalizing the existing `spread > 0.25` warning.

### H2. `inject` scales with the worst weakness — a "targeted win" can inject a full weakness of weight
`scripts/scoring.py:60,64` and `web/scoring.js:38,42`.
`inject = max(max(sev), 0.02)`; weight `w = u·sev + max(0, u−1)·inject`.

The docstring (scoring.py:53) calls inject "one-weakness worth of weight." Verified behavior:
- For a normal weakness profile (one opponent at main=4.0), `maxSev = 1.0`, so `inject = 1.0`.
- Targeting a *winning* matchup C (sev=0) with `u=2` puts weight `(u−1)·inject = 1.0` on C —
  i.e. **the same weight as the single worst weakness in the whole profile**.
- Empirically: baseline COVER for a test main/sub = **0.397**; with `C` (a matchup the main
  already wins) targeted at u=2, COVER collapses to **0.100**. A single targeted win dominated
  the score.

So `inject` is not a fixed unit — it is **data-dependent and equals the worst weakness's weight**.
For a main with a brutal 4.0 matchup, targeting any opponent injects a huge weight; for a main
whose worst matchup is 4.9 (`maxSev = 0.01`), the floor `0.02` dominates and targeting injects a
tiny weight. The targeting knob therefore has **wildly different sensitivity depending on how bad
the main's worst matchup is** — non-intuitive for a UI slider.

Positive: the design goal — let a user up-weight a matchup they currently WIN without that
opponent contributing 0 (which `u·sev` alone would, since sev=0) — is achieved correctly, and
`u=1` provably does NOT trigger inject (`max(0, u−1)=0`), so the normal score is undistorted.
That part is right (verified, see H3 case 3).

Suggestion: if the intent is "one extra opponent's worth of attention," consider making inject
the **mean** or **median** non-zero sev (a representative weakness) rather than the **max**, or
make it an absolute constant independent of the profile so the slider's effect is predictable.
This is a semantics decision — flag to maintainer.

### H3. Pearson correlation is offset/scale-invariant — mislabels strictly-better subs as redundant
`scripts/scoring.py:71-81`, `web/scoring.js:51-64`. METHOD.md §8 calls negative corr
"the strongest signal for complementarity."

Pearson removes both mean and scale. Verified failure modes:
- Sub that **wins every matchup** with the *same shape* as the main's profile →
  `corr(main, sub) = +1.0`. The recommender presents this as maximally redundant
  ("opposite is better"), yet it is an excellent pick (it wins everything).
- Sub that beats everyone **equally** (flat 5.3 vector) → `syy = 0` → guard returns `0.0`,
  not a meaningful complementarity signal. A flat dominant sub is invisible to this column.

The COVER score does capture the strictly-better sub correctly (it's offset-aware), so the
recommender's primary ranking is fine. But `corr` as a *displayed complementarity signal* is
misleading: it answers "does the sub's matchup *shape* mirror the main's?" not "does the sub
*cover* the main's losses?" Two characters can have correlated shapes while one is uniformly
+0.5 above the other (fully covering). Offset-but-same-shape spreads will look falsely redundant.

Suggestion: either (a) relabel the column as "profile-shape similarity" so users don't read it as
coverage, or (b) replace/supplement it with a coverage-oriented complementarity metric, e.g.
covariance restricted to the main's loss set, or the fraction of main's losses the sub converts to
wins. COVER already does most of this; corr adds little and misleads. Flag to maintainer before
changing — it's a displayed-metric decision.

---

## MEDIUM

### M1. `current` profile silently discards 13 of 16 available months
`scripts/scoring.py:25`, `web/scoring.js:12-13`.
The matrix actually contains **16 months (202502–202605)**, not the 5 months
(202601–202605) that METHOD.md §1 line 27 states ("The current pipeline covers 202601–202605").
The data on disk is broader than the doc claims.

`current` assigns weight 0 to every month `< 202603`. If a user passes the full available range,
that **zeroes 202502 through 202602 — 13 months — and keeps only 202603(0.5)/202604/202605**.
Within the documented 5-month window it zeroes only 202601/202602 (2 of 5), which is the intended,
principled behavior (pre-patch meta is genuinely stale after a balance patch).

Two sub-issues:
- The hard 0 is defensible for the *balance-relevance* goal (pre-patch matchups are a different
  game), but it throws away information that could still inform a **prior** (e.g. for ALEX, which
  has only 3 post-ish months, pre-patch data could shrink noisy estimates). Hard-zero is the
  conservative choice and is fine, but worth noting it's lossy by design, not by necessity.
- The `0.5` on the patch month is a reasonable **compromise** (the patch landed mid-month,
  202603 is ~half pre / half post per METHOD §4) but it is **not principled** in the sense of
  matching the actual pre/post match split — it's a round number. If the 2026-03-17 patch split
  the month's matches, a date-weighted fraction (days post-patch / days in month ≈ 14/31 ≈ 0.45)
  would be marginally more defensible, but the data has no intra-month resolution (METHOD §10
  line 219 admits this), so 0.5 is acceptable. Low-impact.

Suggestion: fix METHOD.md §1 to state the true 16-month span on disk, and note that `current`
zeroes *all* pre-patch months (13 of 16 at full range), not just two.

### M2. Anti-symmetry MEDIAN test can pass while masking systematic per-character bias
`scripts/build_matrix.py:39-46`. Pass criterion: `median(|A·B + B·A − 10|) < 0.05`.

Median is the right **robustness** choice against the genuinely heavy tail (per-population
asymmetry produces legitimate large deviations — METHOD §7 is correct that A-vs-B and B-vs-A are
different samples and need not sum to 10). Empirical distribution (directed pairs, n=34,134):

| stat | value |
|------|------|
| median \|dev\| | 0.0230 |
| mean \|dev\| | 0.0313 |
| p90 | 0.0690 |
| p95 | 0.0880 |
| p99 | 0.1320 |
| max | 0.3050 |
| frac > 0.05 | 19.9% |
| frac > 0.10 | 3.2% |

So nearly **1 in 5 pairs exceeds the 0.05 threshold** while the median passes comfortably — exactly
the situation where a median test gives false reassurance about the bulk. The median says "typical
pair is fine"; it says nothing about the 20% tail.

Critically, the test only checks the **symmetric** quantity (sum ≈ 10). It is **structurally blind
to systematic directional bias**: the signed mean deviation is forced to ≈0 (verified: 0.00014)
because every pair is counted in both directions and the signs cancel by construction. So a passing
median does NOT validate "integrity" against a bias where, say, popular characters are systematically
over-rated. I checked the actual per-character signed self-vs-mirror bias: it ranges from MANON
−0.0134 to GUILE +0.0044 — **small and not alarming**, so the dataset is in fact clean here. But
that is luck of the data, not something the median<0.05 test would have caught. The test validates
*magnitude symmetry of the bulk*, not *integrity* or *absence of directional bias*.

Suggestion: keep median as the gate, but also report a robust spread (p95 or MAD) and a per-character
signed-bias scan so a future data refresh that introduces directional bias is actually caught. METHOD
§7 already prints pairs > 0.2; adding the per-character signed mean would close the blind spot cheaply.

### M3. Neutral-fill to 5.0 for missing opponents biases COVER for sparse characters — direction is one-sided
`scripts/scoring.py:66` (`sub_row.get(opp, 5.0)`), `web/scoring.js:44`. METHOD §9(b) discloses this.

For a sub with missing data (ALEX, 3 months), a genuinely favorable matchup is replaced by 5.0 in
the numerator. Because the replacement is always 5.0 (neutral) and never the true (favorable) value,
the bias is **systematically downward** for sparse subs — they can never be helped by a fill, only
neutralized. This is correctly documented as "conservative," and it is conservative in the right
direction (won't over-recommend a data-poor character). Acceptable, but combined with the fact that
ALEX legitimately has only post-patch data, ALEX is structurally penalized in the sub ranking.
Low-to-medium; the doc is honest about it. No change required beyond the existing disclosure.

---

## LOW

### L1. Squared severity over-concentrates on the single worst matchup (a 11:1 ratio at the extremes)
`scripts/scoring.py:59`, METHOD §8. `sev = max(0, 5−main)²`.
Squared weighting gives a 4.0 matchup **11.1×** the weight of a 4.7 matchup, vs **3.3×** for linear.
A 4.95 matchup gets weight 0.0025 — effectively ignored. This is a legitimate modeling choice
("concentrate on the worst") and the doc states the intent. The concern is that COVER becomes
nearly a **single-opponent** statistic when one matchup is much worse than the rest: the worst
matchup can swamp the denominator, so COVER answers "does the sub fix my single worst matchup"
more than "does it fix my bad matchups (plural)." That may be fine, but it's stronger than the
"concentrates attention" framing implies. If a softer concentration is wanted, linear or a 1.5
exponent would spread weight across the bad-matchup set. Design call — note to maintainer.

### L2. `correlation` `syy==0`/`sxx==0` returns 0.0, conflating "no signal" with "zero correlation"
`scripts/scoring.py:81`, `web/scoring.js:63`. A flat (constant) sub or main vector yields a
zero-variance series and the function returns `0.0`. `0.0` reads as "uncorrelated/neutral
complementarity," but the truth is "undefined — sub is uniform." Minor, since flat real vectors
are rare, but it silently mislabels. Could return `None`/`NaN` and have the display show "—".

### L3. `shared_weaknesses` threshold 4.9 is asymmetric vs the site's "Even" band
`scripts/scoring.py:84`. The site legend (METHOD §1) calls 4.9–5.1 "Even." `shared` counts
opponents where both score `< 4.9`, i.e. strictly into "slight disadvantage" or worse. That's a
reasonable definition of "shared weakness" and consistent with the legend's lower Even boundary.
No issue — just note the 4.9 is the legend's "Even" floor, so a matchup at exactly 4.9 (Even) is
not counted, which is correct. Consistent. No change.

### L4. Doc/code drift: METHOD §1 month span, and roster.py vs METHOD tier rationale
- METHOD §1 line 27 says "covers 202601–202605"; disk has 202502–202605. (see M1)
- roster.py:13 comment ("closer to true matchup value") and METHOD §3/§10 ("proxy for population
  proportion") give **opposite** rationales for the same weights. (see H1)
Fix the prose to match the actual deliberate intent.

### L5. JS/Python parity — verified equivalent
`web/scoring.js` conceptually matches the Python: `coverage` (incl. inject and the `u−1` guard),
`correlation`, `wavg`, `combinedRow`, `monthWeights` all mirror the Python. `tests/test_js_parity.py`
passes (27 tests green incl. parity). One cosmetic note: JS `charTable` filters months via
`mw[m]`/`m in mw` (web/scoring.js:120,126) where Python `char_table` does not re-filter by `mw`
in the nmonths/dpatch counts — but since `wavg` ignores zero/absent weights anyway, the combined
scores agree; only the `nmonths` display count could differ if a zero-weight month is present.
Verify the parity test covers a zero-weight-month case; if not, add one. Low.

---

## Edge-case verification log (all passed)

From `scripts/scoring.py::coverage`, executed against the real function:
1. All sev=0, no weights → den=0 → returns **0.0** (no div-by-zero). OK.
2. All sev=0, target one opp u=2 → uses floor inject 0.02 → returns finite. OK.
3. `u=None` ≡ `u=1` everywhere → **identical** (0.39703 == 0.39703). inject does not leak into u=1. OK.
4. Target a winning matchup u=2 → COVER 0.397 → 0.100 (large shift; see H2). Finite, no NaN.
5. Single opponent, main loses → **0.5**. OK.
6. `u=0` everywhere → den=0 → **0.0**. OK.
7. Empty main row → **0.0**. OK.
8. `correlation` flat vector → `syy=0` guard → **0.0** (see L2).
`combined_row`/`wavg` return `None` (not 0) for an all-zero-weight tier, and the tier is omitted
from the denominator rather than contributing zero (analyze.py:39-43) — correct, no zero-injection.

## Bottom line
Ship-ready numerically (no crash/NaN/zero-div paths; guards correct; JS=Python). The three things
worth a maintainer decision before trusting the *interpretation* of outputs: H1 (re-document the
tier weights as a skill-depth bias, not a population proxy — they're the inverse of the population
ordering and the highest weight sits on the highest-variance tier), H2 (inject magnitude is
data-dependent, not "one weakness"), and H3 (corr is shape-similarity, not coverage — relabel or
replace). M1/M2 are documentation/observability gaps, not math errors.
