from statistics import fmean


def expand_months(args):
    """['202601-202605'] or ['202604', '202605'] -> explicit month list."""
    out = []
    for a in args:
        if '-' in a:
            lo, hi = a.split('-')
            y, mo = int(lo[:4]), int(lo[4:])
            while f'{y}{mo:02d}' <= hi:
                out.append(f'{y}{mo:02d}')
                mo += 1
                if mo == 13:
                    y, mo = y + 1, 1
        else:
            out.append(a)
    return out


def month_weights(months, profile, patch_month):
    if profile == 'all':
        return {m: 1.0 for m in months}
    if profile == 'current':
        w = {m: 0.0 if m < patch_month else 0.5 if m == patch_month else 1.0
             for m in months}
        return w if any(w.values()) else {m: 1.0 for m in months}
    raise ValueError(f'unknown profile: {profile}')


def parse_weights(spec):
    """'202601=0,202603=0.5' -> {'202601': 0.0, '202603': 0.5}.
    The {month: weight} dict is the recalculation input shared by the CLIs
    and any future interactive frontend."""
    return {m: float(w) for part in spec.split(',')
            for m, w in [part.split('=')]}


def wavg(scores, weights):
    """Weighted average of scores over keys with nonzero weight; None if empty."""
    pairs = [(scores[k], weights[k]) for k in scores if weights.get(k)]
    if not pairs:
        return None
    return sum(s * w for s, w in pairs) / sum(w for _, w in pairs)


def coverage(main_row, sub_row):
    """Sub coverage of main's weaknesses.
    COVER = sum(w(O) * (sub_vs_O - 5)) / sum(w(O)), w(O) = max(0, 5 - main_vs_O)^2."""
    num = den = 0.0
    for opp, ms in main_row.items():
        w = max(0.0, 5.0 - ms) ** 2
        if w and opp in sub_row:
            num += w * (sub_row[opp] - 5.0)
            den += w
    return num / den if den else 0.0


def correlation(a, b):
    """Pearson correlation over shared opponents. Negative = complementary."""
    keys = sorted(set(a) & set(b))
    xs, ys = [a[k] for k in keys], [b[k] for k in keys]
    mx, my = fmean(xs), fmean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / (sxx * syy) ** 0.5 if sxx and syy else 0.0


def shared_weaknesses(a, b, thresh=4.9):
    return sorted(k for k in set(a) & set(b) if a[k] < thresh and b[k] < thresh)
