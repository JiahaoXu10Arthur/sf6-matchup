"""Bundle the web app into single self-contained HTML files that run fully
offline (double-click, no server, no GitHub, no Google Fonts) — for sharing
where GitHub Pages is blocked (e.g. mainland China).

Inlines the version's HTML + CSS, the shared i18n/scoring/app JS, and the
matrix CSV (as `MATRIX_CSV`, which app.js uses instead of fetch). Google Font
links are stripped so there is zero external dependency; fonts fall back to
system faces.
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
OUT = ROOT / 'standalone'

I18N = (WEB / 'i18n.js').read_text()
SCORING = (WEB / 'scoring.js').read_text()
CSV = (ROOT / 'output' / 'matrix.csv').read_text()

# inline character headshots as data URIs so offline builds show portraits
# without any external requests; imgSrc() prefers CHAR_IMG over the img/ path
CHAR_IMG = {
    p.stem: 'data:image/jpeg;base64,' + base64.b64encode(p.read_bytes()).decode()
    for p in sorted((WEB / 'img').glob('*.jpg'))
}


def build(index_path, css_path, app_path, out_name):
    html = index_path.read_text()
    css = css_path.read_text()
    app = app_path.read_text()

    # strip external font links (blocked in CN / unavailable offline)
    html = re.sub(r'[ \t]*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\n?', '', html)
    html = re.sub(r'[ \t]*<link rel="preconnect"[^>]*>\n?', '', html)

    # inline the stylesheet
    html = html.replace('<link rel="stylesheet" href="style.css">',
                        f'<style>\n{css}\n</style>')

    # drop the external script tags; we inline everything below
    html = re.sub(r'[ \t]*<script src="[^"]*"></script>\n?', '', html)

    # rewrite cross-links so the two standalone files point at each other
    html = html.replace('href="../web-v2/"', 'href="sf6-matchup-tierlist.html"')
    html = html.replace('href="../web/"', 'href="sf6-matchup-bars.html"')

    bundle = (
        f'<script>var MATRIX_CSV = {json.dumps(CSV)};</script>\n'
        f'<script>var CHAR_IMG = {json.dumps(CHAR_IMG)};</script>\n'
        f'<script>\n{I18N}\n</script>\n'
        f'<script>\n{SCORING}\n</script>\n'
        f'<script>\n{app}\n</script>\n'
    )
    html = html.replace('</body>', bundle + '</body>')

    OUT.mkdir(exist_ok=True)
    (OUT / out_name).write_text(html)
    kb = len((OUT / out_name).read_bytes()) / 1024
    print(f'{out_name}: {kb:.0f} KB')


def main():
    # remove stale earlier artifact names if present
    for stale in ('sf6-matchup-light.html', 'sf6-matchup-dark.html'):
        p = OUT / stale
        if p.exists():
            p.unlink()
    build(WEB / 'index.html', WEB / 'style.css', WEB / 'app.js',
          'sf6-matchup-bars.html')
    build(ROOT / 'web-v2' / 'index.html', ROOT / 'web-v2' / 'style.css',
          ROOT / 'web-v2' / 'app.js', 'sf6-matchup-tierlist.html')


if __name__ == '__main__':
    main()
