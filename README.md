# 标准雷达 · 婴配标准变更提醒

给婴幼儿配方奶粉企业实验室用的标准动态提醒工具。
**只告诉你哪版标准变了、什么时候开始用、下次出报告前核对哪一版。**

---

## 它解决什么

实验室同事每天上班第一件事：确认手上用的标准还是不是最新版。
现在靠人肉盯标委会网站、卫健委公告、群里转发的截图——漏一次就是拿旧版出报告。

## 合规立场（写死在代码里）

| 规则 | 实现位置 |
|---|---|
| 不存标准全文 | 数据库**没有任何正文字段**，只存元数据 |
| 拿不准能否下载 → 只给阅读链接 | `download_allowed` 默认 `False` |
| ISO/IEC 采标永不提供下载 | `IsoOfficialAdapter.download_allowed = False` |
| 官方声明不给全文的（如废止标准） | 抓到 `_废止不给全文` 信号后强制置 `False` |
| 单源最小间隔 4 小时 | `http_client.MIN_INTERVAL_H` + 每源检索词配额 |
| 第三方转载版本不是来源 | 只解析官方站点，链接一律指向官方详情页 |

页面底部固定免责声明。使用本工具出的报告，以现行有效标准的正式文本为准。

---

## 快速开始

```bash
# 1. 依赖
python -m pip install requests lxml

# 2. 初始化
cd scripts
python crawler.py --init-db

# 3. 跑一次（第一次只建基线，不推提醒，这是刻意的）
python crawler.py --run

# 4. 每天定时（内部调度器）
python crawler.py --serve
```

单源调试：`python crawler.py --run --source SRC-05`

> 公司代理下 SSL 报错时，设根证书而不是关校验：
> `set REQUESTS_CA_BUNDLE=D:\path\corp-proxy-ca.pem`

---

## 目录结构

```
std-watch/
├── prototype/index.html          可点原型（6 模块，含真实数据）
├── config/
│   ├── keywords.csv              47 条监控关键词（精确/模糊/通配 + 优先级）
│   └── sources.csv               官方源配置（含实测接入状态）
├── db/schema.sql                 11 张表
├── scripts/
│   ├── http_client.py            会话 / 限速 / 编码 / 重试 / SSL 兜底
│   ├── sources.py                各源适配器（结构来自实测）
│   ├── erata.py                  ★ 标准勘误分析与分级
│   └── crawler.py                三条流程：快照 diff → 提醒队列 → 推送
├── data/
│   ├── snapshots/                每次抓取的快照（diff 基准）
│   ├── source_health.json        源健康与熔断状态
│   └── stdwatch.db               SQLite（生产用 PostgreSQL）
└── docs/
    ├── INFO_ARCHITECTURE.md      信息架构 + 页面草图
    ├── REMINDER_TEMPLATE.md      提醒文案模板（含勘误模板）
    └── CRAWL_FINDINGS.md         ★ 真实抓取接入报告（踩坑记录）
```

---

## 数据源现状

抓得到不等于该推。三条流程各自独立跑：**标准换版 / 发布公告 / 标准勘误**。

| 源 | 库 | 状态 | 实抓 |
|---|---|---|---|
| **sppt.cfsa.net.cn** | 标准文本 | ✅ 主力源 | 141 |
| **sppt.cfsa.net.cn** | **标准勘误** `num_tn=4` | ✅ | 176 |
| **sppt.cfsa.net.cn** | **发布公告** `num_tn=1` | ✅ | 56 |
| **openstd.samr.gov.cn** | 国标 | ✅ | 3 |
| **std.samr.gov.cn** | 国标/行标/团标 | ✅ 已找到 JSON 接口 | 14 |
| ISO 官方 | 单标准 | ✅ 按需 | 3 |
| 卫健委 | 公告 | ⛔ 已停用（412 反爬） | 0 |
| 总局 / 工信部 / 团标 / 认监委 | 公告 | 待接 | 0 |

**主力源不是 openstd** —— 它只有 1994-2000 的老国标，
GB 10765-2021 这类现行食品安全国标在卫健委/国家食品安全风险评估中心的库里。

**勘误是独立一条流程** —— 它不改标准号、不改实施日期、不再发公告，
只在勘误表里改一句话。按标准号做 diff 永远发现不了它，
而照错误原文做出来的检测结果是错的。

---

## 三类提醒的处理链路

| 流程 | 触发条件 | 去重 | 首次运行 |
|---|---|---|---|
| 标准换版 | 状态/日期/替代关系字段变化 | 同标准多字段合并成一条 | 只建基线不推 |
| 发布公告 | 出现新的公告 GUID | 按 GUID | 只建基线不推 |
| 标准勘误 | 出现新的勘误 GUID | 按 GUID | 只建基线不推 |

三条流程**共用一个首次基线标记**（`_baseline_done`）——
早先各自按"自己的快照是否为空"判首次，结果出现过
"标准已建基线但勘误快照也被上一轮写好了" → 首次运行就把 176 条历史勘误全推出来。

## 提醒噪音控制

抓得到不等于该推。三层过滤把 141 条压成 2 条：

| 层 | 做法 |
|---|---|
| 源端 | 解读材料按 `TABLENAME` 过滤；勘误剥掉 `<img>` 标签再判级 |
| 匹配端 | 标准号按"前缀+分部号"精确比对，避免 `GB 5009.3` 误命中 `GB 5009.312` |
| 相关端 | `full` / `core` 必提醒，`edge` 只入库，`none` 静默 |

去重规则：同一标准的多个字段变更**合并成一条**；同一标准同一事件类型 30 天内只提醒一次。

## 熔断

某源连续失败 3 次 → 冷却 24 小时跳过 → 恢复后自动重试。
实测 **84 秒 → 1.7 秒**。返回 0 条且无历史快照时判定为"未接通"，直接报错而不是假装成功。

---

## 常用命令

```bash
python crawler.py --init-db        # 初始化
python crawler.py --run            # 全量检查（含公告与勘误）
python crawler.py --run --no-extras # 跳过公告与勘误
python crawler.py --run --source SRC-05   # 单源
python crawler.py --erata-only     # 只跑勘误（最快，3 秒）
python crawler.py --serve          # 每日 07:00 调度
```

---

## 下一步

1. 卫健委 412 绕一下（加 Referer + Cookie 会话）
2. std.samr 找开放数据接口
3. 接 CFSA 标准勘误（`TABLENAME=4`）—— 限量值勘误对实验室影响最大
4. 前端接真实 API，替换原型的静态数据
