/* DOM layer only — all math lives in scoring.js (parity-tested vs Python). */

const state = {
  view: 'match',          // 'match' | 'subs'
  char: 'TERRY',
  rank: 'comb',           // 'comb' | '40' | '41' | '42'
  preset: 'current',      // 'current' | 'all' | 'custom'
  monthW: {},             // {month: weight 0..1}
  tierW: { 40: 1, 41: 2, 42: 3 },
  oppW: { INGRID: 0 },    // per-opponent weight (sparse; absent = 1). 0 = exclude, >1 = target
};

let idx = null;
let months = [];

const $ = sel => document.querySelector(sel);

const BAR_HALF = 0.6;     // matchup bar full deflection at |score - 5| = 0.6
const COVER_HALF = 0.4;   // sub COVER bar full deflection at |cover| = 0.4

const DEFAULT_TIER = { 40: 1, 41: 2, 42: 3 };
const MONTH_STEP = 0.25;  // per-click increment for month-weight steppers (0..1)

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
  buildOppWeights();
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
  document.querySelectorAll('#exclude-chips .opp-w').forEach(el =>
    el.querySelector('.opp-name').textContent = cn(el.dataset.char));
}

function exclude() {
  return new Set(Object.keys(state.oppW).filter(c => state.oppW[c] === 0));
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

// per-opponent weight steppers: 0 = exclude, 1 = normal, 2-3 = target
function buildOppWeights() {
  const box = $('#exclude-chips');
  box.textContent = '';
  const present = new Set(Object.keys(idx));
  const ordered = ROSTER_ORDER.filter(c => present.has(c));
  for (const c of [...ordered, ...[...present].filter(c => !ordered.includes(c))]) {
    const el = document.createElement('div');
    el.className = 'opp-w';
    el.dataset.char = c;
    el.innerHTML = `<button class="opp-step" data-d="-1" aria-label="decrease">−</button>
      <span class="opp-name">${cn(c)}</span>
      <span class="opp-val"></span>
      <button class="opp-step" data-d="1" aria-label="increase">+</button>`;
    const valEl = el.querySelector('.opp-val');
    const paint = () => {
      const w = state.oppW[c] ?? 1;
      valEl.textContent = w;
      el.classList.toggle('excluded', w === 0);
      el.classList.toggle('targeted', w > 1);
    };
    el.querySelectorAll('.opp-step').forEach(btn =>
      btn.addEventListener('click', () => {
        const w = Math.max(0, Math.min(3, (state.oppW[c] ?? 1) + Number(btn.dataset.d)));
        if (w === 1) delete state.oppW[c]; else state.oppW[c] = w;
        paint();
        render();
      }));
    paint();
    box.appendChild(el);
  }
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

// Active months only (weight > 0) as compact steppers; zero-weight months are
// hidden and re-addable via the picker. Keeps a 16-month range from flooding
// the rail. Named buildMonthSliders to match its existing call sites.
function buildMonthSliders() {
  const box = $('#month-sliders');
  // this fn rebuilds the whole list on each stepper click, so remember which
  // button held focus and restore it afterward (keyboard nav must survive).
  const focusMonth = document.activeElement?.closest?.('.month-w')?.dataset.month;
  const focusDir = document.activeElement?.dataset.d;
  box.textContent = '';
  const fmtw = w => String(Math.round(w * 100) / 100);
  const label = m => `${m.slice(0, 4)}.${m.slice(4)}`;
  for (const m of months.filter(x => (state.monthW[x] ?? 0) > 0)) {
    const row = document.createElement('div');
    row.className = 'month-w';
    row.dataset.month = m;
    row.innerHTML = `<button class="month-step" data-d="-1" aria-label="decrease ${label(m)} weight">−</button>
      <span class="month-name">${label(m)}</span>
      <span class="month-val">${fmtw(state.monthW[m])}</span>
      <button class="month-step" data-d="1" aria-label="increase ${label(m)} weight">+</button>`;
    row.querySelectorAll('.month-step').forEach(btn =>
      btn.addEventListener('click', () => {
        const w = Math.max(0, Math.min(1, (state.monthW[m] ?? 0) + Number(btn.dataset.d) * MONTH_STEP));
        state.monthW[m] = Math.round(w * 100) / 100;
        setPreset('custom');
        buildMonthSliders();   // re-render so a zeroed month drops out of the list
        render();
      }));
    box.appendChild(row);
  }
  const inactive = months.filter(m => !((state.monthW[m] ?? 0) > 0));
  if (inactive.length) {
    const sel = document.createElement('select');
    sel.className = 'month-add';
    sel.setAttribute('aria-label', t('addMonth'));
    sel.innerHTML = `<option value="">${t('addMonth')}</option>` +
      inactive.map(m => `<option value="${m}">${label(m)}</option>`).join('');
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      state.monthW[sel.value] = 1;
      setPreset('custom');
      buildMonthSliders();
      render();
    });
    box.appendChild(sel);
  }
  // restore focus to the same control (or the add picker if the month dropped out)
  if (focusMonth) {
    const same = box.querySelector(`.month-w[data-month="${focusMonth}"] .month-step[data-d="${focusDir}"]`);
    (same || box.querySelector('.month-add'))?.focus();
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
  state.oppW = { INGRID: 0 };
  setPreset('current');
  state.monthW = monthWeights(months, 'current', PATCH_MONTH);
  document.querySelectorAll('.rank-tabs button').forEach(x => {
    const on = x.dataset.rank === 'comb';
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', on);
  });
  buildMonthSliders();
  buildTierSliders();
  buildOppWeights();
  render();
}

function setPreset(p) {
  state.preset = p;
  document.querySelectorAll('.presets button').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === p));
}

function selectChar(c) {
  state.char = c;
  $('#char-select').value = c;
  $('#char-name').textContent = cn(c);
  render();
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

  $('#char-select').addEventListener('change', e => selectChar(e.target.value));

  // click a row to scout that opponent / sub (drill into their matchups)
  $('#rows').addEventListener('click', e => {
    const row = e.target.closest('.row');
    if (row && idx[row.dataset.key]) selectChar(row.dataset.key);
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

function axisHtml(leftLabel, barLabels, cols, headers, titles = []) {
  return `<span>${leftLabel}</span>
    <span class="axis-bar"><span>${barLabels[0]}</span><span>${barLabels[1]}</span><span>${barLabels[2]}</span></span>
    <div class="nums">${cols.map(([w, ty], i) =>
      `<span class="${ty === 'main' ? 'col-main' : 'col-sub'} ${w}"${titles[i] ? ` title="${titles[i]}"` : ''}>${headers[i]}</span>`).join('')}</div>`;
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
                                                exclude(), state.tierW, state.oppW);
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
    COLS.subs, [t('hCover'), t('hW3'), t('hCorr'), t('hShared')],
    [, , t('corrHint')]);

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
