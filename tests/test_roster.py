"""Pure roster reducers + month-filter aggregate (web/scout.js), exercised via Node.
IndexedDB persistence lives in store.js and is verified by browser E2E, not here."""
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


# 1714521600 = 2024-05-01 00:00 UTC ; 1717200000 = 2024-06-01 00:00 UTC
def test_month_of_is_utc_yyyymm():
    assert run('monthOf', {'epoch': 1714521600}) == '202405'
    assert run('monthOf', {'epoch': 1717200000}) == '202406'


def test_route_pull_creates_new_profile():
    payload = {'owner': 3400122682, 'name': 'kincho', 'isSelf': False,
               'rows': [{'replay_id': 'A', 'date': '1', 'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '', 'result': 'W'}]}
    res = run('routePull', {'roster': {}, 'payload': payload, 'now': 100})
    assert res['activeId'] == '3400122682'
    p = res['roster']['3400122682']
    assert p['name'] == 'kincho' and p['isSelf'] is False
    assert len(p['rows']) == 1 and p['createdAt'] == 100 and p['updatedAt'] == 100


def test_route_pull_merges_dedupes_into_existing():
    existing = {'3400122682': {'cfnId': '3400122682', 'name': 'kincho', 'isSelf': False,
                'rows': [{'replay_id': 'A', 'result': 'W', 'your_char': 'TERRY', 'opp_char': 'KEN', 'date': '1', 'rank_mr': ''}],
                'createdAt': 1, 'updatedAt': 1}}
    payload = {'owner': 3400122682, 'name': 'kincho', 'rows': [
        {'replay_id': 'A', 'result': 'W', 'your_char': 'TERRY', 'opp_char': 'KEN', 'date': '1', 'rank_mr': ''},  # dup
        {'replay_id': 'B', 'result': 'L', 'your_char': 'TERRY', 'opp_char': 'RYU', 'date': '2', 'rank_mr': ''}]}
    res = run('routePull', {'roster': existing, 'payload': payload, 'now': 200})
    p = res['roster']['3400122682']
    assert len(p['rows']) == 2          # A deduped, B added
    assert p['createdAt'] == 1 and p['updatedAt'] == 200


def test_aggregate_month_filter_drops_zero_weight_months():
    rows = [
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'W', 'date': '1717200000'},  # 202406
        {'your_char': 'TERRY', 'opp_char': 'KEN', 'result': 'L', 'date': '1714521600'},  # 202405
    ]
    # only 202406 has weight -> 1-0 ; 202405 dropped
    got = run('aggregate', {'rows': rows, 'char': 'TERRY', 'monthW': {'202406': 1, '202405': 0}})
    assert got == {'KEN': [1, 0]}
    # no monthW -> include all -> 1-1
    got_all = run('aggregate', {'rows': rows, 'char': 'TERRY', 'monthW': None})
    assert got_all == {'KEN': [1, 1]}


def test_merge_rosters_dedupes_and_keeps_newer_name():
    base = {'1': {'cfnId': '1', 'name': 'old', 'isSelf': False, 'createdAt': 1, 'updatedAt': 5,
                  'rows': [{'replay_id': 'A', 'result': 'W', 'your_char': 'T', 'opp_char': 'K', 'date': '1', 'rank_mr': ''}]}}
    incoming = {'1': {'cfnId': '1', 'name': 'new', 'isSelf': False, 'createdAt': 1, 'updatedAt': 9,
                  'rows': [{'replay_id': 'B', 'result': 'L', 'your_char': 'T', 'opp_char': 'R', 'date': '2', 'rank_mr': ''}]}}
    res = run('mergeRosters', {'base': base, 'incoming': incoming})
    assert len(res['1']['rows']) == 2 and res['1']['name'] == 'new' and res['1']['updatedAt'] == 9


def test_parse_payload_returns_name_and_isself():
    payload = {'owner': 5, 'name': 'me', 'isSelf': True, 'replays': []}
    res = run('parsePayload', {'payload': payload, 'names': ['KEN']})
    assert res['owner'] == 5 and res['name'] == 'me' and res['isSelf'] is True and res['rows'] == []


# --- PR #3 Copilot review hardening ---

def test_safe_id_rejects_dangerous_keys():
    for bad in ('__proto__', 'constructor', 'prototype'):
        assert run('safeId', {'id': bad}) is None
    assert run('safeId', {'id': 3400122682}) == '3400122682'
    assert run('safeId', {'id': 'csv-import'}) == 'csv-import'


def test_route_pull_rejects_dangerous_owner_key():
    payload = {'owner': '__proto__', 'name': 'x', 'isSelf': False,
               'rows': [{'replay_id': 'A', 'date': '1', 'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '', 'result': 'W'}]}
    res = run('routePull', {'roster': {}, 'payload': payload, 'now': 100})
    assert res['activeId'] is None
    assert res['roster'] == {}          # nothing added under a dangerous key


def test_route_pull_self_names_default_profile_on_merge():
    existing = {'5': {'cfnId': '5', 'name': '5', 'isSelf': False, 'createdAt': 1, 'updatedAt': 1,
                'rows': [{'replay_id': 'A', 'date': '1', 'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '', 'result': 'W'}]}}
    payload = {'owner': 5, 'name': 'Kincho', 'isSelf': True,
               'rows': [{'replay_id': 'B', 'date': '2', 'your_char': 'TERRY', 'opp_char': 'RYU', 'rank_mr': '', 'result': 'L'}]}
    res = run('routePull', {'roster': existing, 'payload': payload, 'now': 200})
    p = res['roster']['5']
    assert p['name'] == 'Kincho'        # default name (== id) adopts the pull's fighter name
    assert p['isSelf'] is True          # isSelf flips on


def test_route_pull_preserves_custom_name_and_keeps_self():
    existing = {'5': {'cfnId': '5', 'name': 'MyAlias', 'isSelf': True, 'createdAt': 1, 'updatedAt': 1,
                'rows': [{'replay_id': 'A', 'date': '1', 'your_char': 'TERRY', 'opp_char': 'KEN', 'rank_mr': '', 'result': 'W'}]}}
    payload = {'owner': 5, 'name': 'Whatever', 'isSelf': False,
               'rows': [{'replay_id': 'B', 'date': '2', 'your_char': 'TERRY', 'opp_char': 'RYU', 'rank_mr': '', 'result': 'L'}]}
    res = run('routePull', {'roster': existing, 'payload': payload, 'now': 200})
    p = res['roster']['5']
    assert p['name'] == 'MyAlias'       # manual rename never clobbered by a pull
    assert p['isSelf'] is True          # once self, stays self


def test_merge_rosters_coerces_missing_updatedat_to_number():
    base = {'1': {'cfnId': '1', 'name': 'a', 'isSelf': False, 'createdAt': 1, 'updatedAt': 5,
                  'rows': [{'replay_id': 'A', 'result': 'W', 'your_char': 'T', 'opp_char': 'K', 'date': '1', 'rank_mr': ''}]}}
    incoming = {'1': {'cfnId': '1', 'name': 'b', 'isSelf': False, 'createdAt': 1,   # no updatedAt
                  'rows': [{'replay_id': 'B', 'result': 'L', 'your_char': 'T', 'opp_char': 'R', 'date': '2', 'rank_mr': ''}]}}
    res = run('mergeRosters', {'base': base, 'incoming': incoming})
    assert res['1']['updatedAt'] == 5   # max(5, 0); a NaN would serialize to null and fail this
    assert len(res['1']['rows']) == 2
