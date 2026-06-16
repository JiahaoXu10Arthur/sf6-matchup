"""Coach / priority engine — pure functions in web/scout.js, exercised via Node."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / 'tests' / 'roster_harness.js'
pytestmark = pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')


def run(mode, arg):
    out = subprocess.run(['node', str(HARNESS), mode, json.dumps(arg)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_parse_captures_opponent_mr():
    payload = {'owner': 5, 'replays': [{
        'replay_id': 'R1', 'uploaded_at': 1717200000,
        'player1_info': {'player': {'short_id': 5}, 'character_name': 'TERRY', 'master_rating': 1500, 'round_results': [1, 1]},
        'player2_info': {'player': {'short_id': 9}, 'character_name': 'KEN', 'master_rating': 1650, 'round_results': [1, 0]},
    }]}
    res = run('parsePayload', {'payload': payload, 'names': ['TERRY', 'KEN']})
    row = res['rows'][0]
    assert row['your_char'] == 'TERRY' and row['opp_char'] == 'KEN'
    assert row['rank_mr'] == '1500' and row['opp_mr'] == '1650' and row['result'] == 'W'


def test_skill_matched_agg_weights_close_matches_more():
    rows = [
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W', 'rank_mr': '1500', 'opp_mr': '1500'},
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'L', 'rank_mr': '1500', 'opp_mr': '2100'},
    ]
    agg = run('skillMatchedAgg', {'rows': rows, 'char': 'TERRY', 'opts': {'bandwidth': 200}})
    w, l = agg['KEN']
    assert w > 0.99          # fair match (gap 0) counts fully
    assert l < 0.05          # 600-MR blowout barely counts


def test_skill_matched_agg_unknown_mr_is_neutral():
    rows = [{'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W', 'rank_mr': '', 'opp_mr': ''}]
    agg = run('skillMatchedAgg', {'rows': rows, 'char': 'TERRY', 'opts': {}})
    assert agg['KEN'] == [1, 0]


def test_diagnose_decomposes_personal_vs_universal():
    res = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.40, 'RYU': 0.55},
                                       'agg': {'KEN': [0, 6], 'RYU': [6, 0]}})
    d = {x['opp']: x for x in res}
    assert d['KEN']['universalHardness'] > 0.09 and d['KEN']['personalGap'] > 0
    assert d['RYU']['universalHardness'] == 0 and d['RYU']['personalGap'] == 0


def test_prioritize_ranks_by_usage_times_deficit():
    res = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.50, 'RYU': 0.50},
                                       'agg': {'KEN': [2, 10], 'RYU': [2, 10]}})
    ranked = run('prioritize', {'diagnoses': res, 'usage': {'KEN': 0.20, 'RYU': 0.05}})
    assert ranked[0]['opp'] == 'KEN' and ranked[0]['score'] > ranked[1]['score']


def test_prioritize_excludes_overperformance():
    res = run('diagnoseFromBaseline', {'baseline': {'KEN': 0.50}, 'agg': {'KEN': [10, 2]}})
    ranked = run('prioritize', {'diagnoses': res, 'usage': {'KEN': 0.20}})
    assert ranked[0]['score'] == 0
