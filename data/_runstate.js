/* ===== 运行状态（由 scripts/build_runstate.py 从真实快照生成）=====
   ★ 不要手改 ★ 每次抓取后跑：
       python scripts/fetch_new_sources.py
       python scripts/crawler.py --run
       python scripts/build_runstate.py
   字段全部来自 data/snapshots/*.json 的**文件修改时间**与条数，
   不是页面上写死的字符串。跑没跑、跑了多少条，页面上看得见。 */
const RUNSTATE = {
  schedule:"每日 09:07",
  lastRun:"2026-10-10 19:48",
  lastRunDetail:"0.0 小时前",
  nextRun:"2026-10-11 09:07",
  everRan:true,
  healthy:true,
  sources:[
  {code:"SRC-01", file:"SRC-01_latest.json", count:3, mtime:"2026-10-10 19:45"},
  {code:"SRC-02", file:"SRC-02_latest.json", count:7, mtime:"2026-10-10 19:48"},
  {code:"SRC-05", file:"SRC-05_latest.json", count:373, mtime:"2026-10-10 19:48"},
  {code:"SRC-06", file:"SRC-06_latest.json", count:4, mtime:"2026-10-10 19:45"},
  {code:"SRC-07", file:"SRC-07_latest.json", count:0, mtime:"2026-10-07 11:46"},
  {code:"SRC-08", file:"SRC-08_latest.json", count:56, mtime:"2026-10-10 19:46"},
  {code:"SRC-11", file:"SRC-11_latest.json", count:98, mtime:"2026-10-10 19:46"}
  ],
  extras:[
  {label:"公告", file:"notice_latest.json", count:56, mtime:"2026-10-10 19:46"},
  {label:"勘误与修改单", file:"erata_latest.json", count:176, mtime:"2026-10-10 19:47"}
  ],
  logs:[["2026-10-10 19:48:36","ok","[SRC-05] 食品安全国家标准数据检索平台 抓取 373 条"],["2026-10-10 19:48:36","ok","[SRC-02] 国家标准全文公开系统 openstd 抓取 7 条"],["2026-10-10 19:47:57","ok","[勘误] 收录 176 条标准勘误 / 修改单"],["2026-10-10 19:46:57","ok","[公告] 收录 56 条发布公告"],["2026-10-10 19:46:54","ok","[SRC-11] CNAS 实验室认可规范 抓取 98 条（非国标，标准委不收录）"],["2026-10-10 19:46:12","ok","[SRC-08] 全国团体标准 抓取 56 条（仅作参考）"],["2026-10-10 19:45:47","ok","[SRC-06] 市场监管总局公告 抓取 4 条（BJS 补充检验方法等）"],["2026-10-10 19:45:44","ok","[SRC-01] 全国标准信息公共服务平台 gbQueryPage 抓取 3 条"],["2026-10-07 11:46:15","ok","[SRC-07] 工信部行业公告 抓取 0 条（该源常为 0，属正常）"]]
};
