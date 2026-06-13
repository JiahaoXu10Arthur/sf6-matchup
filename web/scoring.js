/* Port of scripts/scoring.py + analyze.py/recommend.py aggregation.
   UI-free so node can require() it — tests/test_js_parity.py asserts these
   functions match the Python originals. Keep formulas in sync with METHOD.md. */

const PATCH_MONTH = '202603'; // major all-character balance patch, 2026-03-17
const DEFAULT_TIER_WEIGHTS = { 40: 1, 41: 2, 42: 3 };
const RANK_NAMES = { 40: 'HighM', 41: 'GrandM', 42: 'UltM' };
const TARGET_INJECT = 0.25;   // weight a targeted (u>1) non-weakness as a 4.5 matchup; keep in sync with scoring.py

function monthWeights(months, profile, patchMonth) {
  if (profile === 'all') return Object.fromEntries(months.map(m => [m, 1.0]));
  // 'current': pre-patch 0, patch month 0.5, post-patch 1; fallback to equal
  const w = Object.fromEntries(months.map(m =>
    [m, m < patchMonth ? 0.0 : m === patchMonth ? 0.5 : 1.0]));
  return Object.values(w).some(v => v) ? w
    : Object.fromEntries(months.map(m => [m, 1.0]));
}

function wavg(scores, weights) {
  let num = 0, den = 0;
  for (const k of Object.keys(scores)) {
    const w = weights[k];
    if (w) { num += scores[k] * w; den += w; }
  }
  return den ? num / den : null;
}

// w(O) = u(O)·sev(O) + max(0, u(O)−1)·TARGET_INJECT,  sev = max(0, 5−main)².
// u defaults to 1 (→ plain weakness-weighted scheme), u=0 drops O, u>1 targets it.
function weaknessWeights(mainRow, oppWeights) {
  const w = {};
  for (const [o, ms] of Object.entries(mainRow)) {
    const sev = Math.max(0, 5.0 - ms) ** 2;
    const u = oppWeights ? (oppWeights[o] ?? 1) : 1;
    const wt = u * sev + Math.max(0, u - 1) * TARGET_INJECT;
    if (wt) w[o] = wt;
  }
  return w;
}

// overall mean matchup score of a row (tier proxy); empty -> neutral 5.0
function strength(row) {
  const v = Object.values(row);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 5.0;
}

function coverage(mainRow, subRow, oppWeights) {
  // weakness-weighted ABSOLUTE edge. Missing subRow entries count as neutral (5.0).
  const w = weaknessWeights(mainRow, oppWeights);
  let num = 0, den = 0;
  for (const [opp, wt] of Object.entries(w)) {
    num += wt * ((subRow[opp] ?? 5.0) - 5.0);
    den += wt;
  }
  return den ? num / den : 0.0;
}

function specialization(mainRow, subRow, oppWeights) {
  // coverage measured relative to the sub's own average, so a globally-strong
  // character nets ~0 and only genuine counters score high. Missing subRow
  // entries count as neutral relative to the sub (subMean).
  const subMean = strength(subRow);
  const w = weaknessWeights(mainRow, oppWeights);
  let num = 0, den = 0;
  for (const [opp, wt] of Object.entries(w)) {
    num += wt * ((subRow[opp] ?? subMean) - subMean);
    den += wt;
  }
  return den ? num / den : 0.0;
}

function correlation(a, b) {
  const keys = Object.keys(a).filter(k => k in b).sort();
  if (!keys.length) return 0.0;
  const xs = keys.map(k => a[k]), ys = keys.map(k => b[k]);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < keys.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0.0;
}

function sharedWeaknesses(a, b, thresh = 4.9) {
  return Object.keys(a).filter(k => k in b && a[k] < thresh && b[k] < thresh).sort();
}

/* CSV rows -> idx[char][opp][rank][month] = score */
function buildIndex(csvText) {
  const idx = {};
  const lines = csvText.trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const [month, rank, char, opp, score] = lines[i].split(',');
    (((idx[char] ??= {})[opp] ??= {})[rank] ??= {})[month] = parseFloat(score);
  }
  return idx;
}

function availableMonths(csvText) {
  const months = new Set();
  const lines = csvText.trim().split('\n');
  for (let i = 1; i < lines.length; i++) months.add(lines[i].split(',', 1)[0]);
  return [...months].sort();
}

/* {opp: tier-combined score} — mirrors analyze.combined_row */
function combinedRow(idx, char, mw, exclude, tierWeights, ranks = null) {
  ranks ??= Object.keys(tierWeights);
  const out = {};
  for (const [opp, byrank] of Object.entries(idx[char] ?? {})) {
    if (exclude.has(opp)) continue;
    let num = 0, den = 0;
    for (const r of ranks) {
      const v = wavg(byrank[r] ?? {}, mw);
      if (v !== null) { num += v * tierWeights[r]; den += tierWeights[r]; }
    }
    if (den) out[opp] = num / den;
  }
  return out;
}

/* mirrors analyze.char_table; rows sorted by comb ascending */
function charTable(idx, char, mw, exclude, tierWeights, patchMonth) {
  const rows = [];
  for (const [opp, byrank] of Object.entries(idx[char] ?? {})) {
    if (exclude.has(opp)) continue;
    const tier = {};
    let num = 0, den = 0;
    for (const r of Object.keys(tierWeights)) {
      tier[r] = wavg(byrank[r] ?? {}, mw);
      if (tier[r] !== null) { num += tier[r] * tierWeights[r]; den += tierWeights[r]; }
    }
    if (!den) continue;
    const present = Object.values(tier).filter(v => v !== null);
    const g = byrank['41'] ?? {};
    const pre = [], post = [];
    for (const [m, v] of Object.entries(g)) {
      if (!mw[m] && mw[m] !== 0) continue; // month outside requested range
      if (m < patchMonth) pre.push(v); else if (m > patchMonth) post.push(v);
    }
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    const monthsSeen = new Set();
    for (const r of Object.values(byrank))
      for (const m of Object.keys(r)) if (m in mw) monthsSeen.add(m);
    rows.push({
      opp,
      t40: tier['40'], t41: tier['41'], t42: tier['42'],
      comb: num / den,
      spread: Math.max(...present) - Math.min(...present),
      dpatch: pre.length && post.length ? mean(post) - mean(pre) : null,
      nmonths: monthsSeen.size,
    });
  }
  rows.sort((a, b) => a.comb - b.comb);
  return rows;
}

/* mirrors recommend.py main loop; rows sorted by cover descending */
function subTable(idx, char, mw, exclude, tierWeights, oppWeights) {
  const mainRow = combinedRow(idx, char, mw, exclude, tierWeights);
  const worst3 = Object.keys(mainRow).sort((a, b) => mainRow[a] - mainRow[b]).slice(0, 3);
  const results = [];
  for (const sub of Object.keys(idx)) {
    if (sub === char || exclude.has(sub)) continue;
    const row = combinedRow(idx, sub, mw, exclude, tierWeights);
    if (!Object.keys(row).length) continue;
    const perTier = {};
    for (const r of Object.keys(tierWeights))
      perTier[r] = coverage(mainRow, combinedRow(idx, sub, mw, exclude, tierWeights, [r]), oppWeights);
    const w3 = worst3.filter(o => o in row).map(o => row[o]);
    results.push({
      sub,
      cover: coverage(mainRow, row, oppWeights),
      c40: perTier['40'], c41: perTier['41'], c42: perTier['42'],
      spec: specialization(mainRow, row, oppWeights),
      strength: strength(row),
      w3win: w3.length ? w3.reduce((s, v) => s + v, 0) / w3.length * 10 : null,
      corr: correlation(mainRow, row),
      shared: sharedWeaknesses(mainRow, row).length,
    });
  }
  results.sort((a, b) => b.cover - a.cover);
  return { worst3, mainRow, results };
}

if (typeof module !== 'undefined') {
  module.exports = {
    PATCH_MONTH, DEFAULT_TIER_WEIGHTS, RANK_NAMES, TARGET_INJECT,
    monthWeights, wavg, coverage, specialization, strength, correlation, sharedWeaknesses,
    buildIndex, availableMonths, combinedRow, charTable, subTable,
  };
}
