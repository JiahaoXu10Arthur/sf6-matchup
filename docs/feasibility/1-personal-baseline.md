# Feasibility #1 — Personal × Global Baseline

> **One-line verdict: RISKY** — the personal match-history data is fully reachable and
> rich enough, but ONLY behind the player's own authenticated Capcom ID session; there
> is no public per-player API, so the whole feature depends on a fragile, ToS-grey,
> credential-bound scrape of Next.js hydration data.

Researched 2026-06-14. The global-baseline half (`output/matrix.csv`, from the public
`stats/dia_master` API) is already solved; this doc is only about whether **personal**
match history is obtainable.

---

## Data access (the crux)

### What exists

- **Per-player profile:** `https://www.streetfighter.com/6/buckler/profile/{short_id}`
  - `short_id` = the player's 10-digit **User Code** (stable, set at account creation,
    cannot be changed). The changeable CFN display name appears separately as
    `fighter_id`. Capcom web manual confirms the User Code concept:
    https://game.capcom.com/manual/SF6/en/ps5/page/8/1
  - Logged-in user's own profile resolves via
    `https://www.streetfighter.com/6/buckler/profile/auth`.
- **Per-player ranked battle log:**
  `https://www.streetfighter.com/6/buckler/profile/{short_id}/battlelog/rank?page={n}`
  — paginated, with a "next disabled" element marking the last page. This is the
  endpoint every working scraper uses.

### How the data is delivered

It is **not a clean JSON REST API**. Capcom's site is a Next.js app behind AWS
CloudFront. Personal data arrives two ways:

1. The initial HTML embeds `<script id="__NEXT_DATA__">…</script>` containing the full
   `props.pageProps` payload — including `props.pageProps.replay_list`. This is what
   scrapers parse.
2. Client-side navigation hits `_next/data/{urlToken}/en/.../battlelog/rank.json` —
   the standard Next.js data route. The `{urlToken}` is the build/deploy token and
   **rotates whenever Capcom redeploys the site** (hours-to-days lifetime), so any
   `_next/data` URL goes stale and must be re-extracted.

Contrast with the global baseline used today: `…/api/{lang}/stats/dia_master/{YYYYMM}`
is a genuine public JSON endpoint, no auth, served to a plain request with browser
headers. Personal data has no such equivalent — it is reverse-engineered hydration,
not a documented API. **Endpoint stability: low.**

### Login-gating — GATED (high confidence)

This is the decisive finding. Personal battle log requires the player's own
authenticated Capcom ID session:

- The unauthenticated profile route returns **HTTP 403** without a session.
- Every working tool sends an authenticated session. Two independent code-confirmed
  patterns:
  - **Cookie forwarding** — extract `buckler_id` + `buckler_r_id` from the logged-in
    browser's `Cookie` header and replay them on requests
    (`Xjph/CFNScrape`, fork `3ternal/CFNScrape`; `AJardelH/SF6_Ranking_Data` ships a
    gitignored `cookies_headers.py` with a comment "Cookies and headers required / log in").
  - **Headless login** — drive a real browser engine through the Capcom ID flow:
    `cid.capcom.com/ja/login/?guidedBy=web` → `auth.cid.capcom.com` →
    `…/6/buckler/auth/loginep?redirect_url=/`, then read `__NEXT_DATA__` from the
    authenticated battlelog page. This is exactly what **CFN Tracker** does
    (`app/pkg/tracker/sf6/cfn/client.go`, Go + Wails/Rod webview).
- No reproducible method to read a battle log while logged out was found. Treat
  logged-out access as **confirmed unavailable**.
- The exact cookie names (`buckler_id` / `buckler_r_id`) are confirmed from CFNScrape;
  SFBUFF instead takes `SFBUFF_BUCKLER_EMAIL`/`_PASSWORD` or a manually-set
  `AUTH_COOKIE`. So multiple auth surfaces exist, all requiring the user's own account.

### Per-match fields (from `replay_list`) — sufficient

Confirmed fields parsed by working code (`AJardelH/SF6_Ranking_Data`):

| Field | Use |
|-------|-----|
| `replay_id` | unique match id / dedupe key |
| `player1_info.player.short_id`, `player2_info.player.short_id` | identify which side is "you" |
| `player1_info.character_name`, `player2_info.character_name` | your character + opponent character |
| `player1_info.master_rating`, `player2_info.master_rating` | MR (LP-equivalent at Master) at match time |
| `player1_info.round_results`, `player2_info.round_results` | per-round outcome codes; `0` = round loss → match loss = `round_results.count(0) >= 2` |

Plus match timestamp metadata in the broader payload (the ranking JSON exposes
`last_play_at`). **This is more than enough** to compute personal per-(your-char,
opponent-char) win rates: you know your side, your character, the opponent's
character, and who won. (The mirror double-count caveat that bites global-matrix
builders is irrelevant for a single player's own W/L tally.)

### Rate limits / bot protection (honest limits of evidence)

- CloudFront, **not** Cloudflare — generic Cloudflare-challenge advice does not apply.
- **No published rate-limit number and no documented captcha/JS-challenge** in any
  scraper — **unconfirmed**. Practical signals: scrapers self-pace with `time.sleep`,
  a full leaderboard crawl is noted as ">12 hours", and the `urlToken` expires
  periodically. SFBUFF's README documents reverse-proxy bot detection and its live
  site (`sfbuff.site`) returned 403 to automated fetches — so anti-bot friction is
  real even if no hard cap is documented.

---

## Technical approach + stack

The data plumbing is proven; pick an auth strategy (this is the main design decision —
see Key risks). Two viable paths, both port cleanly from existing references:

1. **User-supplied cookie / credentials, server-side fetch.** User logs into Buckler,
   we capture `buckler_id`+`buckler_r_id` (browser extension or paste), fetch
   `profile/{short_id}/battlelog/rank?page=n`, parse `__NEXT_DATA__.props.pageProps.replay_list`.
   Mirrors `CFNScrape` / `SF6_Ranking_Data`.
2. **Headless-browser login** (CFN Tracker model): drive the Capcom ID login, keep the
   session cookie, scrape the same pages. Heavier, but survives `urlToken` rotation
   because it navigates like a real client.

Reusable references to port rather than write from scratch:
- `williamsjokvist/cfn-tracker` (Go) — best-maintained; full auth + `__NEXT_DATA__`
  parse sequence: https://github.com/williamsjokvist/cfn-tracker
- `AJardelH/SF6_Ranking_Data` (Python) — clearest `replay_list` field parsing:
  https://github.com/AJardelH/SF6_Ranking_Data
- `alanoliveira/sfbuff` (Ruby) — web-app ingestion with cookie/credential auth:
  https://github.com/alanoliveira/sfbuff

**Suggested stack:** keep ingestion in Python to match the existing pipeline
(`download_buckler.py` style: urllib/requests + JSON parse), add a small HTML→
`__NEXT_DATA__` extractor. Compute personal per-matchup rates, join against the
existing `matrix.csv` global baseline, apply Bayesian shrinkage.

**Stats (the genuinely novel layer):** for each (your-char, opponent) cell, you have a
small-sample personal win rate `(w, n)` and a global baseline `p0` (the Buckler value
for a player on that character). Use Beta–Binomial / empirical-Bayes shrinkage toward
`p0`: posterior `Beta(α0 + w, β0 + n − w)` with prior centered on `p0`. Surface the
delta (`personal − baseline`) only when the posterior credible interval excludes 0 —
i.e. "you're −12% vs Dhalsim, and with n=23 games that's a real signal, not noise."
This shrinkage + credible-interval gate is exactly what no existing tool does.

---

## What's genuinely novel

**No existing tool does personal-vs-global-baseline matchup weakness with confidence.**

- Official **Battle Diagrams** (`stats/dia`) = global baseline only; nothing personal.
- **CFN Tracker / SF6 Scouter / SmartCV** = raw personal session data (W/L, LP/MR
  deltas, opponent char) — no per-matchup rate, no baseline comparison.
- **SFBUFF** = per-player insights, but no evidence of a global-baseline differential
  and definitely no Bayesian confidence (live site 403'd to automated fetch →
  exact features **unconfirmed**, but at most it's personal stats).
- **Zero** tools apply Bayesian/empirical-Bayes shrinkage or significance gating to
  personal matchup win rates. Community charts only threshold the *global* aggregate.

The two data halves already exist (personal `replay_list` + public `stats/dia`); the
novel contribution is combining them with a small-sample confidence model. This repo
already owns the harder-to-get baseline half.

---

## Effort: **M**

- Ingestion: port a proven scraper (S–M; the auth/parse path is solved).
- Stats layer (Beta–Binomial shrinkage + credible-interval gate, join to `matrix.csv`): S–M;
  small, well-scoped, fits the existing Python pipeline.
- The cost is **not** algorithmic — it's the auth/session UX and ongoing maintenance
  against a rotating, undocumented endpoint. That recurring fragility is what pushes
  this from S to M and is the real ongoing tax.

---

## Key risks / blockers

1. **Auth dependency (highest).** Feature is dead without the user's own logged-in
   Capcom session. No anonymous access, no public API. Every user must either paste
   cookies, install an extension, or trust a headless login with their Capcom
   credentials — significant UX friction and a trust ask.
2. **Endpoint fragility.** `__NEXT_DATA__` shape and the `_next/data` `urlToken` are
   undocumented and rotate on Capcom redeploys. Expect breakage on their schedule, not
   yours.
3. **ToS / scraping grey zone.** Automating an authenticated Capcom account to scrape
   personal data is a clearer ToS concern than the public aggregate stats this repo
   uses today. Handling other users' Capcom credentials/cookies also raises real
   security and liability questions. **DESIGN DECISION for Anon:** local-only tool
   (user runs it against their own session, à la CFN Tracker) vs. hosted web app
   (we custody sessions) — these have very different risk profiles. Do not pick
   silently.
4. **Anti-bot friction.** CloudFront + documented reverse-proxy bot detection (SFBUFF);
   no hard rate limit confirmed, but self-pacing and 403 risk are real.
5. **Small-sample reality.** Many opponents will have very few personal games; the
   Bayesian gate handles this honestly but means a lot of cells will read "not enough
   data yet" — manage expectations in the UI.

---

## Verdict: **RISKY**

The idea is technically feasible and genuinely novel — the personal battle log carries
every field needed, and nobody combines it with the global baseline under a confidence
model. But it lives or dies on **per-user authenticated access to a private,
undocumented, rotating endpoint**, with real ToS and credential-handling exposure. GO
only after Anon decides the auth/custody model (local-only vs hosted); as an open-ended
hosted web app it is RISKY.
