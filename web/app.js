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
};

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

init();

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
    : state.view === 'scatter' ? 'labelScatter' : 'labelMatch');
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
  const active = months.filter(m => (state.monthW[m] ?? 0) > 0);
  return { ...usageWeights(usageRates(usageCsv, active, 36)), ...state.usageW };
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

  $('#reset-btn').addEventListener('click', resetDefaults);
}

/* ---------- tier rendering ---------- */

const VIEW_LABEL = { match: 'labelMatch', bars: 'labelBars', subs: 'labelSubs', scatter: 'labelScatter' };

function render() {
  updateTierState();
  paintUsageBadges();
  if (state.view === 'match') renderMatch();
  else if (state.view === 'bars') renderBars();
  else if (state.view === 'scatter') renderScatter();
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
  return `<button class="chip ${tierCls}" data-char="${r.opp}" title="${title}">
    <img class="chip-avatar" src="${imgSrc(r.opp)}" alt="" loading="lazy" onerror="this.style.display='none'">
    <span class="chip-name">${cn(r.opp)}</span>
    <span class="chip-score">${fmt(v, 2)}</span>${trend}${pip}
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
  return `<div class="row" data-char="${r.opp}">
    <span class="name"><img class="row-avatar" src="${imgSrc(r.opp)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="row-name-text">${cn(r.opp)}${flag}</span></span>
    <div class="bar-track"><div class="bar ${barCls}" style="transform:scaleX(${Math.abs(frac)})"></div></div>
    <div class="nums">
      <span class="col-main ${v >= 5 ? 'adv' : 'dis'}">${fmt(v, 2)}</span>
      <span class="col-sub">Δ ${sfmt(r.dpatch)}</span>
      <span class="col-sub">${r.nmonths}/${months.length}${t('moSuffix')}</span>
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
  const axisHtml = `<span>${t('axisOpponent')}</span>` +
    `<span class="axis-bar"><span>${t('axisLosing')}</span><span>${t('axisEven')}</span><span>${t('axisWinning')}</span></span>` +
    `<div class="nums"><span class="col-main">${t('hScore')}</span><span class="col-sub">${t('hDpatch')}</span><span class="col-sub">${t('hMo')}</span></div>`;

  $('#lanes').innerHTML =
    `<div class="bars"><div class="kpis">${kpiHtml}</div><div class="axis">${axisHtml}</div>` +
    `<div class="rows">${rows.map(r => barRowHtml(r, metric)).join('')}</div></div>`;

  document.querySelectorAll('#lanes .row[data-char]').forEach(el =>
    el.addEventListener('click', () => selectChar(el.dataset.char)));
}

/* ---------- usage × win-rate scatter (cast-wide) ---------- */

const winCls = w => w >= 50.1 ? 't-adv' : w <= 49.9 ? 't-dis' : 't-even';

function renderScatter() {
  $('#reliab-legend').hidden = true;
  const ex = exclude();
  const active = months.filter(m => (state.monthW[m] ?? 0) > 0);
  const rates = usageCsv ? usageRates(usageCsv, active, 36) : {};

  const pts = [];
  for (const c of Object.keys(idx)) {
    if (ex.has(c)) continue;
    const row = combinedRow(idx, c, state.monthW, ex, state.tierW);
    if (!Object.keys(row).length || rates[c] == null) continue;
    pts.push({ char: c, usage: rates[c], win: strength(row) * 10, pol: polarization(row) });
  }

  $('#hero-summary').innerHTML = '';
  $('#caption').innerHTML = t('scatterCaption');

  if (pts.length < 2) {
    $('#lanes').innerHTML = `<div class="lane-empty">${t('scatterEmpty')}</div>`;
    return;
  }

  const W = 860, H = 560, m = { l: 70, r: 28, t: 44, b: 58 };
  const xs = pts.map(p => p.usage), ys = pts.map(p => p.win);
  const xmax = Math.max(...xs) * 1.08;
  const pad = 0.18;
  const ymin = Math.min(...ys) - pad, ymax = Math.max(...ys) + pad;
  const px = u => m.l + u / xmax * (W - m.l - m.r);
  const py = w => H - m.b - (w - ymin) / (ymax - ymin) * (H - m.t - m.b);
  const sorted = [...xs].sort((a, b) => a - b);
  const medUsage = sorted[Math.floor(sorted.length / 2)];

  const xMid = px(medUsage), yMid = py(50);
  const x0 = px(0), x1 = px(xmax), yTop = py(ymax), yBot = py(ymin);

  // quadrant background tints (only when the 50% line is within view)
  const quads = (yMid > yTop && yMid < yBot) ? `
    <rect x="${xMid}" y="${yTop}" width="${x1 - xMid}" height="${yMid - yTop}" class="quad q-pop"/>
    <rect x="${x0}" y="${yTop}" width="${xMid - x0}" height="${yMid - yTop}" class="quad q-sleep"/>
    <rect x="${xMid}" y="${yMid}" width="${x1 - xMid}" height="${yBot - yMid}" class="quad q-over"/>
    <rect x="${x0}" y="${yMid}" width="${xMid - x0}" height="${yBot - yMid}" class="quad q-rare"/>` : '';

  const quadLabel = (key, x, y, anchor) =>
    `<text class="quad-label" x="${x}" y="${y}" text-anchor="${anchor}">${t(key)}</text>`;
  const quadLabels = (yMid > yTop && yMid < yBot) ? `
    ${quadLabel('quadStrongPop', x1 - 8, yTop + 18, 'end')}
    ${quadLabel('quadSleeper', x0 + 8, yTop + 18, 'start')}
    ${quadLabel('quadOverrated', x1 - 8, yBot - 10, 'end')}
    ${quadLabel('quadWeakRare', x0 + 8, yBot - 10, 'start')}` : '';

  // axis ticks
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

  // point radius encodes polarization (matchup-row std): bigger = feast-or-famine.
  const pols = pts.map(p => p.pol), polMax = Math.max(...pols, 0.01);
  const R_MIN = 4, R_MAX = 9;
  const radius = pol => R_MIN + pol / polMax * (R_MAX - R_MIN);

  const dots = pts.map(p => {
    const sel = p.char === state.char;
    const cx = px(p.usage), cy = py(p.win), r = radius(p.pol);
    const title = `${cn(p.char)} · ${p.usage.toFixed(1)}% used · ${p.win.toFixed(2)}% win · ${t('polLabel')} ${p.pol.toFixed(2)}`;
    return `<g class="pt ${winCls(p.win)} ${sel ? 'sel' : ''}" data-char="${p.char}">
      <title>${title}</title>
      <circle cx="${cx}" cy="${cy}" r="${sel ? r + 2 : r}"/>
      <text class="pt-label" x="${cx + r + 3}" y="${cy + 3.5}">${cn(p.char)}</text>
    </g>`;
  }).join('');

  $('#lanes').innerHTML = `
    <div class="scatter-wrap">
      <svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('labelScatter')}" preserveAspectRatio="xMidYMid meet">
        ${quads}
        ${xticks}${yticks}
        <line class="axis-ref" x1="${x0}" y1="${yMid}" x2="${x1}" y2="${yMid}"/>
        <line class="axis-ref dashed" x1="${xMid}" y1="${yTop}" x2="${xMid}" y2="${yBot}"/>
        <line class="axis" x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}"/>
        <line class="axis" x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}"/>
        ${quadLabels}
        <text class="axis-title" x="${(x0 + x1) / 2}" y="${H - 10}" text-anchor="middle">${t('scatterAxisUsage')}</text>
        <text class="axis-title" transform="rotate(-90 16 ${(yTop + yBot) / 2})" x="16" y="${(yTop + yBot) / 2}" text-anchor="middle">${t('scatterAxisWin')}</text>
        ${dots}
      </svg>
    </div>`;

  $('#lanes').querySelectorAll('.pt').forEach(g =>
    g.addEventListener('click', () => selectChar(g.dataset.char)));
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
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW, exclude(), state.tierW, state.oppW, usageMap());
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
      if (idx[c]) selectChar(c);   // drill into that character's matchups
    }));
}
