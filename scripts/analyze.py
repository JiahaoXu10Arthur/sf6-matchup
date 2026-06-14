import argparse
import csv
from collections import defaultdict
from pathlib import Path

from roster import PATCH_MONTH, TIER_WEIGHTS
from scoring import expand_months, month_weights, parse_weights, reliability, wavg

ROOT = Path(__file__).resolve().parent.parent


_MATRIX = None


def _matrix():
    global _MATRIX
    if _MATRIX is None:
        with (ROOT / 'output' / 'matrix.csv').open() as fh:
            _MATRIX = list(csv.DictReader(fh))
    return _MATRIX


def load(char, months, exclude):
    """matrix.csv -> {opp: {rank: {month: score}}} for one character."""
    d = defaultdict(lambda: defaultdict(dict))
    for row in _matrix():
        if (row['char'] == char and row['month'] in months
                and row['opp'] not in exclude):
            d[row['opp']][int(row['rank'])][row['month']] = float(row['score'])
    return d


def combined_row(char, months, mw, exclude, ranks=None):
    """{opp: tier-combined score} — the character's matchup vector.
    mw is a {month: weight} dict; pass any dict to recalculate (web-app API)."""
    ranks = ranks or list(TIER_WEIGHTS)
    out = {}
    for opp, byrank in load(char, months, exclude).items():
        present = {r: v for r in ranks
                   if (v := wavg(byrank.get(r, {}), mw)) is not None}
        den = sum(TIER_WEIGHTS[r] for r in present)
        if den:  # skip opps whose present ranks all have weight 0 (mirrors scoring.js)
            out[opp] = sum(v * TIER_WEIGHTS[r] for r, v in present.items()) / den
    return out


def resolve_weights(args, months):
    """CLI args -> ({month: weight}, label). --weights overrides --profile."""
    if args.weights:
        return parse_weights(args.weights), 'custom'
    return month_weights(months, args.profile, PATCH_MONTH), args.profile


def char_table(char, months, mw, exclude):
    data = load(char, months, exclude)
    rows = []
    for opp, byrank in data.items():
        tier = {r: wavg(byrank.get(r, {}), mw) for r in TIER_WEIGHTS}
        present = {r: v for r, v in tier.items() if v is not None}
        den = sum(TIER_WEIGHTS[r] for r in present)
        if not den:  # no present rank carries weight (mirrors scoring.js `if (!den) continue`)
            continue
        comb = sum(v * TIER_WEIGHTS[r] for r, v in present.items()) / den
        spread = max(present.values()) - min(present.values())
        g = byrank.get(41, {})
        pre = [v for m, v in g.items() if m < PATCH_MONTH]
        post = [v for m, v in g.items() if m > PATCH_MONTH]
        dpatch = (sum(post) / len(post) - sum(pre) / len(pre)) if pre and post else None
        nmonths = len({m for r in byrank.values() for m in r})
        nmo = len({m for r in byrank.values() for m in r if mw.get(m)})
        nranks = len(present)
        rows.append((opp, tier.get(36), tier[40], tier[41], tier[42],
                     comb, spread, dpatch, nmonths, nmo, nranks))
    rows.sort(key=lambda r: r[5])
    return rows


def fmt(v, nd=3):
    return f'{v:.{nd}f}' if v is not None else '—'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--char', required=True)
    ap.add_argument('--months', nargs='+', required=True)
    ap.add_argument('--profile', choices=['all', 'current'], default='current')
    ap.add_argument('--weights', help='custom {month}={weight} CSV, overrides --profile')
    ap.add_argument('--exclude', nargs='*', default=['INGRID'])
    args = ap.parse_args()
    months = expand_months(args.months)
    mw, label = resolve_weights(args, months)
    rows = char_table(args.char, months, mw, set(args.exclude))
    if not rows:
        ap.error(f'no data for character {args.char!r} — check spelling and month range')

    wlabel = ':'.join(str(TIER_WEIGHTS[r]) for r in (36, 40, 41, 42))
    lines = [
        f'# {args.char} matchups — months {months[0]}–{months[-1]}, '
        f'profile={label}, tiers {wlabel} (Master:HighM:GrandM:UltM)',
        '',
        '| Opponent | Master | HighM | GrandM | UltM | COMB | conf | spread | Δpatch | months |',
        '|---|---|---|---|---|---|---|---|---|---|',
    ]
    dots = {'high': '●●●', 'med': '●●○', 'low': '●○○'}
    for opp, t36, t40, t41, t42, comb, spread, dpatch, nm, nmo, nranks in rows:
        noisy = ' ⚠' if spread > 0.25 else ''
        conf = dots[reliability(nmo, nranks, spread)['level']]
        lines.append(
            f'| {opp} | {fmt(t36)} | {fmt(t40)} | {fmt(t41)} | {fmt(t42)} | **{comb:.3f}**'
            f'{noisy} | {conf} | {spread:.3f} | {fmt(dpatch, 3)} | {nm}/{len(months)} |')
    text = '\n'.join(lines) + '\n'
    out = ROOT / 'output' / f'{args.char}_{months[0]}-{months[-1]}_{label}.md'
    out.write_text(text)
    print(text)
    print(f'-> {out}')


if __name__ == '__main__':
    main()
