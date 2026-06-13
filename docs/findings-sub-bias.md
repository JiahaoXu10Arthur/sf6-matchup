# Sub-recommendation bias — empirical study (2026-06-13)

**Trigger:** observation that COVER recommends JP / RASHID / DHALSIM as the sub
for nearly every main. Question: is this a metric flaw, and do alternative
metrics fix it? Study scripts: `/tmp/sub_bias_study.py`, `/tmp/sub_bias_study2.py`
(matrix: 202502–202605, `current` profile, exclude INGRID).

## Findings

### 1. COVER is moderately strength-driven; SPEC is strength-neutral
Correlation of each metric's per-sub score with the sub's raw overall strength
(mean matchup), averaged across 29 mains:

| Metric | mean r vs strength |
|--------|--------------------|
| COVER (absolute edge) | **+0.362** |
| SPEC (mean-centered)  | **+0.049** |

COVER meaningfully rewards globally-strong characters — that is the JP/Rashid
effect. SPEC (each sub's row centered by its own mean: "does this sub
over-perform specifically against *your* weaknesses vs its own baseline?") is
essentially orthogonal to raw strength. **SPEC is the principled complementarity
signal.**

### 2. SPEC does NOT recommend losers (the feared failure mode doesn't occur)
The risk with SPEC was ranking a relatively-better-but-still-losing sub. In
practice, across all 29 mains, the SPEC #1 pick loses the main's worst-3
(w3win < 50%) for **0/29** mains — identical to COVER. SPEC and COVER usually
agree on the **#1** pick; SPEC's value is in the **mid-pack reorder**: e.g. for
TERRY it demotes DHALSIM (5.09 strength) from #2 → #5 and promotes MARISA (4.99)
and ZANGIEF (4.94) — genuine counters that COVER buried under flat-strong chars.

### 3. Top-1 recommendation diversity barely changes across variants
| Variant | #distinct top-1 | max top-1 | top-1 entropy |
|---------|----|----|----|
| COVER | 9 | 9 | 2.73 |
| SPEC | 10 | 9 | 2.78 |
| COVER + exclude-rare | 9 | 8 | 2.88 |
| COVER − λ·strength | 9–10 | 9 | 2.73–2.78 |

No variant meaningfully de-collapses the headline #1 distribution (Rashid is #1
for ~9/29 mains under all of them). **So replacing the ranking is not worth it** —
the win is adding SPEC/strength as *visible, sortable* signals, not swapping the
default sort.

### 4. The "rarity inflation" hypothesis is NOT supported by the data
Hypothesis: rare characters (E.HONDA, DHALSIM) look strong only because opponents
don't know the matchup → flat, uniformly-winning profile. The variance data
refutes this for the headline case:

| Char | mean | std | wins>5.1 / even / loss<4.9 |
|------|------|-----|------|
| DHALSIM | 5.085 | **0.475** | 13 / 3 / 12  ← highly polarized, not flat |
| E.HONDA | 5.058 | 0.216 | 11 / 11 / 6 |
| MAI | 5.055 | 0.143 | 10 / 15 / 3  ← flat |
| SAGAT | 5.040 | 0.124 | 9 / 16 / 3  ← flat |
| JP | 5.033 | 0.277 | 12 / 8 / 8 |

DHALSIM (the most-recommended) is the *most polarized* character, not a flat
"beats-everyone-slightly" one. There is **no clean variance signature** that
isolates unfamiliarity-inflated characters. A "rare-exclusion preset" is
therefore a popularity/preference filter, **not** a data-driven correction — and
the existing per-opponent exclude (u=0) already covers it.

## Recommendation
1. **Add SPEC (specialization) + STR (overall strength) as columns** in the sub
   table (v1 + v2), parity-tested in Python + JS.
2. **Keep COVER as the default ranking**; make the table **sortable** by COVER /
   SPEC / STR so the user can switch lenses.
3. **Do not** add a rare-exclusion preset framed as a bias fix (unjustified);
   the per-opponent exclude already serves popularity filtering.
4. Document SPEC + STR and this study in METHOD.md §8.
