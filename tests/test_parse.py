import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from parse import parse_matchups, parse_selected_params

FIXTURE = (Path(__file__).parent / 'fixtures' / 'aki_41_202605.html').read_text()


def test_parses_all_29_opponents():
    m = parse_matchups(FIXTURE)
    assert len(m) == 29
    assert 'TERRY' in m and 'CHUN-LI' in m and 'DEE JAY' in m


def test_scores_are_plausible_floats():
    m = parse_matchups(FIXTURE)
    assert all(3.0 < v < 7.0 for v in m.values())


def test_empty_page_returns_empty_dict():
    assert parse_matchups('<html><body>no data</body></html>') == {}


def test_selected_params_match_page():
    assert parse_selected_params(FIXTURE) == ('202605', '41', 'aki')
