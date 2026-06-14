NAME_BY_SLUG = {
    'luke': 'LUKE', 'jamie': 'JAMIE', 'manon': 'MANON', 'kimberly': 'KIMBERLY',
    'marisa': 'MARISA', 'lily': 'LILY', 'jp': 'JP', 'juri': 'JURI',
    'deejay': 'DEE JAY', 'cammy': 'CAMMY', 'ryu': 'RYU', 'honda': 'E. HONDA',
    'blanka': 'BLANKA', 'guile': 'GUILE', 'ken': 'KEN', 'chunli': 'CHUN-LI',
    'zangief': 'ZANGIEF', 'dhalsim': 'DHALSIM', 'rashid': 'RASHID',
    'aki': 'A.K.I.', 'ed': 'ED', 'gouki': 'AKUMA', 'vega': 'M. BISON',
    'mai': 'MAI', 'elena': 'ELENA', 'sagat': 'SAGAT', 'cviper': 'C. VIPER',
    'alex': 'ALEX', 'ingrid': 'INGRID', 'terry': 'TERRY',
}
SLUG_BY_NAME = {v: k for k, v in NAME_BY_SLUG.items()}
RANKS = {36: 'Master', 40: 'HighM', 41: 'GrandM', 42: 'UltM'}
# skill-depth weighting: higher rank = deeper understanding = closer to true
# matchup value, so weight it more. Master (entry tier, lowest skill) gets the
# lightest default; all are user-adjustable (continuous) in the web app.
TIER_WEIGHTS = {36: 0.5, 40: 1, 41: 2, 42: 3}
PATCH_MONTH = '202603'  # major all-character balance patch landed 2026-03-17
