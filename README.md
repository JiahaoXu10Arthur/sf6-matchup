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

## Interactive UI

```bash
python3 -m http.server 8741        # from repo root
open http://localhost:8741/web/
```

Character picker, per-rank tabs (High/Grand/Ultimate Master) or tier-weighted
COMB, live month-weight sliders with `current`/`all` presets, adjustable tier
weights, INGRID toggle, and a Sub finder view (COVER / w3win% / corr / shared) —
everything recalculates instantly in-browser from `output/matrix.csv`. The
scoring math in `web/scoring.js` is a port of `scripts/scoring.py`;
`tests/test_js_parity.py` asserts both implementations agree to 1e-9
(requires `node`).

To publish on GitHub Pages: push the repo, enable Pages on the main branch
(root), and the app is live at `https://<user>.github.io/<repo>/web/`.
