/* UI string dictionaries + language state. Math (scoring.js) is untouched. */

const STRINGS = {
  en: {
    kicker: 'CAPCOM BUCKLER DATA · MASTER+',
    viewMatch: 'Matchups',
    viewSubs: 'Sub finder',
    labelMatch: 'MATCHUPS',
    labelSubs: 'SUB FINDER',
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
    footer: 'Scores are win-rate ÷ 10, centered at 5.0.<br>Data: kakuhanapp.com mirror of official Buckler diagrams.',
    loading: 'Loading matrix…',
    loadError: 'Could not load ../output/matrix.csv — run build_matrix.py first.',
    reset: 'Reset to defaults',
    tierHint: 'COMB only — pick COMB above',
    rankComb: 'COMB',
    rank: { 40: 'High', 41: 'Grand', 42: 'Ult' },
    rankFull: { 40: 'High', 41: 'Grand', 42: 'Ultimate' },
    metricComb: 'COMB (tier-weighted)',
    headMatch: '<b>{char}</b> vs {n} · sorted worst-first · metric: <b>{metric}</b> · ⚠ tier spread &gt; 0.25',
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
    tierAdv: 'Favorable', tierSlightAdv: 'Slight +', tierEven: 'Even',
    tierSlightDis: 'Slight −', tierDis: 'Unfavorable',
    subStrong: 'Strong cover', subModerate: 'Moderate cover', subShares: 'Shares weaknesses',
    tierEmpty: 'none', chipHint: 'click a character to scout them',
    spreadFlag: 'tier spread > 0.25',
    moSuffix: 'mo',
    sharedSuffix: ' shared',
  },
  zh: {
    kicker: 'CAPCOM BUCKLER 官方数据 · 大师段位以上',
    viewMatch: '相性表',
    viewSubs: '副角推荐',
    labelMatch: '相性表',
    labelSubs: '副角推荐',
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
    footer: '分数为胜率 ÷ 10，以 5.0 为中心。<br>数据来自 kakuhanapp.com（官方对战相性图镜像）。',
    loading: '正在加载数据…',
    loadError: '无法加载 ../output/matrix.csv — 请先运行 build_matrix.py。',
    reset: '重置为默认',
    tierHint: '仅综合 — 请在上方选择综合',
    rankComb: '综合',
    rank: { 40: 'High', 41: 'Grand', 42: 'Ult' },
    rankFull: { 40: 'High', 41: 'Grand', 42: 'Ultimate' },
    metricComb: '综合（段位加权）',
    headMatch: '<b>{char}</b> 对阵 {n} 名角色 · 按最不利排序 · 指标：<b>{metric}</b> · ⚠ 段位间差异 &gt; 0.25',
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
    tierAdv: '有利', tierSlightAdv: '微有利', tierEven: '五分',
    tierSlightDis: '微不利', tierDis: '不利',
    subStrong: '强力补强', subModerate: '一般补强', subShares: '同样弱势',
    tierEmpty: '无', chipHint: '点击角色查看其对局',
    spreadFlag: '段位间差异 > 0.25',
    moSuffix: '月',
    sharedSuffix: ' 共弱',
  },
};

/* Official SF6 simplified-Chinese character names (Year 3 chars use the
   common community transliterations). Keys are the matrix's display names. */
const CHAR_ZH = {
  'RYU': '隆', 'LUKE': '卢克', 'JAMIE': '杰米', 'CHUN-LI': '春丽',
  'GUILE': '古烈', 'KIMBERLY': '金佰莉', 'JURI': '韩蛛俐', 'KEN': '肯',
  'BLANKA': '布兰卡', 'DHALSIM': '达尔西姆', 'E.HONDA': '本田',
  'DEE JAY': '迪·杰', 'MANON': '曼侬', 'MARISA': '玛丽莎', 'JP': 'JP',
  'ZANGIEF': '桑吉尔夫', 'LILY': '莉莉', 'CAMMY': '嘉米', 'RASHID': '拉希德',
  'A.K.I.': '阿鬼', 'ED': '爱德', 'GOUKI': '豪鬼', 'VEGA': '维加',
  'TERRY': '特瑞', 'MAI': '舞', 'ELENA': '艾琳娜', 'SAGAT': '沙加特',
  'C.VIPER': '毒蛇', 'ALEX': '亚历克斯', 'INGRID': '英格丽德',
};

/* In-game character-select roster order (drives the dropdown). */
const ROSTER_ORDER = [
  'LUKE', 'JAMIE', 'MANON', 'KIMBERLY', 'MARISA', 'LILY', 'JP', 'JURI',
  'DEE JAY', 'CAMMY', 'RYU', 'E.HONDA', 'BLANKA', 'GUILE', 'KEN', 'CHUN-LI',
  'ZANGIEF', 'DHALSIM', 'RASHID', 'A.K.I.', 'ED', 'GOUKI', 'VEGA', 'TERRY',
  'MAI', 'ELENA', 'SAGAT', 'C.VIPER', 'ALEX', 'INGRID',
];

let lang = localStorage.getItem('sf6lab-lang')
  || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');

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
