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
    includeIngrid: 'Include INGRID',
    ingridNote: '(~3 days of data)',
    footer: 'Scores are win-rate ÷ 10, centered at 5.0.<br>Data: kakuhanapp.com mirror of official Buckler diagrams.',
    loading: 'Loading matrix…',
    loadError: 'Could not load ../output/matrix.csv — run build_matrix.py first.',
    rank: { 40: 'High', 41: 'Grand', 42: 'Ult' },
    rankFull: { 40: 'HighM', 41: 'GrandM', 42: 'UltM' },
    metricComb: 'COMB (tier-weighted)',
    headMatch: '<b>{char}</b> vs {n} · sorted worst-first · metric: <b>{metric}</b> · ⚠ tier spread &gt; 0.25',
    headSubs: 'Subs for <b>{char}</b> · worst 3: {worst3} · metric: <b>{metric}</b>',
    axisOpponent: 'OPPONENT',
    axisLosing: '◄ LOSING',
    axisEven: '5.0',
    axisWinning: 'WINNING ►',
    axisScore: 'SCORE · ',
    axisScoreExtra: 'ΔPATCH · MO',
    axisSub: 'SUB',
    axisShares: '◄ SHARES WEAKNESS',
    axisZero: '0',
    axisCovers: 'COVERS ►',
    axisCover: 'COVER · ',
    axisCoverExtra: 'W3% · CORR · SHARED',
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
    includeIngrid: '包含 INGRID',
    ingridNote: '（仅约 3 天数据）',
    footer: '分数为胜率 ÷ 10，以 5.0 为中心。<br>数据来自 kakuhanapp.com（官方对战相性图镜像）。',
    loading: '正在加载数据…',
    loadError: '无法加载 ../output/matrix.csv — 请先运行 build_matrix.py。',
    rank: { 40: '高阶', 41: '特级', 42: '究极' },
    rankFull: { 40: '高阶大师', 41: '特级大师', 42: '究极大师' },
    metricComb: '综合（段位加权）',
    headMatch: '<b>{char}</b> 对阵 {n} 名角色 · 按最不利排序 · 指标：<b>{metric}</b> · ⚠ 段位间差异 &gt; 0.25',
    headSubs: '<b>{char}</b> 的副角推荐 · 最难对局前 3：{worst3} · 指标：<b>{metric}</b>',
    axisOpponent: '对手',
    axisLosing: '◄ 劣势',
    axisEven: '5.0',
    axisWinning: '优势 ►',
    axisScore: '分数 · ',
    axisScoreExtra: '补丁差 · 月份',
    axisSub: '副角',
    axisShares: '◄ 同样弱势',
    axisZero: '0',
    axisCovers: '补强 ►',
    axisCover: 'COVER · ',
    axisCoverExtra: '前3胜率 · 相关 · 共弱',
    spreadFlag: '段位间差异 > 0.25',
    moSuffix: '月',
    sharedSuffix: ' 共弱',
  },
};

let lang = localStorage.getItem('sf6lab-lang')
  || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');

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
