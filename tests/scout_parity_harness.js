/* Node harness for test_scout_parity.py: runs web/scout.js on inputs supplied as
   JSON and prints JSON for Python to compare against bayes.py + personal_scout.py
   + fetch_battlelog.py, so the two scout implementations cannot silently drift. */
const fs = require('fs');
const path = require('path');
const s = require(path.join(__dirname, '..', 'web', 'scout.js'));

const mode = process.argv[2];
const arg = process.argv[3] ? JSON.parse(process.argv[3]) : {};
let out;

if (mode === 'reg') {
  out = arg.cases.map(([x, a, b]) => s.regIncompleteBeta(x, a, b));
} else if (mode === 'ppf') {
  out = arg.cases.map(([q, a, b]) => s.betaPpf(q, a, b));
} else if (mode === 'classify') {
  out = arg.cases.map(([p0, w, l]) => s.classify(p0, w, l));
} else if (mode === 'parse') {
  const nd = JSON.parse(fs.readFileSync(arg.fixturePath, 'utf8'));
  out = s.parseBattlelog(nd, arg.owner, arg.names);
} else if (mode === 'scout') {
  out = s.scout(arg.agg, arg.baseline);
} else if (mode === 'valid') {
  out = s.validRows(arg.rows, arg.names);
} else if (mode === 'csv') {
  try { out = { rows: s.csvToRows(arg.text) }; } catch (e) { out = { error: e.message }; }
} else {
  throw new Error('unknown mode ' + mode);
}

console.log(JSON.stringify(out));
