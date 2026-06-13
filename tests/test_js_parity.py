"""The web UI ports scoring.py/analyze.py/recommend.py to JS (web/scoring.js).
These tests run that port via node against the real matrix and assert it
matches the Python originals, so the two implementations cannot silently drift."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

from analyze import char_table, combined_row
from roster import NAME_BY_SLUG, PATCH_MONTH
from scoring import correlation, coverage, month_weights, shared_weaknesses

MATRIX = ROOT / 'output' / 'matrix.csv'
MONTHS = ['202601', '202602', '202603', '202604', '202605']
TOL = 1e-9

pytestmark = [
    pytest.mark.skipif(shutil.which('node') is None, reason='node not installed'),
    pytest.mark.skipif(not MATRIX.exists(), reason='matrix.csv not built'),
]


def js_results(profile, weights=None):
    args = ['node', str(ROOT / 'tests' / 'parity_harness.js'), str(MATRIX),
            'TERRY', profile]
    if weights is not None:
        args.append(json.dumps(weights))
    out = subprocess.run(args, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


@pytest.fixture(scope='module', params=['current', 'all'])
def parity(request):
    profile = request.param
    mw = month_weights(MONTHS, profile, PATCH_MONTH)
    return js_results(profile), mw


def test_char_table_matches_python(parity):
    js, mw = parity
    py = {r[0]: r for r in char_table('TERRY', MONTHS, mw, {'INGRID'})}
    assert set(js['table']) == set(py)
    for opp, j in js['table'].items():
        opp_, t40, t41, t42, comb, spread, dpatch, nmonths = py[opp]
        assert j['comb'] == pytest.approx(comb, abs=TOL)
        for jv, pv in ((j['t40'], t40), (j['t41'], t41), (j['t42'], t42),
                       (j['dpatch'], dpatch)):
            assert (jv is None) == (pv is None)
            if pv is not None:
                assert jv == pytest.approx(pv, abs=TOL)
        assert j['spread'] == pytest.approx(spread, abs=TOL)
        assert j['nmonths'] == nmonths


def test_sub_table_matches_python(parity):
    js, mw = parity
    exclude = {'INGRID'}
    main_row = combined_row('TERRY', MONTHS, mw, exclude)
    worst3 = sorted(main_row, key=main_row.get)[:3]
    assert js['worst3'] == worst3

    candidates = [n for n in NAME_BY_SLUG.values()
                  if n != 'TERRY' and n not in exclude]
    checked = 0
    for sub in candidates:
        row = combined_row(sub, MONTHS, mw, exclude)
        if not row:
            continue
        j = js['subs'][sub]
        assert j['cover'] == pytest.approx(coverage(main_row, row), abs=TOL)
        for r, key in ((40, 'c40'), (41, 'c41'), (42, 'c42')):
            tier_row = combined_row(sub, MONTHS, mw, exclude, ranks=[r])
            assert j[key] == pytest.approx(coverage(main_row, tier_row), abs=TOL)
        w3 = [row[o] for o in worst3 if o in row]
        w3win = sum(w3) / len(w3) * 10 if w3 else None
        assert j['w3win'] == pytest.approx(w3win, abs=TOL)
        assert j['corr'] == pytest.approx(correlation(main_row, row), abs=TOL)
        assert j['shared'] == len(shared_weaknesses(main_row, row))
        checked += 1
    assert checked == len(js['subs']) == 28


def test_sub_table_matches_python_with_opponent_weights():
    mw = month_weights(MONTHS, 'current', PATCH_MONTH)
    exclude = {'INGRID'}
    weights = {'CHUN-LI': 2.0, 'KEN': 0.0, 'ALEX': 3.0}   # target, drop, target
    js = js_results('current', weights)
    main_row = combined_row('TERRY', MONTHS, mw, exclude)
    for sub in (n for n in NAME_BY_SLUG.values() if n != 'TERRY' and n not in exclude):
        row = combined_row(sub, MONTHS, mw, exclude)
        if not row:
            continue
        assert js['subs'][sub]['cover'] == pytest.approx(
            coverage(main_row, row, weights), abs=TOL)
        for r, key in ((40, 'c40'), (41, 'c41'), (42, 'c42')):
            tier_row = combined_row(sub, MONTHS, mw, exclude, ranks=[r])
            assert js['subs'][sub][key] == pytest.approx(
                coverage(main_row, tier_row, weights), abs=TOL)
