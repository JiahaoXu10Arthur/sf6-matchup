import argparse
from pathlib import Path

from analyze import combined_row, fmt, resolve_weights
from roster import NAME_BY_SLUG
from scoring import correlation, coverage, expand_months, shared_weaknesses

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--char', required=True)
    ap.add_argument('--months', nargs='+', required=True)
    ap.add_argument('--profile', choices=['all', 'current'], default='current')
    ap.add_argument('--weights', help='custom {month}={weight} CSV, overrides --profile')
    ap.add_argument('--exclude', nargs='*', default=['INGRID'])
    args = ap.parse_args()
    months = expand_months(args.months)
    exclude = set(args.exclude)
    mw, label = resolve_weights(args, months)

    main_row = combined_row(args.char, months, mw, exclude)
    if not main_row:
        ap.error(f'no data for character {args.char!r} — check spelling and month range')
    worst3 = sorted(main_row, key=main_row.get)[:3]
    candidates = [n for n in NAME_BY_SLUG.values()
                  if n != args.char and n not in exclude]

    results = []
    for sub in candidates:
        row = combined_row(sub, months, mw, exclude)
        if not row:
            continue
        per_tier = {r: coverage(main_row,
                                combined_row(sub, months, mw,
                                             exclude, ranks=[r]))
                    for r in (40, 41, 42)}
        w3 = [row[o] for o in worst3 if o in row]
        results.append({
            'sub': sub,
            'cover': coverage(main_row, row),
            'c40': per_tier[40], 'c41': per_tier[41], 'c42': per_tier[42],
            'w3win': sum(w3) / len(w3) * 10 if w3 else None,
            'corr': correlation(main_row, row),
            'shared': len(shared_weaknesses(main_row, row)),
        })
    results.sort(key=lambda r: r['cover'], reverse=True)

    lines = [
        f'# Sub recommendation for {args.char} — months {months[0]}–{months[-1]}, '
        f'profile={label}',
        '',
        f'Weakness weights from {args.char} COMB row; worst 3: '
        + ', '.join(f'{o} ({main_row[o]:.3f})' for o in worst3),
        '',
        'COVER: weakness-weighted edge (higher = better patch for bad matchups). '
        'corr: matchup-profile correlation (negative = complementary). '
        'shared: count of opponents both characters lose to (<4.9). '
        'w3win%: avg win rate vs the worst 3.',
        '',
        '| Sub | COVER | COVER@HighM | COVER@GrandM | COVER@UltM | w3win% | corr | shared |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for r in results:
        lines.append(
            f"| {r['sub']} | **{r['cover']:+.3f}** | {r['c40']:+.3f} "
            f"| {r['c41']:+.3f} | {r['c42']:+.3f} | {fmt(r['w3win'], 1)} "
            f"| {r['corr']:+.2f} | {r['shared']} |")
    text = '\n'.join(lines) + '\n'
    out = ROOT / 'output' / f'{args.char}_subs_{label}.md'
    out.write_text(text)
    print(text)
    print(f'-> {out}')


if __name__ == '__main__':
    main()
