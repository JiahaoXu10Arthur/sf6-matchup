import csv
from pathlib import Path
from statistics import median

from parse import parse_matchups, parse_selected_params
from roster import NAME_BY_SLUG

ROOT = Path(__file__).resolve().parent.parent


def main():
    rows, skipped = [], []
    for f in sorted((ROOT / 'data').glob('*.html')):
        slug, rank, month = f.stem.rsplit('_', 2)
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
    out.parent.mkdir(exist_ok=True)
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
    if devs:
        print(f'anti-symmetry: {len(devs) // 2} pairs, median {median(devs):.4f} '
              f'(pass < 0.05), max {max(devs):.4f}')
    else:
        print('anti-symmetry: no symmetric pairs found')


if __name__ == '__main__':
    main()
