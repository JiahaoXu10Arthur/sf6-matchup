/* Node harness for test_personal_lens.py: exposes the personal lens from
   web/scout.js against the real matrix. scout.baselineWinrates/personalRow call
   the global combinedRow, so we install it from scoring.js before invoking. */
const fs = require('fs');
const path = require('path');
const scoring = require(path.join(__dirname, '..', 'web', 'scoring.js'));
const scout = require(path.join(__dirname, '..', 'web', 'scout.js'));
global.combinedRow = scoring.combinedRow;   // scout.js resolves this as a global

const [csvPath, mode, argJson] = process.argv.slice(2);
const arg = argJson ? JSON.parse(argJson) : {};
const csv = fs.readFileSync(csvPath, 'utf8');
const idx = scoring.buildIndex(csv);
const mw = scoring.monthWeights(scoring.availableMonths(csv), 'current', scoring.PATCH_MONTH);
const exclude = new Set(['INGRID']);
const tierW = scoring.DEFAULT_TIER_WEIGHTS;
let out;
if (mode === 'crow') {
  out = scoring.combinedRow(idx, arg.char, mw, exclude, tierW);
} else if (mode === 'prow') {
  out = scout.personalRow(idx, arg.char, mw, exclude, tierW, arg.agg || {});
} else if (mode === 'enc') {
  out = scout.personalEncounter(arg.rows, arg.char);
} else {
  throw new Error('unknown mode ' + mode);
}
console.log(JSON.stringify(out));
