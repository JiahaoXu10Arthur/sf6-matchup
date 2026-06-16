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

PHASE_RAW = {
    'current_season_id': 12,
    'character_win_rates': [
        {'character_id': 0,  'character_alpha': 'ANY',   'win_count': 9,  'battle_count': 18},
        {'character_id': 32, 'character_alpha': 'TERRY', 'win_count': 264,'battle_count': 516},
        {'character_id': 1,  'character_alpha': 'RYU',   'win_count': 0,  'battle_count': 0},
    ],
    'character_win_rates_by_rival_character': [
        {'character_id': 32, 'rival_character_win_rates': [
            {'rival_character_id': 0,  'rival_character_alpha': 'ANY',     'win_count': 264, 'battle_count': 516},
            {'rival_character_id': 18, 'rival_character_alpha': 'MARISA',  'win_count': 1,   'battle_count': 7},
            {'rival_character_id': 99, 'rival_character_alpha': 'ZZGLITCH','win_count': 3,   'battle_count': 3},
            {'rival_character_id': 7,  'rival_character_alpha': 'JURI',    'win_count': 99,  'battle_count': 5},
        ]},
    ],
}
NAMES = ['TERRY', 'RYU', 'MARISA', 'JURI']

def test_parse_phase_maps_and_drops_any_unknown_zero():
    ps = run('parsePhaseStats', {'phaseRaw': PHASE_RAW, 'names': NAMES})
    assert ps['seasonId'] == 12
    assert ps['perChar'] == {'TERRY': [264, 516]}            # ANY dropped, RYU 0-battle dropped
    assert ps['perMatchup']['TERRY']['MARISA'] == [1, 7]     # mapped
    assert 'ZZGLITCH' not in ps['perMatchup']['TERRY']       # unknown dropped
    assert 'ANY' not in ps['perMatchup']['TERRY']            # aggregate dropped

def test_parse_phase_clamps_win_to_battle():
    ps = run('parsePhaseStats', {'phaseRaw': PHASE_RAW, 'names': NAMES})
    assert ps['perMatchup']['TERRY']['JURI'] == [5, 5]       # win_count 99 clamped to battle_count 5

def test_parse_phase_absent_returns_none():
    assert run('parsePhaseStats', {'phaseRaw': None, 'names': NAMES}) is None

def test_parse_phase_coerces_bad_counts():
    raw = {
        'current_season_id': 5,
        'character_win_rates': [
            {'character_id': 32, 'character_alpha': 'TERRY', 'win_count': -5, 'battle_count': 10},
            {'character_id': 1,  'character_alpha': 'RYU',   'win_count': 'abc', 'battle_count': None},
        ],
        'character_win_rates_by_rival_character': [],
    }
    ps = run('parsePhaseStats', {'phaseRaw': raw, 'names': ['TERRY', 'RYU']})
    assert ps['perChar'] == {'TERRY': [0, 10]}   # -5 -> 0 (clamped non-negative); RYU battle None -> 0 -> dropped

def test_parsepayload_includes_phasestats():
    payload = {'owner': 5, 'name': 'P', 'replays': [], 'phaseRaw': PHASE_RAW}
    res = run('parsePayload', {'payload': payload, 'names': NAMES})
    assert res['phaseStats']['perChar'] == {'TERRY': [264, 516]}

def test_parsepayload_no_phaseraw_is_none():
    payload = {'owner': 5, 'name': 'P', 'replays': []}
    res = run('parsePayload', {'payload': payload, 'names': NAMES})
    assert res['phaseStats'] is None

def test_routepull_phase_replaces_and_battlelog_only_preserves():
    pl1 = {'owner': '5', 'name': 'P', 'rows': [],
           'phaseStats': {'seasonId': 12, 'perChar': {'TERRY': [1, 2]}, 'perMatchup': {}}}
    r1 = run('routePull', {'roster': {}, 'payload': pl1, 'now': 1})
    assert r1['roster']['5']['phaseStats']['perChar'] == {'TERRY': [1, 2]}
    # battlelog-only pull (no phaseStats key) must keep the prior snapshot
    pl2 = {'owner': '5', 'name': 'P', 'rows': []}
    r2 = run('routePull', {'roster': r1['roster'], 'payload': pl2, 'now': 2})
    assert r2['roster']['5']['phaseStats']['perChar'] == {'TERRY': [1, 2]}

def test_routepull_new_profile_without_phase_has_no_key():
    r = run('routePull', {'roster': {}, 'payload': {'owner': '9', 'name': 'Q', 'rows': []}, 'now': 1})
    assert 'phaseStats' not in r['roster']['9']
