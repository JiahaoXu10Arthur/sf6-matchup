"""Buckler phase-stats fusion — pure functions in web/scout.js, via Node."""
import json, shutil, subprocess
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / 'tests' / 'roster_harness.js'
pytestmark = pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')

def run(mode, arg):
    out = subprocess.run(['node', str(HARNESS), mode, json.dumps(arg)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)

def test_phase_alpha_zero_is_identical_to_no_phase():
    base = run('classify', {'p0': 0.50, 'wins': 2, 'losses': 4})
    off  = run('classify', {'p0': 0.50, 'wins': 2, 'losses': 4,
                            'opts': {'phase': {'p': 0.20, 'n': 500, 'alpha': 0}}})
    assert off == base

def test_phase_pulls_thin_recent_toward_phase_rate():
    no_phase = run('classify', {'p0': 0.50, 'wins': 3, 'losses': 0})           # lucky recent
    fused    = run('classify', {'p0': 0.50, 'wins': 3, 'losses': 0,
                                'opts': {'phase': {'p': 0.40, 'n': 200, 'alpha': 0.7}}})
    assert fused['shrunk'] < no_phase['shrunk']        # big phase sample drags it down
    assert fused['shrunk'] < 0.50

def test_phase_deficit_and_verdict_stay_vs_global_p0():
    fused = run('classify', {'p0': 0.50, 'wins': 0, 'losses': 2,
                             'opts': {'phase': {'p': 0.35, 'n': 100, 'alpha': 0.7}}})
    assert fused['deficit'] > 0                        # measured vs global 0.50, not vs 0.35
    assert fused['shrunk'] < 0.50
