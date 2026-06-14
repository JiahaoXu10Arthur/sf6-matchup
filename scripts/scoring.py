from statistics import fmean, pstdev

# Weight given to a targeted opponent (u>1) beyond its actual severity. Fixed at
# the severity of a 4.5 "slight disadvantage" (sev = (5-4.5)^2 = 0.25) so the
# target slider behaves consistently regardless of how bad the main's worst
# matchup is. Only applies when u>1; u=1 (normal) never injects.
TARGET_INJECT = 0.25


def expand_months(args):
    """['202601-202605'] or ['202604', '202605'] -> explicit month list."""
    out = []
    for a in args:
        if '-' in a:
            lo, hi = a.split('-', 1)
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


def usage_weights(rates):
    """Per-opponent usage weight from {char: play_rate}: sqrt(rate / mean_rate),
    so an average-popularity opponent = 1.0, popular > 1, rare < 1 (dampened by
    the sqrt so a 9%-played character doesn't dwarf a 1% one 9x). Empty -> {}."""
    if not rates:
        return {}
    mean = fmean(rates.values())
    return {c: (r / mean) ** 0.5 for c, r in rates.items()} if mean else {}


def _weakness_weights(main_row, opp_weights=None, usage=None):
    """w(O) per opponent for the coverage family:
        w(O) = u(O) * usage(O) * sev(O) + max(0, u(O) - 1) * TARGET_INJECT
        sev(O) = max(0, 5 - main_vs_O) ** 2          # weakness severity

    u(O) is the per-opponent user weight (default 1.0): u=1 gives the plain
    weakness-weighted scheme, u=0 drops the opponent, u>1 targets it (counts even
    when it is not a current weakness, via TARGET_INJECT). usage(O) is an optional
    popularity multiplier (default 1.0) that down-weights rarely-played opponents.
    Returns only opponents with nonzero weight."""
    out = {}
    for opp, ms in main_row.items():
        sev = max(0.0, 5.0 - ms) ** 2
        if usage:
            sev *= usage.get(opp, 1.0)
        u = 1.0 if opp_weights is None else opp_weights.get(opp, 1.0)
        w = u * sev + max(0.0, u - 1.0) * TARGET_INJECT
        if w:
            out[opp] = w
    return out


def strength(row):
    """Overall mean matchup score of a character's combined row (tier proxy).
    Empty row -> neutral 5.0."""
    return fmean(row.values()) if row else 5.0


def pair_coverage(main_row, sub_row, thresh=5.0):
    """How well a main+partner ROSTER covers the cast: for each opponent you field
    whichever of the two has the better matchup. 'covered' = opponents the pair wins
    (max score >= thresh, default 5.0 = even-or-better); 'patched' = main's losing
    matchups (< thresh) the partner flips to a win; 'losses' = main's losing matchups;
    'total' = opponents in the main's row. Opponents missing from sub_row fall back to
    the main alone (the partner can't help there). Keep in sync with web/scoring.js."""
    total = len(main_row)
    losses = covered = patched = 0
    for opp, ms in main_row.items():
        if ms < thresh:
            losses += 1
            if sub_row.get(opp, 0.0) >= thresh:
                patched += 1
        if max(ms, sub_row.get(opp, ms)) >= thresh:
            covered += 1
    return {'total': total, 'losses': losses, 'patched': patched, 'covered': covered}


def polarization(row):
    """Spread of a character's combined matchup row = population std of its scores.
    High = feast-or-famine (hard counters and free wins); low = even across the cast.
    Empty or single-opponent rows -> 0.0. Keep in sync with web/scoring.js."""
    v = list(row.values())
    return pstdev(v) if len(v) > 1 else 0.0


def reliability(nmo, nranks, spread):
    """How much agreeing data backs a single combined matchup number.

    The Buckler source does not publish sample sizes, so confidence is derived
    from what we do observe: contributing months (data depth), rank-tier coverage
    (breadth), and cross-rank spread (do the four skill brackets agree?). Returns
    {'level': 'high'|'med'|'low', 'score': 0..1}. A fully-sampled cell never falls
    to 'low' on rank disagreement alone; 'low' is reserved for genuinely thin data.

    Keep in sync with reliability() in web/scoring.js (parity-tested)."""
    depth = min(nmo, 3) / 3 * 0.4 + min(nranks, 4) / 4 * 0.3   # 0..0.7 coverage
    agree = max(0.0, 1.0 - spread / 0.6) * 0.3                 # 0..0.3 agreement
    score = depth + agree                                      # 0..1
    level = 'high' if score >= 0.85 else 'low' if score < 0.6 else 'med'
    return {'level': level, 'score': score}


def coverage(main_row, sub_row, opp_weights=None, usage=None):
    """Sub coverage of main's weaknesses: weakness-weighted ABSOLUTE edge.

    COVER = sum(w(O) * (sub_vs_O - 5)) / sum(w(O)), with w(O) from
    _weakness_weights(). Opponents missing from sub_row count as neutral (5.0)."""
    w = _weakness_weights(main_row, opp_weights, usage)
    num = sum(wt * (sub_row.get(opp, 5.0) - 5.0) for opp, wt in w.items())
    den = sum(w.values())
    return num / den if den else 0.0


def specialization(main_row, sub_row, opp_weights=None, usage=None):
    """Sub coverage measured RELATIVE TO the sub's own average matchup, so a
    globally-strong character (wins against everyone) nets ~0 and only genuine
    counters to the main's weaknesses score high. Removes the raw-strength bias
    in COVER.

    SPEC = sum(w(O) * (sub_vs_O - sub_mean)) / sum(w(O)), same w(O) as coverage.
    Opponents missing from sub_row count as neutral relative to the sub (sub_mean)."""
    sub_mean = strength(sub_row)
    w = _weakness_weights(main_row, opp_weights, usage)
    num = sum(wt * (sub_row.get(opp, sub_mean) - sub_mean) for opp, wt in w.items())
    den = sum(w.values())
    return num / den if den else 0.0


def correlation(a, b):
    """Pearson correlation over shared opponents. Negative = complementary."""
    keys = sorted(set(a) & set(b))
    if not keys:
        return 0.0
    xs, ys = [a[k] for k in keys], [b[k] for k in keys]
    mx, my = fmean(xs), fmean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / (sxx * syy) ** 0.5 if sxx and syy else 0.0


def shared_weaknesses(a, b, thresh=4.9):
    return sorted(k for k in set(a) & set(b) if a[k] < thresh and b[k] < thresh)
