"""Pure-stdlib conjugate Beta-Binomial statistics for the personal matchup scout.
No I/O, no third-party deps — fully unit-testable. See
docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md."""
import math

_MAXIT = 200
_EPS = 3e-12
_FPMIN = 1e-300


def _betacf(x, a, b):
    """Continued fraction for the incomplete beta (Lentz's method, NR betacf)."""
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _FPMIN:
        d = _FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, _MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    return h


def reg_incomplete_beta(x, a, b):
    """Regularized incomplete beta I_x(a,b) = CDF of Beta(a,b) at x."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(x, a, b) / a
    return 1.0 - front * _betacf(1.0 - x, b, a) / b


def beta_posterior(p0, kappa, wins, losses):
    """Prior Beta(p0*kappa, (1-p0)*kappa) updated by wins/losses -> posterior (a, b).
    p0 is the baseline win-rate (prior mean); kappa is the prior strength in
    pseudo-games."""
    a0 = p0 * kappa
    b0 = (1.0 - p0) * kappa
    return (a0 + wins, b0 + losses)


def posterior_mean(alpha, beta):
    return alpha / (alpha + beta)


def beta_ppf(q, alpha, beta):
    """Inverse CDF (quantile) of Beta(alpha, beta) by bisection on the CDF."""
    lo, hi = 0.0, 1.0
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        if reg_incomplete_beta(mid, alpha, beta) < q:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def credible_interval(alpha, beta, level=0.90):
    tail = (1.0 - level) / 2.0
    return (beta_ppf(tail, alpha, beta), beta_ppf(1.0 - tail, alpha, beta))


def prob_below(alpha, beta, threshold):
    """Posterior probability that the true rate is below `threshold`."""
    return reg_incomplete_beta(threshold, alpha, beta)
