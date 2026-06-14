"""Headless downloader for Capcom Buckler's official stats API.

Hits Capcom's own JSON endpoints directly — no browser, no login. Public:

    https://www.streetfighter.com/6/buckler/api/{lang}/stats/{kind}/{YYYYMM}

We fetch two kinds per month:
- `dia_master`  — Master+ battle diagrams, control-total, ranks 36/40/41/42
                  (36=Master, 40/41/42=High/Grand/Ultimate Master). Each rank
                  has a 30-entry opponent_header + 30 records; each record's
                  `values` array holds per-opponent win rates (val "x.xxx",
                  "-" for the mirror). Names are official English (name_alpha).
- `usagerate_master` — per-character play rates per bracket (for default
                  usage-based opponent weights).

Saved raw to data/buckler/{kind}_{YYYYMM}.json; build_matrix_buckler.py parses.
Capcom updates monthly (2nd Thursday). Archive reaches back to ~launch (202306).
"""
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from scoring import expand_months

BASE = 'https://www.streetfighter.com/6/buckler/api/{lang}/stats/{kind}/{month}'
DATA = Path(__file__).resolve().parent.parent / 'data' / 'buckler'
KINDS = ['dia_master', 'usagerate_master']
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                   'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.streetfighter.com/6/buckler/stats/',
}
RETRIES = 3
RETRY_DELAY = 5


def fetch(url):
    """Fetch with retries; CloudFront occasionally drops the first connection."""
    last = None
    for attempt in range(RETRIES):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=HEADERS), timeout=45).read()
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            if attempt < RETRIES - 1:
                time.sleep(RETRY_DELAY)
    raise last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--months', nargs='+', required=True,
                    help='e.g. 202502-202605 or explicit months')
    ap.add_argument('--lang', default='en')
    ap.add_argument('--kinds', nargs='+', default=KINDS)
    args = ap.parse_args()
    months = expand_months(args.months)
    DATA.mkdir(parents=True, exist_ok=True)

    todo = [(k, m) for m in months for k in args.kinds
            if not (DATA / f'{k}_{m}.json').exists()]
    print(f'{len(todo)} files to fetch')
    for i, (kind, month) in enumerate(todo, 1):
        url = BASE.format(lang=args.lang, kind=kind, month=month)
        try:
            body = fetch(url)
            json.loads(body)  # validate before saving
            (DATA / f'{kind}_{month}.json').write_bytes(body)
            note = f'{len(body) // 1024} KB'
        except (urllib.error.HTTPError, ValueError) as e:
            note = f'-> skipped ({e})'
        print(f'[{i}/{len(todo)}] {kind} {month} {note}', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
