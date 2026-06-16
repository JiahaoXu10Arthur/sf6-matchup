/* In-browser Personal Matchup Scout — JS port of scripts/bayes.py +
   personal_scout.py + the pure half of fetch_battlelog.py (parse_battlelog).

   UI-free so node can require() it; tests/test_scout_parity.py asserts these
   functions match the Python originals to 1e-9. Keep formulas in sync with
   docs/METHOD.md. Personal battle data is parsed and scored entirely here in
   the browser — it never leaves the page. */

/* ---------- Beta-Binomial statistics (port of bayes.py) ---------- */

const _MAXIT = 200;
const _EPS = 3e-12;
const _FPMIN = 1e-300;

// Lanczos approximation for ln Γ(x) (JS has no Math.lgamma). g=7, n=9 — accurate
// to ~1e-13 relative, far inside the 1e-9 parity tolerance for our a,b > 0.
const _LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function lgamma(x) {
  if (x < 0.5) {
    // reflection: Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1.0 - x);
  }
  x -= 1.0;
  let a = _LANCZOS[0];
  const tt = x + 7.5;                       // g + 0.5
  for (let i = 1; i < _LANCZOS.length; i++) a += _LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(tt) - tt + Math.log(a);
}

// Continued fraction for the incomplete beta (Lentz's method, NR betacf).
function _betacf(x, a, b) {
  const qab = a + b, qap = a + 1.0, qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - qab * x / qap;
  if (Math.abs(d) < _FPMIN) d = _FPMIN;
  d = 1.0 / d;
  let h = d;
  for (let m = 1; m <= _MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < _FPMIN) d = _FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < _FPMIN) c = _FPMIN;
    d = 1.0 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < _FPMIN) d = _FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < _FPMIN) c = _FPMIN;
    d = 1.0 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1.0) < _EPS) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a,b) = CDF of Beta(a,b) at x.
function regIncompleteBeta(x, a, b) {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1.0 - x));
  if (x < (a + 1.0) / (a + b + 2.0)) return front * _betacf(x, a, b) / a;
  return 1.0 - front * _betacf(1.0 - x, b, a) / b;
}

// Prior Beta(p0*kappa, (1-p0)*kappa) updated by wins/losses -> posterior [a, b].
function betaPosterior(p0, kappa, wins, losses) {
  return [p0 * kappa + wins, (1.0 - p0) * kappa + losses];
}

function posteriorMean(alpha, beta) {
  return alpha / (alpha + beta);
}

// Inverse CDF (quantile) of Beta(alpha, beta) by bisection on the CDF.
function betaPpf(q, alpha, beta) {
  let lo = 0.0, hi = 1.0;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (regIncompleteBeta(mid, alpha, beta) < q) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function credibleInterval(alpha, beta, level = 0.90) {
  const tail = (1.0 - level) / 2.0;
  return [betaPpf(tail, alpha, beta), betaPpf(1.0 - tail, alpha, beta)];
}

// Posterior probability that the true rate is below `threshold`.
function probBelow(alpha, beta, threshold) {
  return regIncompleteBeta(threshold, alpha, beta);
}

/* ---------- scout classification (port of personal_scout.py) ---------- */

const KAPPA = 20.0;       // prior strength: baseline counts as ~20 games
const CRED_LEVEL = 0.90;  // credible-interval coverage
const DELTA = 0.03;       // min material gap vs baseline (3 percentage points)
const MIN_TRUST = 10;     // games below which a deviation is "small sample"
const WEAK_PROB = 0.85;   // P(true < baseline) needed to call a real weakness
const STRONG_PROB = 0.15; // symmetric threshold for overperforming
const PHASE_CAP = 40;     // max phase pseudo-games entering the prior (≈2× KAPPA)

// Classify one matchup given baseline win-rate p0 (0..1) and your wins/losses.
// Returns {shrunk, lo, hi, probBelow, n, verdict, deficit}.
function classify(p0, wins, losses, opts = {}) {
  const kappa = opts.kappa ?? KAPPA;
  const level = opts.level ?? CRED_LEVEL;
  const delta = opts.delta ?? DELTA;
  const minTrust = opts.minTrust ?? MIN_TRUST;
  let [a, b] = betaPosterior(p0, kappa, wins, losses);
  const ph = opts.phase;
  if (ph && ph.alpha > 0 && ph.n > 0 && Number.isFinite(ph.p)) {
    const m = Math.min(ph.n, opts.phaseCap ?? PHASE_CAP) * ph.alpha;
    a += m * ph.p; b += m * (1 - ph.p);
  }
  const mean = posteriorMean(a, b);
  const [lo, hi] = credibleInterval(a, b, level);
  const pb = probBelow(a, b, p0);
  const n = wins + losses;
  let verdict;
  if (pb >= WEAK_PROB && mean <= p0 - delta) verdict = 'real weakness';
  else if (pb <= STRONG_PROB && mean >= p0 + delta) verdict = 'overperforming';
  else if (n < minTrust) verdict = 'small sample';
  else verdict = 'on par';
  return { shrunk: mean, lo, hi, probBelow: pb, n, verdict, deficit: (p0 - mean) * pb };
}

// {opponent: [wins, losses]} for games played as `char`. When monthW is given, a
// match counts only if its month (from its `date`) has weight > 0 (whole-game filter,
// not fractional) — so "current"/"all" profiles apply to the personal record too.
function aggregate(rows, char, monthW) {
  const wl = {};
  for (const row of rows) {
    if (row.your_char !== char) continue;
    if (monthW && !(monthW[monthOf(row.date)] > 0)) continue;
    (wl[row.opp_char] ??= [0, 0])[row.result === 'W' ? 0 : 1]++;
  }
  return wl;
}

// epoch-seconds (string or number) -> 'YYYYMM' in UTC, matching the matrix month keys.
function monthOf(date) {
  const d = new Date(Number(date) * 1000);
  return '' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// a fresh profile record
function newProfile(cfnId, name, isSelf, rows, now) {
  return { cfnId: String(cfnId), name: name || String(cfnId), isSelf: !!isSelf,
           rows: rows.slice(), createdAt: now, updatedAt: now };
}

// reject keys that would pollute an object's prototype (`__proto__`/`constructor`/
// `prototype`) when used as a roster key. CFN ids are numeric, so legit ids never match.
// Returns the string id, or null if unsafe.
function safeId(id) {
  const s = String(id);
  return (s === '__proto__' || s === 'constructor' || s === 'prototype') ? null : s;
}

// route a parsed pull ({owner,name,isSelf,rows[,phaseStats]}) into the roster: create a new
// profile or merge-dedupe into the existing one by CFN id. Returns {roster, activeId}
// (immutable; activeId null if the owner is an unsafe key). A pull never clobbers a manual
// rename — it only fills in the fighter name while the profile still has its default (id)
// name; isSelf only ever flips on. phaseStats is a snapshot: present in payload -> replaces;
// absent from payload -> prior snapshot preserved; no prior snapshot -> key absent.
function routePull(roster, payload, now) {
  const id = safeId(payload.owner);
  if (id == null) return { roster, activeId: null };
  const ex = roster[id];
  const phase = ('phaseStats' in payload && payload.phaseStats != null)
    ? payload.phaseStats
    : (ex ? ex.phaseStats : undefined);
  const base = ex
    ? { ...ex, rows: mergeRows(ex.rows, payload.rows),
        name: (ex.name && ex.name !== ex.cfnId) ? ex.name : (payload.name || ex.name),
        isSelf: ex.isSelf || !!payload.isSelf,
        updatedAt: now }
    : newProfile(id, payload.name, payload.isSelf, payload.rows, now);
  const profile = phase !== undefined ? { ...base, phaseStats: phase } : base;
  return { roster: { ...roster, [id]: profile }, activeId: id };
}

// merge an imported roster into a base roster: per-profile dedupe by replay_id; the
// newer updatedAt wins the name; max updatedAt kept.
function mergeRosters(base, incoming) {
  const out = { ...base };
  for (const id of Object.keys(incoming)) {
    if (safeId(id) == null) continue;          // never merge under a prototype-polluting key
    const inc = incoming[id], cur = out[id];
    const incU = Number(inc.updatedAt) || 0, curU = cur ? (Number(cur.updatedAt) || 0) : 0;
    out[id] = cur
      ? { ...cur, rows: mergeRows(cur.rows, inc.rows),
          name: incU > curU ? inc.name : cur.name,
          isSelf: cur.isSelf || inc.isSelf,
          updatedAt: Math.max(curU, incU) }
      : { ...inc, updatedAt: incU };
  }
  return out;
}

// Your most-played character across the parsed rows (null if none).
function mostPlayed(rows) {
  const counts = {};
  for (const r of rows) counts[r.your_char] = (counts[r.your_char] ?? 0) + 1;
  let best = null, bn = -1;
  for (const c of Object.keys(counts)) if (counts[c] > bn) { bn = counts[c]; best = c; }
  return best;
}

// {opponent: baseline win-rate (0..1)} for `char` from the global COMB matrix.
// combinedRow scores are win-rate/10; reuse the parity-tested scoring.js layer.
function baselineWinrates(idx, char, monthW, exclude, tierW) {
  const row = combinedRow(idx, char, monthW, exclude, tierW);
  const out = {};
  for (const opp of Object.keys(row)) out[opp] = row[opp] / 10.0;
  return out;
}

// {opp: shrunk win-rate × 10} on the 5.0-centered scale — a drop-in for
// combinedRow. Each opponent's wins/losses (from aggregate) are shrunk toward the
// global baseline by classify(); zero personal games returns the exact baseline,
// so Personal mode degrades to the global row wherever you have no data.
function personalRow(idx, char, monthW, exclude, tierW, agg) {
  const base = baselineWinrates(idx, char, monthW, exclude, tierW);   // {opp: 0..1}
  const out = {};
  for (const opp of Object.keys(base)) {
    const [w, l] = agg[opp] || [0, 0];
    out[opp] = classify(base[opp], w, l).shrunk * 10.0;
  }
  return out;
}

// {opp: games you played as `char` against them} — your personal encounter counts.
function personalEncounter(rows, char) {
  const out = {};
  for (const r of rows) {
    if (r.your_char !== char) continue;
    out[r.opp_char] = (out[r.opp_char] || 0) + 1;
  }
  return out;
}

// Join your per-opponent record to the baseline; classify each matchup present
// in both. Returns result dicts sorted worst-first (by credible deficit).
function scout(personalAgg, baseline) {
  const results = [];
  for (const opp of Object.keys(personalAgg)) {
    if (!(opp in baseline)) continue;
    const [wins, losses] = personalAgg[opp];
    const r = classify(baseline[opp], wins, losses);
    results.push({ ...r, opp, wins, losses, baseline: baseline[opp] });
  }
  results.sort((a, b) => b.deficit - a.deficit);
  return results;
}

/* ---------- coach: diagnosis + priority (joins personal record to the baseline) ---------- */

// Gaussian MR-proximity weight: a fair match (opponent MR ≈ yours) counts fully; a blowout
// mismatch is down-weighted toward zero. Unknown/blank MR on either side -> neutral 1.
const MR_BANDWIDTH = 200;
function _mrWeight(rankMr, oppMr, band) {
  const a = Number(rankMr), b = Number(oppMr);
  if (!Number.isFinite(a) || !Number.isFinite(b) || rankMr === '' || oppMr === '') return 1;
  return Math.exp(-0.5 * ((Math.abs(a - b) / band) ** 2));
}

// {opp: [weightedWins, weightedLosses]} for games played as `char`, each game weighted by
// how skill-matched it was. Weighted counts may be fractional (classify accepts that).
function skillMatchedAgg(rows, char, opts = {}) {
  const band = opts.bandwidth ?? MR_BANDWIDTH;
  const wl = {};
  for (const row of rows) {
    if (row.your_char !== char) continue;
    const w = _mrWeight(row.rank_mr, row.opp_mr, band);
    (wl[row.opp_char] ??= [0, 0])[row.result === 'W' ? 0 : 1] += w;
  }
  return wl;
}

const MR_GAP_UNIT = 100;       // MR per logistic unit
const MR_MIN_SAMPLE = 15;      // below this many MR-bearing games, use the fallback slope
const MR_FALLBACK_BETA = 0.4;  // conservative default win-prob slope per 100-MR gap
const MR_MAX_BETA = 3.0;       // clamp the fitted slope; beyond ±3 (≈sigmoid 0.95/100-MR) a separable fit overcorrects

const _clampP = p => Math.min(1 - 1e-6, Math.max(1e-6, p));
const _logit = p => { const q = _clampP(p); return Math.log(q / (1 - q)); };
const _sigmoid = x => 1 / (1 + Math.exp(-x));

// [gap, win] pairs over MR-bearing games as `char` (both MRs present and finite).
function _mrPairs(rows, char) {
  const out = [];
  for (const r of rows) {
    if (r.your_char !== char) continue;
    const a = Number(r.rank_mr), b = Number(r.opp_mr);
    if (!Number.isFinite(a) || !Number.isFinite(b) || r.rank_mr === '' || r.opp_mr === '') continue;
    out.push([(a - b) / MR_GAP_UNIT, r.result === 'W' ? 1 : 0]);
  }
  return out;
}

// Fit win ~ sigmoid(b0 + beta*gap) by Newton's method over MR-bearing games; fall back to a
// fixed conservative slope when the sample is too thin. Returns {beta, fallback, n}.
function mrSlope(rows, char) {
  const pts = _mrPairs(rows, char);
  if (pts.length < MR_MIN_SAMPLE) return { beta: MR_FALLBACK_BETA, fallback: true, n: pts.length };
  let b0 = 0, b1 = 0;
  for (let it = 0; it < 25; it++) {
    let g0 = 0, g1 = 0, h00 = 1e-6, h01 = 0, h11 = 1e-6;
    for (const [x, y] of pts) {
      const mu = _sigmoid(b0 + b1 * x), w = Math.max(1e-6, mu * (1 - mu));
      g0 += (mu - y); g1 += (mu - y) * x; h00 += w; h01 += w * x; h11 += w * x * x;
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;
    b0 -= (h11 * g0 - h01 * g1) / det;
    b1 -= (-h01 * g0 + h00 * g1) / det;
  }
  return { beta: Math.max(-MR_MAX_BETA, Math.min(MR_MAX_BETA, b1)), fallback: false, n: pts.length };
}

// {opp: mean (yourMR - oppMR)/100} over MR-bearing games as `char`.
function matchupGaps(rows, char) {
  const sum = {}, cnt = {};
  for (const r of rows) {
    if (r.your_char !== char) continue;
    const a = Number(r.rank_mr), b = Number(r.opp_mr);
    if (!Number.isFinite(a) || !Number.isFinite(b) || r.rank_mr === '' || r.opp_mr === '') continue;
    sum[r.opp_char] = (sum[r.opp_char] || 0) + (a - b) / MR_GAP_UNIT;
    cnt[r.opp_char] = (cnt[r.opp_char] || 0) + 1;
  }
  const out = {};
  for (const opp of Object.keys(sum)) out[opp] = sum[opp] / cnt[opp];
  return out;
}

// Re-rate an MR-blind phase win-rate to an even-strength (gap 0) reference. No-op when
// gap or beta is zero.
function applyMrBridge(p, gap, beta) {
  if (!gap || !beta) return p;
  return _sigmoid(_logit(p) - beta * gap);
}

// Join the weighted personal record (agg) to the global baseline ({opp: 0..1}) and classify
// each matchup. Splits the gap into personalGap (you below the field) and universalHardness
// (the matchup is hard for everyone — already encoded in the baseline). Optional opts:
// opts.phase = {opp:[win,battle]}, opts.alpha, opts.gaps = {opp:gap}, opts.mrBeta.
function diagnoseFromBaseline(baseline, agg, opts = {}) {
  const phase = opts.phase || {};
  const gaps = opts.gaps || {};
  const alpha = opts.alpha ?? 0;
  const beta = opts.mrBeta ?? 0;
  const out = [];
  for (const opp of Object.keys(baseline)) {
    const p0 = baseline[opp];
    const [w, l] = agg[opp] || [0, 0];
    let phaseOpt;
    const pp = phase[opp];
    if (pp && pp[1] > 0 && alpha > 0) {
      const rate = applyMrBridge(pp[0] / pp[1], gaps[opp] ?? 0, beta);
      phaseOpt = { p: rate, n: pp[1], alpha };
    }
    const c = classify(p0, w, l, phaseOpt ? { phase: phaseOpt } : {});
    out.push({
      opp, baseline: p0, shrunk: c.shrunk, lo: c.lo, hi: c.hi,
      probBelow: c.probBelow, n: c.n, deficit: c.deficit, verdict: c.verdict,
      personalGap: Math.max(0, p0 - c.shrunk),
      universalHardness: Math.max(0, 0.5 - p0),
    });
  }
  return out;
}

// Rank diagnoses by expected return = frequency × personalGap × confidence. classify's
// deficit already equals (baseline - shrunk) * probBelow, so the score is usage * max(0, deficit)
// (overperformance never scores). usage: {opp: frequency} (missing -> 1).
function prioritize(diagnoses, usage) {
  const u = usage || {};
  return diagnoses
    .map(d => ({ ...d, score: (u[d.opp] ?? 1) * Math.max(0, d.deficit) }))
    .sort((a, b) => b.score - a.score);
}

/* ---------- battlelog parsing (port of fetch_battlelog.parse_battlelog) ---------- */

// Punctuation/space-insensitive uppercase key (E.Honda / E. HONDA -> EHONDA).
function _canon(s) {
  return String(s).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

// Build canonical-key -> official roster name from a list of official names,
// plus aliases for Buckler's alternate labels. In the browser the roster comes
// from i18n.js's SLUG_BY_NAME; tests pass the names explicitly.
function buildOfficialMap(names) {
  const list = names
    || (typeof SLUG_BY_NAME !== 'undefined' ? Object.keys(SLUG_BY_NAME) : []);
  const map = {};
  for (const n of list) map[_canon(n)] = n;
  map.VEGA = 'M. BISON';
  map.BISON = 'M. BISON';
  map.GOUKI = 'AKUMA';
  return map;
}

// Map a Buckler character label to the repo's official roster name exactly, so
// scout() can join on it. Falls back to an upper-cased label if unknown.
function officialName(name, officialMap) {
  return officialMap[_canon(name)] ?? String(name).trim().toUpperCase();
}

// Pure: [{replay_id,date,your_char,opp_char,rank_mr,result}] for the profile
// owner (myShortId) from one battlelog page's __NEXT_DATA__ dict.
// WIN RULE: a round is won when its round_results entry is > 0; the match winner
// has more rounds won. Ties (incomplete/disconnect) are skipped.
function parseBattlelog(nextData, myShortId, names) {
  const officialMap = buildOfficialMap(names);
  const replays = nextData?.props?.pageProps?.replay_list || [];
  const meId = parseInt(myShortId, 10);
  const out = [];
  for (const rep of replays) {
    const p1 = rep.player1_info, p2 = rep.player2_info;
    let me, opp;
    if (parseInt(p1.player.short_id, 10) === meId) { me = p1; opp = p2; }
    else if (parseInt(p2.player.short_id, 10) === meId) { me = p2; opp = p1; }
    else continue;
    const myRounds = (me.round_results || []).filter(x => x > 0).length;
    const oppRounds = (opp.round_results || []).filter(x => x > 0).length;
    if (myRounds === oppRounds) continue;   // no decisive result — skip
    out.push({
      replay_id: String(rep.replay_id),
      date: String(rep.uploaded_at ?? ''),
      your_char: officialName(me.character_name, officialMap),
      opp_char: officialName(opp.character_name, officialMap),
      rank_mr: String(me.master_rating ?? ''),
      opp_mr: String(opp.master_rating ?? ''),
      result: myRounds > oppRounds ? 'W' : 'L',
    });
  }
  return out;
}

// Accept a full __NEXT_DATA__ dict or the compact {owner,name,isSelf,replays} blob and
// return {owner, name, isSelf, rows, phaseStats}. Older {owner,replays} blobs still parse.
function parsePayload(payload, names) {
  const phaseStats = parsePhaseStats(payload.phaseRaw ?? null, names);
  if (payload?.props?.pageProps?.replay_list) {
    const pp = payload.props.pageProps;
    const owner = pp.fighter_banner_info?.personal_info?.short_id;
    const name = pp.fighter_banner_info?.personal_info?.fighter_id || String(owner);
    const isSelf = pp.common?.loginUser?.shortId != null
      && Number(pp.common.loginUser.shortId) === Number(owner);
    return { owner, name, isSelf, rows: parseBattlelog(payload, owner, names), phaseStats };
  }
  if (payload?.owner != null && Array.isArray(payload.replays)) {
    const nd = { props: { pageProps: { replay_list: payload.replays } } };
    return { owner: payload.owner, name: payload.name || String(payload.owner),
             isSelf: !!payload.isSelf, rows: parseBattlelog(nd, payload.owner, names), phaseStats };
  }
  throw new Error('unrecognized battlelog payload');
}

// Normalize a Buckler /play `play` blob into {seasonId, perChar, perMatchup}. Maps
// character_alpha -> official roster name, drops the ANY aggregate (id 0), unknown chars,
// and zero-battle entries; coerces counts to non-negative ints and clamps win <= battle so
// downstream win-rates stay in [0,1]. Returns null if absent.
function parsePhaseStats(phaseRaw, names) {
  if (!phaseRaw || !Array.isArray(phaseRaw.character_win_rates)) return null;
  const map = buildOfficialMap(names);
  const known = new Set(Object.values(map));
  const cnt = v => Math.max(0, Math.trunc(Number(v) || 0));
  const nm = a => { const o = officialName(a, map); return known.has(o) ? o : null; };
  const pair = (win, battle) => { const b = cnt(battle); return [Math.min(cnt(win), b), b]; };
  const perChar = {};
  for (const c of phaseRaw.character_win_rates) {
    if (!c || typeof c !== 'object') continue;
    if (c.character_id === 0) continue;
    const name = nm(c.character_alpha);
    const [w, b] = pair(c.win_count, c.battle_count);
    if (!name || b === 0) continue;
    perChar[name] = [w, b];
  }
  const byId = {};
  for (const c of phaseRaw.character_win_rates) {
    if (!c || typeof c !== 'object') continue;
    byId[c.character_id] = c.character_alpha;
  }
  const perMatchup = {};
  for (const rec of phaseRaw.character_win_rates_by_rival_character || []) {
    if (!rec || typeof rec !== 'object') continue;
    if (rec.character_id === 0) continue;
    const alpha = byId[rec.character_id];
    if (alpha === undefined) continue;
    const name = nm(alpha);
    if (!name) continue;
    const mm = {};
    for (const m of rec.rival_character_win_rates || []) {
      if (m.rival_character_id === 0) continue;
      const opp = nm(m.rival_character_alpha);
      const [w, b] = pair(m.win_count, m.battle_count);
      if (!opp || b === 0) continue;
      mm[opp] = [w, b];
    }
    if (Object.keys(mm).length) perMatchup[name] = mm;
  }
  return { seasonId: phaseRaw.current_season_id ?? null, perChar, perMatchup };
}

/* ---------- personal CSV round-trip (mirror fetch_battlelog CSV_FIELDS) ---------- */

const CSV_FIELDS = ['replay_id', 'date', 'your_char', 'opp_char', 'rank_mr', 'result'];

function rowsToCsv(rows) {
  const esc = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const lines = [CSV_FIELDS.join(',')];
  for (const r of rows) lines.push(CSV_FIELDS.map(f => esc(r[f] ?? '')).join(','));
  return lines.join('\n') + '\n';
}

// Minimal CSV reader: handles quoted fields; skips comment rows (replay_id '#…').
function csvToRows(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  for (const f of CSV_FIELDS) {
    if (!header.includes(f)) throw new Error('CSV missing required column: ' + f);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = splitCsvLine(lines[i]);
    const row = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    if (String(row.replay_id).startsWith('#')) continue;
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', inq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inq) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inq = false;
      } else cur += ch;
    } else if (ch === '"') inq = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Append-dedupe incoming rows into existing (dedupe on replay_id, last wins).
function mergeRows(existing, incoming) {
  const byId = new Map();
  for (const r of existing) byId.set(r.replay_id, r);
  for (const r of incoming) byId.set(r.replay_id, r);
  return [...byId.values()];
}

// Keep only well-formed rows: a non-empty string replay_id, both characters in the
// official roster (`names`), and result W/L. This defends the HTML-interpolating Scout
// UI against crafted/malformed payloads (a character name with quotes/angle brackets
// would otherwise reach innerHTML) and drops junk before it can collapse in mergeRows.
function validRows(rows, names) {
  const set = new Set(names);
  return (rows || []).filter(r =>
    r && typeof r.replay_id === 'string' && r.replay_id &&
    set.has(r.your_char) && set.has(r.opp_char) &&
    (r.result === 'W' || r.result === 'L'));
}

if (typeof module !== 'undefined') {
  module.exports = {
    lgamma, regIncompleteBeta, betaPosterior, posteriorMean, betaPpf,
    credibleInterval, probBelow,
    KAPPA, CRED_LEVEL, DELTA, MIN_TRUST, WEAK_PROB, STRONG_PROB, PHASE_CAP,
    classify, aggregate, mostPlayed, baselineWinrates, scout,
    personalRow, personalEncounter,
    skillMatchedAgg, diagnoseFromBaseline, prioritize,
    mrSlope, matchupGaps, applyMrBridge,
    monthOf, newProfile, routePull, mergeRosters, safeId,
    buildOfficialMap, officialName, parseBattlelog, parsePayload, parsePhaseStats,
    CSV_FIELDS, rowsToCsv, csvToRows, mergeRows, validRows,
  };
}
