/* DOM layer only — all math lives in scoring.js (parity-tested vs Python). */

const state = {
  view: 'match',          // 'match' | 'subs'
  char: 'TERRY',
  rank: 'comb',           // 'comb' | '40' | '41' | '42'
  preset: 'current',      // 'current' | 'all' | 'custom'
  monthW: {},             // {month: weight 0..1}
  tierW: { 40: 3, 41: 2, 42: 1 },
  includeIngrid: false,
};

let idx = null;
let months = [];

const $ = sel => document.querySelector(sel);

const BAR_HALF = 0.6;     // matchup bar full deflection at |score - 5| = 0.6
const COVER_HALF = 0.4;   // sub COVER bar full deflection at |cover| = 0.4

init();

async function init() {
  const resp = await fetch('../output/matrix.csv');
  if (!resp.ok) {
    $('#loading').textContent = 'Could not load ../output/matrix.csv — run build_matrix.py first.';
    return;
  }
  const csv = await resp.text();
  idx = buildIndex(csv);
  months = availableMonths(csv);
  state.monthW = monthWeights(months, 'current', PATCH_MONTH);
  $('#loading').remove();
  buildCharSelect();
  buildMonthSliders();
  buildTierSliders();
  wireControls();
  render();
}

function exclude() {
  return state.includeIngrid ? new Set() : new Set(['INGRID']);
}

/* ---------- controls ---------- */

function buildCharSelect() {
  const sel = $('#char-select');
  for (const c of Object.keys(idx).sort()) {
    const o = document.createElement('option');
    o.value = o.textContent = c;
    sel.appendChild(o);
  }
  sel.value = state.char;
}

function sliderRow(name, value, max, step, onInput) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `<span class="slider-name">${name}</span>
    <input type="range" min="0" max="${max}" step="${step}" value="${value}"
           aria-label="${name} weight">
    <span class="slider-val">${value}</span>`;
  const input = row.querySelector('input');
  const val = row.querySelector('.slider-val');
  input.addEventListener('input', () => {
    val.textContent = input.value;
    onInput(parseFloat(input.value));
  });
  return row;
}

function buildMonthSliders() {
  const box = $('#month-sliders');
  box.textContent = '';
  for (const m of months) {
    const label = `${m.slice(0, 4)}.${m.slice(4)}`;
    box.appendChild(sliderRow(label, state.monthW[m], 1, 0.05, v => {
      state.monthW[m] = v;
      setPreset('custom');
      render();
    }));
  }
}

function buildTierSliders() {
  const box = $('#tier-sliders');
  box.textContent = '';
  for (const r of ['40', '41', '42']) {
    box.appendChild(sliderRow(RANK_NAMES[r], state.tierW[r], 5, 0.5, v => {
      state.tierW[r] = v;
      render();
    }));
  }
}

function setPreset(p) {
  state.preset = p;
  document.querySelectorAll('.presets button').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === p));
}

function wireControls() {
  document.querySelectorAll('.view-switch button').forEach(b =>
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      document.querySelectorAll('.view-switch button').forEach(x => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-selected', x === b);
      });
      $('#view-label').textContent = state.view === 'match' ? 'MATCHUPS' : 'SUB FINDER';
      $('#rows').textContent = '';   // column meaning changes — rebuild rows
      render();
    }));

  $('#char-select').addEventListener('change', e => {
    state.char = e.target.value;
    $('#char-name').textContent = state.char;
    render();
  });

  document.querySelectorAll('.rank-tabs button').forEach(b =>
    b.addEventListener('click', () => {
      state.rank = b.dataset.rank;
      document.querySelectorAll('.rank-tabs button').forEach(x => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-selected', x === b);
      });
      render();
    }));

  document.querySelectorAll('.presets button').forEach(b =>
    b.addEventListener('click', () => {
      setPreset(b.dataset.preset);
      state.monthW = monthWeights(months, b.dataset.preset, PATCH_MONTH);
      buildMonthSliders();
      render();
    }));

  $('#include-ingrid').addEventListener('change', e => {
    state.includeIngrid = e.target.checked;
    render();
  });
}

/* ---------- rendering ---------- */

const fmt = (v, nd = 3) => v === null || v === undefined ? '—' : v.toFixed(nd);
const sfmt = (v, nd = 3) => v === null || v === undefined ? '—'
  : (v >= 0 ? '+' : '') + v.toFixed(nd);

function render() {
  if (state.view === 'match') renderMatchups(); else renderSubs();
}

/* Reuse row nodes keyed by name so bars animate between recalcs. */
function syncRows(keys, makeRow, updateRow, orderOf) {
  const box = $('#rows');
  const live = new Map([...box.children].map(el => [el.dataset.key, el]));
  for (const [key, el] of live) {
    if (!keys.includes(key)) { el.remove(); live.delete(key); }
  }
  for (const key of keys) {
    let el = live.get(key);
    if (!el) {
      el = makeRow(key);
      el.dataset.key = key;
      box.appendChild(el);
      // force initial transition from scaleX(0)
      requestAnimationFrame(() => requestAnimationFrame(() => updateRow(el, key)));
    } else {
      updateRow(el, key);
    }
    el.style.order = orderOf(key);
  }
}

function rowSkeleton(subCols) {
  const el = document.createElement('div');
  el.className = 'row';
  el.innerHTML = `<span class="name"></span>
    <div class="bar-track"><div class="bar"></div></div>
    <div class="nums"><span class="main-num"></span>${
      subCols.map(() => '<span class="sub-num"></span>').join('')}</div>`;
  return el;
}

function setBar(el, frac) {
  const bar = el.querySelector('.bar');
  bar.className = 'bar ' + (frac >= 0 ? 'adv' : 'dis');
  bar.style.transform = `scaleX(${Math.min(Math.abs(frac), 1)})`;
}

function renderMatchups() {
  const table = charTable(idx, state.char, state.monthW, exclude(),
                          state.tierW, PATCH_MONTH);
  const metric = r => state.rank === 'comb' ? r.comb : r['t' + state.rank];
  const rows = table.filter(r => metric(r) !== null)
                    .sort((a, b) => metric(a) - metric(b));
  const byOpp = new Map(rows.map(r => [r.opp, r]));

  $('#canvas-head').innerHTML =
    `<b>${state.char}</b> vs ${rows.length} · sorted worst-first · ` +
    `metric: <b>${state.rank === 'comb' ? 'COMB (tier-weighted)' : RANK_NAMES[state.rank]}</b>` +
    ` · ⚠ tier spread &gt; 0.25`;
  $('#axis').innerHTML = `<span>OPPONENT</span>
    <span class="axis-bar"><span>◄ LOSING</span><span>5.0</span><span>WINNING ►</span></span>
    <span style="text-align:right">SCORE · <span class="axis-nums-extra">ΔPATCH · MO</span></span>`;

  syncRows(rows.map(r => r.opp),
    () => rowSkeleton([1, 2]),
    (el, opp) => {
      const r = byOpp.get(opp);
      const v = metric(r);
      el.querySelector('.name').innerHTML =
        opp + (r.spread > 0.25 ? '<span class="flag" title="tier spread > 0.25">⚠</span>' : '');
      setBar(el, (v - 5.0) / BAR_HALF);
      const [main, d, mo] = el.querySelectorAll('.nums > *');
      main.textContent = fmt(v);
      main.className = 'main-num ' + (v >= 5 ? 'adv' : 'dis');
      d.textContent = 'Δ ' + sfmt(r.dpatch);
      d.className = 'sub-num';
      mo.textContent = `${r.nmonths}/${months.length}mo`;
      mo.className = 'sub-num';
    },
    opp => rows.findIndex(r => r.opp === opp));
}

function renderSubs() {
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW,
                                                exclude(), state.tierW);
  const metric = r => state.rank === 'comb' ? r.cover : r['c' + state.rank];
  const rows = results.slice().sort((a, b) => metric(b) - metric(a));
  const bySub = new Map(rows.map(r => [r.sub, r]));

  $('#canvas-head').innerHTML =
    `Subs for <b>${state.char}</b> · worst 3: ` +
    worst3.map(o => `<b>${o}</b> ${mainRow[o].toFixed(3)}`).join(' · ') +
    ` · metric: <b>COVER${state.rank === 'comb' ? '' : '@' + RANK_NAMES[state.rank]}</b>`;
  $('#axis').innerHTML = `<span>SUB</span>
    <span class="axis-bar"><span>◄ SHARES WEAKNESS</span><span>0</span><span>COVERS ►</span></span>
    <span style="text-align:right">COVER · <span class="axis-nums-extra">W3% · CORR · SHARED</span></span>`;

  syncRows(rows.map(r => r.sub),
    () => rowSkeleton([1, 2, 3]),
    (el, sub) => {
      const r = bySub.get(sub);
      const v = metric(r);
      el.querySelector('.name').textContent = sub;
      setBar(el, v / COVER_HALF);
      const [main, w3, corr, sh] = el.querySelectorAll('.nums > *');
      main.textContent = sfmt(v);
      main.className = 'main-num ' + (v >= 0 ? 'adv' : 'dis');
      w3.textContent = fmt(r.w3win, 1) + '%';
      w3.className = 'sub-num';
      corr.textContent = 'r ' + sfmt(r.corr, 2);
      corr.className = 'sub-num ' + (r.corr <= -0.1 ? 'neg' : r.corr >= 0.1 ? 'pos' : '');
      sh.textContent = r.shared + ' shared';
      sh.className = 'sub-num ' + (r.shared >= 2 ? 'pos' : '');
    },
    sub => rows.findIndex(r => r.sub === sub));
}
