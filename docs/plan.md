# SF6 Matchup Aggregation + Complementary Sub Recommendation Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reproducible pipeline that, for ANY SF6 character and ANY month range, aggregates kakuhanapp.com matchup data across 3 rank tiers and produces (a) a combined matchup table and (b) a complementary sub-character recommendation — run first for TERRY over Jan–May 2026.

**Architecture:** Download raw monthly HTML per (character, rank, month) into `data/` (cache, never re-fetched). Parse all files into one long-format `output/matrix.csv`. Two CLI tools read the matrix: `analyze.py` (per-character matchup table) and `recommend.py` (sub recommendation). All scoring is in pure, tested functions in `scoring.py`. Character, months, weight profile, and exclusions are CLI parameters — nothing is Terry-specific.

**Tech Stack:** Python 3 stdlib only (urllib, csv, re, argparse). pytest for tests. No third-party deps.

---

## Background facts (verified 2026-06-13)

- **Data source:** `https://kakuhanapp.com/matchup/master/?month={M}&rank={R}&tool={slug}` — server-rendered HTML derived from Capcom's official Buckler battle diagrams. Scores are win-rate/10 on a 5.0-centered scale (5.237 = 52.37% win rate). Site tiers: ≥5.3 adv, ≥5.1 slight adv, ≥4.9 even, ≥4.7 slight dis, <4.7 dis.
- **Ranks:** 36=Master, 40=High Master, 41=Grand Master, 42=Ultimate Master. We use 40/41/42 with population weights 3:2:1 (HighM largest, UltM noisiest).
- **Roster:** 30 characters. Page alt-text names are uppercase display names; URL slugs are lowercase and sometimes differ (`aki`→`A.K.I.`, `deejay`→`DEE JAY`, `honda`→`E.HONDA`, `chunli`→`CHUN-LI`, `cviper`→`C.VIPER`). Each character page lists 29 opponents.
- **Balance timeline (drives month weighting):**
  - **2026-03-17: major balance patch** touching every character (shipped with ALEX's release).
  - **2026-05-27/28: INGRID released**, with only a minor system patch.
  - So 202601–202602 = pre-patch meta, 202603 = transitional (patch mid-month), 202604–202605 = current meta. ALEX has data from 202603 (partial month); INGRID has only days of 202605 data (very noisy — excluded by default per user preference).
- **HTML parse anchors (verified against cached files):** matchup cards match
  `alt="([^"]+)">\s*<div class="card-body[^>]*>\s*<div class="text-muted small">([\d.]+)</div>` — 29 hits, no duplicates. Selected page params appear as `<option value="..." selected` (month, rank, slug) — used to detect mislabeled/fallback pages.
- **Reusable cache from 2026-06-12 session in `/tmp/kaku/`:** `mx_{slug}_{month}.html` = rank 41, months 202603–202605, 29 non-Terry chars (87 files); `terry_{rank}_{month}.html` = ranks 40/41/42 × 202603–202605 (9 files). Verified rank-41 via embedded selected option.
- **No sample sizes available:** the 件 counts on the page are forum post counts, not match counts. No sample-size weighting is possible; tier weights 3:2:1 are the population proxy.

## Method decisions (confirmed with Anon 2026-06-13)

1. **Month combination:** configurable weight profiles because a major patch splits the window.
   - `all`: equal weight across requested months (the "combined Jan–May" view).
   - `current` (default for rankings): pre-patch months weight 0, patch month (202603) weight 0.5, post-patch weight 1. If every requested month is pre-patch, falls back to equal weights.
   - Time range is a CLI parameter (`--months 202601-202605`), so future ranges need no code change.
   - **Custom weights:** `--weights 202601=0,202602=0,202603=0.5,202604=1,202605=1` overrides the profile. Internally every function takes a plain `{month: weight}` dict — this is the recalculation API a future interactive web app will call (adjust sliders → new dict → recompute from `matrix.csv`). No web code is built now; the pure-function + CSV split is the only accommodation.
   - Meta drift reported separately as **Δpatch** = (GrandM post-patch avg) − (GrandM pre-patch avg) per opponent.
2. **Tiers:** matrix downloaded for all 3 tiers (40/41/42). Outputs show per-tier scores AND the 3:2:1 combined score.
3. **New characters:** included with whatever months exist; each row carries a months-coverage count (e.g. ALEX 3/5). INGRID excluded by default (`--exclude INGRID`) but overridable.
4. **Sub recommendation:** coverage score with squared weakness weighting (carried over from approved 2026-06-12 design):
   `COVER = Σ w(O)·(sub_vs_O − 5.0) / Σ w(O)` where `w(O) = max(0, 5.0 − main_vs_O)²` — only the main's losing matchups count, weighted by severity squared. Plus complementarity checks: Pearson correlation of full matchup rows (negative = complementary), shared-weakness count (<4.9 both), and w3win% (avg win rate vs main's 3 worst).

## Exit criteria (external checks, all must pass)

1. `pytest tests/ -v` — all green.
2. `build_matrix.py` anti-symmetry check: **median** deviation < 0.05 across all paired (month, rank) cells. (Max deviation is NOT a criterion: verified against raw HTML that the source itself is asymmetric — Buckler diagrams are computed per main-character player population, so A-vs-B from A's page ≠ 10 − B-vs-A from B's page exactly; partial-data run showed median 0.028, p90 0.08, max 0.227 with the worst pairs on low-population characters like INGRID. Pair deviations > 0.2 are printed for awareness.)
3. `output/TERRY_202601-202605_{current,all}.md` and `output/TERRY_subs_202601-202605_{current,all}.md` exist with ≥ 28 opponent rows each (filenames carry the month scope to prevent silent clobbering between runs).
4. Reproducibility spot-check: `analyze.py --char KEN ...` produces a KEN table with zero code changes.

## File structure

```
sf6-matchup/
├── README.md                  # how to run the pipeline for any character/range
├── docs/
│   ├── plan.md                # this file
│   ├── findings-2026-06-12.md # prior session methodology notes (provenance)
│   └── METHOD.md              # final methodology writeup
├── scripts/
│   ├── roster.py              # slug/name maps, rank constants, patch month
│   ├── parse.py               # HTML → {opponent: score}
│   ├── scoring.py             # pure math: weights, averages, coverage, correlation
│   ├── download.py            # fetch missing (char, rank, month) pages into data/
│   ├── build_matrix.py        # data/*.html → output/matrix.csv + anti-symmetry check
│   ├── analyze.py             # per-character matchup table CLI
│   └── recommend.py           # sub recommendation CLI
├── tests/
│   ├── fixtures/aki_41_202605.html
│   ├── test_parse.py
│   └── test_scoring.py
├── data/                      # raw HTML cache (gitignored)
└── output/                    # matrix.csv + result tables
```

---

### Task 1: Scaffold, git init, roster constants

**Files:**
- Create: `.gitignore`, `scripts/roster.py`
- Copy: `/tmp/kaku/FINDINGS.md` → `docs/findings-2026-06-12.md`

- [ ] **Step 1: git init and .gitignore**

```bash
cd ~/Desktop/sf6-matchup && git init
printf 'data/\n__pycache__/\n.pytest_cache/\n' > .gitignore
cp /tmp/kaku/FINDINGS.md docs/findings-2026-06-12.md
```

- [ ] **Step 2: Write `scripts/roster.py`**

```python
NAME_BY_SLUG = {
    'luke': 'LUKE', 'jamie': 'JAMIE', 'manon': 'MANON', 'kimberly': 'KIMBERLY',
    'marisa': 'MARISA', 'lily': 'LILY', 'jp': 'JP', 'juri': 'JURI',
    'deejay': 'DEE JAY', 'cammy': 'CAMMY', 'ryu': 'RYU', 'honda': 'E.HONDA',
    'blanka': 'BLANKA', 'guile': 'GUILE', 'ken': 'KEN', 'chunli': 'CHUN-LI',
    'zangief': 'ZANGIEF', 'dhalsim': 'DHALSIM', 'rashid': 'RASHID',
    'aki': 'A.K.I.', 'ed': 'ED', 'gouki': 'GOUKI', 'vega': 'VEGA',
    'mai': 'MAI', 'elena': 'ELENA', 'sagat': 'SAGAT', 'cviper': 'C.VIPER',
    'alex': 'ALEX', 'ingrid': 'INGRID', 'terry': 'TERRY',
}
SLUG_BY_NAME = {v: k for k, v in NAME_BY_SLUG.items()}
RANKS = {40: 'HighM', 41: 'GrandM', 42: 'UltM'}
TIER_WEIGHTS = {40: 3, 41: 2, 42: 1}
PATCH_MONTH = '202603'  # major all-character balance patch landed 2026-03-17
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold sf6-matchup project with roster constants"
```

### Task 2: parse.py (TDD)

**Files:**
- Create: `tests/fixtures/aki_41_202605.html`, `tests/test_parse.py`, `scripts/parse.py`

- [ ] **Step 1: Copy fixture**

```bash
cp /tmp/kaku/mx_aki_202605.html tests/fixtures/aki_41_202605.html
```

- [ ] **Step 2: Write failing test `tests/test_parse.py`**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from parse import parse_matchups, parse_selected_params

FIXTURE = (Path(__file__).parent / 'fixtures' / 'aki_41_202605.html').read_text()


def test_parses_all_29_opponents():
    m = parse_matchups(FIXTURE)
    assert len(m) == 29
    assert 'TERRY' in m and 'CHUN-LI' in m and 'DEE JAY' in m


def test_scores_are_plausible_floats():
    m = parse_matchups(FIXTURE)
    assert all(3.0 < v < 7.0 for v in m.values())


def test_empty_page_returns_empty_dict():
    assert parse_matchups('<html><body>no data</body></html>') == {}


def test_selected_params_match_page():
    assert parse_selected_params(FIXTURE) == ('202605', '41', 'aki')
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python3 -m pytest tests/test_parse.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'parse'`

- [ ] **Step 4: Write `scripts/parse.py`**

```python
import re

CARD_RE = re.compile(
    r'alt="([^"]+)">\s*<div class="card-body[^>]*>\s*'
    r'<div class="text-muted small">([\d.]+)</div>'
)
SELECTED_RE = re.compile(r'<option value="([^"]+)" selected')


def parse_matchups(html):
    """Return {opponent_display_name: score}. Empty dict when the page has
    no matchup data (character not yet released that month)."""
    return {name: float(score) for name, score in CARD_RE.findall(html)}


def parse_selected_params(html):
    """Return the page's own (month, rank, slug) from its selected <option>s.
    Raises StopIteration if the page lacks them (treated as no-data upstream)."""
    vals = SELECTED_RE.findall(html)
    month = next(v for v in vals if re.fullmatch(r'\d{6}', v))
    rank = next(v for v in vals if re.fullmatch(r'\d{2}', v))
    slug = next(v for v in vals if re.fullmatch(r'[a-z]+', v))
    return month, rank, slug
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m pytest tests/test_parse.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add tests scripts/parse.py && git commit -m "feat: HTML matchup parser with page-param sanity extraction"
```

### Task 3: scoring.py (TDD)

**Files:**
- Create: `tests/test_scoring.py`, `scripts/scoring.py`

- [ ] **Step 1: Write failing test `tests/test_scoring.py`**

```python
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from scoring import (month_weights, wavg, coverage, correlation,
                     shared_weaknesses, expand_months)

MONTHS = ['202601', '202602', '202603', '202604', '202605']


def test_month_weights_all_profile_is_equal():
    assert month_weights(MONTHS, 'all', '202603') == {m: 1.0 for m in MONTHS}


def test_month_weights_current_profile_zeroes_prepatch():
    w = month_weights(MONTHS, 'current', '202603')
    assert w == {'202601': 0.0, '202602': 0.0, '202603': 0.5,
                 '202604': 1.0, '202605': 1.0}


def test_month_weights_current_falls_back_when_all_prepatch():
    w = month_weights(['202601', '202602'], 'current', '202603')
    assert w == {'202601': 1.0, '202602': 1.0}


def test_wavg_weighted_average():
    assert wavg({'a': 4.0, 'b': 6.0}, {'a': 1.0, 'b': 3.0}) == pytest.approx(5.5)


def test_wavg_ignores_zero_weight_and_missing_keys():
    assert wavg({'a': 4.0, 'b': 9.9}, {'a': 2.0, 'b': 0.0}) == pytest.approx(4.0)
    assert wavg({}, {'a': 1.0}) is None


def test_coverage_only_counts_main_losing_matchups():
    main = {'A': 4.5, 'B': 5.5}          # only A is a weakness, w = 0.25
    sub = {'A': 6.0, 'B': 4.0}           # sub edge vs A = +1.0
    assert coverage(main, sub) == pytest.approx(1.0)


def test_coverage_squared_weights_dominated_by_worst_matchup():
    main = {'A': 4.0, 'B': 4.9}          # w(A)=1.0, w(B)=0.01
    sub = {'A': 5.0, 'B': 9.0}           # B's huge edge barely matters
    assert coverage(main, sub) == pytest.approx((0.0 + 0.01 * 4.0) / 1.01)


def test_correlation_perfect_anticorrelation():
    a = {'x': 4.0, 'y': 5.0, 'z': 6.0}
    b = {'x': 6.0, 'y': 5.0, 'z': 4.0}
    assert correlation(a, b) == pytest.approx(-1.0)


def test_shared_weaknesses():
    a = {'x': 4.5, 'y': 4.5, 'z': 5.5}
    b = {'x': 4.8, 'y': 5.2, 'z': 4.0}
    assert shared_weaknesses(a, b) == ['x']


def test_expand_months_range_and_cross_year():
    assert expand_months(['202601-202605']) == MONTHS
    assert expand_months(['202511-202602']) == ['202511', '202512', '202601', '202602']
    assert expand_months(['202604', '202605']) == ['202604', '202605']


def test_parse_weights_custom_spec():
    from scoring import parse_weights
    assert parse_weights('202601=0,202603=0.5,202605=1') == {
        '202601': 0.0, '202603': 0.5, '202605': 1.0}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_scoring.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scoring'`

- [ ] **Step 3: Write `scripts/scoring.py`**

```python
from statistics import fmean


def expand_months(args):
    """['202601-202605'] or ['202604', '202605'] -> explicit month list."""
    out = []
    for a in args:
        if '-' in a:
            lo, hi = a.split('-')
            y, mo = int(lo[:4]), int(lo[4:])
            while f'{y}{mo:02d}' <= hi:
                out.append(f'{y}{mo:02d}')
                mo += 1
                if mo == 13:
                    y, mo = y + 1, 1
        else:
            out.append(a)
    return out


def month_weights(months, profile, patch_month):
    if profile == 'all':
        return {m: 1.0 for m in months}
    if profile == 'current':
        w = {m: 0.0 if m < patch_month else 0.5 if m == patch_month else 1.0
             for m in months}
        return w if any(w.values()) else {m: 1.0 for m in months}
    raise ValueError(f'unknown profile: {profile}')


def parse_weights(spec):
    """'202601=0,202603=0.5' -> {'202601': 0.0, '202603': 0.5}.
    The {month: weight} dict is the recalculation input shared by the CLIs
    and any future interactive frontend."""
    return {m: float(w) for part in spec.split(',')
            for m, w in [part.split('=')]}


def wavg(scores, weights):
    """Weighted average of scores over keys with nonzero weight; None if empty."""
    pairs = [(scores[k], weights[k]) for k in scores if weights.get(k)]
    if not pairs:
        return None
    return sum(s * w for s, w in pairs) / sum(w for _, w in pairs)


def coverage(main_row, sub_row):
    """Sub coverage of main's weaknesses.
    COVER = sum(w(O) * (sub_vs_O - 5)) / sum(w(O)), w(O) = max(0, 5 - main_vs_O)^2."""
    num = den = 0.0
    for opp, ms in main_row.items():
        w = max(0.0, 5.0 - ms) ** 2
        if w and opp in sub_row:
            num += w * (sub_row[opp] - 5.0)
            den += w
    return num / den if den else 0.0


def correlation(a, b):
    """Pearson correlation over shared opponents. Negative = complementary."""
    keys = sorted(set(a) & set(b))
    xs, ys = [a[k] for k in keys], [b[k] for k in keys]
    mx, my = fmean(xs), fmean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / (sxx * syy) ** 0.5 if sxx and syy else 0.0


def shared_weaknesses(a, b, thresh=4.9):
    return sorted(k for k in set(a) & set(b) if a[k] < thresh and b[k] < thresh)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_scoring.py -v`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add tests/test_scoring.py scripts/scoring.py && git commit -m "feat: scoring math - month weights, coverage, correlation"
```

### Task 4: Seed cache + download remaining pages

**Files:**
- Create: `scripts/download.py`
- Populate: `data/` (450 files total = 30 chars × 3 ranks × 5 months)

- [ ] **Step 1: Seed `data/` from the 2026-06-12 session cache**

```bash
cd ~/Desktop/sf6-matchup
for f in /tmp/kaku/mx_*.html; do
  b=$(basename "$f" .html)        # mx_{slug}_{month}
  slug_month=${b#mx_}             # {slug}_{month}
  slug=${slug_month%_*}; month=${slug_month##*_}
  cp "$f" "data/${slug}_41_${month}.html"
done
for f in /tmp/kaku/terry_*.html; do cp "$f" data/; done
ls data | wc -l
```

Expected: `96`

- [ ] **Step 2: Write `scripts/download.py`**

```python
import argparse
import time
import urllib.error
import urllib.request
from pathlib import Path

from roster import NAME_BY_SLUG

BASE = 'https://kakuhanapp.com/matchup/master/?month={month}&rank={rank}&tool={slug}'
DATA = Path(__file__).resolve().parent.parent / 'data'
RETRY_DELAY = 5


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=30).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--months', nargs='+', required=True,
                    help='e.g. 202601-202605 or explicit months')
    ap.add_argument('--ranks', nargs='+', type=int, default=[40, 41, 42])
    ap.add_argument('--chars', nargs='+', default=sorted(NAME_BY_SLUG))
    args = ap.parse_args()
    from scoring import expand_months
    months = expand_months(args.months)
    todo = [(s, r, m) for s in args.chars for r in args.ranks for m in months
            if not (DATA / f'{s}_{r}_{m}.html').exists()]
    print(f'{len(todo)} pages to fetch')
    for i, (slug, rank, month) in enumerate(todo, 1):
        url = BASE.format(month=month, rank=rank, slug=slug)
        note = ''
        try:
            body = fetch(url)
        except urllib.error.HTTPError:
            time.sleep(RETRY_DELAY)
            try:
                body = fetch(url)
            except urllib.error.HTTPError as e:
                # server has no page for this combo (e.g. pre-release months);
                # empty marker keeps reruns idempotent, build_matrix reports it
                body = b''
                note = f' -> no data (HTTP {e.code})'
        (DATA / f'{slug}_{rank}_{month}.html').write_bytes(body)
        print(f'[{i}/{len(todo)}] {slug} rank={rank} month={month}{note}', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
```

Note: kakuhanapp returns HTTP 500 for combos where the character wasn't released yet (alex pre-202603, ingrid pre-202605). Persistent HTTP errors become empty marker files; build_matrix reports them as skips. Expected no-data combos: alex×{202601,202602} and ingrid×{202601..202604} across 3 ranks = 18 files.

- [ ] **Step 3: Run download in background (≈354 fetches, ~10–15 min at 1 req/s)**

```bash
cd ~/Desktop/sf6-matchup/scripts && python3 download.py --months 202601-202605
```

Expected final state: `ls ~/Desktop/sf6-matchup/data | wc -l` → `450`

- [ ] **Step 4: Commit (script only; data/ is gitignored)**

```bash
git add scripts/download.py && git commit -m "feat: idempotent kakuhanapp page downloader"
```

### Task 5: build_matrix.py + anti-symmetry validation

**Files:**
- Create: `scripts/build_matrix.py`
- Output: `output/matrix.csv`

- [ ] **Step 1: Write `scripts/build_matrix.py`**

```python
import csv
from pathlib import Path

from parse import parse_matchups, parse_selected_params
from roster import NAME_BY_SLUG

ROOT = Path(__file__).resolve().parent.parent


def main():
    rows, skipped = [], []
    for f in sorted((ROOT / 'data').glob('*.html')):
        slug, rank, month = f.stem.split('_')
        html = f.read_text(errors='replace')
        matchups = parse_matchups(html)
        if not matchups:
            skipped.append((f.name, 'no matchup data'))
            continue
        try:
            sel = parse_selected_params(html)
        except StopIteration:
            sel = None
        if sel != (month, rank, slug):
            # server fell back to a default page; data would be mislabeled
            skipped.append((f.name, f'page params {sel} != filename'))
            continue
        for opp, score in matchups.items():
            rows.append((month, rank, NAME_BY_SLUG[slug], opp, score))

    out = ROOT / 'output' / 'matrix.csv'
    with out.open('w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['month', 'rank', 'char', 'opp', 'score'])
        w.writerows(rows)

    by_key = {(m, r, a, b): s for m, r, a, b, s in rows}
    devs = [abs(s + by_key[(m, r, b, a)] - 10.0)
            for (m, r, a, b), s in by_key.items() if (m, r, b, a) in by_key]
    print(f'{len(rows)} rows -> {out}')
    for name, why in skipped:
        print(f'  skipped {name}: {why}')
    print(f'anti-symmetry: {len(devs)} pairs, max deviation {max(devs):.4f}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run after download completes**

Run: `cd ~/Desktop/sf6-matchup/scripts && python3 build_matrix.py`
Expected: ~12,000+ rows; skipped entries only for pre-release months (alex 202601/202602, ingrid 202601–202604); **median** anti-symmetry deviation < 0.05 (max may reach ~0.25 on low-population characters — genuine source asymmetry, verified against raw HTML; see exit criterion 2). If the MEDIAN is large or any single file's pairs deviate en masse, STOP and inspect that file before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/build_matrix.py output/matrix.csv && git commit -m "feat: long-format matchup matrix with anti-symmetry validation"
```

### Task 6: analyze.py — per-character matchup table

**Files:**
- Create: `scripts/analyze.py`
- Output: `output/TERRY_current.md`, `output/TERRY_all.md`

- [ ] **Step 1: Write `scripts/analyze.py`**

```python
import argparse
import csv
from collections import defaultdict
from pathlib import Path

from roster import PATCH_MONTH, TIER_WEIGHTS
from scoring import expand_months, month_weights, parse_weights, wavg

ROOT = Path(__file__).resolve().parent.parent

_MATRIX = None


def _matrix():
    global _MATRIX
    if _MATRIX is None:
        with (ROOT / 'output' / 'matrix.csv').open() as fh:
            _MATRIX = list(csv.DictReader(fh))
    return _MATRIX


def load(char, months, exclude):
    """matrix.csv -> {opp: {rank: {month: score}}} for one character."""
    d = defaultdict(lambda: defaultdict(dict))
    for row in _matrix():
        if (row['char'] == char and row['month'] in months
                and row['opp'] not in exclude):
            d[row['opp']][int(row['rank'])][row['month']] = float(row['score'])
    return d


def combined_row(char, months, mw, exclude, ranks=None):
    """{opp: tier-combined score} — the character's matchup vector.
    mw is a {month: weight} dict; pass any dict to recalculate (web-app API)."""
    ranks = ranks or list(TIER_WEIGHTS)
    out = {}
    for opp, byrank in load(char, months, exclude).items():
        present = {r: v for r in ranks
                   if (v := wavg(byrank.get(r, {}), mw)) is not None}
        if present:
            out[opp] = (sum(v * TIER_WEIGHTS[r] for r, v in present.items())
                        / sum(TIER_WEIGHTS[r] for r in present))
    return out


def resolve_weights(args, months):
    """CLI args -> ({month: weight}, label). --weights overrides --profile."""
    if args.weights:
        return parse_weights(args.weights), 'custom'
    return month_weights(months, args.profile, PATCH_MONTH), args.profile


def char_table(char, months, mw, exclude):
    data = load(char, months, exclude)
    rows = []
    for opp, byrank in data.items():
        tier = {r: wavg(byrank.get(r, {}), mw) for r in TIER_WEIGHTS}
        present = {r: v for r, v in tier.items() if v is not None}
        if not present:
            continue
        comb = (sum(v * TIER_WEIGHTS[r] for r, v in present.items())
                / sum(TIER_WEIGHTS[r] for r in present))
        spread = max(present.values()) - min(present.values())
        g = byrank.get(41, {})
        pre = [v for m, v in g.items() if m < PATCH_MONTH]
        post = [v for m, v in g.items() if m > PATCH_MONTH]
        dpatch = (sum(post) / len(post) - sum(pre) / len(pre)) if pre and post else None
        nmonths = len({m for r in byrank.values() for m in r})
        rows.append((opp, tier[40], tier[41], tier[42], comb, spread, dpatch, nmonths))
    rows.sort(key=lambda r: r[4])
    return rows


def fmt(v, nd=3):
    return f'{v:.{nd}f}' if v is not None else '—'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--char', required=True)
    ap.add_argument('--months', nargs='+', required=True)
    ap.add_argument('--profile', choices=['all', 'current'], default='current')
    ap.add_argument('--weights', help='custom {month}={weight} CSV, overrides --profile')
    ap.add_argument('--exclude', nargs='*', default=['INGRID'])
    args = ap.parse_args()
    months = expand_months(args.months)
    mw, label = resolve_weights(args, months)
    rows = char_table(args.char, months, mw, set(args.exclude))
    if not rows:
        ap.error(f'no data for character {args.char!r} — check spelling and month range')

    lines = [
        f'# {args.char} matchups — months {months[0]}–{months[-1]}, '
        f'profile={label}, tiers 3:2:1 (HighM:GrandM:UltM)',
        '',
        '| Opponent | HighM | GrandM | UltM | COMB | spread | Δpatch | months |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for opp, t40, t41, t42, comb, spread, dpatch, nm in rows:
        noisy = ' ⚠' if spread > 0.25 else ''
        lines.append(
            f'| {opp} | {fmt(t40)} | {fmt(t41)} | {fmt(t42)} | **{comb:.3f}**'
            f'{noisy} | {spread:.3f} | {fmt(dpatch, 3)} | {nm}/{len(months)} |')
    text = '\n'.join(lines) + '\n'
    out = ROOT / 'output' / f'{args.char}_{months[0]}-{months[-1]}_{label}.md'
    out.write_text(text)
    print(text)
    print(f'-> {out}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run for TERRY, both profiles**

```bash
cd ~/Desktop/sf6-matchup/scripts
python3 analyze.py --char TERRY --months 202601-202605 --profile current
python3 analyze.py --char TERRY --months 202601-202605 --profile all
```

Expected: 28 rows each (29 opponents − INGRID). Sanity anchor against the Mar–May session: in the `current` profile CHUN-LI, GUILE, JP should be at/near the bottom with COMB ≈ 4.80–4.90. ALEX shows `3/5` months, ⚠ flags only where spread > 0.25.

- [ ] **Step 3: Reproducibility spot-check (exit criterion 4)**

Run: `python3 analyze.py --char KEN --months 202601-202605 --profile current`
Expected: a KEN table renders with no code change.

- [ ] **Step 4: Commit**

```bash
git add scripts/analyze.py output/TERRY_current.md output/TERRY_all.md
git commit -m "feat: per-character matchup table CLI (tiered, patch-aware)"
```

### Task 7: recommend.py — complementary sub recommendation

**Files:**
- Create: `scripts/recommend.py`
- Output: `output/TERRY_subs_current.md`, `output/TERRY_subs_all.md`

- [ ] **Step 1: Write `scripts/recommend.py`**

```python
import argparse
from pathlib import Path

from analyze import combined_row, fmt, resolve_weights
from roster import NAME_BY_SLUG
from scoring import correlation, coverage, expand_months, shared_weaknesses

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--char', required=True)
    ap.add_argument('--months', nargs='+', required=True)
    ap.add_argument('--profile', choices=['all', 'current'], default='current')
    ap.add_argument('--weights', help='custom {month}={weight} CSV, overrides --profile')
    ap.add_argument('--exclude', nargs='*', default=['INGRID'])
    args = ap.parse_args()
    months = expand_months(args.months)
    exclude = set(args.exclude)
    mw, label = resolve_weights(args, months)

    main_row = combined_row(args.char, months, mw, exclude)
    if not main_row:
        ap.error(f'no data for character {args.char!r} — check spelling and month range')
    worst3 = sorted(main_row, key=main_row.get)[:3]
    candidates = [n for n in NAME_BY_SLUG.values()
                  if n != args.char and n not in exclude]

    results = []
    for sub in candidates:
        row = combined_row(sub, months, mw, exclude)
        if not row:
            continue
        per_tier = {r: coverage(main_row,
                                combined_row(sub, months, mw,
                                             exclude, ranks=[r]))
                    for r in (40, 41, 42)}
        w3 = [row[o] for o in worst3 if o in row]
        results.append({
            'sub': sub,
            'cover': coverage(main_row, row),
            'c40': per_tier[40], 'c41': per_tier[41], 'c42': per_tier[42],
            'w3win': sum(w3) / len(w3) * 10 if w3 else None,
            'corr': correlation(main_row, row),
            'shared': len(shared_weaknesses(main_row, row)),
        })
    results.sort(key=lambda r: r['cover'], reverse=True)

    lines = [
        f'# Sub recommendation for {args.char} — months {months[0]}–{months[-1]}, '
        f'profile={label}',
        '',
        f'Weakness weights from {args.char} COMB row; worst 3: '
        + ', '.join(f'{o} ({main_row[o]:.3f})' for o in worst3),
        '',
        'COVER: weakness-weighted edge (higher = better patch for bad matchups). '
        'corr: matchup-profile correlation (negative = complementary). '
        'shared: count of opponents both characters lose to (<4.9). '
        'w3win%: avg win rate vs the worst 3.',
        '',
        '| Sub | COVER | COVER@HighM | COVER@GrandM | COVER@UltM | w3win% | corr | shared |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for r in results:
        lines.append(
            f"| {r['sub']} | **{r['cover']:+.3f}** | {r['c40']:+.3f} "
            f"| {r['c41']:+.3f} | {r['c42']:+.3f} | {fmt(r['w3win'], 1)} "
            f"| {r['corr']:+.2f} | {r['shared']} |")
    text = '\n'.join(lines) + '\n'
    out = ROOT / 'output' / f'{args.char}_subs_{months[0]}-{months[-1]}_{label}.md'
    out.write_text(text)
    print(text)
    print(f'-> {out}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run for TERRY, both profiles**

```bash
cd ~/Desktop/sf6-matchup/scripts
python3 recommend.py --char TERRY --months 202601-202605 --profile current
python3 recommend.py --char TERRY --months 202601-202605 --profile all
```

Expected: ranked table of 28 candidates. Sanity anchor: in the Mar–May session the top COVER candidates were DHALSIM, JP, VEGA and the worst were RYU/GUILE/JURI — the `current` profile should be in the same neighborhood; the `all` profile may differ (pre-patch meta).

- [ ] **Step 3: Commit**

```bash
git add scripts/recommend.py output/TERRY_subs_current.md output/TERRY_subs_all.md
git commit -m "feat: complementary sub recommendation CLI"
```

### Task 8: METHOD.md, README, final verification

**Files:**
- Create: `docs/METHOD.md`, `README.md`

- [ ] **Step 1: Write `docs/METHOD.md`** — document, in prose: data source and scale; 30-char roster and slug mapping; rank tiers and the 3:2:1 rationale; the 2026-03-17 patch and 2026-05-27 Ingrid release with sources; month weight profiles (`all` vs `current`) and why both are emitted; Δpatch definition; COVER/corr/shared/w3win definitions with formulas; known limitations (no sample sizes — 件 counts are forum posts; Ingrid ~3 days of data; March is a mixed pre/post-patch month; UltM small-population noise). Write actual content based on this plan's Background and Method sections — do not stub.

- [ ] **Step 2: Write `README.md`** — quickstart:

````markdown
# sf6-matchup

Reproducible SF6 matchup aggregation + complementary sub-character
recommendation from kakuhanapp.com (Capcom Buckler-derived) data.

```bash
cd scripts
python3 download.py     --months 202601-202605            # fetch raw pages (idempotent cache)
python3 build_matrix.py                                   # data/ -> output/matrix.csv
python3 analyze.py   --char TERRY --months 202601-202605 --profile current
python3 recommend.py --char TERRY --months 202601-202605 --profile current
```

Any character (`--char KEN`), any range (`--months 202509-202605`),
`--profile all|current` or fully custom month weights
(`--weights 202601=0,202603=0.5,202604=1,202605=1`), `--exclude` to drop
opponents/candidates (default: INGRID). Method details: docs/METHOD.md.
````

- [ ] **Step 3: Run full exit-criteria check**

```bash
cd ~/Desktop/sf6-matchup
python3 -m pytest tests/ -v                # 16 tests, all green
ls output/TERRY_current.md output/TERRY_all.md \
   output/TERRY_subs_current.md output/TERRY_subs_all.md
```

Expected: 16 tests passed; all 4 output files present.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: methodology writeup and quickstart README"
```

---

## Self-review notes

- Spec coverage: combine-from-Jan ✓ (profile `all`), complementary sub rec ✓ (Task 7), reproducible per character ✓ (CLI `--char`, spot-checked with KEN), time range changeable ✓ (`--months`, `expand_months`), all 3 tiers separately + combined ✓ (per-tier columns and COVER@tier), new chars/patch handling ✓ (coverage counts, weight profiles, Δpatch), project folder ✓.
- Type consistency: `combined_row(char, months, mw, exclude, ranks)` and `resolve_weights(args, months)` defined in Task 6, consumed in Task 7 with the same signatures; `fmt` imported from analyze; `expand_months`/`parse_weights` live in scoring.
- Future web app: scoring is pure functions over a `{month: weight}` dict + `matrix.csv` — an interactive frontend recalculates by calling `combined_row`/`char_table`/`coverage` with a new dict. `--weights` exposes the same path from the CLI today. No web code in this plan (YAGNI).
- Known risk: if kakuhanapp serves a fallback page for pre-release (char, month) combos, the selected-params check in Task 5 quarantines it as skipped rather than ingesting mislabeled data.
