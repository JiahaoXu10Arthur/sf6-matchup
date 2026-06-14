import argparse
import csv
from collections import defaultdict
from pathlib import Path

from analyze import combined_row, fmt, resolve_weights
from roster import NAME_BY_SLUG, TIER_WEIGHTS
from scoring import (correlation, coverage, expand_months, shared_weaknesses,
                     specialization, strength, usage_weights)

ROOT = Path(__file__).resolve().parent.parent


def load_usage_weights(month_w, tier_w=TIER_WEIGHTS):
    """{char: sqrt(rate/mean)} where rate is the tier- and month-weighted average
    play-rate over the rank×month grid: Σ W_r·w_m·u / Σ W_r·w_m (over cells that
    exist), using the same month + tier weights as the matchup scores. Returns {}
    if usage.csv is absent. Mirrors scoring.js usageRates."""
    path = ROOT / 'output' / 'usage.csv'
    if not path.exists():
        return {}
    num, den = defaultdict(float), defaultdict(float)
    with path.open() as fh:
        for row in csv.DictReader(fh):
            w = month_w.get(row['month'], 0) * tier_w.get(int(row['rank']), 0)
            if w <= 0:
                continue
            num[row['char']] += w * float(row['play_rate'])
            den[row['char']] += w
    return usage_weights({c: num[c] / den[c] for c in num if den[c] > 0})


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
    usage = load_usage_weights(mw)

    results = []
    for sub in candidates:
        row = combined_row(sub, months, mw, exclude)
        if not row:
            continue
        per_tier = {r: coverage(main_row,
                                combined_row(sub, months, mw,
                                             exclude, ranks=[r]), None, usage)
                    for r in (40, 41, 42)}
        w3 = [row[o] for o in worst3 if o in row]
        results.append({
            'sub': sub,
            'cover': coverage(main_row, row, None, usage),
            'c40': per_tier[40], 'c41': per_tier[41], 'c42': per_tier[42],
            'spec': specialization(main_row, row, None, usage),
            'strength': strength(row),
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
        'SPEC: same edge but relative to the sub\'s own average — a globally strong '
        'character nets ~0, so high SPEC = a genuine counter, not just a strong pick. '
        'STR: the sub\'s overall mean matchup (tier proxy). '
        'corr: matchup-profile correlation (negative = complementary). '
        'shared: count of opponents both characters lose to (<4.9). '
        'w3win%: avg win rate vs the worst 3.',
        '',
        '| Sub | COVER | SPEC | STR | COVER@HighM | COVER@GrandM | COVER@UltM | w3win% | corr | shared |',
        '|---|---|---|---|---|---|---|---|---|---|',
    ]
    for r in results:
        lines.append(
            f"| {r['sub']} | **{r['cover']:+.3f}** | {r['spec']:+.3f} "
            f"| {r['strength']:.3f} | {r['c40']:+.3f} "
            f"| {r['c41']:+.3f} | {r['c42']:+.3f} | {fmt(r['w3win'], 1)} "
            f"| {r['corr']:+.2f} | {r['shared']} |")
    text = '\n'.join(lines) + '\n'
    out = ROOT / 'output' / f'{args.char}_subs_{months[0]}-{months[-1]}_{label}.md'
    out.write_text(text)
    print(text)
    print(f'-> {out}')


if __name__ == '__main__':
    main()
