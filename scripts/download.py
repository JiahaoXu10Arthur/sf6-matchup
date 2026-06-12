import argparse
import time
import urllib.request
from pathlib import Path

from roster import NAME_BY_SLUG

BASE = 'https://kakuhanapp.com/matchup/master/?month={month}&rank={rank}&tool={slug}'
DATA = Path(__file__).resolve().parent.parent / 'data'


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
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        (DATA / f'{slug}_{rank}_{month}.html').write_bytes(
            urllib.request.urlopen(req, timeout=30).read())
        print(f'[{i}/{len(todo)}] {slug} rank={rank} month={month}', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
