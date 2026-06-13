/* v2 tier-list renderer. Reuses scoring.js (math) + i18n.js (strings/names/roster);
   only the presentation differs from v1 (chips grouped into matchup bands). */

const state = {
  view: 'match',
  char: 'TERRY',
  rank: 'comb',
  preset: 'current',
  monthW: {},
  tierW: { 40: 1, 41: 2, 42: 3 },
  oppW: { INGRID: 0 },    // per-opponent weight (sparse; absent = 1). 0 = exclude, >1 = target
  subSort: 'cover',       // sub-finder ranking key: 'cover' | 'spec' | 'str'
};

let idx = null;
let months = [];

const $ = sel => document.querySelector(sel);
const DEFAULT_TIER = { 40: 1, 41: 2, 42: 3 };
const MONTH_STEP = 0.25;  // per-click increment for month-weight steppers (0..1)

IMG_BASE = '../web/img/';   // headshots live under web/; v2 reaches back into it

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
  $('#view-label').textContent = t(state.view === 'match' ? 'labelMatch' : 'labelSubs');
  $('#char-name').textContent = cn(state.char);
  setAvatar($('#char-avatar'), state.char);
  document.querySelectorAll('#char-select option').forEach(o => o.textContent = cn(o.value));
  document.querySelectorAll('#exclude-chips .opp-w').forEach(el =>
    el.querySelector('.opp-name').textContent = cn(el.dataset.char));
}

function exclude() { return new Set(Object.keys(state.oppW).filter(c => state.oppW[c] === 0)); }

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
    <input type="range" min="0" max="${max}" step="${step}" value="${value}" aria-label="${name} weight">
    <span class="slider-val">${value}</span>`;
  const input = row.querySelector('input');
  const val = row.querySelector('.slider-val');
  input.addEventListener('input', () => { val.textContent = input.value; onInput(parseFloat(input.value)); });
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
        buildMonthSliders();
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
  state.oppW = { INGRID: 0 };
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
    <img class="chip-avatar" src="${imgSrc(r.opp)}" alt="" loading="lazy" onerror="this.style.display='none'">
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

const strCls = s => s >= 5.05 ? 't-adv' : s <= 4.95 ? 't-dis' : '';
const divCls = v => v >= 0.15 ? 't-adv' : v >= 0 ? 't-sadv' : 't-dis';

// one leaderboard row: rank, name, diverging COVER bar, then COVER/SPEC/STR + cues.
// the bar always tracks COVER (covers > 0 / shares < 0), independent of sort key.
function subRow(r, i, cover, maxAbs) {
  const pct = Math.min(100, Math.abs(cover) / maxAbs * 100);
  const corrCls = r.corr <= -0.1 ? 'good' : r.corr >= 0.1 ? 'bad' : '';
  const medal = i < 3 ? ` lb-medal-${i + 1}` : '';
  const title = `${t('hCover')} ${sfmt(cover)} · ${t('hSpec')} ${sfmt(r.spec)} · ${t('hStr')} ${fmt(r.strength, 3)} · ${t('hCorr')} ${sfmt(r.corr, 2)} · ${t('chipHint')}`;
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
  const { worst3, mainRow, results } = subTable(idx, state.char, state.monthW, exclude(), state.tierW, state.oppW);
  const cover = r => state.rank === 'comb' ? r.cover : r['c' + state.rank];
  const sortVal = r => state.subSort === 'spec' ? r.spec
    : state.subSort === 'str' ? r.strength : cover(r);
  const ranked = results.filter(r => cover(r) !== null).sort((a, b) => sortVal(b) - sortVal(a));

  const top = ranked.slice().sort((a, b) => cover(b) - cover(a))[0];
  // complement is drawn from the ranked (visible) set so it can't name a
  // character that was filtered out of the leaderboard.
  const compl = ranked.slice().sort((a, b) => a.corr - b.corr)[0];
  $('#hero-summary').innerHTML = (top && compl) ?
    `<span class="sum adv">${t('kTopSub')}: ${cn(top.sub)} ${sfmt(cover(top))}</span>` +
    `<span class="sum even">${t('kComplement')}: ${cn(compl.sub)} r${sfmt(compl.corr, 2)}</span>` : '';

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
