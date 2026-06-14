/* Node harness for test_js_parity.py: computes charTable + subTable via
   web/scoring.js on the real matrix and prints JSON for Python to compare. */
const fs = require('fs');
const path = require('path');
const s = require(path.join(__dirname, '..', 'web', 'scoring.js'));

const [csvPath, charName, profile, weightsJson] = process.argv.slice(2);
const csv = fs.readFileSync(csvPath, 'utf8');
const idx = s.buildIndex(csv);
const months = s.availableMonths(csv);
const mw = s.monthWeights(months, profile, s.PATCH_MONTH);
const exclude = new Set(['INGRID']);
const oppWeights = weightsJson ? JSON.parse(weightsJson) : undefined;

const table = {};
for (const r of s.charTable(idx, charName, mw, exclude, s.DEFAULT_TIER_WEIGHTS, s.PATCH_MONTH)) {
  table[r.opp] = { comb: r.comb, t36: r.t36, t40: r.t40, t41: r.t41, t42: r.t42,
                   spread: r.spread, dpatch: r.dpatch, nmonths: r.nmonths };
}

const subs = {};
const st = s.subTable(idx, charName, mw, exclude, s.DEFAULT_TIER_WEIGHTS, oppWeights);
for (const r of st.results) {
  subs[r.sub] = { cover: r.cover, c36: r.c36, c40: r.c40, c41: r.c41, c42: r.c42,
                  spec: r.spec, strength: r.strength,
                  w3win: r.w3win, corr: r.corr, shared: r.shared };
}

console.log(JSON.stringify({ worst3: st.worst3, table, subs }));
