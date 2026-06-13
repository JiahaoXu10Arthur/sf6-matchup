/* v2 tier-list renderer. Reuses scoring.js (math) + i18n.js (strings/names/roster);
   only the presentation differs from v1 (chips grouped into matchup bands). */

const state = {
  view: 'match',
  char: 'TERRY',
  rank: 'comb',
  preset: 'current',
  monthW: {},
  tierW: { 40: 3, 41: 2, 42: 1 },
  includeIngrid: false,
};

let idx = null;
let months = [];

const $ = sel => document.querySelector(sel);
const DEFAULT_TIER = { 40: 3, 41: 2, 42: 1 };

// official Buckler bands, rendered worst-first (top to bottom)
const MATCH_TIERS = [
  { lo: -Infinity, hi: 4.7, label: 'tierDis', cls: 't-dis' },
  { lo: 4.7, hi: 4.9, label: 'tierSlightDis', cls: 't-sdis' },
  { lo: 4.9, hi: 5.1, label: 'tierEven', cls: 't-even' },
  { lo: 5.1, hi: 5.3, label: 'tierSlightAdv', cls: 't-sadv' },
  { lo: 5.3, hi: Infinity, label: 'tierAdv', cls: 't-adv' },
];

// sub-coverage bands (best cover first)
const SUB_TIERS = [
  { lo: 0.15, hi: Infinity, label: 'subStrong', cls: 't-adv' },
  { lo: 0.0, hi: 0.15, label: 'subModerate', cls: 't-sadv' },
  { lo: -Infinity, hi: 0.0, label: 'subShares', cls: 't-dis' },
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
  state.monthW = monthWeights(months, 'current', PATCH_MONTH);
  $('#loading').remove();
  buildCharSelect();
  buildMonthSliders();
  buildTierSliders();
  wireControls();
  render();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach(el => el.innerHTML = t(el.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-rank]').forEach(el => el.textContent = t('rank')[el.dataset.i18nRank]);
  document.querySelectorAll('.lang-switch button').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  $('#view-label').textContent = t(state.view === 'match' ? 'labelMatch' : 'labelSubs');
  $('#char-name').textContent = cn(state.char);
  document.querySelectorAll('#char-select option').forEach(o => o.textContent = cn(o.value));
}

function exclude() { return state.includeIngrid ? new Set() : new Set(['INGRID']); }

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

function sliderRow(name, value, max, step, onInput) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `<span class="slider-name">${name}</span>
    <input type="range" min="0" max="${max}" step="${step}" value="${value}" aria-label="${name} weight">
    <span class="slider-val">${value}</span>`;
  const input = row.querySelector('input');
  const val = row.querySelector('.slider-val');
  input.addEventListener('input', () => { val.textContent = input.value; onInput(parseFloat(input.value)); });
  return row;
}

function buildMonthSliders() {
  const box = $('#month-sliders');
  box.textContent = '';
  for (const m of months) {
    box.appendChild(sliderRow(`${m.slice(0, 4)}.${m.slice(4)}`, state.monthW[m], 1, 0.05, v => {
      state.monthW[m] = v; setPreset('custom'); render();
    }));
  }
}

function buildTierSliders() {
  const box = $('#tier-sliders');
  box.textContent = '';
  for (const r of ['40', '41', '42']) {
    box.appendChild(sliderRow(t('rankFull')[r], state.tierW[r], 5, 0.5, v => { state.tierW[r] = v; render(); }));
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
  state.includeIngrid = false;
  setPreset('current');
  state.monthW = monthWeights(months, 'current', PATCH_MONTH);
  document.querySelectorAll('.rank-tabs button').forEach(x => {
    const on = x.dataset.rank === 'comb';
    x.classList.toggle('active', on); x.setAttribute('aria-selected', on);
  });
  $('#include-ingrid').checked = false;
  buildMonthSliders();
  buildTierSliders();
  render();
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
        x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b);
      });
      $('#view-label').textContent = t(state.view === 'match' ? 'labelMatch' : 'labelSubs');
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

  $('#include-ingrid').addEventListener('change', e => { state.includeIngrid = e.target.checked; render(); });
  $('#reset-btn').addEventListener('click', resetDefaults);
}

/* ---------- tier rendering ---------- */

function render() {
  updateTierState();
  if (state.view === 'match') renderMatch(); else renderSubs();
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

function matchChip(r, metric) {
  const v = metric(r);
  const tierCls = MATCH_TIERS.find(tr => v >= tr.lo && v < tr.hi).cls;
  const trend = r.dpatch === null ? ''
    : r.dpatch <= -0.1 ? '<span class="chip-trend dn">↓</span>'
    : r.dpatch >= 0.1 ? '<span class="chip-trend up">↑</span>' : '';
  const flag = r.spread > 0.25 ? `<span class="chip-flag" title="${t('spreadFlag')}">⚠</span>` : '';
  const title = `High ${fmt(r.t40)} · Grand ${fmt(r.t41)} · Ult ${fmt(r.t42)} · Δ ${sfmt(r.dpatch)} · ${t('chipHint')}`;
  return `<button class="chip ${tierCls}" data-char="${r.opp}" title="${title}">
    <span class="chip-name">${cn(r.opp)}</span>
    <span class="chip-score">${fmt(v, 2)}</span>${trend}${flag}
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

  wireChips();
}

function subChip(r, metric) {
  const v = metric(r);
  const corrCls = r.corr <= -0.1 ? 'good' : r.corr >= 0.1 ? 'bad' : '';
  const title = `w3 ${fmt(r.w3win, 1)}% · corr ${sfmt(r.corr, 2)} · shared ${r.shared} · ${t('chipHint')}`;
  return `<button class="chip" data-char="${r.sub}" title="${title}">
    <span class="chip-name">${cn(r.sub)}</span>
    <span class="chip-score">${sfmt(v, 2)}</span>
    <span class="chip-corr ${corrCls}">r${sfmt(r.corr, 2)}</span>
  </button>`;
}

function renderSubs() {
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW, exclude(), state.tierW);
  const metric = r => state.rank === 'comb' ? r.cover : r['c' + state.rank];

  const top = results.slice().sort((a, b) => metric(b) - metric(a))[0];
  const compl = results.slice().sort((a, b) => a.corr - b.corr)[0];
  $('#hero-summary').innerHTML = top ?
    `<span class="sum adv">${t('kTopSub')}: ${cn(top.sub)} ${sfmt(metric(top))}</span>` +
    `<span class="sum even">${t('kComplement')}: ${cn(compl.sub)} r${sfmt(compl.corr, 2)}</span>` : '';

  $('#caption').innerHTML = t('headSubs', {
    char: cn(state.char),
    worst3: worst3.map(o => `<b>${cn(o)}</b> ${mainRow[o].toFixed(3)}`).join(' · '),
    metric: `${t('hCover')}${state.rank === 'comb' ? '' : '@' + t('rankFull')[state.rank]}`,
  });

  $('#lanes').innerHTML = SUB_TIERS.map(tier => {
    const inTier = results.filter(r => metric(r) >= tier.lo && metric(r) < tier.hi)
                          .sort((a, b) => metric(b) - metric(a));
    return laneHtml(tier, inTier.map(r => subChip(r, metric)));
  }).join('');

  wireChips();
}

function wireChips() {
  document.querySelectorAll('.chip[data-char]').forEach(chip =>
    chip.addEventListener('click', () => {
      const c = chip.dataset.char;
      if (idx[c]) selectChar(c);   // drill into that character's matchups
    }));
}
