import re

CARD_RE = re.compile(
    r'alt="([^"]+)">\s*<div class="card-body[^>]*>\s*'
    r'<div class="text-muted small">([\d.]+)</div>'
)
SELECTED_RE = re.compile(r'<option value="([^"]+)" selected')


def parse_matchups(html):
    """Return {opponent_display_name: score}. Empty dict when the page has
    no matchup data (character not yet released that month)."""
    return {name: float(score) for name, score in CARD_RE.findall(html)}


def parse_selected_params(html):
    """Return the page's own (month, rank, slug) from its selected <option>s.
    Raises StopIteration if the page lacks them (treated as no-data upstream)."""
    vals = SELECTED_RE.findall(html)
    month = next(v for v in vals if re.fullmatch(r'\d{6}', v))
    rank = next(v for v in vals if re.fullmatch(r'\d{2}', v))
    slug = next(v for v in vals if re.fullmatch(r'[a-z]+', v))
    return month, rank, slug
