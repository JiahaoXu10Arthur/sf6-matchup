# SF6 Matchup Lab

**English** | [简体中文](README.zh-CN.md)

A reproducible pipeline and interactive web application for **Street Fighter 6**
matchup analysis and complementary sub-character (pocket pick) recommendation,
built on Capcom Buckler official battle-diagram data (via the
[kakuhanapp.com](https://kakuhanapp.com) mirror).

---

## Overview

SF6 Matchup Lab aggregates monthly matchup win-rate data across the three
Master-and-above rank tiers and produces, for **any character over any month
range**:

1. **A matchup table / tier list** — every opponent scored on the Buckler 5.0-centered
   scale, grouped into favourability bands.
2. **A complementary sub-character recommendation** — ranked not merely by win rate
   against your worst matchups, but by a weakness-weighted coverage score with
   complementarity checks.

The analysis is fully parameterised (character, month range, rank weighting,
month weighting, exclusions) and is exposed both as a Python CLI and as a
zero-dependency browser application.

## Live demo

Two interchangeable front-end designs share the same data and logic:

| Design | Description | URL |
|--------|-------------|-----|
| **Bar view** (v1) | Dark "training-mode" diverging-bar table | <https://jiahaoxu10arthur.github.io/sf6-matchup/web/> |
| **Tier list** (v2) | Bold esports tier-band layout (favourability lanes) | <https://jiahaoxu10arthur.github.io/sf6-matchup/web-v2/> |

> GitHub Pages and Google Fonts are blocked in mainland China. For offline or
> in-China sharing, use the self-contained files in [`standalone/`](#offline-standalone-build).

## Features

- **Any character, any time range** — `--char`, `--months 202502-202605` (cross-year supported).
- **All four rank brackets** — Master / High / Grand / Ultimate Master, viewable individually or
  combined with a default 0.5 : 1 : 2 : 3 skill-depth weighting (Ultimate weighted most, Master least; continuously adjustable — see [methodology](docs/METHOD.md#3-rank-tiers-and-skill-depth-weights)).
- **Patch-aware month weighting** — `current` (post-patch) and `all` (equal) presets, or
  fully custom per-month weights; the same `{month: weight}` dictionary drives the
  interactive sliders.
- **Bilingual UI** — English and Simplified Chinese, with auto-detection and a manual toggle.
- **Offline single-file builds** — the entire app and dataset inlined into one shareable HTML file.

## Repository structure

```text
sf6-matchup/
├── scripts/
│   ├── roster.py            # character roster, rank/tier constants, patch month
│   ├── parse.py             # HTML → {opponent: score}
│   ├── scoring.py           # pure math: weights, coverage, correlation
│   ├── download.py          # idempotent page downloader
│   ├── build_matrix.py      # data/*.html → output/matrix.csv (+ anti-symmetry check)
│   ├── analyze.py           # per-character matchup table CLI
│   ├── recommend.py         # complementary sub recommendation CLI
│   └── build_standalone.py  # bundles the web app into offline single-file HTML
├── web/                     # v1 — dark bar-view UI (index.html, style.css, app.js, scoring.js, i18n.js)
├── web-v2/                  # v2 — tier-list UI (reuses ../web scoring.js + i18n.js)
├── standalone/              # generated offline single-file builds
├── tests/                   # pytest suite incl. Python↔JS parity
├── docs/                    # METHOD.md (methodology), plan.md
├── data/                    # raw HTML cache (gitignored)
└── output/matrix.csv        # long-format matchup matrix
```

## Data source and methodology

### Score scale

Scores follow the Buckler convention of win-rate ÷ 10, centred at 5.0
(e.g. `5.237` = 52.37 % win rate). Favourability bands: ≥ 5.3 advantageous,
≥ 5.1 slightly favourable, ≥ 4.9 even, ≥ 4.7 slightly unfavourable, < 4.7
disadvantageous.

### Calculation pipeline

Notation: `s(O, r, m)` is the raw score against opponent `O` at rank `r`
(40 = High, 41 = Grand, 42 = Ultimate Master) in month `m`.

**1. Acquisition & parsing.** One page is fetched per (character, rank, month)
and cached. Each page is parsed into `{opponent: score}`; the page's own
embedded month/rank/character is verified to reject server-fallback pages.
Pre-release character/month combinations return HTTP 500 and are stored as
empty markers.

**2. Long matrix + integrity check.** All pages are flattened into
`output/matrix.csv` with rows `(month, rank, char, opp, score)`. An
**anti-symmetry check** validates that `s(A,B) + s(B,A) ≈ 10` across all mirror
pairs; the pass criterion is **median deviation < 0.05** (the maximum can be
larger — the Buckler diagrams are computed per main-character population, so the
two directions come from different samples).

**3. Month aggregation.** For each opponent and rank, a weighted mean over the
selected months (months with weight 0 are excluded):

```text
m̄(O, r) = Σ_m  w_m · s(O, r, m)  /  Σ_m  w_m
```

Month-weight profiles (`w_m`):

| Profile | Weights |
|---------|---------|
| `current` | pre-patch months = 0, patch month (2026-03) = 0.5, post-patch = 1 |
| `all` | every month = 1 |
| custom (`--weights`) | user-supplied per-month values |

**4. Tier combination → COMB.** The per-rank means are combined across whichever
tiers have data, using default skill-depth weights `W = {Master: 0.5, High: 1, Grand: 2, Ult: 3}`
(continuously adjustable in the web app):

```text
COMB(O) = Σ_r  W_r · m̄(O, r)  /  Σ_r  W_r
```

Ultimate Master carries the most weight: higher rank = deeper game understanding,
so its matchup reads sit closest to the matchup's true value; Master (entry
bracket) gets the lightest default. This is a deliberate bias-over-variance
choice — Ultimate is the *noisiest* tier (smallest population) but the most
informed — explained in
[the methodology](docs/METHOD.md#3-rank-tiers-and-skill-depth-weights). A
single-rank view (`--profile` on a chosen rank) simply uses `m̄(O, r)` directly.
A per-opponent **Δpatch** drift = (Grand Master post-patch mean − pre-patch
mean) is reported separately.

### Complementary sub-character recommendation

The main character's COMB vector defines its weaknesses. Each candidate sub is
scored by **coverage**:

```text
COVER = Σ w(O) · (sub_vs_O − 5) / Σ w(O)
where  w(O) = u(O) · sev(O) + max(0, u(O) − 1) · 0.25,   sev(O) = max(0, 5 − main_vs_O)²
```

Only the main character's losing matchups contribute by default, weighted by the
**square** of their severity, so a sub that patches your hardest matchups
outranks one that marginally improves many near-even ones. Opponents missing
from the sub's data are treated as neutral (5.0). The per-opponent weight `u(O)`
(default 1) lets you **exclude** a low-sample opponent (`u = 0`) or **target** a
specific matchup (`u > 1`) even when you already win it — targeting injects a
fixed 0.25 (a "slight disadvantage" worth) so its strength is independent of your
worst matchup. Three complementarity cross-checks accompany the score:

- **corr** — Pearson correlation between the sub's and main's full matchup
  vectors; negative means the sub wins where the main loses (complementary
  *shape*). It measures profile shape, not coverage — COVER is the ranking; corr
  is a supplementary cue.
- **shared** — number of opponents both characters lose to (score < 4.9).
- **w3win%** — the sub's average win rate against the main's three worst matchups.

Full methodology — tier weighting rationale, the 2026-03-17 balance patch,
edge-case handling, and known limitations — is documented in
[`docs/METHOD.md`](docs/METHOD.md).

## Pipeline (CLI)

Requires Python 3 (standard library only).

```bash
cd scripts
python3 download.py     --months 202502-202605          # fetch raw pages (idempotent cache)
python3 build_matrix.py                                  # data/ → output/matrix.csv
python3 analyze.py   --char TERRY --months 202502-202605 --profile current
python3 recommend.py --char TERRY --months 202502-202605 --profile current
```

### Parameters

| Flag | Description | Default |
|------|-------------|---------|
| `--char` | Character to analyse (e.g. `TERRY`, `KEN`) | required |
| `--months` | Range (`202502-202605`) or explicit list | required |
| `--profile` | `current` (post-patch weighted) or `all` (equal) | `current` |
| `--weights` | Custom per-month weights, e.g. `202604=1,202605=1` | overrides `--profile` |
| `--exclude` | Opponents/candidates to drop | `INGRID` |

## Interactive web app

```bash
python3 -m http.server 8741        # from the repository root
# Bar view:  http://localhost:8741/web/
# Tier list: http://localhost:8741/web-v2/
```

Both interfaces recalculate instantly in the browser from `output/matrix.csv`:
character picker, per-rank tabs or tier-weighted COMB, live month- and
tier-weight sliders, INGRID toggle, reset, and a Sub-finder view. The scoring
math in `web/scoring.js` is a direct port of `scripts/scoring.py`;
`tests/test_js_parity.py` asserts the two implementations agree to `1e-9`.

## Offline standalone build

Pre-built files are attached to the
[latest release](https://github.com/JiahaoXu10Arthur/sf6-matchup/releases/latest) —
download and open directly. To rebuild from current data:

```bash
python3 scripts/build_standalone.py
```

Produces two self-contained files in `standalone/` with the dataset, code, and
styles inlined and all external dependencies removed:

- `sf6-matchup-bars.html` — v1 bar view
- `sf6-matchup-tierlist.html` — v2 tier list

Each runs by double-clicking — no internet, server, or installation required —
and can be shared by email, messaging, or USB. Custom display fonts are omitted
(they require Google Fonts); the layout falls back to the system typeface.

## Development and testing

```bash
python3 -m pytest tests/ -v        # requires `node` for the JS parity tests
```

## Deployment (GitHub Pages)

Push the repository and enable Pages on the `main` branch (root). The apps are
then served at `https://<user>.github.io/<repo>/web/` and `/web-v2/`.

## Attribution and disclaimer

Matchup data originates from Capcom's official Street Fighter 6 Buckler battle
diagrams, accessed via the kakuhanapp.com mirror. This is an unofficial
fan-made analysis tool and is not affiliated with or endorsed by Capcom.
Sample sizes are not published by the source; see `docs/METHOD.md` for the
resulting statistical caveats.
