# Buckler migration plan (2026-06-14)

Switch the data source from the kakuhanapp mirror to Capcom's **official Buckler
`dia_master` API**. Same 4 Master brackets (36/40/41/42) we already use — a
drop-in source swap — plus official English names, official source (no DNS
flakiness), full archive, and usage rates.

## Confirmed decisions
- **Source**: Buckler `api/en/stats/dia_master/{YYYYMM}` (control-total; ranks
  36/40/41/42; skip unlabeled 39). Modern/Classic (`dia` endpoint) deferred —
  doesn't combine with the Master sub-brackets.
- **Names**: adopt Buckler's official `name_alpha` for all 30 chars. Notable:
  `VEGA → M. BISON`, `GOUKI → AKUMA`, `E.HONDA → E. HONDA`, `C.VIPER → C. VIPER`.
  Slugs (tool_name) unchanged: M. BISON→`vega`, AKUMA→`gouki` — **headshots keep
  working**.
- **Usage weights**: default opponent weight `w(O) = sqrt(play_rate / mean)`
  from `usagerate_master`. Down-weights rare opponents (Honda/Dhalsim) without
  being extreme. User-adjustable as now.
- **Archive**: 202502–202605 (16 months), re-sourced.

## Stages
1. **Download** — rewrite `download_buckler.py` to fetch `dia_master_{m}.json` +
   `usage_{m}.json` for the range. (Drops the earlier all-rank `dia` fetch.)
2. **Matrix** — `build_matrix_buckler.py`: parse dia_master JSON → `matrix.csv`
   (month, rank, char, opp, score) with official names; keep anti-symmetry check.
   Parse usage → `output/usage.csv` (month, rank, char, play_rate).
3. **Names** — update roster.py (NAME_BY_SLUG), i18n.js (SLUG_BY_NAME, CHAR_ZH
   keys, ROSTER_ORDER) to official names. Slugs unchanged.
4. **Usage weights** — ship usage to the frontend; default `state.oppW` from
   `sqrt(play_rate/mean)`; Python recommend.py mirrors it. Parity-test.
5. **Docs/tests** — METHOD/README: source = official Buckler; rebuild outputs;
   green tests; rebuild standalone.

Each stage = its own commit. Verify the web app after stages 3 and 4.
