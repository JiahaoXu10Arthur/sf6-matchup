"""The web Personal Scout ports bayes.py + personal_scout.py + the pure half of
fetch_battlelog.py to JS (web/scout.js). These tests run that port via node and
assert it matches the Python originals, so the two implementations cannot drift."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

from bayes import reg_incomplete_beta, beta_ppf
from personal_scout import classify, scout
from fetch_battlelog import parse_battlelog
from roster import NAME_BY_SLUG

HARNESS = ROOT / 'tests' / 'scout_parity_harness.js'
FIXTURE = ROOT / 'tests' / 'fixtures' / 'battlelog_sample.json'
OWNER = 1993249284
NAMES = list(NAME_BY_SLUG.values())
TOL = 1e-9

pytestmark = pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')


def js(mode, arg):
    out = subprocess.run(['node', str(HARNESS), mode, json.dumps(arg)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_reg_incomplete_beta_matches():
    cases = [[0.3, 1.0, 1.0], [0.5, 5.0, 5.0], [0.4, 3.0, 7.0],
             [0.485, 10.4, 11.0], [0.01, 2.0, 40.0], [0.97, 30.0, 1.5]]
    got = js('reg', {'cases': cases})
    for (x, a, b), g in zip(cases, got):
        assert g == pytest.approx(reg_incomplete_beta(x, a, b), abs=TOL)


def test_beta_ppf_matches():
    cases = [[0.05, 8.0, 4.0], [0.5, 8.0, 4.0], [0.95, 8.0, 4.0],
             [0.05, 10.4, 11.0], [0.95, 10.4, 11.0]]
    got = js('ppf', {'cases': cases})
    for (q, a, b), g in zip(cases, got):
        assert g == pytest.approx(beta_ppf(q, a, b), abs=TOL)


def test_classify_matches():
    # a grid spanning every verdict branch: weakness, overperform, small, on-par
    cases = [
        [0.52, 0, 2], [0.52, 2, 0], [0.55, 4, 20], [0.55, 20, 4],
        [0.50, 5, 5], [0.48, 1, 1], [0.60, 12, 8], [0.40, 8, 12],
        [0.52, 0, 0], [0.50, 30, 30],
    ]
    got = js('classify', {'cases': cases})
    for (p0, w, l), g in zip(cases, got):
        py = classify(p0, w, l)
        assert g['verdict'] == py['verdict']
        assert g['n'] == py['n']
        assert g['shrunk'] == pytest.approx(py['shrunk'], abs=TOL)
        assert g['lo'] == pytest.approx(py['lo'], abs=TOL)
        assert g['hi'] == pytest.approx(py['hi'], abs=TOL)
        assert g['probBelow'] == pytest.approx(py['prob_below'], abs=TOL)
        assert g['deficit'] == pytest.approx(py['deficit'], abs=TOL)


def test_parse_battlelog_matches():
    next_data = json.loads(FIXTURE.read_text())
    py = parse_battlelog(next_data, OWNER)
    g = js('parse', {'fixturePath': str(FIXTURE), 'owner': OWNER, 'names': NAMES})
    assert g == py


def test_scout_join_matches():
    # synthetic personal record + baseline covering several verdict branches
    agg = {'CHUN-LI': [0, 3], 'KEN': [6, 1], 'LUKE': [10, 10],
           'RYU': [2, 2], 'CAMMY': [3, 9]}
    baseline = {'CHUN-LI': 0.52, 'KEN': 0.49, 'LUKE': 0.50,
                'RYU': 0.51, 'CAMMY': 0.55, 'ABSENT': 0.50}
    py = scout(agg, baseline)
    g = js('scout', {'agg': agg, 'baseline': baseline})
    assert [r['opp'] for r in g] == [r['opp'] for r in py]   # same worst-first order
    for gr, pr in zip(g, py):
        assert gr['verdict'] == pr['verdict']
        assert gr['wins'] == pr['wins'] and gr['losses'] == pr['losses']
        assert gr['shrunk'] == pytest.approx(pr['shrunk'], abs=TOL)
        assert gr['deficit'] == pytest.approx(pr['deficit'], abs=TOL)


def test_valid_rows_filters_unknown_chars_bad_results_and_missing_id():
    names = ['TERRY', 'KEN']
    rows = [
        {'replay_id': 'a', 'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W', 'date': '1', 'rank_mr': ''},   # keep
        {'replay_id': 'b', 'your_char': 'TERRY', 'opp_char': '<img src=x onerror=alert(1)>', 'result': 'W', 'date': '1', 'rank_mr': ''},  # injection name
        {'replay_id': 'c', 'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'X', 'date': '1', 'rank_mr': ''},   # bad result
        {'replay_id': '', 'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'L', 'date': '1', 'rank_mr': ''},    # no id
    ]
    out = js('valid', {'rows': rows, 'names': names})
    assert [r['replay_id'] for r in out] == ['a']   # only the well-formed, in-roster row survives


def test_csv_to_rows_rejects_a_malformed_header():
    good = 'replay_id,date,your_char,opp_char,rank_mr,result\nx,1,TERRY,KEN,,W\n'
    bad = 'foo,bar\n1,2\n'   # missing required columns
    assert js('csv', {'text': good})['rows'][0]['replay_id'] == 'x'
    assert 'error' in js('csv', {'text': bad})
