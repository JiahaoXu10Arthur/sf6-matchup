import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from personal_scout import classify


def test_classify_real_weakness():
    # baseline 0.52, you are 9-15 (24 games) -> credibly and materially below
    r = classify(0.52, 9, 15)
    assert r['verdict'] == 'real weakness'
    assert r['shrunk'] < 0.52
    assert r['n'] == 24


def test_classify_small_sample_not_flagged():
    # 2-6 over 8 games is < MIN_TRUST and shrinks toward baseline -> not a weakness
    r = classify(0.52, 2, 6)
    assert r['verdict'] == 'small sample'


def test_classify_overperforming():
    r = classify(0.48, 30, 10)   # 75% over 40 games vs 0.48 baseline
    assert r['verdict'] == 'overperforming'
    assert r['shrunk'] > 0.48


def test_classify_on_par():
    r = classify(0.50, 20, 20)   # exactly at baseline, plenty of games
    assert r['verdict'] == 'on par'


def test_classify_deficit_ranks_worst_first():
    worse = classify(0.55, 5, 25)      # big, confident deficit
    milder = classify(0.51, 12, 18)    # smaller deficit
    assert worse['deficit'] > milder['deficit']


from personal_scout import load_personal, aggregate

FIX = Path(__file__).resolve().parent / 'fixtures' / 'personal_terry.csv'


def test_load_personal_reads_all_rows():
    rows = load_personal(FIX)
    assert len(rows) == 6
    assert rows[0]['opp_char'] == 'DHALSIM' and rows[0]['result'] == 'L'


def test_aggregate_filters_by_char_and_counts_wl():
    agg = aggregate(load_personal(FIX), 'TERRY')
    assert agg['DHALSIM'] == (1, 2)   # 1 win, 2 losses
    assert agg['KEN'] == (2, 0)
    assert 'RYU' not in agg            # that game was on LUKE, not TERRY


from personal_scout import baseline_winrates, scout, format_report


def test_baseline_winrates_are_probabilities():
    # combined_row scores are ~5.0-centred /10 -> probabilities near 0.5
    base = baseline_winrates('TERRY', months=None, exclude={'INGRID'})
    assert base, 'TERRY should have baseline opponents'
    assert all(0.2 < p < 0.8 for p in base.values())


def test_scout_produces_verdicts_sorted_worst_first():
    rows = load_personal(FIX)
    base = baseline_winrates('TERRY', months=None, exclude={'INGRID'})
    results = scout(aggregate(rows, 'TERRY'), base)
    # only opponents you have games against AND that exist in the baseline
    names = [r['opp'] for r in results]
    assert 'DHALSIM' in names and 'KEN' in names
    # sorted by deficit descending -> first row has the largest credible deficit
    deficits = [r['deficit'] for r in results]
    assert deficits == sorted(deficits, reverse=True)


def test_format_report_contains_headline_and_table():
    base = baseline_winrates('TERRY', months=None, exclude={'INGRID'})
    results = scout(aggregate(load_personal(FIX), 'TERRY'), base)
    md = format_report('TERRY', results)
    assert '# TERRY' in md
    assert '| Opponent |' in md
    assert 'DHALSIM' in md
