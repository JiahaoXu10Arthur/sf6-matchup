"""Personal matchup scout: compare your Buckler ranked record to the global
baseline with Beta-Binomial shrinkage and report real weaknesses.
See docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md."""
import argparse
import csv
from collections import defaultdict
from pathlib import Path

from bayes import beta_posterior, posterior_mean, credible_interval, prob_below

ROOT = Path(__file__).resolve().parent.parent

KAPPA = 20.0          # prior strength: baseline counts as ~20 games
CRED_LEVEL = 0.90     # credible-interval coverage
DELTA = 0.03          # min material gap vs baseline (3 percentage points)
MIN_TRUST = 10        # games below which a deviation is "small sample"
WEAK_PROB = 0.85      # P(true < baseline) needed to call a real weakness
STRONG_PROB = 0.15    # symmetric threshold for overperforming


def classify(p0, wins, losses, kappa=KAPPA, level=CRED_LEVEL,
             delta=DELTA, min_trust=MIN_TRUST):
    """Classify one matchup given baseline win-rate p0 and your wins/losses.
    Returns {shrunk, lo, hi, prob_below, n, verdict, deficit}."""
    a, b = beta_posterior(p0, kappa, wins, losses)
    mean = posterior_mean(a, b)
    lo, hi = credible_interval(a, b, level)
    pb = prob_below(a, b, p0)
    n = wins + losses
    if pb >= WEAK_PROB and mean <= p0 - delta:
        verdict = 'real weakness'
    elif pb <= STRONG_PROB and mean >= p0 + delta:
        verdict = 'overperforming'
    elif n < min_trust:
        verdict = 'small sample'
    else:
        verdict = 'on par'
    return {'shrunk': mean, 'lo': lo, 'hi': hi, 'prob_below': pb,
            'n': n, 'verdict': verdict, 'deficit': (p0 - mean) * pb}


def load_personal(path):
    """Read a personal battlelog CSV into a list of row dicts."""
    with open(path, newline='') as fh:
        return [row for row in csv.DictReader(fh)
                if not row['replay_id'].startswith('#')]


def aggregate(rows, char):
    """{opponent: (wins, losses)} for the games you played as `char`."""
    wl = defaultdict(lambda: [0, 0])
    for row in rows:
        if row['your_char'] != char:
            continue
        idx = 0 if row['result'] == 'W' else 1
        wl[row['opp_char']][idx] += 1
    return {opp: (w, l) for opp, (w, l) in wl.items()}


from analyze import combined_row
from scoring import month_weights
from roster import PATCH_MONTH

VERDICT_ICON = {'real weakness': '🔴', 'small sample': '⚪',
                'on par': '➖', 'overperforming': '🟢'}


def _matrix_months():
    import csv as _csv
    with (ROOT / 'output' / 'matrix.csv').open() as fh:
        return sorted({r['month'] for r in _csv.DictReader(fh)})


def baseline_winrates(char, months=None, exclude=frozenset({'INGRID'})):
    """{opponent: baseline win-rate (0..1)} for `char` from the COMB matrix,
    `current` month profile by default. combined_row scores are win-rate/10."""
    months = months or _matrix_months()
    mw = month_weights(months, 'current', PATCH_MONTH)
    return {opp: score / 10.0
            for opp, score in combined_row(char, months, mw, set(exclude)).items()}


def scout(personal_agg, baseline):
    """Join your per-opponent record to the baseline; classify each matchup that
    exists in both. Returns result dicts sorted worst-first (by credible deficit)."""
    results = []
    for opp, (wins, losses) in personal_agg.items():
        if opp not in baseline:
            continue
        r = classify(baseline[opp], wins, losses)
        r.update({'opp': opp, 'wins': wins, 'losses': losses,
                  'baseline': baseline[opp]})
        results.append(r)
    results.sort(key=lambda r: r['deficit'], reverse=True)
    return results


def format_report(char, results):
    pct = lambda p: f'{p * 100:.1f}%'
    weaknesses = [r['opp'] for r in results if r['verdict'] == 'real weakness']
    headline = (f'Top weaknesses: {", ".join(weaknesses[:3])}'
                if weaknesses else 'No statistically clear weaknesses found.')
    lines = [
        f'# {char} — personal matchup scout',
        '',
        f'**{headline}**',
        '',
        '| Opponent | Your W-L | Raw% | Shrunk% [90% CI] | Baseline% | Verdict |',
        '|---|---|---|---|---|---|',
    ]
    for r in results:
        raw = r['wins'] / r['n'] if r['n'] else 0.0
        lines.append(
            f"| {r['opp']} | {r['wins']}-{r['losses']} | {pct(raw)} "
            f"| {pct(r['shrunk'])} [{pct(r['lo'])}–{pct(r['hi'])}] "
            f"| {pct(r['baseline'])} | {VERDICT_ICON[r['verdict']]} {r['verdict']} |")
    return '\n'.join(lines) + '\n'


def _most_played(rows):
    counts = defaultdict(int)
    for row in rows:
        counts[row['your_char']] += 1
    return max(counts, key=counts.get) if counts else None


def main():
    ap = argparse.ArgumentParser(description='Personal matchup scout')
    ap.add_argument('--cfn', required=True, help='your CFN id (names data/personal/{cfn}.csv)')
    ap.add_argument('--char', help='your character (default: your most-played)')
    ap.add_argument('--exclude', nargs='*', default=['INGRID'])
    args = ap.parse_args()

    path = ROOT / 'data' / 'personal' / f'{args.cfn}.csv'
    if not path.exists():
        ap.error(f'no personal data at {path} — run fetch_battlelog.py --cfn {args.cfn} first')
    rows = load_personal(path)
    char = args.char or _most_played(rows)
    if not char:
        ap.error('no matches found; check the CSV')
    agg = aggregate(rows, char)
    base = baseline_winrates(char, exclude=set(args.exclude))
    results = scout(agg, base)
    report = format_report(char, results)
    out = ROOT / 'output' / f'{args.cfn}_scout.md'
    out.write_text(report)
    print(report)
    print(f'-> {out}')


if __name__ == '__main__':
    main()
