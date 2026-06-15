"""The web Personal-mode lens (web/scout.js personalRow/personalEncounter) blends
your record with the global baseline via the already-parity-tested classify().
These tests assert the key invariants through Node against the real matrix."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / 'tests' / 'personal_lens_harness.js'
MATRIX = ROOT / 'output' / 'matrix.csv'

pytestmark = [
    pytest.mark.skipif(shutil.which('node') is None, reason='node not installed'),
    pytest.mark.skipif(not MATRIX.exists(), reason='matrix.csv not built'),
]


def run(mode, arg):
    out = subprocess.run(['node', str(HARNESS), str(MATRIX), mode, json.dumps(arg)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_personal_row_empty_equals_global():
    # with no personal games, the shrunk row equals the global COMB row exactly
    crow = run('crow', {'char': 'TERRY'})
    prow = run('prow', {'char': 'TERRY', 'agg': {}})
    assert set(prow) == set(crow)
    for opp in crow:
        assert prow[opp] == pytest.approx(crow[opp], abs=1e-9)


def test_personal_row_shrinks_a_loss_below_baseline_not_to_zero():
    crow = run('crow', {'char': 'TERRY'})
    opp = next(iter(crow))
    prow = run('prow', {'char': 'TERRY', 'agg': {opp: [0, 2]}})
    assert prow[opp] < crow[opp]          # a 0-2 record pulls you below baseline
    assert prow[opp] > 0.0                # but shrinkage keeps it well above 0%
    other = [o for o in crow if o != opp][0]
    assert prow[other] == pytest.approx(crow[other], abs=1e-9)   # untouched


def test_personal_encounter_counts():
    rows = [
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W'},
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'L'},
        {'your_char': 'TERRY', 'opp_char': 'RYU', 'result': 'W'},
        {'your_char': 'CAMMY', 'opp_char': 'KEN', 'result': 'W'},   # different main
    ]
    enc = run('enc', {'rows': rows, 'char': 'TERRY'})
    assert enc == {'KEN': 2, 'RYU': 1}
