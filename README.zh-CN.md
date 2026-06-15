# SF6 Matchup Lab

[English](README.md) | **简体中文**

一个可复现的 **《街头霸王 6》** 对局分析与互补副角（备用角色）推荐工具，
基于 Capcom Buckler 官方对战相性图数据（通过
[Capcom Buckler 官方 API](https://www.streetfighter.com/6/buckler) 直接获取，使用官方角色名与使用率数据）构建，包含数据管线与交互式网页应用。

---

## 概述

SF6 Matchup Lab 聚合大师及以上四个段位的逐月对局胜率数据，可针对
**任意角色、任意月份区间**生成：

1. **对局相性表 / 段位列表** —— 每个对手按 Buckler 以 5.0 为中心的刻度评分，并按优劣势分组；
2. **互补副角推荐** —— 不只看对最差对局的胜率，而是采用按弱点严重度加权的「补强分」，并辅以互补性校验。

分析完全参数化（角色、月份区间、段位权重、月份权重、排除项），既提供 Python 命令行工具，
也提供零依赖的浏览器应用。

## 在线演示

同一应用、六个视图标签共享同一套数据与逻辑，访问
<https://jiahaoxu10arthur.github.io/sf6-matchup/web/>：

| 视图 | 说明 |
|------|------|
| **相性表**（段位） | 电竞风格的优劣势分层布局，逐对局可信度标记 |
| **柱状图** | 深色「训练模式」双向柱状表 |
| **副角推荐** | 推荐最能弥补你弱势对局的副角色 |
| **使用率 × 胜率** | Smogon 风格的全角色使用率对胜率散点图（点大小 = 极化度） |
| **对位地图** | 单角色散点图 —— 每个对手按遭遇频率与你的胜率定位；右下角（常见 · 劣势）是练习重点 |

点击任意角色（柱、点或卡片）即可展开详情卡 —— 胜率、使用率及其擅长/不利对位，
并可一键跳转到该角色的页面。

> 中国大陆无法访问 GitHub Pages 与 Google Fonts；若需离线或在中国大陆分享，
> 请使用 [`standalone/`](#离线单文件构建) 中的自包含文件。

## 功能特性

- **任意角色、任意时间区间** —— `--char`、`--months 202502-202605`（支持跨年）。
- **四个段位** —— 大师 / 高阶 / 特级 / 究极大师，可单独查看，或按默认 0 : 1 : 2 : 3 段位深度权重综合（究极大师权重最高；大师默认排除，但可无级调回，详见[方法论](docs/METHOD.zh-CN.md#3-rank-tiers-and-skill-depth-weights)）。
- **版本感知的月份权重** —— `current`（补丁后）与 `all`（等权）预设，或完全自定义的逐月权重；
  同一套 `{月份: 权重}` 字典同时驱动网页滑块。
- **逐对局可信度** —— 每个对局附带 ●●● / ●●○ / ●○○ 可信度标记，由数据月份数、段位覆盖与各段位一致程度推导（Buckler 未公开样本量）。
- **按使用率加权的副角排序** —— 对手按热度加权，使副角推荐优先覆盖你常遇到的角色。热度采用跨「段位×月份」网格的加权平均（与相性评分使用同一套权重），因此随你设定的段位/月份焦点变化；并支持逐对手覆写。
- **两种散点图** —— 全角色 **使用率 × 胜率** 元数据图（热度对胜率，高估/低估象限），以及单角色 **对位地图**（每个对手按遭遇频率对你的胜率定位），后者凸显常见且劣势、最值得练习的对位。
- **角色详情卡** —— 在任意位置点击角色即可查看其胜率、使用率与擅长/不利对位，并一键跳转到该角色页面。
- **双语界面** —— 英文与简体中文，自动检测并支持手动切换。
- **离线单文件构建** —— 将整个应用与数据集内联进一份可分享的 HTML 文件。

## 目录结构

```text
sf6-matchup/
├── scripts/
│   ├── roster.py                # 角色名单、段位/权重常量、补丁月份
│   ├── scoring.py               # 纯计算：权重、补强分、专精、使用率
│   ├── download_buckler.py      # 幂等的 Buckler JSON 下载器（dia_master + 使用率）
│   ├── build_matrix_buckler.py  # data/buckler/*.json → output/matrix.csv + usage.csv
│   ├── analyze.py               # 单角色对局相性表命令行
│   ├── recommend.py             # 互补副角推荐命令行
│   ├── build_standalone.py      # 将网页应用打包为离线单文件 HTML
│   ├── bayes.py                 # 个人侦察：纯 Beta-Binomial 统计
│   ├── personal_scout.py        # 个人侦察：将你的战绩与基线对比分类（命令行）
│   └── fetch_battlelog.py       # 个人侦察：Playwright 战斗记录抓取 + 纯解析器
├── web/                     # 应用 —— 六个视图标签（index.html、style.css、app.js、scoring.js、scout.js、i18n.js、img/）
├── standalone/              # 生成的离线单文件
├── tests/                   # pytest 测试，含 Python↔JS 一致性校验
├── docs/                    # METHOD.md / METHOD.zh-CN.md（方法论）、plan.md
├── data/buckler/            # 原始 Buckler JSON 缓存（已 gitignore）
├── data/personal/           # 个人侦察：你的会话与战斗记录（已 gitignore）
└── output/matrix.csv        # 长格式对局矩阵
```

## 数据来源与方法论

### 分数刻度

分数遵循 [Buckler](https://www.streetfighter.com/6/buckler/) 约定，即胜率 ÷ 10、以 5.0 为中心（例如 `5.237` = 52.37% 胜率）。
优劣势分档：≥ 5.3 有利、≥ 5.1 微有利、≥ 4.9 五分、≥ 4.7 微不利、< 4.7 不利。

### 计算流程

记号：`s(O, r, m)` 表示在月份 `m`、段位 `r`（40 = 高阶、41 = 特级、42 = 究极大师）
对对手 `O` 的原始分数。

**1. 抓取与解析。** 按每个（角色、段位、月份）组合抓取一个页面并缓存。
每个页面解析为 `{对手: 分数}`；并校验页面自身内嵌的月份/段位/角色，
以剔除服务器回退页面。角色尚未发布的（角色, 月份）组合会返回 HTTP 500，存为空标记。

**2. 长格式矩阵 + 完整性校验。** 所有页面展开为 `output/matrix.csv`，
每行为 `(月份, 段位, 角色, 对手, 分数)`。**反对称校验**验证所有镜像对满足
`s(A,B) + s(B,A) ≈ 10`；通过标准为**中位偏差 < 0.05**（最大值可能更大 ——
Buckler 相性图按各主角人群分别统计，两个方向来自不同样本）。

**3. 月份聚合。** 对每个对手与段位，在所选月份上做加权平均（权重为 0 的月份不计）：

```text
m̄(O, r) = Σ_m  w_m · s(O, r, m)  /  Σ_m  w_m
```

月份权重方案（`w_m`）：

| 方案 | 权重 |
|------|------|
| `current` | 补丁前月份 = 0，补丁当月（2026-03）= 0.5，补丁后 = 1 |
| `all` | 每个月 = 1 |
| 自定义（`--weights`） | 用户指定的逐月权重 |

**4. 段位综合 → COMB。** 将各段位均值按默认段位深度权重
`W = {大师: 0, 高阶: 1, 特级: 2, 究极: 3}`（网页端可无级调节）在有权重的段位上综合：

```text
COMB(O) = Σ_r  W_r · m̄(O, r)  /  Σ_r  W_r
```

究极大师权重最高：段位越高、对游戏理解越深，其对局结果越接近角色对角色的「真实」
相性值；大师（入门段位、人群最大但噪声最高）默认被排除，可按需调回。这是一个刻意偏向「偏差而非方差」的取舍 —— 究极大师人群最小、噪声最大，却
赋予最高权重，换取最具理解力人群的判断；详见[方法论](docs/METHOD.zh-CN.md#3-rank-tiers-and-skill-depth-weights)。
单段位视图（`--profile` 选定某段位）直接使用 `m̄(O, r)`。另外单独报告每个对手的
**Δpatch** 漂移 =（特级大师补丁后均值 − 补丁前均值）。

### 互补副角推荐

本体的 COMB 向量定义其弱点。每个候选副角按**补强分**评分：

```text
COVER = Σ w(O) · (副角对O − 5) / Σ w(O)
其中  w(O) = u(O) · sev(O) + max(0, u(O) − 1) · 0.25，   sev(O) = max(0, 5 − 本体对O)²
```

默认只有本体的劣势对局参与计算，并按其严重度的**平方**加权，因此能补强你最艰难对局的副角，
会排在仅对众多接近五分的对局略有改善的副角之前。副角数据中缺失的对手按中性值（5.0）处理。
每个对手的权重 `u(O)`（默认 1）可用于**排除**低样本对手（`u = 0`）或**针对**某个特定对局
（`u > 1`）—— 即便你已经占优也能针对，针对时注入固定的 0.25（一个「微不利」对局的分量），
其强度与你最差对局的严重度无关。评分同时附带三项互补性交叉验证：

- **corr（相关）** —— 副角与本体完整对局向量之间的皮尔逊相关系数；
  为负表示副角在本体失利之处取胜（互补的**形态**）。它衡量的是相性曲线形态而非补强程度
  —— 真正的排序依据是 COVER，corr 仅为辅助参考。
- **shared（共弱）** —— 两个角色都失利（分数 < 4.9）的对手数量。
- **w3win%（前3胜率）** —— 副角对本体最差三个对局的平均胜率。

完整方法论 —— 段位权重依据、2026-03-17 平衡补丁、边界情形处理及已知局限 ——
记录于 [`docs/METHOD.zh-CN.md`](docs/METHOD.zh-CN.md)（另有[英文版](docs/METHOD.md)）。

## 数据管线（命令行）

需要 Python 3（仅标准库）。

```bash
cd scripts
python3 download_buckler.py    --months 202502-202605    # 抓取官方 Buckler JSON（幂等缓存）
python3 build_matrix_buckler.py                          # data/buckler/ → output/matrix.csv + usage.csv
python3 analyze.py   --char TERRY --months 202502-202605 --profile current
python3 recommend.py --char TERRY --months 202502-202605 --profile current
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--char` | 要分析的角色（如 `TERRY`、`KEN`） | 必填 |
| `--months` | 区间（`202502-202605`）或显式列表 | 必填 |
| `--profile` | `current`（补丁后加权）或 `all`（等权） | `current` |
| `--weights` | 自定义逐月权重，如 `202604=1,202605=1` | 覆盖 `--profile` |
| `--exclude` | 要排除的对手/候选 | `INGRID` |

## 个人对位侦察（本地，可选）

用 Beta-Binomial 收缩把*你自己*的 Buckler 排位战绩与全局基线对比，使小样本的波动
不被误判为真实弱点。每个对手会相对共享的对位基线（与网页应用同一套 `combined_row`）
被归类为*真实弱点*、*超常发挥*、*小样本* 或 *持平*，并给出每个对位 90% 的可信区间。
无论用哪种方式，你的对局数据都保持私密，绝不上传。

**在浏览器中（任何人，免安装）。** 打开网页应用或离线版中的 **个人侦察** 标签页。
把其中的 *导入我的 Buckler 记录* 按钮拖到书签栏，然后在已登录的 Capcom Buckler 网站上
点击它：它会翻页抓取你的排位战斗记录并复制为 JSON，供你粘贴回标签页；你也可以上传个人
CSV。解析与评分全程在页面内运行（`web/scout.js`）—— 你的对战数据绝不离开浏览器。

**在本机（命令行）。** 适合需要脚本化/离线流程并使用 Capcom 登录的场景；会话与对局数据
保留在本地（`data/personal/`，已 gitignore）：

```bash
pip install playwright && playwright install chromium
python3 scripts/fetch_battlelog.py --cfn <你的 short_id>   # 一次性登录，随后翻页抓取战斗记录 -> data/personal/<id>.csv
python3 scripts/personal_scout.py  --cfn <你的 short_id>   # -> output/<id>_scout.md
```

分析内核是共享且经一致性测试的：`scripts/bayes.py` + `scripts/personal_scout.py`
（纯标准库）与其 JS 移植 `web/scout.js` 通过 `tests/test_scout_parity.py` 验证一致
（误差 `1e-9` 以内）。仅命令行抓取步骤需要 Playwright。

## 交互式网页应用

```bash
python3 -m http.server 8741        # 在仓库根目录运行
# 应用：http://localhost:8741/web/   （相性表 · 柱状图 · 副角推荐 · 使用率 × 胜率 · 对位地图 · 个人侦察）
```

应用在浏览器中基于 `output/matrix.csv` 即时重新计算：角色选择、
分段位标签或段位加权综合（COMB）、可直接输入的月份与段位权重、逐对手使用率权重、
INGRID 开关、重置，以及六个视图标签 —— 包括浏览器内的 **个人侦察**（见上文）。
`web/scoring.js` 与 `web/scout.js` 中的计算逻辑分别是 `scripts/scoring.py` 与
`scripts/bayes.py`/`personal_scout.py` 的移植；`tests/test_js_parity.py` 与
`tests/test_scout_parity.py` 验证各套实现的结果一致（误差 `1e-9` 以内）。

在「个人侦察」标签页导入战斗记录后，**个人模式** 开关会让对位地图、副角推荐与
相性表/柱状图按你自己的天梯数据呈现。每个对位都是你的战绩向全球基准收缩的结果
（Beta-Binomial，约 20 局先验），因此在你没有对局数据的地方会精确回退到全球数据 ——
关闭开关时各视图与全球默认完全一致。对位地图以「你的遭遇频率 × 你的收缩胜率」绘制；
副角推荐按你实际失利的对位排序；相性表与柱状图标注你的胜负与超常/不及预期的差值；
个人侦察表则为每个劣势对位给出推荐副角。个人数据全程留在浏览器中。

## 离线单文件构建

预构建文件已附在[最新 Release](https://github.com/JiahaoXu10Arthur/sf6-matchup/releases/latest)中，
下载后直接打开即可。如需基于当前数据重新构建：

```bash
python3 scripts/build_standalone.py
```

在 `standalone/` 中生成一份自包含文件，已内联数据集、代码与样式，并移除全部外部依赖：

- `sf6-matchup.html` —— 完整应用（全部六个视图标签）

双击即可运行 —— 无需联网、服务器或安装 —— 可通过邮件、即时通讯或 U 盘分享。
自定义显示字体被省略（其依赖 Google Fonts），布局将回退到系统字体。

## 开发与测试

```bash
python3 -m pytest tests/ -v        # JS 一致性测试需要 `node`
```

## 部署（GitHub Pages）

推送仓库并在 `main` 分支（根目录）启用 Pages，应用即可在
`https://<user>.github.io/<repo>/web/` 访问。

## 致谢与免责声明

对局与使用率数据来源于 Capcom《街头霸王 6》官方 Buckler 对战相性图
（streetfighter.com/6/buckler）。本项目为非官方的爱好者分析工具，与 Capcom 无任何关联，亦未获其认可。
数据来源未公开样本量；由此产生的统计注意事项见 `docs/METHOD.zh-CN.md`。
