/* UI string dictionaries + language state. Math (scoring.js) is untouched. */

const STRINGS = {
  en: {
    kicker: 'CAPCOM BUCKLER DATA · MASTER+',
    viewMatch: 'Matchups',
    viewBars: 'Bars',
    viewSubs: 'Sub finder',
    viewScatter: 'Usage × Win',
    labelMatch: 'MATCHUPS',
    labelBars: 'BARS',
    labelSubs: 'SUB FINDER',
    labelScatter: 'USAGE × WIN%',
    scatterCaption: 'Every character — <b>usage rate</b> (how often they are played) vs <b>overall win rate</b>; <b>dot size</b> = polarization (how feast-or-famine their matchups are). The win-rate axis spans barely 1.5 points: the cast is tightly balanced, so quadrants matter more than exact position.',
    polLabel: 'polarization',
    scatterAxisUsage: 'Usage rate (%) →',
    scatterAxisWin: 'Overall win rate (%) →',
    quadStrongPop: 'Strong & popular',
    quadSleeper: 'Strong & slept-on',
    quadOverrated: 'Popular but losing',
    quadWeakRare: 'Weak & rare',
    scatterEmpty: 'Usage data unavailable for the selected months.',
    character: 'Character',
    rankView: 'Rank view',
    monthWeights: 'Month weights',
    tierWeights: 'Tier weights',
    combMix: '(COMB mix)',
    presetCurrent: 'current',
    presetAll: 'all',
    addMonth: '+ add month',
    exclude: 'Opponent weights',
    excludeHint: '0 = exclude · 1 = normal · 2–3 = target. Affects the Sub finder ranking.',
    usageWeight: 'Weight by usage',
    usageHint: 'Down-weight rarely-played opponents (√ of play rate) in the Sub finder.',
    footer: 'Scores are win-rate ÷ 10, centered at 5.0.<br>Data: official Capcom Buckler battle diagrams (Master+).',
    loading: 'Loading matrix…',
    loadError: 'Could not load ../output/matrix.csv — run build_matrix.py first.',
    reset: 'Reset to defaults',
    tierHint: 'COMB only — pick COMB above',
    rankComb: 'COMB',
    rank: { 36: 'Master', 40: 'High', 41: 'Grand', 42: 'Ult' },
    rankFull: { 36: 'Master', 40: 'High', 41: 'Grand', 42: 'Ultimate' },
    metricComb: 'COMB (tier-weighted)',
    headMatch: '<b>{char}</b> vs {n} · sorted worst-first · metric: <b>{metric}</b>',
    headSubs: 'Subs for <b>{char}</b> · worst 3: {worst3} · metric: <b>{metric}</b>',
    axisOpponent: 'OPPONENT',
    axisLosing: '◄ LOSING',
    axisEven: '5.0',
    axisWinning: 'WINNING ►',
    axisSub: 'SUB',
    axisShares: '◄ SHARES WEAKNESS',
    axisZero: '0',
    axisCovers: 'COVERS ►',
    hScore: 'SCORE', hDpatch: 'ΔPATCH', hMo: 'MO',
    hCover: 'COVER', hW3: 'W3%', hCorr: 'CORR', hShared: 'SHARED',
    hSpec: 'SPEC', hStr: 'STR',
    corrHint: 'Profile-shape similarity, not coverage — COVER is the ranking',
    specHint: 'Coverage relative to the sub\'s own average — a globally strong character nets ~0, so high SPEC = a genuine counter, not just a strong pick',
    strHint: 'The sub\'s overall mean matchup (tier proxy) — high STR = strong vs the whole cast',
    sortHint: 'click to sort',
    kHardest: 'Hardest', kDis: 'Disadvantages', kAdv: 'Advantages', kBest: 'Best',
    kTopSub: 'Top sub', kCovers: 'Cover weaknesses', kComplement: 'Most complementary',
    kDuo: 'Best duo', patchHint: 'patches N of your losing matchups; the main+sub roster covers X of the cast',
    tierAdv: 'Favorable', tierSlightAdv: 'Slight +', tierEven: 'Even',
    tierSlightDis: 'Slight −', tierDis: 'Unfavorable',
    subStrong: 'Strong cover', subModerate: 'Moderate cover', subShares: 'Shares weaknesses',
    tierEmpty: 'none', chipHint: 'click a character to scout them',
    spreadFlag: 'tier spread > 0.25',
    moSuffix: 'mo',
    reliabHigh: 'High confidence — full months, ranks agree',
    reliabMed: 'Medium confidence — fewer months or ranks disagree',
    reliabLow: 'Low confidence — thin data, read with caution',
    reliabLegend: 'Confidence (●●● high / ●●○ medium / ●○○ low) reflects months of data, rank coverage, and how much the skill brackets agree — not Capcom sample sizes, which are unpublished.',
  },
  zh: {
    kicker: 'CAPCOM BUCKLER 官方数据 · 大师段位以上',
    viewMatch: '相性表',
    viewBars: '柱状图',
    viewSubs: '副角推荐',
    viewScatter: '使用率 × 胜率',
    labelMatch: '相性表',
    labelBars: '柱状图',
    labelSubs: '副角推荐',
    labelScatter: '使用率 × 胜率',
    scatterCaption: '全角色 — <b>使用率</b>（被使用的频率）对比<b>总体胜率</b>；<b>点的大小</b> = 极化度（对局两极分化程度）。胜率轴的跨度仅约 1.5 个百分点：版本高度平衡，因此所处象限比精确位置更重要。',
    polLabel: '极化度',
    scatterAxisUsage: '使用率 (%) →',
    scatterAxisWin: '总体胜率 (%) →',
    quadStrongPop: '强势且热门',
    quadSleeper: '强势但冷门',
    quadOverrated: '热门但偏弱',
    quadWeakRare: '弱势且冷门',
    scatterEmpty: '所选月份无使用率数据。',
    character: '角色',
    rankView: '段位视图',
    monthWeights: '月份权重',
    tierWeights: '段位权重',
    combMix: '（综合配比）',
    presetCurrent: '当前版本',
    presetAll: '全部',
    addMonth: '+ 添加月份',
    exclude: '对手权重',
    excludeHint: '0 = 排除 · 1 = 正常 · 2–3 = 针对。影响副角推荐排序。',
    usageWeight: '按使用率加权',
    usageHint: '在副角推荐中降低冷门对手的权重（使用率的平方根）。',
    footer: '分数为胜率 ÷ 10，以 5.0 为中心。<br>数据来自 Capcom Buckler 官方对战相性图（大师段位以上）。',
    loading: '正在加载数据…',
    loadError: '无法加载 ../output/matrix.csv — 请先运行 build_matrix.py。',
    reset: '重置为默认',
    tierHint: '仅综合 — 请在上方选择综合',
    rankComb: '综合',
    rank: { 36: 'Master', 40: 'High', 41: 'Grand', 42: 'Ult' },
    rankFull: { 36: 'Master', 40: 'High', 41: 'Grand', 42: 'Ultimate' },
    metricComb: '综合（段位加权）',
    headMatch: '<b>{char}</b> 对阵 {n} 名角色 · 按最不利排序 · 指标：<b>{metric}</b>',
    headSubs: '<b>{char}</b> 的副角推荐 · 最难对局前 3：{worst3} · 指标：<b>{metric}</b>',
    axisOpponent: '对手',
    axisLosing: '◄ 劣势',
    axisEven: '5.0',
    axisWinning: '优势 ►',
    axisSub: '副角',
    axisShares: '◄ 同样弱势',
    axisZero: '0',
    axisCovers: '补强 ►',
    hScore: '分数', hDpatch: '补丁差', hMo: '月份',
    hCover: '补强', hW3: '前3胜率', hCorr: '相关', hShared: '共弱',
    hSpec: '专精', hStr: '强度',
    corrHint: '相性曲线形态相似度，非补强程度 —— 排序依据是 COVER',
    specHint: '相对副角自身平均的补强程度 —— 全面强势的角色趋近 0，因此专精高 = 真正针对你弱点的角色，而非单纯的强角',
    strHint: '副角的总体平均相性（强度代理）—— 强度高 = 对全阵容都强',
    sortHint: '点击排序',
    kHardest: '最难对局', kDis: '劣势数', kAdv: '优势数', kBest: '最优对局',
    kTopSub: '最佳副角', kCovers: '可补强弱点', kComplement: '最互补',
    kDuo: '最佳搭档', patchHint: '可补强你 N 个劣势对局；主角 + 副角的组合覆盖全角色中的 X 个',
    tierAdv: '有利', tierSlightAdv: '微有利', tierEven: '五分',
    tierSlightDis: '微不利', tierDis: '不利',
    subStrong: '强力补强', subModerate: '一般补强', subShares: '同样弱势',
    tierEmpty: '无', chipHint: '点击角色查看其对局',
    spreadFlag: '段位间差异 > 0.25',
    moSuffix: '月',
    reliabHigh: '高可信度 — 月份充足，各段位一致',
    reliabMed: '中等可信度 — 月份偏少或各段位存在分歧',
    reliabLow: '低可信度 — 数据较薄，请谨慎参考',
    reliabLegend: '可信度（●●● 高 / ●●○ 中 / ●○○ 低）反映数据月份数、段位覆盖以及各段位的一致程度——并非 Capcom 的样本量（官方未公开）。',
  },
};

/* Official SF6 simplified-Chinese character names (Year 3 chars use the
   common community transliterations). Keys are the matrix's display names. */
const CHAR_ZH = {
  'RYU': '隆', 'LUKE': '卢克', 'JAMIE': '杰米', 'CHUN-LI': '春丽',
  'GUILE': '古烈', 'KIMBERLY': '金佰莉', 'JURI': '韩蛛俐', 'KEN': '肯',
  'BLANKA': '布兰卡', 'DHALSIM': '达尔西姆', 'E. HONDA': '本田',
  'DEE JAY': '迪·杰', 'MANON': '曼侬', 'MARISA': '玛丽莎', 'JP': 'JP',
  'ZANGIEF': '桑吉尔夫', 'LILY': '莉莉', 'CAMMY': '嘉米', 'RASHID': '拉希德',
  'A.K.I.': '阿鬼', 'ED': '爱德', 'AKUMA': '豪鬼', 'M. BISON': '维加',
  'TERRY': '特瑞', 'MAI': '舞', 'ELENA': '艾琳娜', 'SAGAT': '沙加特',
  'C. VIPER': '毒蛇', 'ALEX': '亚历克斯', 'INGRID': '英格丽德',
};

/* In-game character-select roster order (drives the dropdown). */
const ROSTER_ORDER = [
  'LUKE', 'JAMIE', 'MANON', 'KIMBERLY', 'MARISA', 'LILY', 'JP', 'JURI',
  'DEE JAY', 'CAMMY', 'RYU', 'E. HONDA', 'BLANKA', 'GUILE', 'KEN', 'CHUN-LI',
  'ZANGIEF', 'DHALSIM', 'RASHID', 'A.K.I.', 'ED', 'AKUMA', 'M. BISON', 'TERRY',
  'MAI', 'ELENA', 'SAGAT', 'C. VIPER', 'ALEX', 'INGRID',
];

let lang = localStorage.getItem('sf6lab-lang')
  || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');

/* Display name -> URL slug, for headshot images at IMG_BASE + slug + '.jpg'. */
const SLUG_BY_NAME = {
  'A.K.I.': 'aki', 'ALEX': 'alex', 'BLANKA': 'blanka', 'CAMMY': 'cammy',
  'CHUN-LI': 'chunli', 'C. VIPER': 'cviper', 'DEE JAY': 'deejay', 'DHALSIM': 'dhalsim',
  'ED': 'ed', 'ELENA': 'elena', 'AKUMA': 'gouki', 'GUILE': 'guile', 'E. HONDA': 'honda',
  'INGRID': 'ingrid', 'JAMIE': 'jamie', 'JP': 'jp', 'JURI': 'juri', 'KEN': 'ken',
  'KIMBERLY': 'kimberly', 'LILY': 'lily', 'LUKE': 'luke', 'MAI': 'mai', 'MANON': 'manon',
  'MARISA': 'marisa', 'RASHID': 'rashid', 'RYU': 'ryu', 'SAGAT': 'sagat', 'TERRY': 'terry',
  'M. BISON': 'vega', 'ZANGIEF': 'zangief',
};

// base path for headshots (relative to the app at /web/). The standalone build
// defines CHAR_IMG (slug -> data URI) which takes precedence for offline use.
var IMG_BASE = 'img/';

/* Headshot image URL for a character display name ('' if unknown). */
function imgSrc(name) {
  const slug = SLUG_BY_NAME[name];
  if (!slug) return '';
  if (typeof CHAR_IMG !== 'undefined' && CHAR_IMG[slug]) return CHAR_IMG[slug];
  return IMG_BASE + slug + '.jpg';
}

/* Localized character display name; falls back to the canonical name. */
function cn(name) {
  return lang === 'zh' ? CHAR_ZH[name] ?? name : name;
}

function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

function setLang(l) {
  lang = l;
  localStorage.setItem('sf6lab-lang', l);
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
}
