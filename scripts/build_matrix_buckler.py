"""Build output/matrix.csv (+ usage.csv) from the official Buckler dia_master /
usagerate_master JSON downloaded by download_buckler.py.

matrix.csv schema is unchanged (month, rank, char, opp, score) so the rest of
the pipeline (analyze.py, scoring.js, the web app) is untouched — only the
source and the now-official character names differ. Per-opponent cells are
aligned by id (`_oid` -> opponent_header id) rather than array position, so a
differing sort order can't mislabel a matchup.
"""
import csv
import json
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent.parent
BUCKLER = ROOT / 'data' / 'buckler'
OUT = ROOT / 'output'
RANKS = [36, 40, 41, 42]   # Master / High / Grand / Ultimate (skip unlabeled 39)


def build_matrix():
    rows = []
    for f in sorted(BUCKLER.glob('dia_master_*.json')):
        month = f.stem.rsplit('_', 1)[-1]
        d = json.loads(f.read_text())['diaData']['c']['d_sort']
        for r in RANKS:
            blk = d.get(str(r))
            if not blk:
                continue
            name = {h['id']: h['name_alpha'] for h in blk['opponent_header']}
            for rec in blk['records']:
                for cell in rec['values']:
                    v = cell['val']
                    if v and v != '-':
                        rows.append((month, r, rec['name_alpha'], name[cell['_oid']], v))
    return rows


def build_usage():
    rows = []
    for f in sorted(BUCKLER.glob('usagerate_master_*.json')):
        month = f.stem.rsplit('_', 1)[-1]
        for brk in json.loads(f.read_text())['usagerateData'][0]['val']:
            for c in brk['val']:
                rows.append((month, brk['league_rank'],
                             c['character_alpha'], c['play_rate']))
    return rows


def report_anti_symmetry(rows):
    by = {(m, r, a, b): float(s) for m, r, a, b, s in rows}
    devs = sorted(abs(s + by[(m, r, b, a)] - 10.0)
                  for (m, r, a, b), s in by.items()
                  if a < b and (m, r, b, a) in by)
    if devs:
        print(f'anti-symmetry: {len(devs)} pairs, median {median(devs):.4f} '
              f'(pass < 0.05), max {max(devs):.4f}')


def main():
    OUT.mkdir(exist_ok=True)
    rows = build_matrix()
    with (OUT / 'matrix.csv').open('w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['month', 'rank', 'char', 'opp', 'score'])
        w.writerows(rows)
    print(f'matrix.csv: {len(rows)} rows')
    report_anti_symmetry(rows)

    usage = build_usage()
    with (OUT / 'usage.csv').open('w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['month', 'rank', 'char', 'play_rate'])
        w.writerows(usage)
    print(f'usage.csv: {len(usage)} rows')


if __name__ == '__main__':
    main()
