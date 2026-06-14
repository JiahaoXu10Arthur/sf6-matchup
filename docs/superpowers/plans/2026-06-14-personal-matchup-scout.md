# Personal Matchup Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local CLI that ingests your own Capcom Buckler ranked battlelog and reports, per opponent, whether you have a *real* matchup weakness vs the global baseline — separating signal from small-sample noise via Beta-Binomial shrinkage.

**Architecture:** Three layers with strict separation: `bayes.py` (pure stdlib statistics, no I/O), `personal_scout.py` (offline analysis + markdown report, reads your CSV + `output/matrix.csv`), and `fetch_battlelog.py` (the only networked part — Playwright login + battlelog paging, with a pure parser that is fixture-tested). The analysis layer and all tests run with zero third-party dependencies; Playwright is required only to fetch.

**Tech Stack:** Python 3 stdlib (`math`, `csv`, `argparse`, `statistics`); Playwright (Chromium) for the fetch step only; pytest. Reuses the repo's `scripts/analyze.combined_row`, `scripts/scoring.month_weights`, `scripts/roster`.

**Spec:** `docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/bayes.py` | Pure conjugate Beta-Binomial: incomplete-beta CDF, posterior, credible interval, prob-below. No I/O. |
| `scripts/personal_scout.py` | Load personal CSV, aggregate W/L, classify each matchup vs baseline, format the markdown report, CLI. |
| `scripts/fetch_battlelog.py` | `parse_battlelog()` (pure, fixture-tested) + Playwright login/paging glue (manual verification). |
| `tests/test_bayes.py` | Unit tests for the statistics (known conjugate results, CDF identities, shrinkage behaviour). |
| `tests/test_personal_scout.py` | Verdict logic + aggregation + report, against a fixture personal CSV and the real matrix. |
| `tests/test_fetch_battlelog.py` | `parse_battlelog()` against a saved `__NEXT_DATA__` fixture. No live auth. |
| `tests/fixtures/personal_terry.csv` | Small hand-built personal record for scout tests. |
| `tests/fixtures/battlelog_sample.json` | A captured `__NEXT_DATA__` payload (one page) for the parser test. |
| `.gitignore` | Add `data/personal/` so cookies/session/personal data never commit. |

Constants (named, in their modules): `KAPPA = 20.0` (prior strength), `CRED_LEVEL = 0.90`, `DELTA = 0.03` (material gap), `MIN_TRUST = 10` (games), `WEAK_PROB = 0.85` / `STRONG_PROB = 0.15` (verdict thresholds).

---

## Task 1: Incomplete-beta CDF (`scripts/bayes.py`)

**Files:**
- Create: `scripts/bayes.py`
- Test: `tests/test_bayes.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_bayes.py
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from bayes import reg_incomplete_beta


def test_incomplete_beta_uniform_is_identity():
    # I_x(1,1) == x  (Beta(1,1) is Uniform)
    assert reg_incomplete_beta(0.3, 1.0, 1.0) == pytest.approx(0.3, abs=1e-9)


def test_incomplete_beta_endpoints():
    assert reg_incomplete_beta(0.0, 2.0, 5.0) == 0.0
    assert reg_incomplete_beta(1.0, 2.0, 5.0) == 1.0


def test_incomplete_beta_symmetry():
    # I_x(a,b) == 1 - I_(1-x)(b,a)
    x, a, b = 0.4, 3.0, 7.0
    assert reg_incomplete_beta(x, a, b) == pytest.approx(
        1.0 - reg_incomplete_beta(1.0 - x, b, a), abs=1e-12)


def test_incomplete_beta_median_symmetric_beta():
    # Beta(5,5) is symmetric about 0.5 -> CDF(0.5) == 0.5
    assert reg_incomplete_beta(0.5, 5.0, 5.0) == pytest.approx(0.5, abs=1e-9)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_bayes.py -v`
Expected: FAIL — `ImportError: cannot import name 'reg_incomplete_beta'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/bayes.py
"""Pure-stdlib conjugate Beta-Binomial statistics for the personal matchup scout.
No I/O, no third-party deps — fully unit-testable. See
docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md."""
import math

_MAXIT = 200
_EPS = 3e-12
_FPMIN = 1e-300


def _betacf(x, a, b):
    """Continued fraction for the incomplete beta (Lentz's method, NR betacf)."""
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _FPMIN:
        d = _FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, _MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    return h


def reg_incomplete_beta(x, a, b):
    """Regularized incomplete beta I_x(a,b) = CDF of Beta(a,b) at x."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(x, a, b) / a
    return 1.0 - front * _betacf(1.0 - x, b, a) / b
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_bayes.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/bayes.py tests/test_bayes.py
git commit -m "feat(scout): incomplete-beta CDF (stdlib Beta-Binomial core)"
```

---

## Task 2: Posterior, credible interval, prob-below (`scripts/bayes.py`)

**Files:**
- Modify: `scripts/bayes.py`
- Test: `tests/test_bayes.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_bayes.py  (append)
from bayes import (beta_posterior, posterior_mean, beta_ppf,
                   credible_interval, prob_below)


def test_beta_posterior_uniform_prior():
    # p0=0.5, kappa=2 -> Beta(1,1) prior; +7 wins, +3 losses -> Beta(8,4)
    a, b = beta_posterior(0.5, 2.0, 7, 3)
    assert (a, b) == pytest.approx((8.0, 4.0))
    assert posterior_mean(a, b) == pytest.approx(8.0 / 12.0)


def test_beta_ppf_inverts_cdf():
    a, b = 8.0, 4.0
    for q in (0.05, 0.5, 0.95):
        x = beta_ppf(q, a, b)
        assert reg_incomplete_beta(x, a, b) == pytest.approx(q, abs=1e-6)


def test_credible_interval_brackets_mean_and_narrows_with_data():
    # more games -> tighter interval around the same prior mean
    a1, b1 = beta_posterior(0.5, 20.0, 5, 5)
    a2, b2 = beta_posterior(0.5, 20.0, 50, 50)
    lo1, hi1 = credible_interval(a1, b1, 0.90)
    lo2, hi2 = credible_interval(a2, b2, 0.90)
    assert lo1 < posterior_mean(a1, b1) < hi1
    assert (hi2 - lo2) < (hi1 - lo1)


def test_prob_below_equals_cdf():
    a, b = 8.0, 4.0
    assert prob_below(a, b, 0.5) == pytest.approx(reg_incomplete_beta(0.5, a, b))


def test_shrinkage_pulls_toward_prior():
    # raw rate 0.2 over few games stays near the 0.5 baseline prior...
    few = posterior_mean(*beta_posterior(0.5, 20.0, 2, 8))
    # ...but over many games moves toward the raw 0.2
    many = posterior_mean(*beta_posterior(0.5, 20.0, 20, 80))
    assert 0.2 < many < few < 0.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_bayes.py -v`
Expected: FAIL — `ImportError: cannot import name 'beta_posterior'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/bayes.py  (append)

def beta_posterior(p0, kappa, wins, losses):
    """Prior Beta(p0*kappa, (1-p0)*kappa) updated by wins/losses -> posterior (a, b).
    p0 is the baseline win-rate (prior mean); kappa is the prior strength in
    pseudo-games."""
    a0 = p0 * kappa
    b0 = (1.0 - p0) * kappa
    return (a0 + wins, b0 + losses)


def posterior_mean(alpha, beta):
    return alpha / (alpha + beta)


def beta_ppf(q, alpha, beta):
    """Inverse CDF (quantile) of Beta(alpha, beta) by bisection on the CDF."""
    lo, hi = 0.0, 1.0
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        if reg_incomplete_beta(mid, alpha, beta) < q:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def credible_interval(alpha, beta, level=0.90):
    tail = (1.0 - level) / 2.0
    return (beta_ppf(tail, alpha, beta), beta_ppf(1.0 - tail, alpha, beta))


def prob_below(alpha, beta, threshold):
    """Posterior probability that the true rate is below `threshold`."""
    return reg_incomplete_beta(threshold, alpha, beta)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_bayes.py -v`
Expected: PASS (9 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/bayes.py tests/test_bayes.py
git commit -m "feat(scout): Beta-Binomial posterior, credible interval, prob-below"
```

---

## Task 3: Matchup classification (`scripts/personal_scout.py`)

**Files:**
- Create: `scripts/personal_scout.py`
- Test: `tests/test_personal_scout.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_scout.py
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from personal_scout import classify


def test_classify_real_weakness():
    # baseline 0.52, you are 9-15 (24 games) -> credibly and materially below
    r = classify(0.52, 9, 15)
    assert r['verdict'] == 'real weakness'
    assert r['shrunk'] < 0.52
    assert r['n'] == 24


def test_classify_small_sample_not_flagged():
    # 2-6 over 8 games is < MIN_TRUST and shrinks toward baseline -> not a weakness
    r = classify(0.52, 2, 6)
    assert r['verdict'] == 'small sample'


def test_classify_overperforming():
    r = classify(0.48, 30, 10)   # 75% over 40 games vs 0.48 baseline
    assert r['verdict'] == 'overperforming'
    assert r['shrunk'] > 0.48


def test_classify_on_par():
    r = classify(0.50, 20, 20)   # exactly at baseline, plenty of games
    assert r['verdict'] == 'on par'


def test_classify_deficit_ranks_worst_first():
    worse = classify(0.55, 5, 25)      # big, confident deficit
    milder = classify(0.51, 12, 18)    # smaller deficit
    assert worse['deficit'] > milder['deficit']
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_personal_scout.py -v`
Expected: FAIL — `ImportError: cannot import name 'classify'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/personal_scout.py
"""Personal matchup scout: compare your Buckler ranked record to the global
baseline with Beta-Binomial shrinkage and report real weaknesses.
See docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md."""
import argparse
import csv
from collections import defaultdict
from pathlib import Path

from bayes import beta_posterior, posterior_mean, credible_interval, prob_below

ROOT = Path(__file__).resolve().parent.parent

KAPPA = 20.0          # prior strength: baseline counts as ~20 games
CRED_LEVEL = 0.90     # credible-interval coverage
DELTA = 0.03          # min material gap vs baseline (3 percentage points)
MIN_TRUST = 10        # games below which a deviation is "small sample"
WEAK_PROB = 0.85      # P(true < baseline) needed to call a real weakness
STRONG_PROB = 0.15    # symmetric threshold for overperforming


def classify(p0, wins, losses, kappa=KAPPA, level=CRED_LEVEL,
             delta=DELTA, min_trust=MIN_TRUST):
    """Classify one matchup given baseline win-rate p0 and your wins/losses.
    Returns {shrunk, lo, hi, prob_below, n, verdict, deficit}."""
    a, b = beta_posterior(p0, kappa, wins, losses)
    mean = posterior_mean(a, b)
    lo, hi = credible_interval(a, b, level)
    pb = prob_below(a, b, p0)
    n = wins + losses
    if pb >= WEAK_PROB and mean <= p0 - delta:
        verdict = 'real weakness'
    elif pb <= STRONG_PROB and mean >= p0 + delta:
        verdict = 'overperforming'
    elif n < min_trust:
        verdict = 'small sample'
    else:
        verdict = 'on par'
    return {'shrunk': mean, 'lo': lo, 'hi': hi, 'prob_below': pb,
            'n': n, 'verdict': verdict, 'deficit': (p0 - mean) * pb}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_personal_scout.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/personal_scout.py tests/test_personal_scout.py
git commit -m "feat(scout): matchup classification (real weakness vs small sample)"
```

---

## Task 4: Load + aggregate personal record (`scripts/personal_scout.py`)

**Files:**
- Modify: `scripts/personal_scout.py`
- Create: `tests/fixtures/personal_terry.csv`
- Test: `tests/test_personal_scout.py`

- [ ] **Step 1: Create the fixture**

```csv
# tests/fixtures/personal_terry.csv
replay_id,date,your_char,opp_char,rank_mr,result
r1,2026-06-01T10:00:00Z,TERRY,DHALSIM,1480,L
r2,2026-06-01T10:10:00Z,TERRY,DHALSIM,1478,L
r3,2026-06-01T10:20:00Z,TERRY,DHALSIM,1482,W
r4,2026-06-02T10:00:00Z,TERRY,KEN,1490,W
r5,2026-06-02T10:10:00Z,TERRY,KEN,1492,W
r6,2026-06-03T10:00:00Z,LUKE,RYU,1400,L
```

- [ ] **Step 2: Write the failing test**

```python
# tests/test_personal_scout.py  (append)
from personal_scout import load_personal, aggregate

FIX = Path(__file__).resolve().parent / 'fixtures' / 'personal_terry.csv'


def test_load_personal_reads_all_rows():
    rows = load_personal(FIX)
    assert len(rows) == 6
    assert rows[0]['opp_char'] == 'DHALSIM' and rows[0]['result'] == 'L'


def test_aggregate_filters_by_char_and_counts_wl():
    agg = aggregate(load_personal(FIX), 'TERRY')
    assert agg['DHALSIM'] == (1, 2)   # 1 win, 2 losses
    assert agg['KEN'] == (2, 0)
    assert 'RYU' not in agg            # that game was on LUKE, not TERRY
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python3 -m pytest tests/test_personal_scout.py -v`
Expected: FAIL — `ImportError: cannot import name 'load_personal'`

- [ ] **Step 4: Write minimal implementation**

```python
# scripts/personal_scout.py  (append)

def load_personal(path):
    """Read a personal battlelog CSV into a list of row dicts."""
    with open(path, newline='') as fh:
        return [row for row in csv.DictReader(fh)
                if not row['replay_id'].startswith('#')]


def aggregate(rows, char):
    """{opponent: (wins, losses)} for the games you played as `char`."""
    wl = defaultdict(lambda: [0, 0])
    for row in rows:
        if row['your_char'] != char:
            continue
        idx = 0 if row['result'] == 'W' else 1
        wl[row['opp_char']][idx] += 1
    return {opp: (w, l) for opp, (w, l) in wl.items()}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m pytest tests/test_personal_scout.py -v`
Expected: PASS (7 passed)

> Note: the fixture's leading `#` comment row is skipped by `load_personal`; the
> `csv.DictReader` treats it as a data row whose `replay_id` begins with `#`.

- [ ] **Step 6: Commit**

```bash
git add scripts/personal_scout.py tests/test_personal_scout.py tests/fixtures/personal_terry.csv
git commit -m "feat(scout): load + aggregate personal battlelog by character"
```

---

## Task 5: Baseline join + report + CLI (`scripts/personal_scout.py`)

**Files:**
- Modify: `scripts/personal_scout.py`
- Test: `tests/test_personal_scout.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_personal_scout.py  (append)
from personal_scout import baseline_winrates, scout, format_report


def test_baseline_winrates_are_probabilities():
    # combined_row scores are ~5.0-centred /10 -> probabilities near 0.5
    base = baseline_winrates('TERRY', months=None, exclude={'INGRID'})
    assert base, 'TERRY should have baseline opponents'
    assert all(0.2 < p < 0.8 for p in base.values())


def test_scout_produces_verdicts_sorted_worst_first():
    rows = load_personal(FIX)
    base = baseline_winrates('TERRY', months=None, exclude={'INGRID'})
    results = scout(aggregate(rows, 'TERRY'), base)
    # only opponents you have games against AND that exist in the baseline
    names = [r['opp'] for r in results]
    assert 'DHALSIM' in names and 'KEN' in names
    # sorted by deficit descending -> first row has the largest credible deficit
    deficits = [r['deficit'] for r in results]
    assert deficits == sorted(deficits, reverse=True)


def test_format_report_contains_headline_and_table():
    base = baseline_winrates('TERRY', months=None, exclude={'INGRID'})
    results = scout(aggregate(load_personal(FIX), 'TERRY'), base)
    md = format_report('TERRY', results)
    assert '# TERRY' in md
    assert '| Opponent |' in md
    assert 'DHALSIM' in md
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_personal_scout.py -v`
Expected: FAIL — `ImportError: cannot import name 'baseline_winrates'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/personal_scout.py  (append)
from analyze import combined_row
from scoring import month_weights
from roster import PATCH_MONTH

VERDICT_ICON = {'real weakness': '🔴', 'small sample': '⚪',
                'on par': '➖', 'overperforming': '🟢'}


def _matrix_months():
    import csv as _csv
    with (ROOT / 'output' / 'matrix.csv').open() as fh:
        return sorted({r['month'] for r in _csv.DictReader(fh)})


def baseline_winrates(char, months=None, exclude=frozenset({'INGRID'})):
    """{opponent: baseline win-rate (0..1)} for `char` from the COMB matrix,
    `current` month profile by default. combined_row scores are win-rate/10."""
    months = months or _matrix_months()
    mw = month_weights(months, 'current', PATCH_MONTH)
    return {opp: score / 10.0
            for opp, score in combined_row(char, months, mw, set(exclude)).items()}


def scout(personal_agg, baseline):
    """Join your per-opponent record to the baseline; classify each matchup that
    exists in both. Returns result dicts sorted worst-first (by credible deficit)."""
    results = []
    for opp, (wins, losses) in personal_agg.items():
        if opp not in baseline:
            continue
        r = classify(baseline[opp], wins, losses)
        r.update({'opp': opp, 'wins': wins, 'losses': losses,
                  'baseline': baseline[opp]})
        results.append(r)
    results.sort(key=lambda r: r['deficit'], reverse=True)
    return results


def format_report(char, results):
    pct = lambda p: f'{p * 100:.1f}%'
    weaknesses = [r['opp'] for r in results if r['verdict'] == 'real weakness']
    headline = (f'Top weaknesses: {", ".join(weaknesses[:3])}'
                if weaknesses else 'No statistically clear weaknesses found.')
    lines = [
        f'# {char} — personal matchup scout',
        '',
        f'**{headline}**',
        '',
        '| Opponent | Your W-L | Raw% | Shrunk% [90% CI] | Baseline% | Verdict |',
        '|---|---|---|---|---|---|',
    ]
    for r in results:
        raw = r['wins'] / r['n'] if r['n'] else 0.0
        lines.append(
            f"| {r['opp']} | {r['wins']}-{r['losses']} | {pct(raw)} "
            f"| {pct(r['shrunk'])} [{pct(r['lo'])}–{pct(r['hi'])}] "
            f"| {pct(r['baseline'])} | {VERDICT_ICON[r['verdict']]} {r['verdict']} |")
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser(description='Personal matchup scout')
    ap.add_argument('--cfn', required=True, help='your CFN id (names data/personal/{cfn}.csv)')
    ap.add_argument('--char', help='your character (default: your most-played)')
    ap.add_argument('--exclude', nargs='*', default=['INGRID'])
    args = ap.parse_args()

    path = ROOT / 'data' / 'personal' / f'{args.cfn}.csv'
    if not path.exists():
        ap.error(f'no personal data at {path} — run fetch_battlelog.py --cfn {args.cfn} first')
    rows = load_personal(path)
    char = args.char or _most_played(rows)
    if not char:
        ap.error('no matches found; check the CSV')
    agg = aggregate(rows, char)
    base = baseline_winrates(char, exclude=set(args.exclude))
    results = scout(agg, base)
    report = format_report(char, results)
    out = ROOT / 'output' / f'{args.cfn}_scout.md'
    out.write_text(report)
    print(report)
    print(f'-> {out}')


def _most_played(rows):
    counts = defaultdict(int)
    for row in rows:
        counts[row['your_char']] += 1
    return max(counts, key=counts.get) if counts else None


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_personal_scout.py -v`
Expected: PASS (10 passed)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `python3 -m pytest tests/ -q`
Expected: PASS (all prior tests + the new ones)

- [ ] **Step 6: Commit**

```bash
git add scripts/personal_scout.py tests/test_personal_scout.py
git commit -m "feat(scout): baseline join, markdown report, and CLI"
```

---

## Task 6: Battlelog parser (`scripts/fetch_battlelog.py`)

> The parser is pure and fixture-tested. The fixture MUST be a real captured page
> (Step 1) — the exact `replay_list` shape is undocumented, so we pin it to reality
> rather than guess. Keep all Buckler-shape assumptions inside this one function.

**Files:**
- Create: `scripts/fetch_battlelog.py`
- Create: `tests/fixtures/battlelog_sample.json`
- Test: `tests/test_fetch_battlelog.py`

- [ ] **Step 1: Capture a real fixture (manual, one-time)**

Log in to Buckler in your browser, open your ranked battlelog
(`https://www.streetfighter.com/6/buckler/profile/<your_short_id>/battlelog/rank`),
View Source, copy the JSON inside `<script id="__NEXT_DATA__" type="application/json">`,
and save it to `tests/fixtures/battlelog_sample.json`. Then inspect
`props.pageProps.replay_list[0]` and note the actual field names for: each player's
`short_id`, character name, and how win/loss is encoded (e.g. `round_results` arrays
or a `winner`/`battle_result` flag). Record those field names in a comment at the top
of `scripts/fetch_battlelog.py` before writing the parser.

Also reconcile the **character labels** Buckler returns (e.g. `"Vega"`, `"E.Honda"`,
`"C.Viper"`, `"Gouki"`) against the repo's official roster names in `output/matrix.csv`
(`M. BISON`, `E. HONDA`, `C. VIPER`, `AKUMA` — note the spaces). `_official()` below
must produce names that exactly match the matrix, or `scout()` will silently skip those
opponents. Prefer mapping by Buckler's stable `character_id` if the fixture exposes one;
otherwise extend `roster.NAME_BY_SLUG` (or a small id→name table) so every label maps.
Add a parser test asserting a renamed character (e.g. Vega→`M. BISON`) maps correctly.

> If you cannot capture a real fixture, STOP and report — do not invent the schema.

- [ ] **Step 2: Write the failing test (adapt field access to the captured shape)**

```python
# tests/test_fetch_battlelog.py
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from fetch_battlelog import parse_battlelog

FIX = Path(__file__).resolve().parent / 'fixtures' / 'battlelog_sample.json'


def test_parse_battlelog_extracts_rows_for_target_player():
    next_data = json.loads(FIX.read_text())
    # short_id of the profile owner in the captured fixture — fill from the data
    my_short_id = next_data['props']['pageProps']['fighter_banner_info']['personal_info']['short_id']
    rows = parse_battlelog(next_data, my_short_id)
    assert rows, 'fixture should contain at least one replay'
    r = rows[0]
    assert set(r) == {'replay_id', 'date', 'your_char', 'opp_char', 'rank_mr', 'result'}
    assert r['result'] in ('W', 'L')
    assert r['your_char'] and r['opp_char'] and r['your_char'] != r['opp_char']
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python3 -m pytest tests/test_fetch_battlelog.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_battlelog'`

- [ ] **Step 4: Write the parser (using the field names recorded in Step 1)**

```python
# scripts/fetch_battlelog.py
"""Fetch your own Buckler ranked battlelog (Playwright login + paging) and parse it
to a personal CSV. Only this module is networked. parse_battlelog() is pure and
fixture-tested. Field access below matches the captured __NEXT_DATA__ shape (Step 1).
See docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from roster import NAME_BY_SLUG   # map Buckler character slugs/names -> official names

ROOT = Path(__file__).resolve().parent.parent


def _official(name_or_slug):
    """Best-effort map a Buckler character label to the repo's official roster name."""
    key = str(name_or_slug).strip().lower()
    return NAME_BY_SLUG.get(key, str(name_or_slug).strip().upper())


def parse_battlelog(next_data, my_short_id):
    """Pure: extract [{replay_id,date,your_char,opp_char,rank_mr,result}] for the
    profile owner (my_short_id) from one battlelog page's __NEXT_DATA__ dict.

    NOTE: the player-info/result field names below are taken from the captured
    fixture (Task 6 Step 1); adjust the marked lines if your capture differs."""
    replays = next_data['props']['pageProps'].get('replay_list') or []
    out = []
    for rep in replays:
        # --- fields below come from the real fixture; verify against Step 1 ---
        p1, p2 = rep['player1_info'], rep['player2_info']
        if int(p1['player']['short_id']) == int(my_short_id):
            me, opp = p1, p2
        elif int(p2['player']['short_id']) == int(my_short_id):
            me, opp = p2, p1
        else:
            continue
        my_rounds = sum(1 for x in me.get('round_results', []) if x == 1)
        opp_rounds = sum(1 for x in opp.get('round_results', []) if x == 1)
        result = 'W' if my_rounds > opp_rounds else 'L'
        out.append({
            'replay_id': str(rep['replay_id']),
            'date': str(rep.get('uploaded_at', '')),
            'your_char': _official(me['character_name']),
            'opp_char': _official(opp['character_name']),
            'rank_mr': str(me.get('master_rating', '')),
            'result': result,
        })
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m pytest tests/test_fetch_battlelog.py -v`
Expected: PASS (1 passed). If field names differ from the fixture, fix the marked
lines until it passes — the fixture is ground truth.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch_battlelog.py tests/test_fetch_battlelog.py tests/fixtures/battlelog_sample.json
git commit -m "feat(scout): battlelog __NEXT_DATA__ parser (fixture-tested)"
```

---

## Task 7: Playwright fetch glue + gitignore (`scripts/fetch_battlelog.py`)

> This task is networked and auth'd; it is verified manually, not by unit tests
> (the parser it depends on is already tested in Task 6).

**Files:**
- Modify: `scripts/fetch_battlelog.py`
- Modify: `.gitignore`

- [ ] **Step 1: Add the gitignore entry**

Append to `.gitignore`:

```gitignore
# personal scout: your session + match data never leave your machine
data/personal/
```

- [ ] **Step 2: Add Playwright login + paging + CSV writer**

```python
# scripts/fetch_battlelog.py  (append)
import argparse
import csv
import json

PERSONAL_DIR = ROOT / 'data' / 'personal'
SESSION = PERSONAL_DIR / '.session.json'
CSV_FIELDS = ['replay_id', 'date', 'your_char', 'opp_char', 'rank_mr', 'result']
PROFILE_URL = 'https://www.streetfighter.com/6/buckler/profile/{sid}/battlelog/rank?page={page}'
BASE = 'https://www.streetfighter.com/6/buckler/'


def _page_next_data(page):
    """Extract the __NEXT_DATA__ JSON from the current page."""
    raw = page.locator('#__NEXT_DATA__').inner_text()
    return json.loads(raw)


def fetch(short_id, max_pages=20):
    """Log in (persisted session) and page the ranked battlelog into rows."""
    from playwright.sync_api import sync_playwright   # imported lazily: optional dep
    PERSONAL_DIR.mkdir(parents=True, exist_ok=True)
    rows, seen = [], set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = (browser.new_context(storage_state=str(SESSION))
               if SESSION.exists() else browser.new_context())
        page = ctx.new_page()
        page.goto(BASE)
        if 'login' in page.url or not SESSION.exists():
            print('Log in with your Capcom ID in the opened window, then press Enter here…')
            input()
            ctx.storage_state(path=str(SESSION))
        for n in range(1, max_pages + 1):
            page.goto(PROFILE_URL.format(sid=short_id, page=n))
            page.wait_for_selector('#__NEXT_DATA__')
            batch = parse_battlelog(_page_next_data(page), short_id)
            fresh = [r for r in batch if r['replay_id'] not in seen]
            if not fresh:
                break                      # caught up to known history
            seen.update(r['replay_id'] for r in fresh)
            rows.extend(fresh)
            page.wait_for_timeout(1000)    # polite delay
        browser.close()
    return rows


def _merge_csv(path, rows):
    """Append-dedupe rows into the personal CSV (dedupe on replay_id)."""
    existing = {}
    if path.exists():
        with open(path, newline='') as fh:
            for r in csv.DictReader(fh):
                existing[r['replay_id']] = r
    for r in rows:
        existing[r['replay_id']] = r
    with open(path, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        w.writeheader()
        w.writerows(existing.values())
    return len(existing)


def main():
    ap = argparse.ArgumentParser(description='Fetch your Buckler ranked battlelog')
    ap.add_argument('--cfn', required=True, help='your CFN short_id')
    ap.add_argument('--pages', type=int, default=20)
    args = ap.parse_args()
    rows = fetch(args.cfn, args.pages)
    path = PERSONAL_DIR / f'{args.cfn}.csv'
    total = _merge_csv(path, rows)
    print(f'fetched {len(rows)} new matches; {total} total -> {path}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Manual verification**

```bash
pip install playwright && playwright install chromium
python3 scripts/fetch_battlelog.py --cfn <your_short_id> --pages 3
# log in when prompted; expect: "fetched N new matches; M total -> data/personal/<id>.csv"
python3 scripts/personal_scout.py --cfn <your_short_id>
# expect a markdown report with per-opponent verdicts; output/<id>_scout.md written
```
Expected: the CSV exists under `data/personal/` and is gitignored
(`git status` shows nothing under `data/personal/`); the scout prints a report.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch_battlelog.py .gitignore
git commit -m "feat(scout): Playwright battlelog fetch + dedup CSV writer"
```

---

## Task 8: Docs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Document the tool in both READMEs**

Add a "Personal Matchup Scout (local)" subsection under the CLI/pipeline section of
each README, with the two commands and a one-line note that it requires Playwright and
your own Capcom login, runs entirely locally, and never commits your data:

```markdown
### Personal Matchup Scout (local, optional)

Compare *your own* ranked record to the global baseline with Beta-Binomial
confidence. Requires your Capcom login and Playwright (`pip install playwright &&
playwright install chromium`); your session and match data stay on your machine
(`data/personal/`, gitignored).

​```bash
python3 scripts/fetch_battlelog.py --cfn <your_short_id>   # one-time login, then pages your battlelog
python3 scripts/personal_scout.py  --cfn <your_short_id>   # -> output/<id>_scout.md
​```
```

- [ ] **Step 2: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: document the local Personal Matchup Scout"
```

---

## Notes for the implementer

- **Order matters:** Tasks 1→5 are pure/offline and need no login — build and fully test
  them first. Tasks 6–7 touch the live Buckler site; Task 6 Step 1 (capturing a real
  fixture) is a hard prerequisite — do not invent the `replay_list` schema.
- **Zero-dep core:** `bayes.py` and `personal_scout.py` import only stdlib + existing
  repo modules. Only `fetch_battlelog.py` imports Playwright, and it does so lazily so
  the analysis + tests run without it installed.
- **Never commit personal data:** verify `git status` is clean under `data/personal/`
  after fetching.
- **Exit criterion:** `python3 -m pytest tests/ -q` green (all existing + new tests),
  and a manual `fetch → scout` round-trip produces a report.
