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
