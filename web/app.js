/* v2 tier-list renderer. Reuses scoring.js (math) + i18n.js (strings/names/roster);
   only the presentation differs from v1 (chips grouped into matchup bands). */

const state = {
  view: 'match',
  char: 'TERRY',
  rank: 'comb',
  preset: 'current',
  monthW: {},
  tierW: { 36: 0, 40: 1, 41: 2, 42: 3 },
  oppW: { INGRID: 0 },    // per-opponent weight (sparse; absent = 1). 0 = exclude, >1 = target
  usageW: {},             // per-opponent usage-weight override (sparse; absent = auto from play rate)
  subSort: 'cover',       // sub-finder ranking key: 'cover' | 'spec' | 'str'
  useUsage: true,         // weight opponents by play rate (down-weights rare chars)
  personalRows: [],       // your parsed battlelog rows (Scout view; in-memory only)
  personalMode: false,    // read views through your own battlelog (shrunk vs baseline)
};

// transient status line for the Scout view (set before render(), shown once)
let scoutStatus = null;

let idx = null;
let months = [];
let usageCsv = '';

const $ = sel => document.querySelector(sel);
const DEFAULT_TIER = { 36: 0, 40: 1, 41: 2, 42: 3 };
const MONTH_STEP = 0.25;  // per-click increment for month-weight steppers (0..1)
const BAR_HALF = 0.6;     // matchup bar full deflection at |score - 5| = 0.6 (bars view)


// set an <img> headshot's src + alt; hide gracefully if missing
function setAvatar(img, name) {
  const src = imgSrc(name);
  img.src = src;
  img.alt = cn(name);
  img.style.visibility = src ? '' : 'hidden';
  img.onerror = () => { img.style.visibility = 'hidden'; };
}

// official Buckler bands, rendered worst-first (top to bottom)
const MATCH_TIERS = [
  { lo: -Infinity, hi: 4.7, label: 'tierDis', cls: 't-dis' },
  { lo: 4.7, hi: 4.9, label: 'tierSlightDis', cls: 't-sdis' },
  { lo: 4.9, hi: 5.1, label: 'tierEven', cls: 't-even' },
  { lo: 5.1, hi: 5.3, label: 'tierSlightAdv', cls: 't-sadv' },
  { lo: 5.3, hi: Infinity, label: 'tierAdv', cls: 't-adv' },
];

const fmt = (v, nd = 3) => v === null || v === undefined ? '—' : v.toFixed(nd);
const sfmt = (v, nd = 3) => v === null || v === undefined ? '—'
  : (v >= 0 ? '+' : '') + v.toFixed(nd);

// personal annotation for one opponent: {wl, dir} or null when no games / Personal
// mode off. dir from your shrunk win-rate − the global baseline (score units).
function personalAnno(opp) {
  if (!personalActive()) return null;
  const rec = aggregate(state.personalRows, state.char)[opp];
  if (!rec) return null;
  const [w, l] = rec;
  const base = combinedRow(idx, state.char, state.monthW, exclude(), state.tierW)[opp];
  if (base == null) return null;
  const shrunk = personalRow(idx, state.char, state.monthW, exclude(), state.tierW,
                             aggregate(state.personalRows, state.char))[opp];
  const delta = shrunk - base;
  return { wl: `${w}–${l}`, dir: delta >= 0.1 ? 'up' : delta <= -0.1 ? 'dn' : 'even' };
}
const annoArrow = a => a.dir === 'up' ? '↑' : a.dir === 'dn' ? '↓' : '·';

async function init() {
  setLang(lang);
  applyI18n();
  let csv;
  if (typeof MATRIX_CSV !== 'undefined') {
    csv = MATRIX_CSV;
  } else {
    const resp = await fetch('../output/matrix.csv');
    if (!resp.ok) { $('#loading').textContent = t('loadError'); return; }
    csv = await resp.text();
  }
  idx = buildIndex(csv);
  months = availableMonths(csv);
  if (typeof USAGE_CSV !== 'undefined') {
    usageCsv = USAGE_CSV;
  } else {
    const ur = await fetch('../output/usage.csv');
    usageCsv = ur.ok ? await ur.text() : '';
  }
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
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach(el => el.innerHTML = t(el.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-rank]').forEach(el => el.textContent = t('rank')[el.dataset.i18nRank]);
  document.querySelectorAll('.lang-switch button').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  $('#view-label').textContent = t(state.view === 'bars' ? 'labelBars'
    : state.view === 'subs' ? 'labelSubs'
    : state.view === 'scatter' ? 'labelScatter'
    : state.view === 'threats' ? 'labelThreats'
    : state.view === 'scout' ? 'labelScout' : 'labelMatch');
  $('#char-name').textContent = cn(state.char);
  setAvatar($('#char-avatar'), state.char);
  document.querySelectorAll('#char-select option').forEach(o => o.textContent = cn(o.value));
  document.querySelectorAll('#exclude-chips .opp-w').forEach(el =>
    el.querySelector('.opp-name').textContent = cn(el.dataset.char));
}

function exclude() { return new Set(Object.keys(state.oppW).filter(c => state.oppW[c] === 0)); }

// usage-weight map for the active months (null when the toggle is off).
// per-opponent manual overrides in state.usageW win over the auto play-rate value.
function usageMap() {
  if (!state.useUsage || !usageCsv) return null;
  return { ...usageWeights(usageRates(usageCsv, state.monthW, state.tierW)), ...state.usageW };
}

/* ---------- personal lens selectors (Personal mode; see scout.js) ---------- */

// is the personal lens active? (toggle on AND a battlelog is loaded)
function personalActive() { return state.personalMode && state.personalRows.length > 0; }

// the matchup row a view should use: personal shrunk row when Personal mode is on,
// else the global COMB row. Same {opp: score} shape either way.
function activeRow(char) {
  if (personalActive()) {
    return personalRow(idx, char, state.monthW, exclude(), state.tierW,
                       aggregate(state.personalRows, char));
  }
  return combinedRow(idx, char, state.monthW, exclude(), state.tierW);
}

// {opp: count} of how often you faced each opponent as `char` (empty when off)
function activeEncounter(char) {
  return personalActive() ? personalEncounter(state.personalRows, char) : {};
}

// opponent usage-weight map: personal encounter weights when Personal mode is on,
// else the existing global usageMap(). Manual overrides (state.usageW) still win.
function activeUsage(char) {
  if (personalActive()) {
    return { ...usageWeights(activeEncounter(char)), ...state.usageW };
  }
  return usageMap();
}

/* ---------- controls (shared shape with v1) ---------- */

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

// per-opponent weight: 0 = exclude, 1 = normal, >1 = target. Directly editable
// (type a number) + ± steppers; shows each opponent's usage weight when on.
function buildOppWeights() {
  const box = $('#exclude-chips');
  box.textContent = '';
  const usage = usageMap();
  const present = new Set(Object.keys(idx));
  const ordered = ROSTER_ORDER.filter(c => present.has(c));
  for (const c of [...ordered, ...[...present].filter(c => !ordered.includes(c))]) {
    const el = document.createElement('div');
    el.className = 'opp-w';
    el.dataset.char = c;
    el.innerHTML = `<button class="opp-step" data-d="-1" aria-label="decrease">−</button>
      <span class="opp-name">${cn(c)}</span>
      <input class="opp-val" type="number" min="0" step="0.1" aria-label="${cn(c)} weight">
      <button class="opp-step" data-d="1" aria-label="increase">+</button>
      <span class="opp-usage-wrap" title="${t('usageWeight')}">×<input class="opp-usage" type="number" min="0" step="0.05" aria-label="${cn(c)} usage weight"></span>`;
    const inp = el.querySelector('.opp-val');
    const usageInp = el.querySelector('.opp-usage');
    const usageWrap = el.querySelector('.opp-usage-wrap');
    const paint = () => {
      const w = state.oppW[c] ?? 1;
      inp.value = w;
      el.classList.toggle('excluded', w === 0);
      el.classList.toggle('targeted', w > 1);
      const uw = usage ? usage[c] : null;
      usageWrap.hidden = uw == null;
      if (uw != null) {
        usageInp.value = uw.toFixed(2);
        usageInp.classList.toggle('overridden', c in state.usageW);
      }
    };
    const setW = w => {
      w = Math.round(Math.max(0, w) * 100) / 100;
      if (w === 1) delete state.oppW[c]; else state.oppW[c] = w;
      paint();
      render();
    };
    inp.addEventListener('change', () => setW(parseFloat(inp.value) || 0));
    el.querySelectorAll('.opp-step').forEach(btn =>
      btn.addEventListener('click', () => setW((state.oppW[c] ?? 1) + Number(btn.dataset.d))));
    // usage-weight override: empty reverts to the auto play-rate value
    usageInp.addEventListener('change', () => {
      const raw = usageInp.value.trim();
      if (raw === '') delete state.usageW[c];
      else state.usageW[c] = Math.round(Math.max(0, parseFloat(raw) || 0) * 100) / 100;
      render();
    });
    paint();
    box.appendChild(el);
  }
}

// refresh the per-opponent usage inputs (live on toggle / month change / override)
function paintUsageBadges() {
  const usage = usageMap();
  document.querySelectorAll('#exclude-chips .opp-w').forEach(el => {
    const c = el.dataset.char;
    const uw = usage ? usage[c] : null;
    const wrap = el.querySelector('.opp-usage-wrap');
    const inp = el.querySelector('.opp-usage');
    wrap.hidden = uw == null;
    if (uw != null && inp !== document.activeElement) {   // don't clobber mid-edit
      inp.value = uw.toFixed(2);
      inp.classList.toggle('overridden', c in state.usageW);
    }
  });
}

// slider + a directly-editable number box (each syncs the other)
function sliderRow(name, value, max, step, onInput) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `<span class="slider-name">${name}</span>
    <input class="slider-range" type="range" min="0" max="${max}" step="${step}" value="${value}" aria-label="${name} weight">
    <input class="slider-val" type="number" min="0" step="${step}" value="${value}" aria-label="${name} weight value">`;
  const range = row.querySelector('.slider-range');
  const num = row.querySelector('.slider-val');
  range.addEventListener('input', () => { num.value = range.value; onInput(parseFloat(range.value)); });
  num.addEventListener('change', () => {
    const v = Math.max(0, parseFloat(num.value) || 0);
    num.value = v; range.value = Math.min(v, max); onInput(v);
  });
  return row;
}

// Active months only (weight > 0) as compact steppers; zero-weight months are
// hidden and re-addable via the picker — keeps 16 months from flooding the card.
function buildMonthSliders() {
  const box = $('#month-sliders');
  // this fn rebuilds the whole list on each stepper click, so remember which
  // button held focus and restore it afterward (keyboard nav must survive).
  const focusMonth = document.activeElement?.closest?.('.month-w')?.dataset.month;
  const focusDir = document.activeElement?.dataset.d;
  box.textContent = '';
  const fmtw = w => String(Math.round(w * 100) / 100);
  const label = m => `${m.slice(0, 4)}.${m.slice(4)}`;
  const setMonth = (m, w) => {
    state.monthW[m] = Math.round(Math.max(0, Math.min(1, w)) * 100) / 100;
    setPreset('custom');
    buildMonthSliders();   // a month set to 0 drops to the add-picker on rebuild
    render();
  };
  for (const m of months.filter(x => (state.monthW[x] ?? 0) > 0)) {
    const row = document.createElement('div');
    row.className = 'month-w';
    row.dataset.month = m;
    row.innerHTML = `<button class="month-step" data-d="-1" aria-label="decrease ${label(m)} weight">−</button>
      <span class="month-name">${label(m)}</span>
      <input class="month-val" type="number" min="0" max="1" step="${MONTH_STEP}" value="${fmtw(state.monthW[m])}" aria-label="${label(m)} weight">
      <button class="month-step" data-d="1" aria-label="increase ${label(m)} weight">+</button>`;
    row.querySelector('.month-val').addEventListener('change', e =>
      setMonth(m, parseFloat(e.target.value) || 0));
    row.querySelectorAll('.month-step').forEach(btn =>
      btn.addEventListener('click', () =>
        setMonth(m, (state.monthW[m] ?? 0) + Number(btn.dataset.d) * MONTH_STEP)));
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
  // restore focus to the same control (stepper, value input, or the add picker
  // if the month dropped out)
  if (focusMonth) {
    const sel = focusDir
      ? `.month-w[data-month="${focusMonth}"] .month-step[data-d="${focusDir}"]`
      : `.month-w[data-month="${focusMonth}"] .month-val`;
    (box.querySelector(sel) || box.querySelector('.month-add'))?.focus();
  }
}

function buildTierSliders() {
  const box = $('#tier-sliders');
  box.textContent = '';
  for (const r of ['36', '40', '41', '42']) {
    box.appendChild(sliderRow(t('rankFull')[r], state.tierW[r], 5, 0.05, v => { state.tierW[r] = v; render(); }));
  }
}

function updateTierState() {
  const active = state.rank === 'comb';
  const sec = $('#tier-control');
  sec.classList.toggle('disabled', !active);
  sec.querySelectorAll('input').forEach(i => { i.disabled = !active; });
}

function setPreset(p) {
  state.preset = p;
  document.querySelectorAll('.presets button').forEach(b => b.classList.toggle('active', b.dataset.preset === p));
}

function resetDefaults() {
  state.rank = 'comb';
  state.tierW = { ...DEFAULT_TIER };
  state.oppW = { INGRID: 0 };
  state.usageW = {};
  state.useUsage = true;
  $('#usage-toggle').checked = true;
  state.personalMode = false;
  const ptgl = $('#personal-toggle'); if (ptgl) ptgl.checked = false;
  setPreset('current');
  state.monthW = monthWeights(months, 'current', PATCH_MONTH);
  document.querySelectorAll('.rank-tabs button').forEach(x => {
    const on = x.dataset.rank === 'comb';
    x.classList.toggle('active', on); x.setAttribute('aria-selected', on);
  });
  buildMonthSliders();
  buildTierSliders();
  buildOppWeights();
  render();
}

function selectChar(c) {
  state.char = c;
  $('#char-select').value = c;
  $('#char-name').textContent = cn(c);
  setAvatar($('#char-avatar'), c);
  render();
}

/* ---------- character detail card (click any char chip) ---------- */

let charCardEl = null;

function closeCharCard() {
  if (!charCardEl) return;
  charCardEl.remove();
  charCardEl = null;
  document.removeEventListener('keydown', onCardKey);
  document.removeEventListener('click', onCardOutside, true);
}

function onCardKey(e) { if (e.key === 'Escape') closeCharCard(); }
function onCardOutside(e) { if (charCardEl && !charCardEl.contains(e.target)) closeCharCard(); }

// pop a compact summary of a character (win-rate, usage, best/worst matchups)
// anchored to the clicked element, with a button to drill into its own page.
function openCharCard(char, anchor) {
  closeCharCard();
  if (!idx[char]) return;
  const row = combinedRow(idx, char, state.monthW, exclude(), state.tierW);
  const entries = Object.entries(row);
  if (!entries.length) { selectChar(char); return; }   // no data under current weights -> just navigate
  const win = strength(row) * 10;
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  const strong = sorted.slice(0, 3);
  const weak = sorted.slice(-3).reverse();
  const usage = (usageCsv ? usageRates(usageCsv, state.monthW, state.tierW)[char] : null);
  const mini = arr => arr.map(([opp, sc]) =>
    `<span class="cc-mini"><img src="${imgSrc(opp)}" alt="" loading="lazy" onerror="this.style.display='none'"><b>${cn(opp)}</b><i>${fmt(sc, 2)}</i></span>`).join('');

  charCardEl = document.createElement('div');
  charCardEl.className = 'char-card';
  charCardEl.innerHTML =
    `<div class="cc-head">
       <img class="cc-avatar" src="${imgSrc(char)}" alt="" onerror="this.style.visibility='hidden'">
       <span class="cc-name">${cn(char)}</span>
       <button class="cc-close" aria-label="${t('close')}">×</button>
     </div>
     <div class="cc-stats">
       <div class="cc-stat"><span class="cc-stat-label">${t('ccWin')}</span><span class="cc-stat-val ${win >= 50 ? 'adv' : 'dis'}">${win.toFixed(1)}%</span></div>
       <div class="cc-stat"><span class="cc-stat-label">${t('ccUsage')}</span><span class="cc-stat-val">${usage != null ? usage.toFixed(1) + '%' : '—'}</span></div>
     </div>
     <div class="cc-mlist"><span class="cc-mhead adv">${t('ccStrong')}</span>${mini(strong)}</div>
     <div class="cc-mlist"><span class="cc-mhead dis">${t('ccWeak')}</span>${mini(weak)}</div>
     <button class="cc-go">${t('ccGo', { char: cn(char) })} →</button>`;
  document.body.appendChild(charCardEl);
  positionCharCard(charCardEl, anchor);

  charCardEl.querySelector('.cc-close').addEventListener('click', closeCharCard);
  charCardEl.querySelector('.cc-go').addEventListener('click', () => { closeCharCard(); selectChar(char); });
  document.addEventListener('keydown', onCardKey);
  // capture-phase outside-click, deferred so the opening click doesn't close it
  setTimeout(() => document.addEventListener('click', onCardOutside, true), 0);
}

function positionCharCard(card, anchor) {
  const r = anchor.getBoundingClientRect();
  card.style.position = 'fixed';
  card.style.visibility = 'hidden';
  const cw = card.offsetWidth, ch = card.offsetHeight, pad = 8;
  let left = Math.min(r.left, window.innerWidth - cw - pad);
  let top = r.bottom + pad;
  if (top + ch > window.innerHeight - pad) top = r.top - ch - pad;  // flip above if it would overflow
  card.style.left = Math.max(pad, left) + 'px';
  card.style.top = Math.max(pad, top) + 'px';
  card.style.visibility = '';
}

function wireControls() {
  document.querySelectorAll('.view-switch button').forEach(b =>
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      document.querySelectorAll('.view-switch button').forEach(x => {
        x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b);
      });
      $('#view-label').textContent = t(VIEW_LABEL[state.view]);
      render();
    }));

  document.querySelectorAll('.lang-switch button').forEach(b =>
    b.addEventListener('click', () => {
      if (b.dataset.lang === lang) return;
      setLang(b.dataset.lang); applyI18n(); buildTierSliders(); render();
    }));

  $('#char-select').addEventListener('change', e => selectChar(e.target.value));

  document.querySelectorAll('.rank-tabs button').forEach(b =>
    b.addEventListener('click', () => {
      state.rank = b.dataset.rank;
      document.querySelectorAll('.rank-tabs button').forEach(x => {
        x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b);
      });
      render();
    }));

  document.querySelectorAll('.presets button').forEach(b =>
    b.addEventListener('click', () => {
      setPreset(b.dataset.preset);
      state.monthW = monthWeights(months, b.dataset.preset, PATCH_MONTH);
      buildMonthSliders(); render();
    }));

  $('#usage-toggle').addEventListener('change', e => { state.useUsage = e.target.checked; render(); });
  $('#personal-toggle').addEventListener('change', e => { state.personalMode = e.target.checked; render(); });

  $('#reset-btn').addEventListener('click', resetDefaults);
}

/* ---------- tier rendering ---------- */

const VIEW_LABEL = { match: 'labelMatch', bars: 'labelBars', subs: 'labelSubs', scatter: 'labelScatter', threats: 'labelThreats', scout: 'labelScout' };

function render() {
  closeCharCard();
  updateTierState();
  paintUsageBadges();
  if (state.view === 'match') renderMatch();
  else if (state.view === 'bars') renderBars();
  else if (state.view === 'scatter') renderScatter();
  else if (state.view === 'threats') renderThreats();
  else if (state.view === 'scout') renderScout();
  else renderSubs();
}

function laneHtml(tier, chips) {
  const count = chips.length;
  const body = count
    ? `<div class="chips">${chips.join('')}</div>`
    : `<div class="lane-empty">${t('tierEmpty')}</div>`;
  return `<section class="lane ${tier.cls}">
    <div class="lane-head"><span class="lane-name">${t(tier.label)}</span><span class="lane-count">${count}</span></div>
    ${body}
  </section>`;
}

const RELIAB_PIPS = { high: '●●●', med: '●●○', low: '●○○' };
const RELIAB_LABEL = { high: 'reliabHigh', med: 'reliabMed', low: 'reliabLow' };

function matchChip(r, metric) {
  const v = metric(r);
  const tierCls = MATCH_TIERS.find(tr => v >= tr.lo && v < tr.hi).cls;
  const trend = r.dpatch === null ? ''
    : r.dpatch <= -0.1 ? '<span class="chip-trend dn">↓</span>'
    : r.dpatch >= 0.1 ? '<span class="chip-trend up">↑</span>' : '';
  const pip = `<span class="chip-reliab r-${r.reliab}" title="${t(RELIAB_LABEL[r.reliab])}" aria-label="${t(RELIAB_LABEL[r.reliab])}">${RELIAB_PIPS[r.reliab]}</span>`;
  const title = `High ${fmt(r.t40)} · Grand ${fmt(r.t41)} · Ult ${fmt(r.t42)} · Δ ${sfmt(r.dpatch)} · ${r.nmo}${t('moSuffix')} · ${t('chipHint')}`;
  const anno = personalAnno(r.opp);
  const annoHtml = anno
    ? `<span class="chip-personal ${anno.dir}" title="${t('personalDelta')}">${anno.wl} ${annoArrow(anno)}</span>`
    : '';
  return `<button class="chip ${tierCls}" data-char="${r.opp}" title="${title}">
    <img class="chip-avatar" src="${imgSrc(r.opp)}" alt="" loading="lazy" onerror="this.style.display='none'">
    <span class="chip-name">${cn(r.opp)}</span>
    <span class="chip-score">${fmt(v, 2)}</span>${annoHtml}${trend}${pip}
  </button>`;
}

function renderMatch() {
  const table = charTable(idx, state.char, state.monthW, exclude(), state.tierW, PATCH_MONTH);
  const metric = r => state.rank === 'comb' ? r.comb : r['t' + state.rank];
  const rows = table.filter(r => metric(r) !== null);

  const dis = rows.filter(r => metric(r) < 4.9).length;
  const even = rows.filter(r => metric(r) >= 4.9 && metric(r) <= 5.1).length;
  const adv = rows.filter(r => metric(r) > 5.1).length;
  $('#hero-summary').innerHTML =
    `<span class="sum dis">${dis} ${t('tierDis')}</span>` +
    `<span class="sum even">${even} ${t('tierEven')}</span>` +
    `<span class="sum adv">${adv} ${t('tierAdv')}</span>`;

  $('#caption').innerHTML = t('headMatch', {
    char: cn(state.char), n: rows.length,
    metric: state.rank === 'comb' ? t('metricComb') : t('rankFull')[state.rank],
  });

  $('#lanes').innerHTML = MATCH_TIERS.map(tier => {
    const inTier = rows.filter(r => metric(r) >= tier.lo && metric(r) < tier.hi)
                       .sort((a, b) => metric(a) - metric(b));
    return laneHtml(tier, inTier.map(r => matchChip(r, metric)));
  }).join('');

  const legend = $('#reliab-legend');
  legend.textContent = t('reliabLegend');
  legend.hidden = false;

  wireChips();
}

/* ---------- bars view (ported from v1's diverging-bar table) ---------- */

function barRowHtml(r, metric) {
  const v = metric(r);
  const frac = Math.max(-1, Math.min(1, (v - 5.0) / BAR_HALF));
  const barCls = frac >= 0 ? 'adv' : 'dis';
  const flag = r.spread > 0.25 ? `<span class="flag" title="${t('spreadFlag')}">⚠</span>` : '';
  // personal column only exists in Personal mode (keeps global layout identical)
  const anno = personalAnno(r.opp);
  const annoHtml = personalActive()
    ? (anno
        ? `<span class="col-personal ${anno.dir}" title="${t('personalDelta')}">${anno.wl} ${annoArrow(anno)}</span>`
        : '<span class="col-personal"></span>')
    : '';
  return `<div class="row" data-char="${r.opp}">

    <span class="name"><img class="row-avatar" src="${imgSrc(r.opp)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="row-name-text">${cn(r.opp)}${flag}</span></span>
    <div class="bar-track"><div class="bar ${barCls}" style="transform:scaleX(${Math.abs(frac)})"></div></div>
    <div class="nums">
      <span class="col-main ${v >= 5 ? 'adv' : 'dis'}">${fmt(v, 2)}</span>
      <span class="col-sub" title="${t('hDpatchHint')}">Δ ${sfmt(r.dpatch)}</span>
      ${annoHtml}
    </div>
  </div>`;
}

function renderBars() {
  const table = charTable(idx, state.char, state.monthW, exclude(), state.tierW, PATCH_MONTH);
  const metric = r => state.rank === 'comb' ? r.comb : r['t' + state.rank];
  const rows = table.filter(r => metric(r) !== null).sort((a, b) => metric(a) - metric(b));

  $('#hero-summary').innerHTML = '';
  $('#caption').innerHTML = t('headMatch', {
    char: cn(state.char), n: rows.length,
    metric: state.rank === 'comb' ? t('metricComb') : t('rankFull')[state.rank],
  });
  $('#reliab-legend').hidden = true;

  if (!rows.length) { $('#lanes').innerHTML = `<div class="lane-empty">${t('tierEmpty')}</div>`; return; }

  const hardest = rows[0], best = rows[rows.length - 1];
  const kpis = [
    { label: t('kHardest'), val: cn(hardest.opp), sub: fmt(metric(hardest), 2), tone: 'dis' },
    { label: t('kDis'), val: rows.filter(r => metric(r) < 4.9).length, tone: 'dis' },
    { label: t('kAdv'), val: rows.filter(r => metric(r) > 5.1).length, tone: 'adv' },
    { label: t('kBest'), val: cn(best.opp), sub: fmt(metric(best), 2), tone: 'adv' },
  ];
  const kpiHtml = kpis.map(c =>
    `<div class="kpi ${c.tone || ''}"><span class="kpi-label">${c.label}</span><span class="kpi-val">${c.val}${c.sub ? `<small>${c.sub}</small>` : ''}</span></div>`).join('');
  const personalHead = personalActive() ? `<span class="col-personal">${t('personalOn')}</span>` : '';
  const axisHtml = `<span>${t('axisOpponent')}</span>` +
    `<span class="axis-bar"><span>${t('axisLosing')}</span><span>${t('axisEven')}</span><span>${t('axisWinning')}</span></span>` +
    `<div class="nums"><span class="col-main">${t('hScore')}</span><span class="col-sub" title="${t('hDpatchHint')}">${t('hDpatch')}</span>${personalHead}</div>`;

  $('#lanes').innerHTML =
    `<div class="bars${personalActive() ? ' personal' : ''}"><div class="kpis">${kpiHtml}</div><div class="axis">${axisHtml}</div>` +
    `<div class="rows">${rows.map(r => barRowHtml(r, metric)).join('')}</div></div>`;

  document.querySelectorAll('#lanes .row[data-char]').forEach(el =>
    el.addEventListener('click', () => openCharCard(el.dataset.char, el)));
}

/* ---------- usage × win-rate scatter (cast-wide) ---------- */

const winCls = w => w >= 50.1 ? 't-adv' : w <= 49.9 ? 't-dis' : 't-even';

// shared scatter renderer. pts = [{char, x, y, size(0..1), cls, title}];
// cfg = {axisX, axisY, aria, quadTR, quadTL, quadBR, quadBL} (all i18n keys).
function buildScatter(pts, cfg) {
  const W = 860, H = 560, m = { l: 70, r: 28, t: 44, b: 58 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xmax = Math.max(...xs) * 1.08 || 1;
  const pad = 0.18;
  const ymin = Math.min(...ys) - pad, ymax = Math.max(...ys) + pad;
  const px = u => m.l + u / xmax * (W - m.l - m.r);
  const py = w => H - m.b - (w - ymin) / (ymax - ymin) * (H - m.t - m.b);
  const sortedX = [...xs].sort((a, b) => a - b);
  const xMid = px(sortedX[Math.floor(sortedX.length / 2)]), yMid = py(50);
  const x0 = px(0), x1 = px(xmax), yTop = py(ymax), yBot = py(ymin);
  const within = yMid > yTop && yMid < yBot;   // is the 50% line in view?

  const quads = within ? `
    <rect x="${xMid}" y="${yTop}" width="${x1 - xMid}" height="${yMid - yTop}" class="quad q-pop"/>
    <rect x="${x0}" y="${yTop}" width="${xMid - x0}" height="${yMid - yTop}" class="quad q-sleep"/>
    <rect x="${xMid}" y="${yMid}" width="${x1 - xMid}" height="${yBot - yMid}" class="quad q-over"/>
    <rect x="${x0}" y="${yMid}" width="${xMid - x0}" height="${yBot - yMid}" class="quad q-rare"/>` : '';
  const ql = (key, x, y, anchor) => `<text class="quad-label" x="${x}" y="${y}" text-anchor="${anchor}">${t(key)}</text>`;
  const quadLabels = within ? `
    ${ql(cfg.quadTR, x1 - 8, yTop + 18, 'end')}
    ${ql(cfg.quadTL, x0 + 8, yTop + 18, 'start')}
    ${ql(cfg.quadBR, x1 - 8, yBot - 10, 'end')}
    ${ql(cfg.quadBL, x0 + 8, yBot - 10, 'start')}` : '';

  let xticks = '';
  for (let u = 0; u <= xmax; u += 2) {
    xticks += `<line class="grid" x1="${px(u)}" y1="${yTop}" x2="${px(u)}" y2="${yBot}"/>
      <text class="tick" x="${px(u)}" y="${yBot + 18}" text-anchor="middle">${u}</text>`;
  }
  let yticks = '';
  const yStep = (ymax - ymin) > 2 ? 0.5 : 0.25;
  for (let w = Math.ceil(ymin / yStep) * yStep; w <= ymax; w += yStep) {
    yticks += `<line class="grid" x1="${x0}" y1="${py(w)}" x2="${x1}" y2="${py(w)}"/>
      <text class="tick" x="${x0 - 10}" y="${py(w) + 4}" text-anchor="end">${w.toFixed(1)}</text>`;
  }

  const R_MIN = 4, R_MAX = 9;
  const dots = pts.map(p => {
    const sel = p.char === state.char;
    const cx = px(p.x), cy = py(p.y);
    const r = R_MIN + Math.max(0, Math.min(1, p.size)) * (R_MAX - R_MIN);
    return `<g class="pt ${p.cls} ${sel ? 'sel' : ''}" data-char="${p.char}">
      <title>${p.title}</title>
      <circle cx="${cx}" cy="${cy}" r="${sel ? r + 2 : r}"/>
      <text class="pt-label" x="${cx + r + 3}" y="${cy + 3.5}">${cn(p.char)}</text>
    </g>`;
  }).join('');

  $('#lanes').innerHTML = `
    <div class="scatter-wrap">
      <svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t(cfg.aria)}" preserveAspectRatio="xMidYMid meet">
        ${quads}
        ${xticks}${yticks}
        <line class="axis-ref" x1="${x0}" y1="${yMid}" x2="${x1}" y2="${yMid}"/>
        <line class="axis-ref dashed" x1="${xMid}" y1="${yTop}" x2="${xMid}" y2="${yBot}"/>
        <line class="axis" x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}"/>
        <line class="axis" x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}"/>
        ${quadLabels}
        <text class="axis-title" x="${(x0 + x1) / 2}" y="${H - 10}" text-anchor="middle">${t(cfg.axisX)}</text>
        <text class="axis-title" transform="rotate(-90 16 ${(yTop + yBot) / 2})" x="16" y="${(yTop + yBot) / 2}" text-anchor="middle">${t(cfg.axisY)}</text>
        ${dots}
      </svg>
    </div>`;

  $('#lanes').querySelectorAll('.pt').forEach(g =>
    g.addEventListener('click', () => openCharCard(g.dataset.char, g)));
}

function renderScatter() {
  $('#reliab-legend').hidden = true;
  const ex = exclude();
  const rates = usageCsv ? usageRates(usageCsv, state.monthW, state.tierW) : {};
  const raw = [];
  for (const c of Object.keys(idx)) {
    if (ex.has(c)) continue;
    const row = combinedRow(idx, c, state.monthW, ex, state.tierW);
    if (!Object.keys(row).length || rates[c] == null) continue;
    raw.push({ char: c, usage: rates[c], win: strength(row) * 10, pol: polarization(row) });
  }
  $('#hero-summary').innerHTML = '';
  $('#caption').innerHTML = t('scatterCaption');
  if (raw.length < 2) { $('#lanes').innerHTML = `<div class="lane-empty">${t('scatterEmpty')}</div>`; return; }
  const polMax = Math.max(...raw.map(p => p.pol), 0.01);
  const pts = raw.map(p => ({
    char: p.char, x: p.usage, y: p.win, size: p.pol / polMax, cls: winCls(p.win),
    title: `${cn(p.char)} · ${p.usage.toFixed(1)}% used · ${p.win.toFixed(2)}% win · ${t('polLabel')} ${p.pol.toFixed(2)}`,
  }));
  buildScatter(pts, {
    axisX: 'scatterAxisUsage', axisY: 'scatterAxisWin', aria: 'labelScatter',
    quadTR: 'quadStrongPop', quadTL: 'quadSleeper', quadBR: 'quadOverrated', quadBL: 'quadWeakRare',
  });
}

// per-character "threat map": one point per opponent — x = how often you face
// them (usage), y = your win-rate vs them. Lower-right (common & you lose) is
// the drill list; dot size = data confidence (reliability).
function renderThreats() {
  $('#reliab-legend').hidden = true;
  const ex = exclude();
  const pts = [];
  if (personalActive()) {
    // personal: x = your encounter share, y = your shrunk win-rate, size = your sample
    const row = personalRow(idx, state.char, state.monthW, ex, state.tierW, aggregate(state.personalRows, state.char));
    const enc = personalEncounter(state.personalRows, state.char);
    const totalGames = Object.values(enc).reduce((s, n) => s + n, 0);
    const maxN = Math.max(1, ...Object.values(enc));
    for (const opp of Object.keys(row)) {
      const win = row[opp] * 10, n = enc[opp] || 0;
      pts.push({
        char: opp, x: totalGames ? n / totalGames * 100 : 0, y: win, size: n / maxN, cls: winCls(win),
        title: `${cn(opp)} · ${n} ${t('scoutMatches')} · ${win.toFixed(2)}% ${t('ccWin')}`,
      });
    }
    $('#hero-summary').innerHTML = '';
    $('#caption').innerHTML = t('threatCaption', { char: cn(state.char) })
      + (totalGames === 0 ? ` <b>${t('personalNoGames', { char: cn(state.char) })}</b>` : '');
  } else {
    const rates = usageCsv ? usageRates(usageCsv, state.monthW, state.tierW) : {};
    const table = charTable(idx, state.char, state.monthW, ex, state.tierW, PATCH_MONTH);
    const metric = r => state.rank === 'comb' ? r.comb : r['t' + state.rank];
    for (const r of table) {
      const v = metric(r);
      if (v == null || rates[r.opp] == null) continue;
      const win = v * 10, rel = reliability(r.nmo, r.nranks, r.spread).score;
      pts.push({
        char: r.opp, x: rates[r.opp], y: win, size: rel, cls: winCls(win),
        title: `${cn(r.opp)} · ${rates[r.opp].toFixed(1)}% ${t('threatFaced')} · ${win.toFixed(2)}% ${t('ccWin')}`,
      });
    }
    $('#hero-summary').innerHTML = '';
    $('#caption').innerHTML = t('threatCaption', { char: cn(state.char) });
  }
  if (pts.length < 2) { $('#lanes').innerHTML = `<div class="lane-empty">${t('scatterEmpty')}</div>`; return; }
  buildScatter(pts, {
    axisX: 'threatAxisUsage', axisY: 'threatAxisWin', aria: 'labelThreats',
    quadTR: 'quadComfort', quadTL: 'quadFree', quadBR: 'quadPriority', quadBL: 'quadMinor',
  });
}

/* ---------- Personal Matchup Scout (in-browser; data stays local) ---------- */

// Self-contained bookmarklet: run it while logged into Buckler. It reads your
// profile id from the URL, pages your ranked battlelog, and pops a copy box with
// a compact {owner, replays} JSON to paste into the Scout tab. No regex/quotes
// nesting so it survives as a template literal; all parsing happens here in-app.
// Build the "Pull my Buckler log" bookmarklet with localized strings baked in
// (it runs on Buckler's origin, outside our app, so it can't reach our i18n at
// runtime — we interpolate the current language's strings at drag time). It shows
// a live progress pill (page p/n) and ends with a copy box.
function scoutBookmarklet(s) {
  return `javascript:(async()=>{try{
var parts=location.pathname.split('/profile/');
var ndEl=document.getElementById('__NEXT_DATA__');
var nd=ndEl?JSON.parse(ndEl.textContent):null;
var owner=(parts[1]?parts[1].split('/')[0]:'')||(nd&&nd.props.pageProps.fighter_banner_info&&nd.props.pageProps.fighter_banner_info.personal_info.short_id);
if(!owner){alert(${JSON.stringify(s.noProfile)});return;}
var base='https://www.streetfighter.com/6/buckler/profile/'+owner+'/battlelog/rank?page=';
var pill=document.createElement('div');
pill.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:#131826;color:#eaeef7;border:1px solid #283047;border-radius:8px;padding:10px 14px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.45)';
document.body.appendChild(pill);
var seen={},replays=[],total=20,shown='?';
for(var p=1;p<=20;p++){
pill.textContent=${JSON.stringify(s.progress)}.replace('{p}',p).replace('{n}',shown);
var html=await fetch(base+p,{credentials:'include'}).then(x=>x.text());
var doc=new DOMParser().parseFromString(html,'text/html');
var el=doc.getElementById('__NEXT_DATA__');
if(!el)break;
var pp=JSON.parse(el.textContent).props.pageProps;
if(p===1&&pp.total_page){total=Math.min(20,pp.total_page);shown=total;pill.textContent=${JSON.stringify(s.progress)}.replace('{p}',p).replace('{n}',shown);}
var list=(pp.replay_list)||[];
var fresh=0,i,r;
for(i=0;i<list.length;i++){r=list[i];if(!seen[r.replay_id]){seen[r.replay_id]=1;replays.push(r);fresh++;}}
if(!fresh||p>=total)break;
await new Promise(z=>setTimeout(z,500));
}
pill.remove();
if(!replays.length){alert(${JSON.stringify(s.noMatches)});return;}
var blob=JSON.stringify({owner:owner,replays:replays});
var ov=document.createElement('div');
ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(5,8,15,.78);display:flex;align-items:center;justify-content:center';
var card=document.createElement('div');
card.style.cssText='background:#131826;color:#eaeef7;border:1px solid #283047;border-radius:10px;padding:18px;width:min(560px,92vw);font-family:system-ui,sans-serif';
var h=document.createElement('p');h.textContent=${JSON.stringify(s.done)}.replace('{n}',replays.length);h.style.cssText='margin:0 0 10px;font-size:14px';
var ta=document.createElement('textarea');ta.value=blob;ta.readOnly=true;ta.style.cssText='width:100%;height:120px;font-family:monospace;font-size:11px;background:#0b0e16;color:#eaeef7;border:1px solid #283047;border-radius:6px;padding:8px;box-sizing:border-box';
var bar=document.createElement('div');bar.style.cssText='margin-top:12px;display:flex;gap:8px;justify-content:flex-end';
var copy=document.createElement('button');copy.textContent=${JSON.stringify(s.copy)};copy.style.cssText='padding:7px 16px;border-radius:6px;border:none;background:#6e8bff;color:#0b0e16;font-weight:700;cursor:pointer';
copy.onclick=function(){ta.select();try{navigator.clipboard.writeText(blob)}catch(e){document.execCommand('copy')}copy.textContent=${JSON.stringify(s.copied)};};
var close=document.createElement('button');close.textContent=${JSON.stringify(s.close)};close.style.cssText='padding:7px 16px;border-radius:6px;border:1px solid #283047;background:transparent;color:#eaeef7;cursor:pointer';
close.onclick=function(){ov.remove()};
bar.appendChild(copy);bar.appendChild(close);
card.appendChild(h);card.appendChild(ta);card.appendChild(bar);ov.appendChild(card);
document.body.appendChild(ov);ta.select();
}catch(e){alert(${JSON.stringify(s.failed)}+(e&&e.message?e.message:e));}})();`;
}

const VERDICT_META = {
  'real weakness': { key: 'vWeak', cls: 'dis', icon: '🔴' },
  'overperforming': { key: 'vStrong', cls: 'adv', icon: '🟢' },
  'small sample': { key: 'vSmall', cls: 'dim', icon: '⚪' },
  'on par': { key: 'vOnPar', cls: 'even', icon: '➖' },
};

function scoutMsg(text, isErr = false) { scoutStatus = text ? { text, isErr } : null; }

const ROSTER_NAMES = () => Object.keys(SLUG_BY_NAME);

// parse a pasted bookmarklet/__NEXT_DATA__ blob, merge into state, pick your main
function ingestPayloadText(text) {
  text = (text || '').trim();
  if (!text) return;
  let payload;
  try { payload = JSON.parse(text); }
  catch (e) { scoutMsg(t('scoutBadJson'), true); render(); return; }
  let parsed;
  try { parsed = parsePayload(payload, ROSTER_NAMES()); }
  catch (e) { scoutMsg(t('scoutBadPayload'), true); render(); return; }
  loadParsedRows(parsed);
}

function ingestCsvFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let rows;
    try { rows = csvToRows(String(reader.result)); }
    catch (e) { scoutMsg(t('scoutBadCsv'), true); render(); return; }
    loadParsedRows(rows);
  };
  reader.onerror = () => { scoutMsg(t('scoutBadCsv'), true); render(); };
  reader.readAsText(file);
}

function loadParsedRows(parsed) {
  if (!parsed || !parsed.length) { scoutMsg(t('scoutNoMatches'), true); render(); return; }
  const before = state.personalRows.length;
  state.personalRows = mergeRows(state.personalRows, parsed);
  const added = state.personalRows.length - before;
  const tgl = $('#personal-toggle'); if (tgl) tgl.disabled = false;   // enable Personal mode
  scoutMsg(t('scoutLoaded', { added, total: state.personalRows.length }));
  const main = mostPlayed(state.personalRows);
  if (main && idx[main]) selectChar(main);   // selectChar re-renders
  else render();
}

function clearScoutData() {
  state.personalRows = [];
  state.personalMode = false;
  const tgl = $('#personal-toggle'); if (tgl) { tgl.checked = false; tgl.disabled = true; }
  scoutMsg(null); render();
}

function downloadScoutCsv() {
  const blob = new Blob([rowsToCsv(state.personalRows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sf6_personal_battlelog.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function scoutInputsHtml(compact) {
  // compact = inline "add more" affordance shown above a loaded table
  return `<div class="scout-inputs ${compact ? 'compact' : ''}">
    <div class="scout-method">
      <span class="scout-step">1</span>
      <div class="scout-method-body">
        <span class="scout-method-title">${t('scoutBmTitle')}</span>
        <p class="scout-method-hint">${t('scoutBmHint')}</p>
        <a class="scout-bm" id="scout-bm" href="#" draggable="true">⚡ ${t('scoutBmLabel')}</a>
      </div>
    </div>
    <div class="scout-method">
      <span class="scout-step">2</span>
      <div class="scout-method-body">
        <span class="scout-method-title">${t('scoutPasteTitle')}</span>
        <p class="scout-method-hint">${t('scoutPasteHint')}</p>
        <textarea class="scout-paste" id="scout-paste" rows="3" placeholder="${t('scoutPastePlaceholder')}"></textarea>
        <div class="scout-paste-row">
          <button class="scout-go" id="scout-paste-go">${t('scoutGo')}</button>
          <label class="scout-upload">${t('scoutUpload')}<input type="file" id="scout-file" accept=".csv" hidden></label>
        </div>
      </div>
    </div>
  </div>`;
}

function scoutStatusHtml() {
  if (!scoutStatus) return '';
  const html = `<p class="scout-msg ${scoutStatus.isErr ? 'err' : 'ok'}">${scoutStatus.text}</p>`;
  scoutStatus = null;   // show once
  return html;
}

function scoutVerdictCell(verdict) {
  const m = VERDICT_META[verdict];
  return `<span class="sc-verdict ${m.cls}">${m.icon} ${t(m.key)}</span>`;
}

// best pocket vs one opponent = the character with the highest GLOBAL matchup score
// against `opp` (an actual edge, > 5.0), excluding your main + the excluded set.
function bestPocket(opp) {
  const ex = exclude();
  let best = null, bestScore = 5.0;
  for (const sub of Object.keys(idx)) {
    if (sub === state.char || ex.has(sub)) continue;
    const sc = combinedRow(idx, sub, state.monthW, ex, state.tierW)[opp];
    if (sc != null && sc > bestScore) { bestScore = sc; best = sub; }
  }
  return best ? { sub: best, score: bestScore } : null;
}

// pocket cell: only where you underperform (shrunk < baseline). The jump control
// is a role=button span — the row itself is a <button>, so a nested <button> would
// be invalid markup.
function scoutPocketCell(r) {
  if (r.shrunk >= r.baseline) return `<span class="sc-pocket">—</span>`;
  const p = bestPocket(r.opp);
  return p
    ? `<span class="sc-pocket"><span class="sc-pocket-go" role="button" tabindex="0" data-pocket="${p.sub}">${cn(p.sub)} <i>${p.score.toFixed(2)}</i> →</span></span>`
    : `<span class="sc-pocket">${t('scoutNoPocket')}</span>`;
}

function scoutTableHtml(results) {
  const pct = p => (p * 100).toFixed(1) + '%';
  const head = `<div class="sc-row sc-head">
    <span class="sc-opp">${t('scoutOpp')}</span>
    <span class="sc-wl">${t('scoutWL')}</span>
    <span class="sc-raw">${t('scoutRaw')}</span>
    <span class="sc-shrunk">${t('scoutShrunk')}</span>
    <span class="sc-base">${t('scoutBaseline')}</span>
    <span class="sc-verd">${t('scoutVerdict')}</span>
    <span class="sc-pocket">${t('scoutPocket')}</span>
  </div>`;
  const rows = results.map(r => {
    const raw = r.n ? r.wins / r.n : 0;
    return `<button class="sc-row" data-char="${r.opp}" title="${t('chipHint')}">
      <span class="sc-opp"><img class="sc-avatar" src="${imgSrc(r.opp)}" alt="" onerror="this.style.display='none'">${cn(r.opp)}</span>
      <span class="sc-wl">${r.wins}–${r.losses}</span>
      <span class="sc-raw">${pct(raw)}</span>
      <span class="sc-shrunk">${pct(r.shrunk)} <small>[${pct(r.lo)}–${pct(r.hi)}]</small></span>
      <span class="sc-base">${pct(r.baseline)}</span>
      <span class="sc-verd">${scoutVerdictCell(r.verdict)}</span>
      ${scoutPocketCell(r)}
    </button>`;
  }).join('');
  return `<div class="sc-table">${head}${rows}</div>`;
}

function renderScout() {
  $('#reliab-legend').hidden = true;
  $('#hero-summary').innerHTML = '';

  if (!state.personalRows.length) {
    $('#caption').innerHTML = t('scoutIntro');
    $('#lanes').innerHTML = scoutStatusHtml() + scoutInputsHtml(false);
    wireScoutInputs();
    return;
  }

  const rows = state.personalRows;
  const myChars = [...new Set(rows.map(r => r.your_char))]
    .sort((a, b) => rows.filter(r => r.your_char === b).length - rows.filter(r => r.your_char === a).length);
  const char = state.char;
  const agg = aggregate(rows, char);
  const baseline = baselineWinrates(idx, char, state.monthW, exclude(), state.tierW);
  const results = scout(agg, baseline);

  // data summary bar: match count, your-character quick switches, manage buttons
  const charChips = myChars.map(c => {
    const n = rows.filter(r => r.your_char === c).length;
    return `<button class="sc-mychar ${c === char ? 'active' : ''}" data-mychar="${c}">${cn(c)} <i>${n}</i></button>`;
  }).join('');
  const summary = `<div class="sc-bar">
    <span class="sc-count"><b>${rows.length}</b> ${t('scoutMatches')}</span>
    <span class="sc-playing">${t('scoutPlaying')}</span>
    <span class="sc-mychars">${charChips}</span>
    <span class="sc-actions">
      <button class="sc-action" id="scout-add">${t('scoutAddMore')}</button>
      <button class="sc-action" id="scout-dl">${t('scoutDownload')}</button>
      <button class="sc-action danger" id="scout-clear">${t('scoutClear')}</button>
    </span>
  </div>`;

  $('#caption').innerHTML = t('scoutCaptionLoaded', { char: cn(char), n: rows.length });

  let body;
  if (!results.length) {
    body = `<p class="lane-empty">${t('scoutNoGames', { char: cn(char) })}</p>`;
  } else {
    const weaknesses = results.filter(r => r.verdict === 'real weakness').map(r => cn(r.opp));
    const headline = weaknesses.length
      ? `<span class="sc-headline dis">${t('scoutTopWeak')}: ${weaknesses.slice(0, 3).join(' · ')}</span>`
      : `<span class="sc-headline adv">${t('scoutNoWeak')}</span>`;
    body = `<div class="sc-headline-wrap">${headline}</div>` + scoutTableHtml(results);
  }

  $('#lanes').innerHTML = summary + scoutStatusHtml() +
    `<div class="sc-addpanel" id="scout-addpanel" hidden>${scoutInputsHtml(true)}</div>` + body;

  wireScoutInputs();
  wireChips();
  document.querySelectorAll('#lanes .sc-pocket-go').forEach(el => {
    const go = e => { e.stopPropagation(); if (idx[el.dataset.pocket]) openCharCard(el.dataset.pocket, el); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
  });
  document.querySelectorAll('#lanes .sc-mychar').forEach(b =>
    b.addEventListener('click', () => selectChar(b.dataset.mychar)));
  $('#scout-add')?.addEventListener('click', () => {
    const p = $('#scout-addpanel'); if (p) p.hidden = !p.hidden;
  });
  $('#scout-dl')?.addEventListener('click', downloadScoutCsv);
  $('#scout-clear')?.addEventListener('click', clearScoutData);
}

function wireScoutInputs() {
  const bm = $('#scout-bm');
  if (bm) {
    bm.href = scoutBookmarklet({
      noProfile: t('bmNoProfile'), progress: t('bmProgress'), noMatches: t('bmNoMatches'),
      done: t('bmDone'), copy: t('bmCopy'), copied: t('bmCopied'), close: t('bmClose'), failed: t('bmFailed'),
    });
    // clicking it here would run in our origin (CORS-blocked) — it's meant to be
    // dragged to the bookmarks bar and clicked on the Buckler site instead.
    bm.addEventListener('click', e => { e.preventDefault(); scoutMsg(t('scoutBmDrag')); render(); });
  }
  $('#scout-paste-go')?.addEventListener('click', () => ingestPayloadText($('#scout-paste')?.value));
  $('#scout-file')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (f) ingestCsvFile(f);
  });
}

const strCls = s => s >= 5.05 ? 't-adv' : s <= 4.95 ? 't-dis' : '';
const divCls = v => v >= 0.15 ? 't-adv' : v >= 0 ? 't-sadv' : 't-dis';

// one leaderboard row: rank, name, diverging COVER bar, then COVER/SPEC/STR + cues.
// the bar always tracks COVER (covers > 0 / shares < 0), independent of sort key.
function subRow(r, i, cover, maxAbs) {
  const pct = Math.min(100, Math.abs(cover) / maxAbs * 100);
  const corrCls = r.corr <= -0.1 ? 'good' : r.corr >= 0.1 ? 'bad' : '';
  const medal = i < 3 ? ` lb-medal-${i + 1}` : '';
  const title = `${t('hCover')} ${sfmt(cover)} · ${t('hSpec')} ${sfmt(r.spec)} · ${t('hStr')} ${fmt(r.strength, 3)} · ${t('hCorr')} ${sfmt(r.corr, 2)} · patches ${r.pairPatched}/${r.pairLosses}, roster covers ${r.pairCovered}/${r.pairTotal} · ${t('chipHint')}`;
  return `<button class="lb-row${medal}" data-char="${r.sub}" title="${title}">
    <span class="lb-rank">${i + 1}</span>
    <span class="lb-name"><img class="lb-avatar" src="${imgSrc(r.sub)}" alt="" loading="lazy" onerror="this.style.display='none'">${cn(r.sub)}</span>
    <span class="lb-track">
      <span class="lb-fill ${cover >= 0 ? 'pos' : 'neg'} ${divCls(cover)}" style="width:${pct / 2}%"></span>
    </span>
    <span class="lb-cover ${divCls(cover)}">${sfmt(cover)}</span>
    <span class="lb-spec ${divCls(r.spec)}">${sfmt(r.spec)}</span>
    <span class="lb-str ${strCls(r.strength)}">${fmt(r.strength, 2)}</span>
    <span class="lb-corr ${corrCls}">${sfmt(r.corr, 2)}</span>
    <span class="lb-shared">${r.shared}</span>
  </button>`;
}

function renderSubs() {
  $('#reliab-legend').hidden = true;
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW, exclude(),
    state.tierW, state.oppW, activeUsage(state.char), personalActive() ? activeRow(state.char) : undefined);
  const cover = r => state.rank === 'comb' ? r.cover : r['c' + state.rank];
  const sortVal = r => state.subSort === 'spec' ? r.spec
    : state.subSort === 'str' ? r.strength : cover(r);
  const ranked = results.filter(r => cover(r) !== null).sort((a, b) => sortVal(b) - sortVal(a));

  const top = ranked.slice().sort((a, b) => cover(b) - cover(a))[0];
  // complement is drawn from the ranked (visible) set so it can't name a
  // character that was filtered out of the leaderboard.
  const compl = ranked.slice().sort((a, b) => a.corr - b.corr)[0];
  // best duo partner = the one that patches the most of the main's losing matchups
  // (tie-break by roster coverage), per the pair-coverage metric.
  const duo = ranked.slice().sort((a, b) =>
    (b.pairPatched - a.pairPatched) || (b.pairCovered - a.pairCovered))[0];
  const duoPct = duo ? Math.round(duo.pairCovered / duo.pairTotal * 100) : 0;
  $('#hero-summary').innerHTML = (top && compl) ?
    `<span class="sum adv">${t('kTopSub')}: ${cn(top.sub)} ${sfmt(cover(top))}</span>` +
    `<span class="sum even">${t('kComplement')}: ${cn(compl.sub)} r${sfmt(compl.corr, 2)}</span>` +
    `<span class="sum adv" title="${t('patchHint')}">${t('kDuo')}: ${cn(state.char)} + ${cn(duo.sub)} → ${duo.pairCovered}/${duo.pairTotal} (${duoPct}%)</span>` : '';

  $('#caption').innerHTML = t('headSubs', {
    char: cn(state.char),
    worst3: worst3.map(o => `<b>${cn(o)}</b> ${mainRow[o].toFixed(3)}`).join(' · '),
    metric: `${t('hCover')}${state.rank === 'comb' ? '' : '@' + t('rankFull')[state.rank]}`,
  });
  if (personalActive() && !Object.keys(aggregate(state.personalRows, state.char)).length) {
    $('#caption').innerHTML += ` <b>${t('personalNoGames', { char: cn(state.char) })}</b>`;
  }

  if (!ranked.length) { $('#lanes').innerHTML = `<div class="lane-empty">${t('tierEmpty')}</div>`; return; }
  const maxAbs = Math.max(0.05, ...ranked.map(r => Math.abs(cover(r))));
  const sortable = (key, label, hint) => {
    const on = state.subSort === key;
    return `<span class="lb-${key} lb-sort${on ? ' active' : ''}" data-sort="${key}" role="button" tabindex="0" title="${hint} · ${t('sortHint')}">${label}${on ? ' ▾' : ''}</span>`;
  };
  const head = `<div class="lb-head">
    <span class="lb-rank">#</span>
    <span class="lb-name">${t('axisSub')}</span>
    <span class="lb-track-head">◄ ${t('hShared')} · ${t('hCover')} ►</span>
    ${sortable('cover', t('hCover'), t('hCover'))}
    ${sortable('spec', t('hSpec'), t('specHint'))}
    ${sortable('str', t('hStr'), t('strHint'))}
    <span class="lb-corr" title="${t('corrHint')}">${t('hCorr')}</span>
    <span class="lb-shared">${t('hShared')}</span>
  </div>`;
  $('#lanes').innerHTML = `<div class="lb">${head}${ranked.map((r, i) => subRow(r, i, cover(r), maxAbs)).join('')}</div>`;
  wireSubSort();
  wireChips();
}

function wireSubSort() {
  document.querySelectorAll('.lb-sort').forEach(el => {
    const go = () => { state.subSort = el.dataset.sort; render(); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

function wireChips() {
  document.querySelectorAll('#lanes [data-char]').forEach(el =>
    el.addEventListener('click', () => {
      const c = el.dataset.char;
      if (idx[c]) openCharCard(c, el);   // open the character detail card
    }));
}

// bootstrap last, so every top-level const/let is initialized before init()→render()
// runs (the standalone build calls init() synchronously — no fetch await to yield on).
init();
