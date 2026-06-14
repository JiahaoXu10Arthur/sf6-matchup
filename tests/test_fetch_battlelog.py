import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from fetch_battlelog import parse_battlelog, _official

FIX = Path(__file__).resolve().parent / 'fixtures' / 'battlelog_sample.json'
NEXT = json.loads(FIX.read_text())
MY_ID = NEXT['props']['pageProps']['fighter_banner_info']['personal_info']['short_id']


def test_parse_battlelog_shape():
    rows = parse_battlelog(NEXT, MY_ID)
    assert rows, 'fixture should contain at least one replay'
    for r in rows:
        assert set(r) == {'replay_id', 'date', 'your_char', 'opp_char', 'rank_mr', 'result'}
        assert r['result'] in ('W', 'L')
        assert r['your_char'] and r['opp_char']   # mirror matches (same char) are valid


def test_parse_battlelog_win_rule_from_round_results():
    # owner played Ingrid; round_results > 0 = round won (codes 1/5/6/7/8), 0 = lost.
    rows = {r['replay_id']: r for r in parse_battlelog(NEXT, MY_ID)}
    # H8M7756GJ: owner Ingrid [1,1] beats Terry [0,0]
    assert rows['H8M7756GJ']['result'] == 'W'
    assert rows['H8M7756GJ']['your_char'] == 'INGRID'
    assert rows['H8M7756GJ']['opp_char'] == 'TERRY'
    # 4LS3SAX9W: owner Ingrid [0,0] loses to Ken [5,5] — proves 5 counts as a win
    assert rows['4LS3SAX9W']['result'] == 'L'
    assert rows['4LS3SAX9W']['opp_char'] == 'KEN'


def test_parse_battlelog_date_and_mr_are_strings():
    r = parse_battlelog(NEXT, MY_ID)[0]
    assert r['date'].isdigit()        # uploaded_at unix epoch, stringified
    assert isinstance(r['rank_mr'], str)


def test_official_reconciles_buckler_labels_to_matrix_names():
    assert _official('Terry') == 'TERRY'
    assert _official('Dee Jay') == 'DEE JAY'      # space form
    assert _official('E.Honda') == 'E. HONDA'     # dotted, no space -> matrix spacing
    assert _official('Chun-Li') == 'CHUN-LI'
    assert _official('A.K.I.') == 'A.K.I.'
    assert _official('Vega') == 'M. BISON'        # Buckler alias
    assert _official('Gouki') == 'AKUMA'          # Buckler alias


def test_parse_battlelog_skips_other_players():
    # a stranger's id should yield no rows (owner not in any replay as that id)
    assert parse_battlelog(NEXT, 1) == []
