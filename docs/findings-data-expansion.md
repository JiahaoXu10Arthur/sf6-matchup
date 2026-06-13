# Data-expansion feasibility — kakuhanapp probe (2026-06-13)

Investigated three requested expansions against the live kakuhanapp source.

## 1. Include Master (rank 36) — ✅ FEASIBLE

The rank `<select>` already offers four ranks; we currently use only the top three:

| value | label | used today |
|-------|-------|-----------|
| 36 | MASTER | ✗ (this request) |
| 40 | HIGH MASTER | ✓ weight 1 |
| 41 | GRAND MASTER | ✓ weight 2 |
| 42 | ULTIMATE MASTER | ✓ weight 3 |

Live check: `rank=36&tool=terry&month=202605` returns a full **29-matchup** page (e.g. LILY 5.222, ALEX 5.220). So Master data exists across the archive and parses with the existing regex — no parser changes needed.

**Work:** download rank 36 for all chars × 16 months (~480 pages), rebuild matrix, add 36 to `TIER_WEIGHTS` + the rank tabs (a 4th "Master" tab), update parity tests + METHOD.
**Open decision:** Master is the *lowest* of the four brackets (largest population, least skill). The current scheme is skill-depth-weighted 1:2:3. What weight should Master get? It must be ≤ High's to stay monotonic — see question to user.

## 2. Modern / Classic separation — ❌ NOT AVAILABLE from this source

kakuhanapp's matchup data is **control-aggregated**; it does not split by control type at Master+. Evidence:
- The only form controls on `/matchup/master/` and `/matchup/` are `month`, `rank`, `tool` — no control/mode select.
- Passing `&control=modern&type=M` is ignored: output is byte-identical to default (29 identical scores).
- The モダン/クラシック strings on the page are all **user comments requesting this feature**, e.g.
  - "マスター以上でも操作タイプ別の相性出してほしい" — *"I wish they'd publish matchup data by control type for Master+."*
  - "出来ればマスター以上でもCとMで分けてデータ出して欲しいです" — *"If possible, split the data by C and M for Master+ too."*
  These confirm the split does **not** exist here.

The only source that separates control types is Capcom Buckler directly, whose `dia_master` endpoint is login-gated + bot-protected (the very reason we mirror via kakuhanapp). **Conclusion: not feasible without a new, blocked data source.** Recommend dropping unless a control-split source is found.

## 3. Character headshots — ✅ FEASIBLE

kakuhanapp serves a card portrait per character at a stable path:
`/static/images/character/card_{slug}.jpg` (slug = our roster slug).

Live check: `card_terry.jpg` → HTTP 200, image/jpeg, ~5 KB; `card_jp.jpg` → ~15 KB. ~30 small JPGs total, fetched once.

**Open decisions:**
- **Source/storage:** these are Capcom character art mirrored by kakuhanapp. Bundle them (commit / inline into standalone for offline use) vs hotlink (breaks offline + may be blocked). Bundling redistributes Capcom art in a fan tool.
- **Placement:** character `<select>` (hard — native selects can't show images), the main character header, the matchup/sub rows, the v2 tier chips, or a combination.

## Bonus observation
kakuhanapp also exposes `/matchup/subchar/` and `/matchup/subchar_master/` — its **own** sub-character recommendation feature. Could be a cross-check reference for our COVER/SPEC recommendations (different methodology), if of interest.
