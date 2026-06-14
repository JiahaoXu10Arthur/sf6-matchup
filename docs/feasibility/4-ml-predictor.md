# Feasibility #4 — Match-outcome predictor (ML)

> Research-only feasibility note. Verdict at bottom. All numbers below were computed
> on the real `output/matrix.csv` (45,512 rows, 30 chars, ranks 36/40/41/42,
> months 202502–202605) with throwaway scripts; methodology is in `docs/METHOD.md`.

## The proposed idea

A calibrated win-probability model predicting a match outcome from
`(charA, charB, rank, +usage)`, as a learn-ML / portfolio piece.

## Is there signal beyond the lookup? (computed)

This is the crux. We already store per-`(charA, charB, rank, month)` matchup win
rates. A "predictor" taking those same features and returning a win probability
**is the matrix cell** — a `dict` lookup wearing a `model.predict()` hat. Asking
"P(A beats B at rank R this month)" when that exact number is a CSV cell is not ML.

So the only honest question is: **is there variance to predict that the raw cell
does not already give you?** I tested it directly.

### 1. The target barely moves — most cells are near-even

- Score distribution: mean 5.002, **std 0.263** on the 5.0-centered scale.
- **81.2%** of all matchups sit within ±0.3 of even (5.0).

There is little spread to explain. A model that always guessed "even" (5.0) is
only ~0.19 MAE off. This caps the achievable upside.

### 2. Forecasting next month: smoothing beats the raw cell, but the absolute gain is tiny

Held-out test — predict month *t*'s cell for every `(rank, char, opp)` series
from prior months (~42k test points). Baseline = "use last month's value."

| Method | MAE | vs last-month |
|---|---|---|
| always 5.0 (even) | 0.1853 | +82% (worse) |
| linear extrapolation | 0.1719 | +69% (worse) |
| **last month (baseline)** | **0.1017** | — |
| shrink last month 10% → 5.0 | 0.0986 | −3% |
| EWMA (α=0.5) | 0.0878 | −14% |
| mean of last 2 months | 0.0892 | −12% |
| **full history mean** | **0.0856** | **−16%** |

Post-patch-only test (202604–202605) reproduces this: history-mean −13%,
EWMA −12% vs last-month.

**Finding:** there *is* real, reproducible signal — temporal smoothing and
shrinkage beat the raw last-month cell by **12–16%**. But the absolute scale is
small: MAE drops from 0.102 to 0.086, i.e. ~**0.86 percentage points of win
rate**. The matchup numbers are dominated by a slow-moving "true" value plus
month-to-month noise, and the win is "average out the noise," not "discover
hidden structure."

### 3. Mean reversion is real (this is the ML hook)

Correlation between a cell's prior deviation from 5.0 and its next-month change:
**r = −0.276**. Negative ⇒ extreme matchups drift back toward even. This is
textbook regression-to-mean and is exactly why shrinkage/EWMA win above. It is
also the cleanest justification for a *hierarchical/Bayesian shrinkage* model
rather than a lookup.

### 4. The rank axis carries genuine, exploitable structure

Month-to-month volatility is **3× higher at the top rank** than the bottom:

| Rank | mean \|Δ month-to-month\| |
|---|---|
| 36 Master | 0.0462 |
| 40 High Master | 0.0898 |
| 41 Grand Master | 0.1331 |
| 42 Ultimate Master | 0.1377 |

And the four tiers disagree: mean max−min spread across ranks per cell = **0.255**,
with **42.9%** of cells exceeding the 0.25 spread flag from METHOD §6.3.

Crucially, the stable low ranks **predict the noisy top rank**. Predicting next
month's UltM(42) cell:

| Predictor for next-month UltM cell | MAE |
|---|---|
| UltM's own last month | 0.1377 |
| **blend (0.5·own + 0.5·lower tiers)** | **0.1211** (−12%) |

A model that borrows strength across ranks beats the per-rank lookup. **This is
the single most defensible "model > lookup" result in the data.**

### 5. The patch boundary is a real regime change

GrandM cells shift on average **0.141** across the 202603 patch (202602→202604)
vs a normal monthly delta of ~0.10; **10.2%** of series move >0.3. METHOD already
treats 202603 as the meta boundary. A model that ignores the patch will be biased
on post-patch months — handling it is genuine modeling work, not a lookup.

### 6. Noise floor

Post-patch within-series std (rank 41, 2 months) ≈ **0.069**. No model can predict
below this — it is the irreducible month-to-month noise. Our best forecaster
(0.086 MAE) is already close to it, which both confirms the signal is real and
caps how impressive the model can ever look.

## Defensible ML framing

Do **not** frame this as "predict who wins a match" — that is the lookup, and any
reviewer who knows the data will see through it. The honest, defensible framings,
in order of strength:

1. **Hierarchical shrinkage estimator of the *true* matchup value** ("best-of"
   framing). Treat each observed monthly cell as a noisy draw around a latent
   character-pair-vs-rank true skill value. Partial-pooling across ranks and
   months (borrow strength: stable Master informs noisy UltM; recent months
   inform the current estimate) to produce a **better, uncertainty-quantified**
   estimate than any single cell. Validated above: cross-rank blending beats the
   raw UltM cell by 12%, EWMA beats last-month by 14%. This is legitimately ML/stats
   and directly upgrades the existing site's combined-score number.

2. **Next-month / next-patch forecaster with calibrated uncertainty.** Predict
   the *next* month's matchup (genuinely unknown — not in the CSV yet) and emit a
   prediction interval. Headline metric: beat the last-month and history-mean
   baselines on a rolling holdout. The patch regime change (finding 5) is the
   interesting modeling challenge.

3. **Calibration as the portfolio centerpiece.** Convert score → P(win) and show a
   reliability diagram / Brier score / calibration curve on held-out months. "I
   built a *calibrated* probabilistic estimator and proved it with a reliability
   plot" is a stronger portfolio story than the point prediction itself.

All three answer "what does the model add over returning the cell?" with a number.

## Technical approach + stack

- **statsmodels / PyMC** for the hierarchical model. A partial-pooling
  (random-effects) model over `pair × rank × month` is the natural fit; PyMC gives
  you the calibrated posterior intervals that make framing #3 sing. A frequentist
  `statsmodels` mixed-effects model is the lighter alternative.
- **sklearn** only as the baseline harness (Ridge over engineered features:
  last-month value, lagged means, rank one-hot, patch-era flag, usage) and for
  calibration tooling (`CalibratedClassifierCV`, reliability curves) — but note
  the target is continuous, so this is regression + a logistic link for the
  P(win) view, not classification.
- **Validation must be temporal** (rolling-origin / forward-chaining): train on
  months ≤ t, test on t+1. Random k-fold leaks future into past and would be a
  red flag in review.
- Baselines to beat (non-negotiable for credibility): last-month, full-history
  mean, EWMA. The model has to beat EWMA-0.5 (MAE 0.088), not just "always even."

## Effort

**S–M.** The data is clean, small (fits in memory), already parsed, and the
baselines are trivial. A hierarchical PyMC model + rolling-origin eval + a
calibration plot is a focused weekend-to-week project. It is *small* as a lookup
and *medium* only because doing the Bayesian/hierarchical version and the temporal
validation properly is where the learning (and the portfolio value) lives.

## Key risks

- **Lookup-in-disguise risk (highest).** If framed as "predict the match," it is a
  CSV lookup and a sophisticated reviewer will say so. Must be framed as
  shrinkage/forecasting/calibration with a baseline-beating number.
- **Small effect size.** The win over baselines is real but ~0.86 pp of win rate.
  Honest, but not flashy — the story has to be "calibrated and principled," not
  "huge accuracy."
- **No sample sizes (METHOD §10).** Capcom publishes no match counts, so the
  *natural* inverse-variance weighting is unavailable; uncertainty must be inferred
  from observed cross-rank/cross-month dispersion. This is a real limitation to
  state up front.
- **Player-level features need data we don't have.** Per-player skill/usage
  features (the thing that would make it a true *match-outcome* predictor rather
  than a *matchup-average* estimator) require personal match data not in this repo.
  **Flagged dependency** — out of scope for current data.
- **Anti-symmetry / per-population bias (METHOD §7)** means A-vs-B and B-vs-A need
  not sum to 10.0; a model should be fit per displayed-character row, not assume
  symmetry.

## What extra data would elevate it

- **Per-player match logs** (rank, characters, outcome) → a true match-outcome
  classifier with player features; this is the only thing that turns it from
  "matchup estimator" into a genuine "predict *this* match" model.
- **Match-count sample sizes per cell** → proper inverse-variance pooling.
- **Future months** accumulating naturally → a live forecasting backtest, the most
  convincing portfolio artifact.

## Verdict

**RISKY** — real ML signal exists (cross-rank shrinkage beats the raw UltM cell by
12%, EWMA beats last-month by 14%, r=−0.276 mean reversion), so it is *not* purely
a lookup; but the naive "predict the match" framing **is** a lookup and the honest
effect size is small, so portfolio value is real only if framed as a
hierarchical-shrinkage / calibrated-forecasting exercise that demonstrably beats
last-month and EWMA baselines on temporal holdout.
