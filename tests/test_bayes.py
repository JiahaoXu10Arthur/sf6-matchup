import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from bayes import reg_incomplete_beta


def test_incomplete_beta_uniform_is_identity():
    # I_x(1,1) == x  (Beta(1,1) is Uniform)
    assert reg_incomplete_beta(0.3, 1.0, 1.0) == pytest.approx(0.3, abs=1e-9)


def test_incomplete_beta_endpoints():
    assert reg_incomplete_beta(0.0, 2.0, 5.0) == 0.0
    assert reg_incomplete_beta(1.0, 2.0, 5.0) == 1.0


def test_incomplete_beta_symmetry():
    # I_x(a,b) == 1 - I_(1-x)(b,a)
    x, a, b = 0.4, 3.0, 7.0
    assert reg_incomplete_beta(x, a, b) == pytest.approx(
        1.0 - reg_incomplete_beta(1.0 - x, b, a), abs=1e-12)


def test_incomplete_beta_median_symmetric_beta():
    # Beta(5,5) is symmetric about 0.5 -> CDF(0.5) == 0.5
    assert reg_incomplete_beta(0.5, 5.0, 5.0) == pytest.approx(0.5, abs=1e-9)


from bayes import (beta_posterior, posterior_mean, beta_ppf,
                   credible_interval, prob_below)


def test_beta_posterior_uniform_prior():
    # p0=0.5, kappa=2 -> Beta(1,1) prior; +7 wins, +3 losses -> Beta(8,4)
    a, b = beta_posterior(0.5, 2.0, 7, 3)
    assert (a, b) == pytest.approx((8.0, 4.0))
    assert posterior_mean(a, b) == pytest.approx(8.0 / 12.0)


def test_beta_ppf_inverts_cdf():
    a, b = 8.0, 4.0
    for q in (0.05, 0.5, 0.95):
        x = beta_ppf(q, a, b)
        assert reg_incomplete_beta(x, a, b) == pytest.approx(q, abs=1e-6)


def test_credible_interval_brackets_mean_and_narrows_with_data():
    # more games -> tighter interval around the same prior mean
    a1, b1 = beta_posterior(0.5, 20.0, 5, 5)
    a2, b2 = beta_posterior(0.5, 20.0, 50, 50)
    lo1, hi1 = credible_interval(a1, b1, 0.90)
    lo2, hi2 = credible_interval(a2, b2, 0.90)
    assert lo1 < posterior_mean(a1, b1) < hi1
    assert (hi2 - lo2) < (hi1 - lo1)


def test_prob_below_equals_cdf():
    a, b = 8.0, 4.0
    assert prob_below(a, b, 0.5) == pytest.approx(reg_incomplete_beta(0.5, a, b))


def test_shrinkage_pulls_toward_prior():
    # raw rate 0.2 over few games stays near the 0.5 baseline prior...
    few = posterior_mean(*beta_posterior(0.5, 20.0, 2, 8))
    # ...but over many games moves toward the raw 0.2
    many = posterior_mean(*beta_posterior(0.5, 20.0, 20, 80))
    assert 0.2 < many < few < 0.5
