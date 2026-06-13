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

const DEFAULT_TIER = { 40: 3, 41: 2, 42: 1 };

// numeric column layout per view: [widthClass, 'main'|'sub'] — shared by the
// axis header and data rows so fixed widths keep both vertically aligned.
const COLS = {
  match: [['c-score', 'main'], ['c-dpatch', 'sub'], ['c-mo', 'sub']],
  subs: [['c-cover', 'main'], ['c-w3', 'sub'], ['c-corr', 'sub'], ['c-shared', 'sub']],
};

async function init() {
  setLang(lang);          // sync <html lang> with detected/stored language
  applyI18n();
  let csv;
  if (typeof MATRIX_CSV !== 'undefined') {
    csv = MATRIX_CSV;     // inlined by the standalone offline build
  } else {
    const resp = await fetch('../output/matrix.csv');
    if (!resp.ok) {
      $('#loading').textContent = t('loadError');
      return;
    }
    csv = await resp.text();
  }
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

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el =>
    el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach(el =>
    el.innerHTML = t(el.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-rank]').forEach(el =>
    el.textContent = t('rank')[el.dataset.i18nRank]);
  document.querySelectorAll('.lang-switch button').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === lang));
  $('#view-label').textContent = t(state.view === 'match' ? 'labelMatch' : 'labelSubs');
  $('#char-name').textContent = cn(state.char);
  document.querySelectorAll('#char-select option').forEach(o =>
    o.textContent = cn(o.value));
}

function exclude() {
  return state.includeIngrid ? new Set() : new Set(['INGRID']);
}

/* ---------- controls ---------- */

function buildCharSelect() {
  const sel = $('#char-select');
  const present = new Set(Object.keys(idx));
  const ordered = ROSTER_ORDER.filter(c => present.has(c));
  for (const c of [...ordered, ...[...present].filter(c => !ordered.includes(c))]) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = cn(c);
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
    box.appendChild(sliderRow(t('rankFull')[r], state.tierW[r], 5, 0.5, v => {
      state.tierW[r] = v;
      render();
    }));
  }
}

/* Tier weights only affect the COMB metric; disable them for single-rank views. */
function updateTierState() {
  const active = state.rank === 'comb';
  const sec = $('#tier-control');
  sec.classList.toggle('disabled', !active);
  sec.querySelectorAll('input').forEach(i => { i.disabled = !active; });
}

function resetDefaults() {
  state.rank = 'comb';
  state.tierW = { ...DEFAULT_TIER };
  state.includeIngrid = false;
  setPreset('current');
  state.monthW = monthWeights(months, 'current', PATCH_MONTH);
  document.querySelectorAll('.rank-tabs button').forEach(x => {
    const on = x.dataset.rank === 'comb';
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', on);
  });
  $('#include-ingrid').checked = false;
  buildMonthSliders();
  buildTierSliders();
  render();
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
      $('#view-label').textContent = t(state.view === 'match' ? 'labelMatch' : 'labelSubs');
      $('#rows').textContent = '';   // column meaning changes — rebuild rows
      render();
    }));

  document.querySelectorAll('.lang-switch button').forEach(b =>
    b.addEventListener('click', () => {
      if (b.dataset.lang === lang) return;
      setLang(b.dataset.lang);
      applyI18n();
      buildTierSliders();   // slider names are localized
      render();
    }));

  $('#char-select').addEventListener('change', e => {
    state.char = e.target.value;
    $('#char-name').textContent = cn(state.char);
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

  $('#reset-btn').addEventListener('click', resetDefaults);
}

/* ---------- rendering ---------- */

const fmt = (v, nd = 3) => v === null || v === undefined ? '—' : v.toFixed(nd);
const sfmt = (v, nd = 3) => v === null || v === undefined ? '—'
  : (v >= 0 ? '+' : '') + v.toFixed(nd);

function render() {
  document.body.classList.toggle('view-match', state.view === 'match');
  document.body.classList.toggle('view-subs', state.view === 'subs');
  updateTierState();
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

function rowSkeleton(cols) {
  const el = document.createElement('div');
  el.className = 'row';
  el.innerHTML = `<span class="name"></span>
    <div class="bar-track"><div class="bar"></div></div>
    <div class="nums">${cols.map(([w, ty]) =>
      `<span class="${ty === 'main' ? 'col-main' : 'col-sub'} ${w}"></span>`).join('')}</div>`;
  return el;
}

function axisHtml(leftLabel, barLabels, cols, headers) {
  return `<span>${leftLabel}</span>
    <span class="axis-bar"><span>${barLabels[0]}</span><span>${barLabels[1]}</span><span>${barLabels[2]}</span></span>
    <div class="nums">${cols.map(([w, ty], i) =>
      `<span class="${ty === 'main' ? 'col-main' : 'col-sub'} ${w}">${headers[i]}</span>`).join('')}</div>`;
}

function setBar(el, frac) {
  const bar = el.querySelector('.bar');
  bar.className = 'bar ' + (frac >= 0 ? 'adv' : 'dis');
  bar.style.transform = `scaleX(${Math.min(Math.abs(frac), 1)})`;
}

// data-dense dashboard "key indicators" strip — the headline insight at a glance
function renderKpis(cards) {
  $('#kpis').innerHTML = cards.map(c =>
    `<div class="kpi ${c.tone || ''}">
       <span class="kpi-label">${c.label}</span>
       <span class="kpi-val">${c.val}${c.sub ? `<small>${c.sub}</small>` : ''}</span>
     </div>`).join('');
}

function renderMatchups() {
  const table = charTable(idx, state.char, state.monthW, exclude(),
                          state.tierW, PATCH_MONTH);
  const metric = r => state.rank === 'comb' ? r.comb : r['t' + state.rank];
  const rows = table.filter(r => metric(r) !== null)
                    .sort((a, b) => metric(a) - metric(b));
  const byOpp = new Map(rows.map(r => [r.opp, r]));

  $('#canvas-head').innerHTML = t('headMatch', {
    char: cn(state.char), n: rows.length,
    metric: state.rank === 'comb' ? t('metricComb') : t('rankFull')[state.rank],
  });

  if (rows.length) {
    const hardest = rows[0], best = rows[rows.length - 1];
    renderKpis([
      { label: t('kHardest'), val: cn(hardest.opp), sub: fmt(metric(hardest)), tone: 'dis' },
      { label: t('kDis'), val: rows.filter(r => metric(r) < 4.9).length, tone: 'dis' },
      { label: t('kAdv'), val: rows.filter(r => metric(r) > 5.1).length, tone: 'adv' },
      { label: t('kBest'), val: cn(best.opp), sub: fmt(metric(best)), tone: 'adv' },
    ]);
  }

  $('#axis').innerHTML = axisHtml(
    t('axisOpponent'),
    [t('axisLosing'), t('axisEven'), t('axisWinning')],
    COLS.match, [t('hScore'), t('hDpatch'), t('hMo')]);

  syncRows(rows.map(r => r.opp),
    () => rowSkeleton(COLS.match),
    (el, opp) => {
      const r = byOpp.get(opp);
      const v = metric(r);
      el.querySelector('.name').innerHTML =
        cn(opp) + (r.spread > 0.25 ? `<span class="flag" title="${t('spreadFlag')}">⚠</span>` : '');
      setBar(el, (v - 5.0) / BAR_HALF);
      const [main, d, mo] = el.querySelectorAll('.nums > *');
      main.textContent = fmt(v);
      main.classList.toggle('adv', v >= 5);
      main.classList.toggle('dis', v < 5);
      d.textContent = 'Δ ' + sfmt(r.dpatch);
      mo.textContent = `${r.nmonths}/${months.length}${t('moSuffix')}`;
    },
    opp => rows.findIndex(r => r.opp === opp));
}

function renderSubs() {
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW,
                                                exclude(), state.tierW);
  const metric = r => state.rank === 'comb' ? r.cover : r['c' + state.rank];
  const rows = results.slice().sort((a, b) => metric(b) - metric(a));
  const bySub = new Map(rows.map(r => [r.sub, r]));

  $('#canvas-head').innerHTML = t('headSubs', {
    char: cn(state.char),
    worst3: worst3.map(o => `<b>${cn(o)}</b> ${mainRow[o].toFixed(3)}`).join(' · '),
    metric: `${t('hCover')}${state.rank === 'comb' ? '' : '@' + t('rankFull')[state.rank]}`,
  });

  if (rows.length) {
    const top = rows[0];
    const compl = rows.slice().sort((a, b) => a.corr - b.corr)[0];
    renderKpis([
      { label: t('kTopSub'), val: cn(top.sub), sub: sfmt(metric(top)), tone: 'adv' },
      { label: t('kCovers'), val: rows.filter(r => metric(r) > 0).length, tone: 'adv' },
      { label: t('kComplement'), val: cn(compl.sub), sub: 'r ' + sfmt(compl.corr, 2), tone: 'adv' },
    ]);
  }

  $('#axis').innerHTML = axisHtml(
    t('axisSub'),
    [t('axisShares'), t('axisZero'), t('axisCovers')],
    COLS.subs, [t('hCover'), t('hW3'), t('hCorr'), t('hShared')]);

  syncRows(rows.map(r => r.sub),
    () => rowSkeleton(COLS.subs),
    (el, sub) => {
      const r = bySub.get(sub);
      const v = metric(r);
      el.querySelector('.name').textContent = cn(sub);
      setBar(el, v / COVER_HALF);
      const [main, w3, corr, sh] = el.querySelectorAll('.nums > *');
      main.textContent = sfmt(v);
      main.classList.toggle('adv', v >= 0);
      main.classList.toggle('dis', v < 0);
      w3.textContent = fmt(r.w3win, 1) + '%';
      corr.textContent = 'r ' + sfmt(r.corr, 2);
      corr.classList.toggle('neg', r.corr <= -0.1);
      corr.classList.toggle('pos', r.corr >= 0.1);
      sh.textContent = r.shared + t('sharedSuffix');
      sh.classList.toggle('pos', r.shared >= 2);
    },
    sub => rows.findIndex(r => r.sub === sub));
}

init();   // run after all declarations are initialized (works for fetch + inlined builds)
