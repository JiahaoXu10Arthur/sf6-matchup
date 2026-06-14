# Feasibility — Idea #2: Tournament Meta Tracker

**Research date:** 2026-06-14
**Question:** Build a tool tracking the SF6 *competitive* metagame over time from tournament results — character representation, placements, and especially **pro pick-rate (tournament) vs ladder usage** (we already have ranked usage in `output/usage.csv`) — to data-back the "competitive ≠ casual tier list" argument from [ideas-social-2.md](../ideas-social-2.md) idea #1.

**One-line verdict: RISKY** — the *idea* is high-value and well-motivated, but the **per-set character data does not exist at scale in any free, structured, queryable source**. Representation-by-attendance is trivially feasible; placement-*by-character* and pro pick-rate are not, without manual collection. Scope to what the data actually supports.

---

## 1. Data access

### 1a. start.gg GraphQL API — tournaments, events, entrants, standings, sets

Fully feasible and free for everything *except* character data.

- **Auth:** Free personal access token from [Developer Settings](https://start.gg/admin/profile/developer) → "Create new token", `Authorization: Bearer <token>` header. Tokens expire after 1 year. No paid tier. ([auth docs](https://developer.start.gg/docs/authentication/))
- **Rate limits:** max **80 requests / 60s**, and **≤1000 objects per request** (incl. nested objects). ([rate-limit docs](https://developer.start.gg/docs/rate-limits/)) This is the binding constraint — paginating sets across hundreds of tournaments is slow but doable with backoff.
- **Available cleanly:** tournaments, events, phases, entrants, standings (placements), sets, scores, player handles, sponsors, country, prize pool, attendance. The community already scrapes exactly this (e.g. [Apify FGC scraper](https://apify.com/jungle_synthesizer/startgg-liquipedia-fgc-tabletop-tournament-scraper/api), [pysmashgg](https://github.com/JeremySkalla/pysmashgg)).
- SF6 is `videogame` id on start.gg; query tournaments by videogameId + date window, then events → standings.

### 1b. THE CRUX — does start.gg record WHICH CHARACTER each player used per set/game?

**Structurally: yes. In practice: almost never populated, and not at scale.**

- The schema **does** model it. `Game.selections` is an array of `GameSelection`, documented as "Selections for this game such as character, etc." ([Game schema](https://smashgg-schema.netlify.app/reference/game.doc.html)). `GameSelection` has `selectionType` (enum), `selectionValue` (int), `character` (Character object — "If this is a character selection, returns the selected character"), `entrant`, `participant`. ([GameSelection schema](https://smashgg-schema.netlify.app/reference/gameselection.doc.html)) So the field is real and maps to a first-class `Character` object, not a free-text string.

- **But two gating problems make it unusable at scale:**
  1. **Per-*game* records barely exist.** `Game` objects only exist when a set is reported game-by-game (the reporter ticks each game's winner/score). SF6 tournaments overwhelmingly report sets as a final score (e.g. 3–1) with **no per-game breakdown**, so there are simply no `Game` rows to attach selections to.
  2. **Even when games exist, character selection is optional manual entry.** Filling `selections` requires the TO/player to pick the character per game in the reporting UI. This is a Smash-community convention (and even there it's spotty); **SF6 brackets effectively never fill it.** The character data is entered by humans who have no incentive to, not captured from the game.

- **Decisive corroborating evidence:** the de-facto SF6 tournament pick-rate source, **BreakoutES**, collects pick-rates **manually by watching streamed Top-8 matches** — "Whenever the Top 8 is reached within a weekly bracket, data will be collected for each match streamed." ([BreakoutES methodology](https://www.breakoutes.com/sf6pickrates-2025)). If start.gg's `selections` were populated, nobody would be hand-charting VODs. The fact that the entire community does this manually is the strongest possible signal that **the API character field is empty in practice.**

**Conclusion: per-set character data is NOT accessible at scale from start.gg.** This is the historical FGC data gap, and it is still open in 2026 for SF6.

### 1c. Alternative / supplementary character-data sources

| Source | Has character data? | Access | Quality / verdict |
|---|---|---|---|
| **BreakoutES** | Yes — tournament pick-rate (Top-8 only), monthly, 2024–2026 | Free, but **HTML tables on-page, no API/CSV/download** — must scrape | Best available pro pick-rate; manual VOD-charting so authoritative but small-N and skewed by who plays most matches. Their own caveat. ([link](https://www.breakoutes.com/sf6pickrates-2025)) |
| **Liquipedia (Fighting Games wiki)** | Partial — per-event participant lists & placements solid; **character used is inconsistently filled** per result | LPDB API: **free only for open-source/educational/non-commercial**; commercial tiers **$49–$199+/mo**; explicitly bans tools that "replicate the Liquipedia user experience"; CC BY-SA attribution | 1,092+ SF6 tournament pages, excellent for *representation/placements/attendance*. Character-per-player is not reliably structured. Licensing is a real constraint for a public web app. ([API terms](https://liquipedia.net/api), [SF6 wiki](https://liquipedia.net/fighters/Street_Fighter_6)) |
| **fgctopplayers.com** | Derived character tiers (CMS/CPF/T3R/RDI from rated results) — **not raw per-set picks** | Public site, no documented API | Already computes a "CPV" tier from tournament results. A *competitor*, not a feed. ([character-stats](https://fgctopplayers.com/character-stats/)) |
| **VOD / bracket sites, EVO/Capcom Cup result pages** | Character only in video, not structured | Manual | Only viable via human charting or future CV — out of scope for a data tool. |
| **Capcom Cup / CPT official pages** | Standings yes, character no | Web pages | Representation only. |

**Net:** Two realistic character-data paths, both with friction — (a) scrape BreakoutES pick-rate tables (small, free, manual-origin, fragile to HTML changes), or (b) Liquipedia LPDB (richer placements, but character field unreliable + licensing/cost for commercial use). Neither gives clean placement-*by-character* at set granularity.

---

## 2. Technical approach + stack

Fits the existing repo's posture (Python ingest pipeline → CSV/JSON → static browser app). Two tiers depending on data ambition:

**Tier A — Representation tracker (data we can actually get cleanly):**
1. Python ingester hits start.gg GraphQL: enumerate SF6 tournaments in a date window → events → entrants/standings. Respect 80 req/60s (token-bucket + backoff).
2. Emit `output/tournaments.csv` (tournament, date, tier, attendance, top-N placements, player handles) — mirrors existing CSV style.
3. Web app: attendance/representation over time, top-player placement timeline, tournament index. **No character dimension.**

**Tier B — Pro-vs-ladder pick-rate (the actual thesis, needs external char data):**
1. Add a **small manually-maintained / scraped `output/tournament_pickrate.csv`** (character, month, top8_pick_count) seeded from BreakoutES (~27 numbers/month). This is exactly what idea #1 in ideas-social-2.md already proposed as an optional overlay.
2. Join on character id against existing `usage.csv` (ladder) and Buckler win-rate.
3. **The headline viz:** scatter — tournament pick-rate (x) vs ladder usage/win-rate (y) — with the named quadrants from ideas-social-2.md ("pro darling / ladder ghost", "ladder monster / pro poison", etc.). Browser-side, zero new runtime deps.

Stack: keep Python + requests (or `gql`) for ingest; static front-end (canvas/SVG scatter) consistent with the existing zero-dependency browser-app constraint noted in ideas-social.

> **Decision for Anon (design choice — flagging per global rules, not picking silently):** the pick-rate table is an **external, manually-sourced dependency** that breaks the "100% Buckler / zero-dependency" purity of the current tool. Three options: **(i)** ship Tier A only (pure, but doesn't deliver the thesis); **(ii)** ship Tier B with a *manual* monthly `tournament_pickrate.csv` you hand-update from BreakoutES (~5 min/month, no scraping fragility, honest about provenance); **(iii)** automate a BreakoutES/Liquipedia scraper (fragile, licensing questions for Liquipedia). My read: option (ii) is the best effort/reward, but this is your call.

---

## 3. What's genuinely novel

- **No SF6 tool fuses tournament pick-rate with Buckler *ranked* usage on one chart.** BreakoutES has pro pick-rate; Buckler/CatCammy have ladder usage; fgctopplayers has a derived tier — **nobody overlays the two signals to visualize the competitive-vs-casual divergence.** That fusion is the differentiator, and it's the data-backed version of the single most-repeated 2026 tier-list argument ([esports.gg competitive-vs-casual](https://esports.gg/opinion/street-fighter-6/sf6-tier-list-competitive-casual/)).
- The named-quadrant framing ("pro darling / ladder ghost") turns an abstract argument into a shareable artifact.
- Time-series of the *gap* (does a character's pro-vs-ladder divergence widen after a patch?) is unshipped anywhere.

Under-served gaps in existing tools: Liquipedia = raw archive, no analysis/usage fusion; fgctopplayers = tournament-only tier, no ladder comparison; BreakoutES = pick-rate only, static tables, no win-rate/matchup context; Buckler = ladder-only. **None cross the streams.**

---

## 4. Realistic scope given actual data availability

- **What's solidly feasible (start.gg, clean, automatable):** character **representation/attendance** trends, player placement timelines, tournament-presence-by-character *if* we approximate "presence" from entrant rosters where available. This is "representation tracker," not "placement-by-character."
- **What requires external manual-origin data:** the headline **pro pick-rate vs ladder usage** comparison (BreakoutES-style table). Small (~27 numbers/month), high-value, but a non-Buckler dependency.
- **What is effectively NOT feasible at scale:** **placement-by-character** (e.g. "Ken's average tournament finish") and **per-set/per-game character matchup results from tournaments** — because per-game character selection is not in the data. Don't promise it.

So the honest product = **"pro pick-rate vs ladder usage" overlay (Tier B)** built on a small curated pick-rate table, optionally plus a start.gg-powered representation/attendance view (Tier A). The matchup-level tournament data that would let you compute tournament *matchup* win-rates is out of reach.

---

## 5. Effort

| Component | Effort |
|---|---|
| start.gg ingest (tournaments/standings/attendance) | **M** (auth, pagination, rate-limit handling, schema mapping) |
| Tier A representation views | **S–M** |
| Curated `tournament_pickrate.csv` + join + scatter viz (Tier B, the thesis) | **S** (data already modeled as a character-keyed table in ideas-social-2 #1) |
| Automated BreakoutES/Liquipedia scraper (if chosen) | **M**, ongoing maintenance, Liquipedia licensing risk |

**Overall: M** for a credible Tier A + Tier B (manual pick-rate) product. The thesis viz itself is **S** — the cost is plumbing and the data-sourcing decision, not the chart.

---

## 6. Key risks / blockers

1. **CRUX BLOCKER — per-set character data absent at scale.** start.gg `Game.selections` exists in schema but is essentially never populated for SF6; community charts pick-rates by hand. Any feature promising character-level tournament *results* (placement-by-character, tournament matchup win-rates) is **blocked**. (High)
2. **Pick-rate source fragility/provenance.** BreakoutES is manual, small-N, self-described as "skewed", HTML-only (no API). Liquipedia's character field is unreliable and its API is paid/restricted for commercial use and bans look-alike tools. (High)
3. **Dependency-purity tradeoff.** The thesis needs a non-Buckler external table — contradicts the tool's current zero-dependency identity. Needs an explicit decision. (Med — design)
4. **start.gg rate limits** (80/60s) make full historical backfill slow; needs caching/incremental ingest. (Low–Med)
5. **Liquipedia licensing/attribution** (CC BY-SA, no UX-replication, commercial tiers) if used as a source for a public app. (Med)
6. **Small N → noisy quadrants.** Tournament pick-rates from Top-8-only samples are thin; the "pro darling/ghost" quadrant assignments must carry confidence caveats (reuse the tool's existing low-data honesty layer). (Med)

---

## Verdict: **RISKY**

The idea is genuinely differentiated and answers a real 2026 community argument, and the *thesis chart* (pro pick-rate × ladder usage) is cheap to build. But it stands entirely on an **external, manually-collected pick-rate table** because the canonical hard gap — per-set character data — is still not accessible at scale in any free structured source (start.gg models it but TOs don't fill it; BreakoutES proves the gap by charting it by hand). **GO** if scoped to: (a) start.gg representation/attendance tracker + (b) a small curated BreakoutES-sourced pick-rate overlay joined to existing ladder data. **BLOCKED** for anything claiming character-level tournament *placements* or *matchup* results. Decide the data-dependency question (Anon) before building.

---

## Sources
- [start.gg API — Authentication](https://developer.start.gg/docs/authentication/)
- [start.gg API — Rate Limits (80 req/60s, 1000 objects/req)](https://developer.start.gg/docs/rate-limits/)
- [start.gg GraphQL schema — Game type (`selections`)](https://smashgg-schema.netlify.app/reference/game.doc.html)
- [start.gg GraphQL schema — GameSelection (`character`, `selectionType`)](https://smashgg-schema.netlify.app/reference/gameselection.doc.html)
- [start.gg API — Entrants/Standings query examples](https://developer.start.gg/docs/examples/queries/entrants-by-tournament/)
- [BreakoutES — SF6 tournament pick-rates, manual Top-8 methodology](https://www.breakoutes.com/sf6pickrates-2025)
- [Liquipedia API / LPDB — terms, pricing, restrictions](https://liquipedia.net/api)
- [Liquipedia — Street Fighter 6 wiki (1,092+ tournament pages)](https://liquipedia.net/fighters/Street_Fighter_6)
- [fgctopplayers.com — SF6 character stats / CPV tier](https://fgctopplayers.com/character-stats/)
- [esports.gg — SF6 competitive vs casual tier list (the argument this data-backs)](https://esports.gg/opinion/street-fighter-6/sf6-tier-list-competitive-casual/)
- [Apify — start.gg + Liquipedia FGC tournament scraper (proves what's scrapable)](https://apify.com/jungle_synthesizer/startgg-liquipedia-fgc-tabletop-tournament-scraper/api)
- [pysmashgg — Python wrapper for start.gg GraphQL](https://github.com/JeremySkalla/pysmashgg)
