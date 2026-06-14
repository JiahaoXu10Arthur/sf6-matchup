# FGC / Community Research: Ideas to Improve the SF6 Matchup Tool

Research date: 2026-06-14. Goal: mine the FGC + adjacent data communities (Smogon, Tekken, LoL) for adoptable ideas to improve our Buckler-aggregating matchup table + tier list + sub-recommendation tool.

---

## TL;DR — Prioritized adoptable ideas

| # | Idea | Theme | Effort | Bet size |
|---|------|-------|--------|----------|
| 1 | "Threat list" framing for the tier list (Smogon's core insight) | Framing | Low | Easy win |
| 2 | Per-cell sample-size confidence (dim/flag low-N matchups) | Data/Viz | Low–Med | Easy win |
| 3 | Diverging blue↔orange heatmap (match Buckler/CatCammy convention) | Viz | Low | Easy win |
| 4 | "Best/worst matchups" per-character drilldown (u.gg pattern) | Viz | Low | Easy win |
| 5 | Usage-vs-viability scatter ("over/underrated" quadrants — Smogon Viability Stats) | Viz/Feature | Med | Bigger bet |
| 6 | "Who covers your bad matchups" reframed as coverage %, not single sub | Framing/Feature | Med | Bigger bet |
| 7 | Skill-bracket slider with explicit weighting transparency (Smogon P(r>cutoff)) | Feature/Data | Med | Medium |
| 8 | Time-series / patch-delta view (how a matchup moved after a patch) | Feature/Data | Med–High | Bigger bet |
| 9 | "Mirror-removed" and "even/favored/unfavored" summary stats per character | Viz | Low | Easy win |
| 10 | Pair-up sub picker validated against Capcom's real sub-pairing data | Framing/Data | Low | Easy win |

---

## Theme 1 — Visualization

### How the community currently consumes matchup data
- **Buckler "Battle Diagrams"** (official): a matchup grid colored blue = higher win rate, orange = lower, filterable by rank league and control type (Classic/Modern), ranked-only. This blue↔orange diverging convention is the de-facto standard players already read fluently. **We should match it** so the tool feels native. ([Buckler stats](https://www.streetfighter.com/6/buckler/en/stats/dia))
- **CatCammy (@CatCammy6)** is the most-cited independent analyst. Format: a full N×N matchup table filtered to **ranked FT2 sets, both players ≥1700 MR, opponents within ~50 MR of each other**, with sample sizes quoted (e.g. 296,532 sets). Players trust it specifically *because* the skill floor and MR-gap filters are stated up front. ([CatCammy on X](https://x.com/CatCammy6/status/1800621012435767428), [DashFight writeup](https://dashfight.com/news/street-fighter-6-matchup-table-by-cat-cammy-4753))
- **EventHubs** republishes these monthly as the news beat — the demand is for *recurring, comparable* snapshots, not one-offs. ([EventHubs SF6 matchup charts](https://www.eventhubs.com/news/2024/apr/03/sf6-master-matchup-chart/))

### Adoptable visualization ideas
1. **Diverging heatmap matching the Buckler/CatCammy blue↔orange convention** (idea #3). Players already parse this. Center the scale at 50%, not at the data midpoint, so "even" reads as neutral. *Easy win.*
2. **Per-character "best matchups / worst matchups" drilldown** (idea #4). u.gg's counter pages are built around exactly this: pick a character, immediately see a ranked list of who they beat and who beats them, sorted by win rate, with the matchup win % on each. This is the single most-used view in LoL stat sites and maps perfectly onto our data. ([u.gg counters](https://u.gg/lol/champions/gangplank/counter), [leagueofgraphs best-with/best-against](https://www.leagueofgraphs.com/champions/counters)) *Easy win.*
3. **Usage-vs-viability scatter** (idea #5). Smogon's "Viability Stats" plots usage against vetted viability to surface *over- and under-rated* picks. Our analogue: x = usage rate, y = overall win rate, with quadrants — "strong & popular," "strong & slept-on" (the interesting one — pick these), "weak & overplayed," "weak & rare." This turns two numbers we already have into a genuinely novel, shareable view nobody in SF6 currently ships. ([Smogon Viability Stats](https://www.smogon.com/forums/threads/viability-stats-combining-usage-viability-rankings.3487400/)) *Bigger bet, high differentiation.*
4. **Sample-size confidence baked into the cell** (idea #2). Render low-N matchups dimmed/hatched with the N on hover, or a confidence interval band. The #1 community complaint about every SF6 chart is that low-usage characters (non-shotos) have noisy, player-dependent matchup numbers. Visibly de-emphasizing thin cells directly answers a known pain point. ([Steam: sample-size accuracy discussion](https://steamcommunity.com/app/1364780/discussions/0/3882725333016959459)) *Easy win, high trust payoff.*
5. **Per-character summary chips**: count of favored / even / unfavored matchups, and an average win rate with the mirror removed (idea #9). Pros already talk in these terms ("Luke has no losing matchups, all even or slight-favor"). Cheap to compute, very legible. ([EventHubs Luke analysis](https://www.eventhubs.com/news/2024/apr/03/sf6-master-matchup-chart/)) *Easy win.*

---

## Theme 2 — Features players ask for / done poorly

### Known pain points
- **Sample-size unreliability** for weak/rare characters — the most repeated criticism. Charts present all cells with equal visual weight even when one is 50,000 sets and another is 300. (Steam discussions.)
- **Skill-level mismatch**: tier lists are defended as "tournament-viable at top level" but players keep misreading them against their own ranked experience. Honda/knowledge-check characters dominate low ranks but are bottom-tier competitively. A chart that doesn't let you *re-bracket by skill* invites this confusion every time. ([Steam: tier list vs skill](https://steamcommunity.com/app/1364780/discussions/0/3815159202305488974)) Our skill-bracket weighting already addresses this — **we should make it the headline feature, not a buried toggle.**
- **Static snapshots, no patch context**: matchups shift after every balance patch (e.g. Ryu's usage/win-rate jump noted post-patch). Players want "how did this move since the last patch," which no current tool shows well. ([EventHubs patch stats](https://www.eventhubs.com/news/2025/jan/10/sf6-december-stats-changes-ryu/))

### Adoptable feature ideas
6. **Skill-bracket slider with transparent weighting** (idea #7). Smogon weights every data point by `P(rating > cutoff)` using Glicko, and *publishes the formula and the rationale* ("tiers are threat lists — they should reflect what competent players face"). The trust comes from transparency. We have skill-bracket weighting already; add a one-line "how this is weighted" explainer and let users see the cutoff effect. ([Smogon weighted-stats FAQ](https://www.smogon.com/forums/threads/weighted-stats-faq.3478570/)) *Medium.*
7. **Patch-delta / time-series view** (idea #8). Show a matchup's win-rate trend across patches, with patch markers. Pairs naturally with our aggregation if we snapshot Buckler data over time. This is the gap every SF6 resource leaves open. *Bigger bet — requires historical data capture; start snapshotting now even before the UI exists.*
8. **"Threat list" / meta-prep mode** (idea #1). Reframe the tier list explicitly as "the characters you must be ready to fight" (weighted by usage × win rate), which is what Smogon tiers *actually are*. This reframing is free and instantly makes usage-weighting feel purposeful rather than arbitrary. ([Smogon weighted-stats FAQ](https://www.smogon.com/forums/threads/weighted-stats-faq.3478570/)) *Easy win.*

### Reference tools worth studying for feature parity
- **ewgf.gg** (Tekken 8): character stats, player profiles, leaderboards, rank distribution — a polished modern stat-site template. (403'd on fetch but widely referenced.) ([ewgf.gg](https://www.ewgf.gg/))
- **Tekken-Lytics / Wavu Wank**: per-player "your bad matchups" via ID lookup; community loves the personalized angle. ([Z League on Wavu Wank](https://www.zleague.gg/theportal/tekken-google-sheet-win-rate-vs-specific-matchups-revealed/), [Tekken-Lytics discussion](https://steamcommunity.com/app/1778820/discussions/0/4511003785959104618/))
- **METAsrc Counter Picker** (LoL): live recommendation given enemy picks — directly analogous to our sub-recommender. ([METAsrc](https://www.metasrc.com/lol/counter-picker))

---

## Theme 3 — Framing & terminology (the pocket/secondary angle)

This is where our tool's central thesis lives, so it's the most important section.

### How the community actually thinks about secondaries
- **Capcom's own Oct 2025 dev column** analyzed subs by "for each character's mains, who do they most pick as a sub" — i.e. **conditional on your main**, not raw playrate. Result: **Ken (sub for 10 mains), Cammy (6), Zangief (4), Ryu (3), Juri (2)**, and **20 of 27 characters are nobody's popular sub.** ([EventHubs / Capcom sub-character column](https://www.eventhubs.com/news/2025/oct/09/street-fighter-6-sub-characters/))
- Two distinct motivations co-exist in community discourse: (a) **matchup coverage** (counter-pick your main's bad MUs), and (b) **kit familiarity / transfer** (Ryu↔Ken, Cammy→Juri because the playstyle carries over). Players rarely pick a sub *purely* on matchup math — ease of transfer matters a lot. ([Reddit/Steam sub discussions](https://steamcommunity.com/app/1364780/discussions/0/6513974436464589564))

### Is our framing aligned? Mostly yes — with two adjustments
9. **Validate / calibrate against Capcom's real sub-pairing data** (idea #10). Our recommender outputs *who covers your bad matchups*; Capcom tells us *who players actually sub*. If we surface both ("our pick: X covers your worst MUs; community most-subs: Ken/Cammy"), we get instant credibility and a built-in sanity check. The fact that Ken/Cammy/Zangief dominate real subs — strong, flexible characters, not just matchup-coverage picks — suggests our pure-coverage math may over-recommend niche characters. *Easy win.*
10. **Add a "transfer cost" / kit-similarity dimension to the sub recommendation** (idea #6, framing half). The community's lived heuristic is "cover the matchup *and* something I can actually play." A pure coverage-optimal sub that plays nothing like your main is a bad real-world recommendation. Even a coarse archetype tag (shoto / rushdown / zoner / grappler) used as a tiebreaker would align us with how players choose. *Medium — needs a similarity signal; archetype tags are the cheap version.*
11. **Reframe sub output as coverage %, not a single name** (idea #6, feature half). Instead of "your sub is X," show "X covers 4 of your 5 losing matchups (raising your weighted win rate from 48.2% → 51.1%)." This mirrors how LoL counter-pickers quantify the swing and makes the recommendation falsifiable/trustworthy. *Medium.*

### Terminology to adopt (matches community vocabulary)
- "**Sub**" and "**pocket**" are both in active use; "sub" is Capcom-official, "pocket" is community slang for a narrower counter-pick-only secondary. Consider using **"pocket"** specifically for our matchup-coverage recommendation and **"sub"** for a general secondary — the distinction maps onto our tool's actual function.
- "**Threat list**" (Smogon) for the usage-weighted tier list.
- "**Even / slight-favor / unfavored / losing**" buckets rather than raw decimals for at-a-glance reads (community speaks in these terms).

---

## Theme 4 — Data

- **Match the Buckler filter vocabulary** users already trust: rank league, control type (Classic/Modern), ranked-only. Expose these as filters since our source data is Buckler. ([Buckler stats](https://www.streetfighter.com/6/buckler/en/stats/dia))
- **State the skill floor + MR gap explicitly** the way CatCammy does (≥1700 MR, ≤50 MR gap, FT2). Stating the cohort is *why* people trust her numbers over raw Buckler. ([CatCammy](https://x.com/CatCammy6/status/1800621012435767428))
- **Capture historical snapshots now** to enable the patch-delta view later (idea #8) — this is data-collection debt that only gets more expensive to backfill.
- **Surface N per cell** as a first-class data field, not just a footnote (feeds idea #2).
- **Smogon's lesson on cutoffs**: they tested 1500/1850/2200 cutoffs and found results statistically similar — the weighting function behaves as a clean threshold. Implication: we don't need many brackets; 2–3 well-chosen ones (e.g. all-Master, high-Master ≥1700, top ladder) cover the space. ([Smogon weighted-stats FAQ](https://www.smogon.com/forums/threads/weighted-stats-faq.3478570/))

---

## Biggest differentiators (if picking only a few)
1. **Usage-vs-viability scatter** (idea #5) — nothing in SF6 ships this; it's Smogon's most respected analytical artifact ported to our domain.
2. **Coverage-% sub recommendation validated against Capcom's real sub data** (ideas #9–11) — turns our central feature from "trust me" into a quantified, sanity-checked recommendation.
3. **Patch-delta time series** (idea #8) — the universally-requested, universally-missing view.

---

## Sources
- [Buckler's Boot Camp — Battle Diagrams (official)](https://www.streetfighter.com/6/buckler/en/stats/dia)
- [CatCammy on X — matchup table (≥1700 MR, FT2)](https://x.com/CatCammy6/status/1800621012435767428)
- [CatCammy (@CatCammy6) profile](https://twitter.com/CatCammy6)
- [DashFight — SF6 Matchup Table by Cat Cammy](https://dashfight.com/news/street-fighter-6-matchup-table-by-cat-cammy-4753)
- [DashFight — SF6 Master Rank Matchup Sheet](https://dashfight.com/news/street-fighter-6-master-rank-matchup-sheet-3500)
- [EventHubs — Master rank matchup chart (Luke, even/favored framing)](https://www.eventhubs.com/news/2024/apr/03/sf6-master-matchup-chart/)
- [EventHubs — Master matchup chart from thousands of games](https://www.eventhubs.com/news/2023/sep/27/sf6-master-matchup-chart/)
- [EventHubs — Dec stats / patch usage shifts (Ryu)](https://www.eventhubs.com/news/2025/jan/10/sf6-december-stats-changes-ryu/)
- [EventHubs — SF6 sub characters (Capcom dev column: Ken/Cammy)](https://www.eventhubs.com/news/2025/oct/09/street-fighter-6-sub-characters/)
- [EventHubs — SF6 stats hub (usage)](https://www.eventhubs.com/stats/sf6/)
- [Steam — sample-size accuracy discussion](https://steamcommunity.com/app/1364780/discussions/0/3882725333016959459)
- [Steam — tier list vs player skill discussion](https://steamcommunity.com/app/1364780/discussions/0/3815159202305488974)
- [Steam — secondary/sub character discussion](https://steamcommunity.com/app/1364780/discussions/0/6513974436464589564)
- [Smogon — Weighted Stats FAQ (methodology, cutoffs, threat-list framing)](https://www.smogon.com/forums/threads/weighted-stats-faq.3478570/)
- [Smogon — Viability Stats (usage + viability, over/underrated)](https://www.smogon.com/forums/threads/viability-stats-combining-usage-viability-rankings.3487400/)
- [Smogon — Quantitative analysis of viability/metagame changes](https://www.smogon.com/forums/threads/quantitative-analysis-of-viability-rankings-metagame-changes-and-camps-of-thought.3649801/)
- [u.gg — LoL champion counters (best/worst matchup drilldown)](https://u.gg/lol/champions/gangplank/counter)
- [leagueofgraphs — best-with / best-against](https://www.leagueofgraphs.com/champions/counters)
- [METAsrc — LoL Counter Picker (live recommendation)](https://www.metasrc.com/lol/counter-picker)
- [ewgf.gg — Tekken 8 statistics site](https://www.ewgf.gg/)
- [Z League — Wavu Wank Tekken 8 matchup sheet](https://www.zleague.gg/theportal/tekken-google-sheet-win-rate-vs-specific-matchups-revealed/)
- [Steam — Tekken-Lytics stat site discussion](https://steamcommunity.com/app/1778820/discussions/0/4511003785959104618/)
