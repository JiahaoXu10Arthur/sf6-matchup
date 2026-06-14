# FGC / Community Research, Pass 2 — Net-New Ideas for the SF6 Matchup Tool

Research date: 2026-06-14. Goal: a SECOND survey of the FGC + adjacent data communities to find ideas NOT already captured in [ideas-social.md](./ideas-social.md). Pass 1 already covered: usage-vs-viability scatter, sample-size reliability flags, coverage-% sub reframe, pocket/sub terminology, kit-similarity/archetype tiebreakers, validation against Capcom real sub-pairing data, METAsrc-style live counter-picker, Smogon viability stats, diverging heatmap, per-character best/worst drilldown, threat-list framing, patch-delta time series, skill-bracket slider, even/favored/unfavored buckets.

Everything below is intended to be additive to that list.

> **Source-quality note up front.** Current 2026 SF6-specific *community-complaint* threads were hard to surface via search — most indexed discussion is Steam threads from 2023–2025 and republished EventHubs charts. I flag every claim's recency below. The strongest *fresh* (mid-2026) facts I could verify: the Ingrid release (2026-05-28) shipping with NO balance patch, Season 4 being unannounced/delayed, Alex's 2026-03-17 balance patch, and Buckler now publishing structured per-character `battle_change` lists per patch date. Idea-generation drawn from adjacent communities (Tekken ewgf.gg, LoL u.gg duo lists, a Berkeley sports-analytics fighting-game model, BreakoutES tournament pickrates) is timeless rather than 2026-dated; I say so where it matters.

---

## TL;DR — Prioritized net-new ideas

| # | Idea | Type | Effort | Differentiation |
|---|------|------|--------|-----------------|
| 1 | Tournament-pickrate vs ranked-usage gap ("pro darling / ladder monster" split) | Feature/Viz | Med | High — no SF6 tool fuses CPT-pickrate w/ Buckler ranked data |
| 2 | "Reference only" honesty layer mirroring Buckler's own low-data asterisk | Framing/Trust | Low | Med — turns a known official caveat into a feature |
| 3 | Sub-PAIR synergy/coverage table (LoL "duo tier list" ported to main+pocket) | Feature/Viz | Med | High — pairs, not single subs, is genuinely unshipped in SF6 |
| 4 | Patch-anchored matchup diff using Buckler's own `battle_change` change-lists | Feature/Data | Med | High — ties win-rate moves to actual notated buffs/nerfs |
| 5 | Matchup-spread "shape" metric per character (volatility / polarization index) | Viz/Stat | Low–Med | High — one number nobody computes; flags polarizing chars |
| 6 | "Frozen meta" staleness indicator + data-recency stamp | Framing/Trust | Low | Med — directly answers the mid-2026 no-patch limbo |
| 7 | Shareable per-character "matchup card" image export (X-native) | Feature/Distribution | Med | Med — the unit that actually circulates is the screenshot |
| 8 | Symmetry/consistency check: A-vs-B vs B-vs-A disagreement flag | Data/Trust | Low | Med — exposes data noise other tools hide |
| 9 | "Who am I a counter-pick FOR" reverse-sub lookup | Feature | Low | Med — inverts the recommender; answers a real ladder question |
| 10 | Decompose win rate vs raw usage weighting toggle ("popularity tax") | Stat/Framing | Low | Med — makes the threat-list weighting auditable per-character |

---

## Theme A — Tournament vs ranked: the data fusion nobody ships

### 1. Tournament-pickrate × ranked-win-rate split  *(High differentiation)*
The single most repeated *structural* complaint in 2026 tier-list discourse is that **one tier list cannot serve both competitive and casual readers** — knowledge-check characters dominate ladder but vanish at top level, and pro-viable characters underperform on ladder. The esports.gg "Post-Combo Breaker 2026" piece is explicitly built around a competitive-vs-casual split for exactly this reason. ([esports.gg, 2026](https://esports.gg/opinion/street-fighter-6/sf6-tier-list-competitive-casual/))

Meanwhile **BreakoutES** maintains SF6 *tournament* pickrates (streamed Top-8 only, 2024/2025/2026), a totally separate signal from Buckler ranked usage. ([BreakoutES](https://www.breakoutes.com/sf6pickrates-2025)) And **fgctopplayers.com** publishes a "CPV" character tier ranking from top-player results. ([fgctopplayers.com](https://fgctopplayers.com/character-stats/))

**Net-new idea:** plot **tournament pickrate (x) vs Buckler ranked win-rate or usage (y)** as a second scatter (distinct from Pass 1's usage×win-rate scatter). Quadrants become *named community archetypes*:
- **"Pro darling, ladder ghost"** — high CPT pickrate, low ranked usage (e.g. execution-heavy picks).
- **"Ladder monster, pro poison"** — high ranked usage/win-rate, near-zero tournament presence (knowledge-check / gimmick characters).
- **"Universally strong"** and **"forgotten."**

This is the data-backed version of the argument the community has *every month* but never has a chart for.

**Fits our data model:** Buckler gives us ranked usage + win-rate already. Tournament pickrate is a small external table (scrape/ingest BreakoutES-style Top-8 counts, ~27 numbers/month) joined on character id. It does not touch the matchup math; it's a new view on the same character index. *Open question for Anon: ingest external tournament data (adds a non-Buckler dependency, contradicts "zero-dependency" purity) or ship this as a manual/optional CSV overlay?*

---

## Theme B — Trust & honesty layers (cheap, high-credibility)

The recurring trust theme across BOTH passes: people distrust matchup numbers for low-sample/low-skill cells. Pass 1 handled this with confidence dots. These are *additional* trust moves.

### 2. "Reference only" honesty layer — adopt Buckler's own caveat  *(Low effort)*
Buckler's official Battle Diagrams page literally states **"Use as reference values only"** and renders **a symbol next to any matchup lacking definitive match data.** ([Buckler Battle Diagrams](https://www.streetfighter.com/6/buckler/en/stats/dia)) We can adopt the *exact* official caveat language and asterisk convention — instant familiarity, and it inoculates the tool against the "your numbers are wrong" pile-on by stating the limitation the way the data owner does. This is framing/copy, not new computation.

**Fits our data model:** purely presentational; reuses the per-cell N we already surface for confidence dots.

### 8. Symmetry / consistency flag  *(Low effort, distinct from confidence dots)*
Buckler reports A-vs-B and B-vs-A as separate aggregates; in clean data they should sum to ~100%. When they *don't* (e.g. Ryu-vs-Cammy says 54% but Cammy-vs-Ryu says 50%), that gap is a direct, model-free measure of noise/bias in that cell. **Flag cells where |wr(A,B) + wr(B,A) − 100%| exceeds a threshold.** No other SF6 tool exposes this; it's a self-auditing trust signal that confidence dots (which only look at N) miss.

**Fits our data model:** trivially computed from the `dia_master` matrix we already load — compare the transpose against itself. Pure derived field.

### 6. "Frozen meta" staleness indicator  *(Low effort, very 2026-relevant)*
As of mid-2026 the meta is in an unusual **balance-patch limbo**: Ingrid (2026-05-28) shipped with throw/bug fixes only and *no character balance changes*, Season 4 is unannounced, and Capcom says the full balance pass is "in development" with no date. ([gamer.org Season 4 delay](https://www.gamer.org/street-fighter-6-season-4-delayed-world-tour-is-over-and-here-is-what-capcom-actually-said/)) That means matchup data is currently *more* stable and trustworthy than usual — a selling point. Conversely, when a patch lands the data instantly goes stale.

**Net-new idea:** a header stamp — **"Data current as of patch 2026-05-28 · meta unchanged for N days · no pending balance patch"** — that flips to a loud **"⚠ balance patch landed YYYY-MM-DD, pre-patch data shown"** warning the moment a new `battle_change` date appears. Turns the awkward no-patch period into a credibility feature and protects against silently serving stale numbers post-patch.

**Fits our data model:** read the latest `battle_change` patch date from Buckler; compare to our snapshot date.

---

## Theme C — Sub/pocket recommender upgrades (the tool's thesis)

### 3. Sub-PAIR synergy table — port LoL's "duo tier list"  *(High differentiation)*
LoL stat sites (u.gg, METAsrc) ship a **"duo tier list"**: not "is champ X good," but "do X and Y *together* cover each other," ranked by combined performance. ([u.gg duo tier list](https://u.gg/lol/duo-tier-list), [METAsrc duo](https://www.metasrc.com/lol/tier-list/duo)) Pass 1's sub-recommender answers "given main M, what single pocket best covers M's bad matchups." The net-new move is to **score and rank main+pocket PAIRS directly**: for each (main, pocket) combination, compute the *combined* coverage — % of the field where at least one of the two is favored — and the weighted win-rate of always picking the better of the two per opponent.

This reframes the output from "here is your sub" to **"here is your two-character roster and the % of the cast it covers,"** which is how players actually think about a main+pocket. It also surfaces *non-obvious good pairs* (two narrow characters that happen to cover disjoint weaknesses), which the single-sub recommender structurally cannot find.

**Fits our data model:** pure combinatorics over the existing `dia_master` matrix — for each character pair, take the elementwise max win-rate row and aggregate. ~27×27 pairs, cheap. No new data.

### 9. Reverse-sub lookup: "who am I a pocket FOR"  *(Low effort)*
The recommender currently runs main → best pocket. Invert the index so a user can ask **"I already play Ken well — whose bad matchups does Ken patch?"** This answers a real ladder question ("my second is locked, what should my first be?") and doubles the utility of the same computed table.

**Fits our data model:** it is literally the transpose of the coverage table from idea #3 / Pass 1's recommender. Same numbers, indexed the other way.

---

## Theme D — New per-character statistics (one-number signals)

### 5. Matchup-spread "shape" / polarization index  *(High differentiation)*
Every SF6 chart reduces a character to *average* win-rate (and Pass 1 adds favored/even/unfavored counts). Nobody computes the **distribution shape** — yet "polarizing" is core FGC vocabulary (zoners/grapplers like Guile-vs-Gief or Honda are *low-variance-killer*: a few brutal matchups, many fine ones). The Berkeley sports-analytics fighting-game model is built on exactly this insight — that variance/comeback-factor, not the mean, drives outcomes — and uses Poisson/Monte-Carlo over interaction distributions rather than a single average. ([Berkeley SAAS, "The Values of a Fighter"](https://saas.studentorg.berkeley.edu/rp/the-values-of-a-fighter))

**Net-new idea:** a per-character **polarization metric** = std-dev (or interquartile range) of that character's matchup-win-rate row. Surface it as a one-glance chip — **"Guile: avg 51% but high-variance (3 hard counters, rest even+)"** vs **"Ryu: avg 50%, flat — no scary matchups, no free ones."** Optionally a small sparkline/violin of the row's spread. This is a genuinely novel character descriptor in SF6 and directly informs sub choice (you sub *against* the polarized character's specific hard counters).

**Fits our data model:** std-dev/IQR of each row in `dia_master`. One derived number per character. Trivial.

### 10. "Popularity tax" — auditable usage weighting  *(Low effort)*
Pass 1 adopts Smogon's usage-weighted threat-list framing. The net-new refinement: let users **toggle between raw win-rate ranking and usage-weighted ranking, and show the per-character delta** ("Manon: +0.0 raw, but −2 threat-rank because nobody plays her"). This makes the weighting *auditable per character* instead of a black box, pre-empting "why is X ranked below Y" arguments by showing exactly how much usage moved each character.

**Fits our data model:** we already have `usagerate_master` and the win-rate ranking; the delta is the difference between the two sorts.

---

## Theme E — Distribution (how matchup data actually travels in 2026)

### 7. Shareable per-character "matchup card" PNG export  *(Med effort)*
The unit that actually circulates in the FGC is **the screenshot.** CatCammy's monthly tables and EventHubs republications spread as *images* on X, and the whole monthly-snapshot demand documented in Pass 1 is really demand for *shareable, comparable images*. ([CatCammy on X, 2026 ranked Master+ chart](https://x.com/CatCammy6/status/1915957808844988551)) No current SF6 tool generates a clean, branded, single-character "matchup card" (best/worst MUs + polarization + confidence + patch stamp) sized for an X post.

**Net-new idea:** a one-click **"export this character's matchup card as PNG"** (canvas render in-browser, zero deps). Bakes in the data-recency stamp (idea #6) and confidence flags. This is a *growth* feature — every shared card is attributed and carries the trust caveats with it, so the tool spreads the way matchup charts already spread.

**Fits our data model:** renders existing per-character view to canvas; no new data, fits the zero-dependency browser-app constraint.

---

## Meta context worth baking in (mid-2026, verified)
- **Ingrid** = Year 3's final DLC, released **2026-05-28**, no balance patch (throw/bug fixes only). Year 3 = Mai, Elena(S3 start), Alex, Ingrid. INGRID is excluded from our pipeline per project notes — but she now exists in Buckler usage/dia data, so the tool should explicitly state inclusion/exclusion. ([Nintendo Life](https://www.nintendolife.com/news/2026/04/street-fighter-6s-next-dlc-character-joins-the-battle-in-may-2026), [gamer.org](https://www.gamer.org/street-fighter-6-season-4-delayed-world-tour-is-over-and-here-is-what-capcom-actually-said/))
- **Alex** released **2026-03-17** *with* a full balance patch (per-character `battle_change` lists exist for that date). ([Alex patch notes, EventHubs](https://www.eventhubs.com/news/2026/mar/16/street-fighter-alex-patch-notes/))
- **Season 4 unannounced / World Tour story content ended**; full balance pass "in development," no date. Meta is currently frozen — unusually stable matchup data. ([gamer.org](https://www.gamer.org/street-fighter-6-season-4-delayed-world-tour-is-over-and-here-is-what-capcom-actually-said/))
- Buckler publishes **structured per-character change-lists** at `/buckler/battle_change/<YYYYMMDD>/<char>` — a machine-readable patch timeline we can anchor diffs to (ideas #4, #6). ([Buckler battle_change index](https://www.streetfighter.com/6/buckler/battle_change))
- Post-S3.5 top tier discourse names **Ed, Sagat, JP, C. Viper** as S/S+; **Alex** debuted A-tier. (Tertiary aggregator source — treat as directional, not authoritative.) ([propelrc tier list, June 2026](https://www.propelrc.com/ultimate-sf6-tier-list/))

### 4. Patch-anchored matchup diff  *(High differentiation — extends Pass 1's patch-delta idea)*
Pass 1 proposed a generic patch-delta time series. The net-new specificity: **anchor each win-rate delta to the actual notated change** from Buckler's `battle_change` list. So instead of "Guile-vs-Gief moved +3% in March," show **"Guile-vs-Gief +3% — coincides with Gief's 2026-03-17 nerf [linked change]."** This connects the *statistical* move to the *mechanical cause*, which is what every "did this nerf actually matter" forum thread is really asking. ([Buckler battle_change](https://www.streetfighter.com/6/buckler/battle_change))

**Fits our data model:** requires the historical snapshots Pass 1 already says to start capturing, PLUS ingesting the (small, structured) `battle_change` character lists keyed by patch date. The join key is (character, patch-date).

---

## Top 3 net-new bets

1. **Tournament-vs-ranked split scatter (#1).** This is the highest-differentiation idea in either pass: it data-backs the single most common 2026 tier-list argument ("competitive vs casual is not the same list"), reuses our Buckler character index, and needs only a tiny external pickrate table. It's the natural companion to Pass 1's usage×win-rate scatter and makes the tool the *only* place fusing both signals. Decision needed from Anon on the external-data dependency.

2. **Sub-PAIR synergy table (#3) + reverse-sub lookup (#9).** This is the strongest upgrade to the tool's actual thesis. Players think in main+pocket *pairs*, not single subs; porting LoL's proven "duo tier list" pattern reframes the recommender output as "your two-character roster covers X% of the cast" and surfaces non-obvious complementary pairs the single-sub math can't find. Pure combinatorics over data we already load — no new dependencies.

3. **Polarization / matchup-shape index (#5).** A genuinely novel one-number character descriptor grounded in real FGC vocabulary and in serious analytics precedent (Berkeley's variance-over-mean thesis). Trivial to compute (std-dev of a row), instantly legible, and it directly improves sub recommendations by identifying *which specific* hard counters a polarized character has. Cheapest high-differentiation win available.

Honorable mention: the **honesty/staleness/symmetry trust layer (#2, #6, #8)** is collectively low-effort and, given that distrust of the numbers is the #1 cross-pass complaint, probably the highest *trust-per-line-of-code* work in the doc.

---

## Sources
- [esports.gg — SF6 tier list, competitive vs casual, Post-Combo Breaker 2026](https://esports.gg/opinion/street-fighter-6/sf6-tier-list-competitive-casual/)
- [BreakoutES — SF6 tournament pickrates 2024/2025/2026](https://www.breakoutes.com/sf6pickrates-2025)
- [fgctopplayers.com — SF6 character stats / CPV tier rankings](https://fgctopplayers.com/character-stats/)
- [Buckler's Boot Camp — Battle Diagrams ("use as reference only", low-data symbol)](https://www.streetfighter.com/6/buckler/en/stats/dia)
- [Buckler's Boot Camp — Battle Change List index (structured per-patch change-lists)](https://www.streetfighter.com/6/buckler/battle_change)
- [Buckler — 2026-05-28 update battle change list (Ingrid patch, fixes only)](https://www.streetfighter.com/6/buckler/en/battle_change)
- [EventHubs — Alex + balance update patch notes (2026-03-17)](https://www.eventhubs.com/news/2026/mar/16/street-fighter-alex-patch-notes/)
- [Nintendo Life — Ingrid joins SF6 May 2026 (final Year 3 DLC)](https://www.nintendolife.com/news/2026/04/street-fighter-6s-next-dlc-character-joins-the-battle-in-may-2026)
- [gamer.org — Season 4 delayed, World Tour over, balance patch "in development"](https://www.gamer.org/street-fighter-6-season-4-delayed-world-tour-is-over-and-here-is-what-capcom-actually-said/)
- [CatCammy on X — 2026 ranked Ultimate Master+ (1800 MR) matchup chart](https://x.com/CatCammy6/status/1915957808844988551)
- [CatCammy on X — matchup table (1700 MR, FT2)](https://x.com/CatCammy6/status/1800621012435767428)
- [u.gg — LoL Duo Tier List (pair synergy ranking)](https://u.gg/lol/duo-tier-list)
- [METAsrc — LoL duo tier list](https://www.metasrc.com/lol/tier-list/duo)
- [ewgf.gg — Tekken 8 statistics site (character stats, profiles, rank distribution)](https://www.ewgf.gg/statistics)
- [Berkeley SAAS — "The Values of a Fighter" (variance/Poisson/Monte-Carlo fighting-game model)](https://saas.studentorg.berkeley.edu/rp/the-values-of-a-fighter)
- [propelrc — SF6 tier list June 2026 (post-S3.5 top tiers; tertiary/directional)](https://www.propelrc.com/ultimate-sf6-tier-list/)
