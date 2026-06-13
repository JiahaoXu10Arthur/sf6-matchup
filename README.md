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
