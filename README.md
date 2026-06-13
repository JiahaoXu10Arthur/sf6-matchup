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

- **Any character, any time range** — `--char`, `--months 202601-202605` (cross-year supported).
- **All three rank tiers** — High / Grand / Ultimate Master, viewable individually or
  combined with a 3 : 2 : 1 population weighting.
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

Scores follow the Buckler convention of win-rate ÷ 10, centred at 5.0
(e.g. `5.237` = 52.37 % win rate). Favourability bands: ≥ 5.3 advantageous,
≥ 5.1 slightly favourable, ≥ 4.9 even, ≥ 4.7 slightly unfavourable, < 4.7
disadvantageous.

The complementary-sub score is:

```text
COVER = Σ w(O) · (sub_vs_O − 5) / Σ w(O),   where  w(O) = max(0, 5 − main_vs_O)²
```

Only the main character's losing matchups contribute, weighted by the square of
their severity, so a sub that patches your hardest matchups outranks one that
marginally improves many near-even ones. Pearson correlation, shared-weakness
count, and average win rate versus your worst three opponents are reported as
complementarity cross-checks.

Full methodology — tier weighting rationale, the 2026-03-17 balance patch, the
anti-symmetry validation, and known limitations — is documented in
[`docs/METHOD.md`](docs/METHOD.md).

## Pipeline (CLI)

Requires Python 3 (standard library only).

```bash
cd scripts
python3 download.py     --months 202601-202605          # fetch raw pages (idempotent cache)
python3 build_matrix.py                                  # data/ → output/matrix.csv
python3 analyze.py   --char TERRY --months 202601-202605 --profile current
python3 recommend.py --char TERRY --months 202601-202605 --profile current
```

### Parameters

| Flag | Description | Default |
|------|-------------|---------|
| `--char` | Character to analyse (e.g. `TERRY`, `KEN`) | required |
| `--months` | Range (`202601-202605`) or explicit list | required |
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
