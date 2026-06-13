# SF6 Matchup Lab

[English](README.md) | **简体中文**

一个可复现的 **《街头霸王 6》** 对局分析与互补副角（备用角色）推荐工具，
基于 Capcom Buckler 官方对战相性图数据（通过
[kakuhanapp.com](https://kakuhanapp.com) 镜像获取）构建，包含数据管线与交互式网页应用。

---

## 概述

SF6 Matchup Lab 聚合大师段位及以上三个段位的逐月对局胜率数据，可针对
**任意角色、任意月份区间**生成：

1. **对局相性表 / 段位列表** —— 每个对手按 Buckler 以 5.0 为中心的刻度评分，并按优劣势分组；
2. **互补副角推荐** —— 不只看对最差对局的胜率，而是采用按弱点严重度加权的「补强分」，并辅以互补性校验。

分析完全参数化（角色、月份区间、段位权重、月份权重、排除项），既提供 Python 命令行工具，
也提供零依赖的浏览器应用。

## 在线演示

两套可互换的前端设计共享同一套数据与逻辑：

| 设计 | 说明 | 链接 |
|------|------|------|
| **柱状图视图**（v1） | 深色「训练模式」双向柱状表 | <https://jiahaoxu10arthur.github.io/sf6-matchup/web/> |
| **段位列表**（v2） | 电竞风格的优劣势分层布局 | <https://jiahaoxu10arthur.github.io/sf6-matchup/web-v2/> |

> 中国大陆无法访问 GitHub Pages 与 Google Fonts。若需离线或在中国大陆分享，
> 请使用 [`standalone/`](#离线单文件构建) 中的自包含文件。

## 功能特性

- **任意角色、任意时间区间** —— `--char`、`--months 202601-202605`（支持跨年）。
- **三个段位** —— 高阶 / 特级 / 究极大师，可单独查看，或按 3 : 2 : 1 人口权重综合。
- **版本感知的月份权重** —— `current`（补丁后）与 `all`（等权）预设，或完全自定义的逐月权重；
  同一套 `{月份: 权重}` 字典同时驱动网页滑块。
- **双语界面** —— 英文与简体中文，自动检测并支持手动切换。
- **离线单文件构建** —— 将整个应用与数据集内联进一份可分享的 HTML 文件。

## 目录结构

```text
sf6-matchup/
├── scripts/
│   ├── roster.py            # 角色名单、段位/权重常量、补丁月份
│   ├── parse.py             # HTML → {对手: 分数}
│   ├── scoring.py           # 纯计算：权重、补强分、相关性
│   ├── download.py          # 幂等的页面下载器
│   ├── build_matrix.py      # data/*.html → output/matrix.csv（含反对称校验）
│   ├── analyze.py           # 单角色对局相性表命令行
│   ├── recommend.py         # 互补副角推荐命令行
│   └── build_standalone.py  # 将网页应用打包为离线单文件 HTML
├── web/                     # v1 —— 深色柱状图界面
├── web-v2/                  # v2 —— 段位列表界面（复用 ../web 的 scoring.js 与 i18n.js）
├── standalone/              # 生成的离线单文件
├── tests/                   # pytest 测试，含 Python↔JS 一致性校验
├── docs/                    # METHOD.md（方法论）、plan.md
├── data/                    # 原始 HTML 缓存（已 gitignore）
└── output/matrix.csv        # 长格式对局矩阵
```

## 数据来源与方法论

分数遵循 Buckler 约定，即胜率 ÷ 10、以 5.0 为中心（例如 `5.237` = 52.37% 胜率）。
优劣势分档：≥ 5.3 有利、≥ 5.1 微有利、≥ 4.9 五分、≥ 4.7 微不利、< 4.7 不利。

互补副角的补强分公式为：

```text
COVER = Σ w(O) · (副角对O − 5) / Σ w(O)，   其中  w(O) = max(0, 5 − 本体对O)²
```

只有本体的劣势对局参与计算，并按其严重度的平方加权，因此能补强你最艰难对局的副角，
会排在仅对众多接近五分的对局略有改善的副角之前。此外还报告皮尔逊相关系数、
共同弱点数量、以及对你最差三个对手的平均胜率作为互补性交叉验证。

完整方法论 —— 段位权重依据、2026-03-17 平衡补丁、反对称校验及已知局限 ——
记录于 [`docs/METHOD.md`](docs/METHOD.md)（英文）。

## 数据管线（命令行）

需要 Python 3（仅标准库）。

```bash
cd scripts
python3 download.py     --months 202601-202605          # 抓取原始页面（幂等缓存）
python3 build_matrix.py                                  # data/ → output/matrix.csv
python3 analyze.py   --char TERRY --months 202601-202605 --profile current
python3 recommend.py --char TERRY --months 202601-202605 --profile current
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--char` | 要分析的角色（如 `TERRY`、`KEN`） | 必填 |
| `--months` | 区间（`202601-202605`）或显式列表 | 必填 |
| `--profile` | `current`（补丁后加权）或 `all`（等权） | `current` |
| `--weights` | 自定义逐月权重，如 `202604=1,202605=1` | 覆盖 `--profile` |
| `--exclude` | 要排除的对手/候选 | `INGRID` |

## 交互式网页应用

```bash
python3 -m http.server 8741        # 在仓库根目录运行
# 柱状图视图：http://localhost:8741/web/
# 段位列表：  http://localhost:8741/web-v2/
```

两种界面都在浏览器中基于 `output/matrix.csv` 即时重新计算：角色选择、
分段位标签或段位加权综合（COMB）、实时月份与段位权重滑块、INGRID 开关、重置，
以及副角推荐视图。`web/scoring.js` 中的计算逻辑是 `scripts/scoring.py` 的移植；
`tests/test_js_parity.py` 验证两套实现的结果一致（误差 `1e-9` 以内）。

## 离线单文件构建

```bash
python3 scripts/build_standalone.py
```

在 `standalone/` 中生成两份自包含文件，已内联数据集、代码与样式，并移除全部外部依赖：

- `sf6-matchup-bars.html` —— v1 柱状图视图
- `sf6-matchup-tierlist.html` —— v2 段位列表

双击即可运行 —— 无需联网、服务器或安装 —— 可通过邮件、即时通讯或 U 盘分享。
自定义显示字体被省略（其依赖 Google Fonts），布局将回退到系统字体。

## 开发与测试

```bash
python3 -m pytest tests/ -v        # JS 一致性测试需要 `node`
```

## 部署（GitHub Pages）

推送仓库并在 `main` 分支（根目录）启用 Pages，应用即可在
`https://<user>.github.io/<repo>/web/` 与 `/web-v2/` 访问。

## 致谢与免责声明

对局数据来源于 Capcom《街头霸王 6》官方 Buckler 对战相性图，通过 kakuhanapp.com
镜像获取。本项目为非官方的爱好者分析工具，与 Capcom 无任何关联，亦未获其认可。
数据来源未公开样本量；由此产生的统计注意事项见 `docs/METHOD.md`。
