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
