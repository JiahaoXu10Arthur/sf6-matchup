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

def test_apply_mr_bridge_zero_gap_is_noop():
    assert abs(run('applyMrBridge', {'p': 0.50, 'gap': 0.0, 'beta': 0.4}) - 0.50) < 1e-9

def test_apply_mr_bridge_tougher_schedule_raises_rate():
    # gap = (you - opp)/100; negative gap = opponents stronger -> normalized rate higher
    up = run('applyMrBridge', {'p': 0.50, 'gap': -2.0, 'beta': 0.4})
    assert up > 0.50

def test_mr_slope_falls_back_without_mr():
    rows = [{'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W', 'rank_mr': '', 'opp_mr': ''}]
    res = run('mrSlope', {'rows': rows, 'char': 'TERRY'})
    assert res['fallback'] is True

def test_matchup_gaps_mean_per_opponent():
    rows = [
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '1500', 'opp_mr': '1700', 'result': 'L'},
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '1500', 'opp_mr': '1500', 'result': 'W'},
    ]
    g = run('matchupGaps', {'rows': rows, 'char': 'TERRY'})
    assert abs(g['KEN'] - (-1.0)) < 1e-9      # mean gap (-200 + 0)/2 /100 = -1.0

def test_mr_slope_separable_data_stays_bounded():
    # Perfectly separable: wins only when you outrank, losses only when you underrank.
    # Logistic MLE diverges here; the fitted beta must be clamped, not blow up.
    rows = (
        [{'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '1700', 'opp_mr': '1500', 'result': 'W'}] * 8 +
        [{'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '1500', 'opp_mr': '1700', 'result': 'L'}] * 8 +
        [{'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '1600', 'opp_mr': '1600', 'result': 'W'}]
    )
    res = run('mrSlope', {'rows': rows, 'char': 'TERRY'})
    assert res['fallback'] is False        # 17 games >= MR_MIN_SAMPLE, so it fits
    assert abs(res['beta']) <= 3.0          # clamped to MR_MAX_BETA, not divergent

def test_diagnose_no_opts_unchanged():
    a = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.50}, 'agg': {'KEN': [2, 4]}})
    b = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.50}, 'agg': {'KEN': [2, 4]}, 'opts': {'alpha': 0}})
    assert a == b

def test_diagnose_phase_sharpens_shrunk():
    no_phase = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.50}, 'agg': {'KEN': [3, 0]}})
    withp    = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.50}, 'agg': {'KEN': [3, 0]},
                'opts': {'alpha': 0.7, 'phase': {'KEN': [40, 200]}}})   # 20% phase rate, big n
    assert withp[0]['shrunk'] < no_phase[0]['shrunk']

def test_diagnose_phase_absent_opponent_is_plain_classify():
    # opponent present in baseline but NOT in phase -> no phase term, same as plain
    plain = run('diagnoseFromBaseline', {'baseline': {'RYU': 0.50}, 'agg': {'RYU': [1, 1]}})
    withp = run('diagnoseFromBaseline', {'baseline': {'RYU': 0.50}, 'agg': {'RYU': [1, 1]},
                'opts': {'alpha': 0.7, 'phase': {'KEN': [40, 200]}}})   # phase has KEN, not RYU
    assert plain[0]['shrunk'] == withp[0]['shrunk']

def test_diagnose_phase_mr_bridge_adjusts_shrunk():
    # gap < 0 means opponents were stronger on average -> raw phase rate understates skill,
    # so the bridge raises the rate -> shrunk should be higher than with no gap (bridge no-op).
    no_bridge = run('diagnoseFromBaseline', {
        'baseline': {'KEN': 0.50}, 'agg': {'KEN': [0, 0]},
        'opts': {'alpha': 0.7, 'phase': {'KEN': [40, 200]},
                 'gaps': {'KEN': 0.0}, 'mrBeta': 0.4}
    })
    with_gap = run('diagnoseFromBaseline', {
        'baseline': {'KEN': 0.50}, 'agg': {'KEN': [0, 0]},
        'opts': {'alpha': 0.7, 'phase': {'KEN': [40, 200]},
                 'gaps': {'KEN': -2.0}, 'mrBeta': 0.4}  # stronger opponents -> bridged rate rises
    })
    assert with_gap[0]['shrunk'] > no_bridge[0]['shrunk']

def test_sanitize_phase_drops_unknown_and_coerces():
    dirty = {'seasonId': 12,
             'perChar': {'TERRY': [264, 516], '<img>': [9, 9]},
             'perMatchup': {'TERRY': {'MARISA': ['1', '7'], 'BADGUY': [2, 2]}}}
    clean = run('sanitizePhaseStats', {'ps': dirty, 'names': ['TERRY', 'MARISA']})
    assert clean['perChar'] == {'TERRY': [264, 516]}          # unknown '<img>' dropped
    assert clean['perMatchup'] == {'TERRY': {'MARISA': [1, 7]}}  # string counts coerced; BADGUY dropped

def test_sanitize_phase_clamps_and_drops_zero_battle():
    dirty = {'seasonId': 5, 'perChar': {'TERRY': [99, 5], 'MARISA': [3, 0]}}
    clean = run('sanitizePhaseStats', {'ps': dirty, 'names': ['TERRY', 'MARISA']})
    assert clean['perChar'] == {'TERRY': [5, 5]}   # win 99 clamped to battle 5; MARISA dropped (0 battle)

def test_sanitize_phase_empty_or_absent_returns_none():
    assert run('sanitizePhaseStats', {'ps': {'perChar': {}, 'perMatchup': {}}, 'names': ['TERRY']}) is None
    assert run('sanitizePhaseStats', {'ps': None, 'names': ['TERRY']}) is None

def test_sanitize_phase_rejects_infinity_counts():
    # "Infinity" strings must NOT survive coercion (Number('Infinity') is Infinity).
    dirty = {'perChar': {'TERRY': ['Infinity', 'Infinity'], 'MARISA': [3, 'Infinity']}}
    clean = run('sanitizePhaseStats', {'ps': dirty, 'names': ['TERRY', 'MARISA']})
    assert clean is None     # both battle counts -> 0 -> dropped -> nothing valid -> None

def test_sanitize_phase_drops_proto_key():
    dirty = {'perChar': {'__proto__': [5, 10], 'TERRY': [3, 4]}}
    clean = run('sanitizePhaseStats', {'ps': dirty, 'names': ['TERRY']})
    assert clean['perChar'] == {'TERRY': [3, 4]}   # __proto__ not a roster name -> dropped

def test_parse_phase_rejects_infinity_counts():
    raw = {'current_season_id': 1,
           'character_win_rates': [
               {'character_id': 32, 'character_alpha': 'TERRY', 'win_count': 'Infinity', 'battle_count': 'Infinity'}],
           'character_win_rates_by_rival_character': []}
    ps = run('parsePhaseStats', {'phaseRaw': raw, 'names': ['TERRY']})
    assert ps['perChar'] == {}     # Infinity battle -> 0 -> dropped

def test_parse_phase_rejects_nonnumeric_season_id():
    raw = {'current_season_id': '<img src=x onerror=alert(1)>',
           'character_win_rates': [{'character_id': 32, 'character_alpha': 'TERRY', 'win_count': 1, 'battle_count': 2}],
           'character_win_rates_by_rival_character': []}
    ps = run('parsePhaseStats', {'phaseRaw': raw, 'names': ['TERRY']})
    assert ps['seasonId'] is None                 # non-numeric season id rejected at the parse boundary
    assert ps['perChar'] == {'TERRY': [1, 2]}     # the rest still parses

def test_parse_phase_keeps_numeric_season_id():
    raw = {'current_season_id': 12,
           'character_win_rates': [{'character_id': 32, 'character_alpha': 'TERRY', 'win_count': 1, 'battle_count': 2}],
           'character_win_rates_by_rival_character': []}
    ps = run('parsePhaseStats', {'phaseRaw': raw, 'names': ['TERRY']})
    assert ps['seasonId'] == 12

def test_merge_rosters_carries_imported_phasestats():
    base = {'5': {'cfnId': '5', 'name': 'P', 'isSelf': False, 'rows': [], 'updatedAt': 1,
                  'phaseStats': {'seasonId': 11, 'perChar': {'TERRY': [1, 2]}, 'perMatchup': {}}}}
    inc  = {'5': {'cfnId': '5', 'name': 'P', 'isSelf': False, 'rows': [], 'updatedAt': 2,
                  'phaseStats': {'seasonId': 12, 'perChar': {'TERRY': [9, 10]}, 'perMatchup': {}}}}
    out = run('mergeRosters', {'base': base, 'incoming': inc})
    assert out['5']['phaseStats']['perChar'] == {'TERRY': [9, 10]}   # incoming replaces

def test_merge_rosters_preserves_phasestats_when_incoming_absent():
    base = {'5': {'cfnId': '5', 'name': 'P', 'isSelf': False, 'rows': [], 'updatedAt': 1,
                  'phaseStats': {'seasonId': 11, 'perChar': {'TERRY': [1, 2]}, 'perMatchup': {}}}}
    inc  = {'5': {'cfnId': '5', 'name': 'P', 'isSelf': False, 'rows': [], 'updatedAt': 2}}  # no phaseStats
    out = run('mergeRosters', {'base': base, 'incoming': inc})
    assert out['5']['phaseStats']['perChar'] == {'TERRY': [1, 2]}    # existing preserved

RAW_SLICE = {
    'mode': 'ranked', 'phase': 12,
    'characterWinRates': [
        {'character_id': 0,  'character_alpha': 'ANY',   'win_count': 9,  'battle_count': 18},
        {'character_id': 27, 'character_alpha': 'TERRY', 'win_count': 212,'battle_count': 424},
        {'character_id': 1,  'character_alpha': 'RYU',   'win_count': 0,  'battle_count': 0},
    ],
    'rivalWinRates': [
        {'character_id': 27, 'rival_character_win_rates': [
            {'rival_character_id': 0,  'rival_character_alpha': 'ANY',     'win_count': 100, 'battle_count': 200},
            {'rival_character_id': 18, 'rival_character_alpha': 'MARISA',  'win_count': 1,   'battle_count': 7},
            {'rival_character_id': 99, 'rival_character_alpha': 'ZZGLITCH','win_count': 3,   'battle_count': 3},
            {'rival_character_id': 7,  'rival_character_alpha': 'JURI',    'win_count': 99,  'battle_count': 5},
        ]},
    ],
}
NAMES2 = ['TERRY', 'RYU', 'MARISA', 'JURI']

def test_parse_slice_maps_and_keeps_mode_phase():
    sl = run('parsePhaseSlice', {'rawSlice': RAW_SLICE, 'names': NAMES2})
    assert sl['mode'] == 'ranked' and sl['phase'] == 12
    assert sl['perChar'] == {'TERRY': [212, 424]}
    assert sl['perMatchup']['TERRY']['MARISA'] == [1, 7]
    assert 'ZZGLITCH' not in sl['perMatchup']['TERRY']
    assert sl['perMatchup']['TERRY']['JURI'] == [5, 5]

def test_parse_slice_absent_returns_null():
    assert run('parsePhaseSlice', {'rawSlice': None, 'names': NAMES2}) is None

def test_parse_slice_rejects_infinity():
    raw = {'mode': 'ranked', 'phase': 5,
           'characterWinRates': [{'character_id': 27, 'character_alpha': 'TERRY', 'win_count': 'Infinity', 'battle_count': 'Infinity'}],
           'rivalWinRates': []}
    sl = run('parsePhaseSlice', {'rawSlice': raw, 'names': NAMES2})
    assert sl['perChar'] == {}
