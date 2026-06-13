import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from scoring import (month_weights, wavg, coverage, correlation,
                     shared_weaknesses, expand_months)

MONTHS = ['202601', '202602', '202603', '202604', '202605']


def test_month_weights_all_profile_is_equal():
    assert month_weights(MONTHS, 'all', '202603') == {m: 1.0 for m in MONTHS}


def test_month_weights_current_profile_zeroes_prepatch():
    w = month_weights(MONTHS, 'current', '202603')
    assert w == {'202601': 0.0, '202602': 0.0, '202603': 0.5,
                 '202604': 1.0, '202605': 1.0}


def test_month_weights_current_falls_back_when_all_prepatch():
    w = month_weights(['202601', '202602'], 'current', '202603')
    assert w == {'202601': 1.0, '202602': 1.0}


def test_wavg_weighted_average():
    assert wavg({'a': 4.0, 'b': 6.0}, {'a': 1.0, 'b': 3.0}) == pytest.approx(5.5)


def test_wavg_ignores_zero_weight_and_missing_keys():
    assert wavg({'a': 4.0, 'b': 9.9}, {'a': 2.0, 'b': 0.0}) == pytest.approx(4.0)
    assert wavg({}, {'a': 1.0}) is None


def test_coverage_only_counts_main_losing_matchups():
    main = {'A': 4.5, 'B': 5.5}          # only A is a weakness, w = 0.25
    sub = {'A': 6.0, 'B': 4.0}           # sub edge vs A = +1.0
    assert coverage(main, sub) == pytest.approx(1.0)


def test_coverage_squared_weights_dominated_by_worst_matchup():
    main = {'A': 4.0, 'B': 4.9}          # w(A)=1.0, w(B)=0.01
    sub = {'A': 5.0, 'B': 9.0}           # B's huge edge barely matters
    assert coverage(main, sub) == pytest.approx((0.0 + 0.01 * 4.0) / 1.01)


def test_correlation_perfect_anticorrelation():
    a = {'x': 4.0, 'y': 5.0, 'z': 6.0}
    b = {'x': 6.0, 'y': 5.0, 'z': 4.0}
    assert correlation(a, b) == pytest.approx(-1.0)


def test_shared_weaknesses():
    a = {'x': 4.5, 'y': 4.5, 'z': 5.5}
    b = {'x': 4.8, 'y': 5.2, 'z': 4.0}
    assert shared_weaknesses(a, b) == ['x']


def test_expand_months_range_and_cross_year():
    assert expand_months(['202601-202605']) == MONTHS
    assert expand_months(['202511-202602']) == ['202511', '202512', '202601', '202602']
    assert expand_months(['202604', '202605']) == ['202604', '202605']


def test_parse_weights_custom_spec():
    from scoring import parse_weights
    assert parse_weights('202601=0,202603=0.5,202605=1') == {
        '202601': 0.0, '202603': 0.5, '202605': 1.0}


def test_coverage_missing_sub_data_counts_as_neutral():
    main = {'A': 4.5, 'B': 4.5}          # equal weaknesses, w = 0.25 each
    sub = {'A': 6.0}                     # no data vs B -> neutral 5.0
    assert coverage(main, sub) == pytest.approx(0.5)


def test_coverage_weight_zero_drops_opponent():
    main = {'A': 4.5, 'B': 4.5}          # equal weaknesses
    sub = {'A': 6.0, 'B': 4.0}           # +1 vs A, -1 vs B → cancels at default
    assert coverage(main, sub) == pytest.approx(0.0)
    assert coverage(main, sub, {'B': 0.0}) == pytest.approx(1.0)   # drop B → only A


def test_coverage_weight_targets_non_weakness():
    main = {'A': 4.5, 'B': 5.2}          # A weakness (sev .25), B favourable (sev 0)
    sub = {'A': 5.0, 'B': 6.0}           # neutral vs A, strong vs B
    assert coverage(main, sub) == pytest.approx(0.0)            # default: B ignored
    # target B at u=3: inject=.25; w(A)=.25 (edge 0), w(B)=2*.25=.5 (edge +1)
    assert coverage(main, sub, {'B': 3.0}) == pytest.approx(0.5 / 0.75)


def test_correlation_no_shared_opponents_returns_zero():
    assert correlation({'x': 4.0}, {'y': 6.0}) == 0.0


def test_correlation_single_shared_opponent_returns_zero():
    assert correlation({'x': 5.0, 'y': 4.0}, {'x': 5.0, 'z': 6.0}) == 0.0


def test_wavg_disjoint_weight_keys_returns_none():
    assert wavg({'a': 4.0}, {'b': 1.0}) is None
