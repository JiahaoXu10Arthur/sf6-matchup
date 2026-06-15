/* Node harness for test_roster.py: exercises the pure roster reducers + month-filter
   aggregate from web/scout.js (no IndexedDB — that lives in store.js, E2E-tested). */
const path = require('path');
const s = require(path.join(__dirname, '..', 'web', 'scout.js'));
const mode = process.argv[2];
const arg = process.argv[3] ? JSON.parse(process.argv[3]) : {};
let out;
if (mode === 'monthOf') out = s.monthOf(arg.epoch);
else if (mode === 'routePull') out = s.routePull(arg.roster, arg.payload, arg.now);
else if (mode === 'mergeRosters') out = s.mergeRosters(arg.base, arg.incoming);
else if (mode === 'aggregate') out = s.aggregate(arg.rows, arg.char, arg.monthW);
else if (mode === 'parsePayload') out = s.parsePayload(arg.payload, arg.names);
else if (mode === 'safeId') out = s.safeId(arg.id);
else throw new Error('unknown mode ' + mode);
console.log(JSON.stringify(out));
