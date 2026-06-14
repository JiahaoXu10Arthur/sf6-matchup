"""Headless downloader for Capcom Buckler's official battle-diagram (dia) API.

Unlike the kakuhanapp mirror (download.py), this hits Capcom's own JSON endpoint
directly — no browser, no login. The endpoint is public:

    https://www.streetfighter.com/6/buckler/api/{lang}/stats/dia/{YYYYMM}

One payload per month contains the FULL matrix: both control-type modes
(diaData.ci = split by Classic/Modern, diaData.c = control-total) × two sort
orders × all 8 rank tiers (1=Rookie … 8=Master). Each rank holds a
60-entry opponent_header (30 chars × {Classic, Modern}) and 60 records, each
with a `values` array of per-opponent win rates (val "x.xxx", "-" for the
mirror). We save the raw JSON; build_matrix_buckler.py parses it.

Archive goes back to ~SF6 launch (202306). Capcom updates monthly (2nd Thursday).
"""
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from scoring import expand_months

BASE = 'https://www.streetfighter.com/6/buckler/api/{lang}/stats/dia/{month}'
DATA = Path(__file__).resolve().parent.parent / 'data' / 'buckler'
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                   'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.streetfighter.com/6/buckler/stats/dia',
}
RETRIES = 3
RETRY_DELAY = 5


def fetch(url):
    """Fetch with retries; CloudFront occasionally drops the first connection."""
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            return urllib.request.urlopen(req, timeout=45).read()
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            if attempt < RETRIES - 1:
                time.sleep(RETRY_DELAY)
    raise last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--months', nargs='+', required=True,
                    help='e.g. 202306-202605 or explicit months')
    ap.add_argument('--lang', default='en')
    args = ap.parse_args()
    months = expand_months(args.months)
    DATA.mkdir(parents=True, exist_ok=True)

    todo = [m for m in months if not (DATA / f'dia_{m}.json').exists()]
    print(f'{len(todo)} of {len(months)} months to fetch')
    for i, month in enumerate(todo, 1):
        url = BASE.format(lang=args.lang, month=month)
        try:
            body = fetch(url)
            json.loads(body)  # validate it parses before saving
            (DATA / f'dia_{month}.json').write_bytes(body)
            note = f'{len(body) // 1024} KB'
        except (urllib.error.HTTPError, ValueError) as e:
            note = f'-> skipped ({e})'
        print(f'[{i}/{len(todo)}] {month} {note}', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
