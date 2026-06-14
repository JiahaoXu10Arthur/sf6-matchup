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
