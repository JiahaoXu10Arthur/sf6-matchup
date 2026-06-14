"""Fetch your own Capcom Buckler ranked battlelog and parse it to a personal CSV.

Only this module is networked. `parse_battlelog()` is pure and fixture-tested
against a real captured page. See
docs/superpowers/specs/2026-06-14-personal-matchup-scout-design.md.

Captured `__NEXT_DATA__` shape (battlelog/rank page), verified from a real page:
  props.pageProps.fighter_banner_info.personal_info.short_id   -> profile owner id
  props.pageProps.replay_list[]                                -> one entry per match
    .replay_id        (str, e.g. "H8M7756GJ")
    .uploaded_at      (int, unix epoch)
    .player1_info / .player2_info
        .player.short_id     (int)            -> who the player is
        .character_id        (int, stable)    -> e.g. 27 Terry, 11 Dee Jay, 32 Ingrid
        .character_name      (str, display)   -> e.g. "Terry", "Dee Jay", "Ingrid"
        .round_results       (int[])          -> per-round outcome codes
        .master_rating       (int)            -> MR
WIN RULE: a player wins a round when their round_results entry is > 0 (the value
1/5/6/7/8 encodes the finish type; 0 = round lost). The match winner has more
rounds won. (The earlier plan's `== 1` assumption was wrong — confirmed against
a real fixture where wins also carry codes 5/6/7/8.)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from roster import NAME_BY_SLUG

ROOT = Path(__file__).resolve().parent.parent


def _canon(s):
    """Punctuation/space-insensitive uppercase key (E.Honda / E. HONDA -> EHONDA)."""
    return ''.join(ch for ch in str(s).upper() if ch.isalnum())


# canonical-key -> official roster name, covering every character regardless of
# Buckler's spacing/punctuation; plus aliases for Buckler's alternate labels.
_OFFICIAL_BY_CANON = {_canon(n): n for n in NAME_BY_SLUG.values()}
_OFFICIAL_BY_CANON.update({'VEGA': 'M. BISON', 'BISON': 'M. BISON', 'GOUKI': 'AKUMA'})


def _official(name):
    """Map a Buckler character label to the repo's official roster name exactly,
    so scout() can join on it. Falls back to an upper-cased label if unknown."""
    return _OFFICIAL_BY_CANON.get(_canon(name), str(name).strip().upper())


def parse_battlelog(next_data, my_short_id):
    """Pure: [{replay_id,date,your_char,opp_char,rank_mr,result}] for the profile
    owner (my_short_id) from one battlelog page's __NEXT_DATA__ dict."""
    replays = next_data['props']['pageProps'].get('replay_list') or []
    me_id = int(my_short_id)
    out = []
    for rep in replays:
        p1, p2 = rep['player1_info'], rep['player2_info']
        if int(p1['player']['short_id']) == me_id:
            me, opp = p1, p2
        elif int(p2['player']['short_id']) == me_id:
            me, opp = p2, p1
        else:
            continue
        my_rounds = sum(1 for x in me.get('round_results', []) if x > 0)
        opp_rounds = sum(1 for x in opp.get('round_results', []) if x > 0)
        if my_rounds == opp_rounds:
            continue   # no decisive result (incomplete / disconnect) — skip
        out.append({
            'replay_id': str(rep['replay_id']),
            'date': str(rep.get('uploaded_at', '')),
            'your_char': _official(me['character_name']),
            'opp_char': _official(opp['character_name']),
            'rank_mr': str(me.get('master_rating', '')),
            'result': 'W' if my_rounds > opp_rounds else 'L',
        })
    return out


# ---------------------------------------------------------------------------
# Networked glue (Playwright). Imported lazily so the analysis layer + tests run
# without Playwright installed. Verified manually, not by unit tests.
# ---------------------------------------------------------------------------

import argparse
import csv
import json

PERSONAL_DIR = ROOT / 'data' / 'personal'
SESSION = PERSONAL_DIR / '.session.json'
CSV_FIELDS = ['replay_id', 'date', 'your_char', 'opp_char', 'rank_mr', 'result']
BASE = 'https://www.streetfighter.com/6/buckler/'
PROFILE_URL = BASE + 'profile/{sid}/battlelog/rank?page={page}'


def _page_next_data(page):
    """Extract the __NEXT_DATA__ JSON from the current page."""
    return json.loads(page.locator('#__NEXT_DATA__').inner_text())


def fetch(short_id, max_pages=20):
    """Log in (persisted session) and page the ranked battlelog into rows."""
    from playwright.sync_api import sync_playwright   # optional dep, lazy
    PERSONAL_DIR.mkdir(parents=True, exist_ok=True)
    rows, seen = [], set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = (browser.new_context(storage_state=str(SESSION))
               if SESSION.exists() else browser.new_context())
        page = ctx.new_page()
        page.goto(BASE)
        if 'login' in page.url or not SESSION.exists():
            print('Log in with your Capcom ID in the opened window, then press Enter here…')
            input()
            ctx.storage_state(path=str(SESSION))
        for n in range(1, max_pages + 1):
            page.goto(PROFILE_URL.format(sid=short_id, page=n))
            page.wait_for_selector('#__NEXT_DATA__')
            batch = parse_battlelog(_page_next_data(page), short_id)
            fresh = [r for r in batch if r['replay_id'] not in seen]
            if not fresh:
                break                       # caught up to known history
            seen.update(r['replay_id'] for r in fresh)
            rows.extend(fresh)
            page.wait_for_timeout(1000)     # polite delay
        browser.close()
    return rows


def _merge_csv(path, rows):
    """Append-dedupe rows into the personal CSV (dedupe on replay_id)."""
    existing = {}
    if path.exists():
        with open(path, newline='') as fh:
            for r in csv.DictReader(fh):
                existing[r['replay_id']] = r
    for r in rows:
        existing[r['replay_id']] = r
    with open(path, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        w.writeheader()
        w.writerows(existing.values())
    return len(existing)


def main():
    ap = argparse.ArgumentParser(description='Fetch your Buckler ranked battlelog')
    ap.add_argument('--cfn', required=True, help='your CFN short_id')
    ap.add_argument('--pages', type=int, default=20)
    args = ap.parse_args()
    rows = fetch(args.cfn, args.pages)
    path = PERSONAL_DIR / f'{args.cfn}.csv'
    total = _merge_csv(path, rows)
    print(f'fetched {len(rows)} new matches; {total} total -> {path}')


if __name__ == '__main__':
    main()
