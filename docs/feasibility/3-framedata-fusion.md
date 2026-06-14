# Feasibility #3 — Frame-data × Matchup Fusion

> "Fuse public SF6 frame data with our matchup win-rate data so a player sees *which of their buttons/options actually win in THIS matchup*."

Investigated 2026-06-14. Research only — no app code written.

**One-line verdict: RISKY.** The frame-data sourcing is GO (clean, complete, current sources exist). The *insight* is the risk: frame data + a single matchup win% does **not** produce honest "which button wins" guidance. The real version needs hitbox/range and per-move matchup-usage data that no public source aggregates.

---

## 1. Frame-data source availability + license (the crux)

**Crux answer: YES — at least two sources are simultaneously machine-readable, complete, current, and legally reusable.** The license posture forces a choice (see below).

| Source | Format | Machine-readable | Completeness | Cadence | License | Reusable? |
|---|---|---|---|---|---|---|
| **FAT / `D4RKONION/FAT`** | Single JSON file in repo | **Best** — one HTTP GET | **Richest schema.** 30 chars (incl. Terry, Ingrid). Per move: `startup, active, recovery, total, onHit, onBlock, onPC, DRoH/DRoB` (Drive Rush), `dmg, dmgScaling, hitstun, blockstun, hitstop, range, atkLvl, xx` (cancel options), `extraInfo` | **Updated today (2026-06-14)**; tracks patches closely | **GPL-3.0** + must credit/link FAT | Yes, but **copyleft is viral on your codebase** |
| **SuperCombo Wiki `SF6_FrameData`** | MediaWiki Cargo API → JSON | **Yes** — live `action=cargoquery` API (not Cloudflare-blocked; HTML pages are) | Full. 2,306 rows. Fields: `name, startup, active, recovery, blockAdv, hitAdv, guard, cancel, damage, hitconfirm` | Community patch-tracked, current | **CC-BY-SA** (attribution + share-alike on *data only*, no code copyleft) | Yes — cleaner for a non-GPL app |
| Ultimate Frame Data | HTML only | Scrapable, no API/export | Full + hitbox images (33 chars) | Patch-current (MetalMusicMan) | **None stated** → default copyright | No (not cleanly redistributable) |
| Official Capcom / Buckler | HTML patch prose, Cloudflare | No structured frame dataset | Patch notes only, not data | Authoritative for patches | EULA **prohibits** scraping/redistribution | **No — highest legal risk** |
| `0xSilverest/sf6-frame-data-extractor` | Clojure scraper (no data committed) | Produces JSON/CSV; richest official fields | Scrapes live Capcom site | Dormant (last push 2025-02) but scrapes live | Ambiguous (`NOASSERTION`) | Verify LICENSE first |
| `jrfrancisco1123/sf6_framedata` | Python dicts committed | Convertible | Newest roster, clean tabular | Active (2026-03) | **None** → all rights reserved | No |
| `racpsjcsp/SF6-FrameData` | Swift arrays committed | Convertible | **MIT** but only 18 launch chars, frozen Oct 2023 | Abandoned | MIT | Yes but badly stale |
| `sagansfault/sf6fd` | Java lib | Sparse | Season 1, 1 commit | Dead | None | No |
| `SF6QuickReference` | JS, command-list | **No frame data at all** | Inputs only | Stale | GPL-3.0 | N/A |

**Best source — depends on app license (a decision for Anon):**
- **Open-source app → FAT `SF6FrameData.json`.** Single 2.6 MB file, richest schema (the only source with `range` *and* cancel options inline), updated literally today. URL: `https://raw.githubusercontent.com/D4RKONION/FAT/main/src/js/constants/framedata/SF6FrameData.json`. Catch: GPL-3.0 is viral on your codebase.
- **Closed/permissive app → SuperCombo Cargo API.** Live JSON, complete, current, CC-BY-SA (attribution + share-alike on the *derived data* only, no copyleft on your code). Endpoint: `https://wiki.supercombo.gg/api.php?action=cargoquery&format=json&tables=SF6_FrameData&fields=...&limit=500&offset=...`. Catch: values carry wiki markup (`'''116 (total)'''`, `KD +20`) needing cleanup; footer CC-BY-SA wording should be visually confirmed.

Both include **Ingrid** (30 chars), which the pipeline excludes — filter regardless. Our matrix has 30 chars including INGRID in the raw CSV.

> **DESIGN DECISION FOR ANON:** GPL-3.0 (FAT, viral code, but turnkey + `range` field) vs CC-BY-SA (SuperCombo, no code copyleft, but markup cleanup + no inline `range`). This is the single biggest sourcing call and changes the architecture. I have not chosen.

---

## 2. What "fusion" really delivers (skeptical)

**Join key:** `(my_char, opponent_char)` → from our `output/matrix.csv` (rows of `month, rank, char, opp, score`) joined to frame data keyed by `char`. Trivial join: both sides key on character name (need a name-normalization map — `M. BISON` vs FAT `Bison`, `C. VIPER`, `E. HONDA`, etc.).

**The honest problem — what does the join actually produce?**

A matchup win% is a **single scalar per character pair**. Frame data is a **per-move table that does not vary by opponent.** Joining them does NOT make frame data matchup-specific — you just display the same frame table next to a number that says "this matchup is 47%." That is **not** "which button wins THIS matchup." That is two facts side by side.

What makes a button "win" a matchup is **spatial and situational**, none of which is in frame-data-plus-win%:
1. **Hitbox/hurtbox geometry + reach** — "my 2MK out-ranges their 5HK." Frame data cannot express this. (Extractable from UFD images or `WistfulHopes/SF6Mods` hitbox viewer.)
2. **Range-vs-startup interaction** — move A beats B only at distance X; needs range + startup *together*.
3. **Per-move usage frequency in the matchup** — "they will press *this* button." **Buckler exposes only character-level usage, no per-move data.** Would require replay-parsing or community data — the hardest input.
4. **Option coverage** — does my OS catch their backdash / DI / jump? Combinatorial, not a per-move attribute.
5. **Projectile data** (speed, durability, recovery) — decisive in fireball matchups.
6. **Punish-counter routing** — SF6's PC system makes optimal punishes matchup- and move-specific.

**Verdict on the insight:** "which button wins this matchup" framed as *frame-data + win%* is **overclaiming / marketing.** The easy 20% (frames + win%) is exactly what every existing tool already has separately. The load-bearing 80% — hitbox geometry, range×startup, per-move matchup usage — is the data nobody has aggregated. That gap is both the moat and the build risk.

**An honest, shippable framing that the data *can* support today:** a matchup-context **punish/whiff-punish and "key buttons" reference** — given my char + opponent, show (a) my fastest/longest pokes by `range`+`startup`, (b) my punish options vs the opponent's *unsafe* moves (their `onBlock` < my fastest startup — this IS a genuine cross-character computation), (c) the win% as context. That is real and defensible. The "AI tells you which button wins" pitch is not, without hitbox + usage data.

---

## 3. Technical approach + stack

Builds on the existing Python pipeline (`scripts/`, `output/matrix.csv`) + planned web app (`web-v2/`).

1. **Ingest** chosen frame source into `data/framedata/` as normalized JSON (one fetch for FAT; paginated Cargo pulls + markup-strip for SuperCombo).
2. **Normalize move schema** to a common shape: `{char, move, startup, active, recovery, onBlock, onHit, range?, cancel[], atkLvl, dmg}`. Strip wiki markup if SuperCombo.
3. **Character name map** between matrix.csv names and frame-source names.
4. **Cross-character compute layer** (the only genuinely "fused" output): for `(me, opp)`, compute *my moves that punish opp's minus-on-block moves* (`opp.onBlock < -my.fastestStartup`), my reach-advantaged pokes, opp's plus frames I must respect. Win% from matrix as a context badge.
5. **Web surface**: matchup picker → frame table + computed punish/poke list + win% context.

Stack: existing Python for ingest/normalize/compute (emit static JSON); existing web-v2 front-end to render. No new heavy infra.

---

## 4. Existing tools / differentiation

**No tool fuses matchup data with frame data.** Confirmed:
- Frame tools (FAT, Ultimate Frame Data, Frame Checker 6, SF6 Frame Killer) are all **single-character lookups, zero matchup dimension.**
- Matchup/win-rate data (Buckler Battle Diagrams + Character Usage) is **character-level only, no frame data, no per-move usage,** no public API.
- SuperCombo has per-character *Matchups* pages but they are **hand-written prose**, not data-driven, not joined to its own frame tables.

**Differentiation is real** — the join `(matchup) → (move-level guidance)` is genuinely unbuilt. But the differentiation that is *defensible with available data* is the cross-character punish/poke computation (item 4 in §3), not "which button wins," which needs the unavailable hitbox+usage layer.

---

## Effort: **M** (Medium)

- Frame ingest + normalize + name-map: S (FAT is one file; SuperCombo adds markup cleanup).
- Cross-character punish/poke compute: S–M (real logic, but bounded).
- Web surface: M (matchup picker + tables, leverages existing web-v2).
- Reaching the *advertised* "which button wins" insight (hitbox geometry + per-move usage): **L→XL and partly blocked** by data that does not exist publicly.

So: **M to ship the honest version; the marketed version is L+ and data-blocked.**

## Key risks / blockers

1. **Insight overclaim (highest).** Frames + win% ≠ "which button wins." Shipping that framing is dishonest and easily debunked by the FGC. Reframe to punish/poke reference + win% context.
2. **License choice is load-bearing.** GPL-3.0 (FAT) vs CC-BY-SA (SuperCombo) — undecided, changes architecture. Both require attribution.
3. **Patch drift.** Frame data changes every balance patch (latest 2026-05-28); must re-sync. FAT/SuperCombo track it; a stale snapshot misleads.
4. **Missing data for the real insight:** no public per-move matchup usage (Buckler is character-level only); hitbox/range only via FAT's inline `range` field or scraping UFD images / SF6Mods viewer.
5. **Name normalization** between matrix.csv and frame source (minor but required).
6. **Capcom Buckler must not be scraped** for frame data (EULA prohibits; sf6frames.com publicly shut down over scraping). Our matchup data already comes from Buckler stats — keep frame data on FAT/SuperCombo.

---

## Verdict: **RISKY** — GO on data sourcing, RISKY on the headline insight.

Sourcing is solved (FAT JSON or SuperCombo Cargo API, both complete/current/reusable). Build the honest **matchup-context punish/poke reference** (M effort, genuinely unbuilt, defensible). Do **not** ship "which button wins this matchup" as the pitch — that requires hitbox + per-move-usage data that no public source provides, and the frames-plus-win% version of it is marketing.

### Sources
- FAT data: https://raw.githubusercontent.com/D4RKONION/FAT/main/src/js/constants/framedata/SF6FrameData.json — repo https://github.com/D4RKONION/FAT (GPL-3.0)
- SuperCombo Cargo API: https://wiki.supercombo.gg/api.php?action=cargoquery&format=json&tables=SF6_FrameData (CC-BY-SA) — https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data
- Ultimate Frame Data: https://ultimateframedata.com/sf6/
- Buckler stats (matchup/usage, no frame data): https://www.streetfighter.com/6/buckler/en/stats/dia , https://www.streetfighter.com/6/buckler/en/stats/usagerate
- Hitbox data: https://github.com/WistfulHopes/SF6Mods
- GitHub repos: https://github.com/0xSilverest/sf6-frame-data-extractor , https://github.com/jrfrancisco1123/sf6_framedata , https://github.com/racpsjcsp/SF6-FrameData , https://github.com/sagansfault/sf6fd , https://github.com/jerpdoesgames/SF6QuickReference
