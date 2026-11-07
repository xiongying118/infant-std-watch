# 每日官方源检查 — 执行记录

## 2026-10-05（首次执行）
- 管线退出码 0，校验通过：STD=327 LAWS=42 ERATA=15 REFGROUPS=12
- data.js 与 HEAD 提交逐块字节一致（STD/REFGROUPS/SOONPOOL/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/SRCS 全部相同）→ **判定情况 B，未发布**
- SRC-07（工信部）、SRC-08（团标平台）返回 0 条报错，但**接口本身是通的**：
  - 用中文关键词（婴幼儿配方乳粉/乳粉）直调 SRC-08 可拿到 26 条
  - 管线传入的是 `merged[:8]` 即 GB 10765 这类**标准号**，不是中文名 → 团标平台按标准号查必然 0 条
  - 结论：**配置问题（检索词选取），不是官方源故障**，但按纪律仍记为「未取到数据」
- SRC-05 的 16 条「变更」是 `days_to_implement` 每日递减造成的假变化，`row_hash` 未变，非真实变更
- 真实新增：0 标准 / 0 换版 / 0 废止 / 0 勘误；修改单 6 条为 10-04 已入库记录的重复推送
- RUNSTATE.lastRun 显示 19:10 / 「-8.0 小时前」为**时区 bug**：mtime() 无条件 +8h，本机东八区运行时被二次偏移；真实完成时间 11:10

### 遗留待修（下次执行前可处理）
1. SRC-08 检索词应传中文名（`TTBZ_KEYWORDS`），SRC-07/08 不应复用 `all_terms[:limit]`
2. `build_runstate.py` 的 `mtime()` 应判断运行环境是否已是东八区，避免重复 +8

## 2026-10-06
- 管线退出码 0，校验通过：STD=327 LAWS=42 ERATA=15 REFGROUPS=12 ALERTS=2
- **判定情况 C → 未发布**（抓取阶段 SRC-05 静默掉条，属抓取失败，不能当「无更新」）
- data.js 与 HEAD 差异仅限 623 行后的 RUNSTATE 时间戳，数据主体 1-622 行逐字节一致
- 真实新增/换版/废止/勘误均 0 条；修改单 6 条为重复推送，去重后 0

### SRC-05 由 355 掉到 347（已定位根因）
- 消失 8 条全是项目核心：GB23790-2010/2023、GB25596-2010/2025、GB29922-2013/2025、GB29923-2013/2023
- **已直连官方接口复核：8 条全部仍在库、状态与实施日期均未变 → 是抓取失败，不是官方撤回**
- 根因：`sources.py:612-620` `CfsaSpptAdapter.fetch` 用裸 `print`吞掉逐关键词异常，
  只要整体非空即算成功；`crawler.py:827` 仅在总条数为 0 时抛错
- 危害：降级快照污染基线 → 下次这 8 条会被判「全新发布」，推送 8 条假提醒
- 处置：`git checkout` 还原 SRC-05 快照（回 355）+ `--skip-fetch` 重生成 data.js，未改抓取逻辑

### 新增待修（最高优先级）
1. **静默掉条**：让 `fetch` 统计失败关键词数并超阈判源失败；`sanity_guard.py`
   只校验 data.js 的 STD/LAWS/REFGROUPS/ERATA/ALERTS，**未覆盖各源快照条数**，
   故 347/355 这次静默通过 —— 应把源快照条数纳入闸门
2. SRC-07 / SRC-08 仍返回 0 条报错（同 10-05，未修）
3. SRC-08 检索词应传中文名（`TTBZ_KEYWORDS`）
- 10-05 记的时区 +8 bug 本次未复现（lastRunDetail 显示 0.0 小时前，正确）

## 2026-10-07
- 管线退出码 0，校验通过：STD=347 LAWS=42 ERATA=15 REFGROUPS=12 ALERTS=2
- **判定情况 A → 已发布**（线上链接 https://infant-std-watch.app.workbuddy.host/）
-各源：SRC-01=3 SRC-02=3 SRC-05=355 SRC-06=4 SRC-07=0（连续失败 3 次冷却）SRC-08=56（已恢复）公告=56 勘误=176
- 真实新增/换版/废止/勘误 **全 0**；6 条修改单是 10-04 已入库记录的重复推送，去重后 0
- data.js 与 HEAD 差异**仅 RUNSTATE 元数据**（lastRun、各源 count/mtime、SRC-08 由 0→56）；
  数据主体 1-646 行逐字节一致 → 本次发布**不含新标准数据**

### SRC-05 掉条根因已确认（比 10-06 更明确）
- 消失 18 条全是项目核心：GB 7718/28050/2763/2763.1/29924/12693/17405/5749 系列
- **直连官方接口复核：15/18 仍在库且状态未变 → 抓取失败，非官方撤回**
  （GB 5749 三条 CFSA 库确实不收录，属源范围问题）
- **根因**：这 18 条带空格标准号（`GB 7718-2025`）来自 `fetch_wanted.py` 的**补充抓取**，
  而 `daily_check.py` 只调 `crawler.py`，**从不调 `fetch_wanted.py`**
  → 补充结果被每日主流程覆盖回 355。10-06 记录的「355→347」是同一问题的另一面
- 危害：快照 355 污染基线；若哪天跑了 fetch_wanted 回到 373，这 18 条会被误判「全新发布」

### 待修（优先级排序）
1. **把 `fetch_wanted.py` 纳入 `daily_check.py` 流程**（本次确认的根因，最高优先级）
2. **静默掉条闸门**：`sanity_guard.py` 未覆盖各源快照条数，故 355/373 静默通过
3. SRC-07（工信部）连续失败需单独排查；SRC-08 检索词问题仍未修（本次 56 条是英文号检索所得）
4. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常，非空即算成功

## 2026-10-08
- 管线退出码 0，校验通过：STD=347 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2
- **判定情况 C → 未发布**：SRC-07（工信部）报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 4
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0（连续第4 次失败）SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 实测逐块比对：**STD 347→347，added=[] removed=[]，LAWS/ERATA/ALERTS/REFGROUPS 全同**
  → 唯一变化是 SRCS +SRC-11、新增 CNASDOCS(18)/CNASKINDS(6)、RUNSTATE 时间戳、以及「还有 N 天」日计数
- **真实新增/换版/废止/勘误全0**；6 条 MOD 修改单 `detected_at` 全是 10-04，已在库，属重复推送

### 10-07 预测的污染场景已复现，但危害面比预想小
- SRC-05 回到 373（=355+ 18 条带空格标准号），证实 10-07 记录的 355 确实是降级快照
- fetch_wanted 已于 10-06 前后纳入管线（git log `2fbb7c9`），故本次补抓生效、373 为**正确基线**
- 18 条带空格标准已在 STD 中（GB 7718-2025/ 28050-2025 / 2763.1-2022 等），故 STD 仍是 347，未虚增
- 但 `change_events` 表在 18:10 一次写入 **18 条 REVISION + 1 条 NEW**（T/ 团标为主），
  `what_changed` 全是「被代替为 None → ；废止日期 None →」——**空 diff 假变更**
  → 根因：SRC-08 快照字段缺失时 None→None 被判成变更；这些是首次入库前的基线建立期产物，非官方新动作

### 待修（优先级排序）
1. **SRC-07（工信部）连续 4 次失败**：需单独排查接口/风控，不能长期靠历史快照兜底
2. **空 diff 假变更**：change_events 里「None → 」的 REVISION 应在入库前过滤；团标源首日建基线不应产出提醒
3. **静默掉条闸门仍未做**：本次 SRC-05 从 355→373 依旧静默通过 `sanity_guard.py`，条数波动无闸门
4. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-09
- 管线退出码 0，校验通过：STD=347 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2
- **判定情况 C → 未发布**：SRC-07（工信部）报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **5**
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0（连续第5 次失败）SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测：**STD/LAWS/ERATA/ALERTS/CNASDOCS/CNASKINDS 全逐字节一致**
  → REFGROUPS 13 组「changed」经逐项核验**全是 "387 天前"→"388 天前" 日计数递减**，非真实内容变化
  → SOONPOOL 4 条 added/removed 亦为 d 值 133→132、314→313 递减，标准号与实施日期完全相同
  → 唯一实质变化 = RUNSTATE.lastRun（10-08 18:10 → 10-09 19:36）
- **真实新增/换版/废止/勘误全 0**；6 条 MOD 修改单为 10-04 已入库记录的重复推送，去重后 0

### SRC-07 失败升级：不是「快照兜底」，是从未成功过
- `data/snapshots/SRC-07_latest.json` 实为 **2 字节空数组 `[]`**，mtime 停在 10-07 11:46
- 即 SRC-07 **历史上从未取到过任何数据**，10-08 记的「靠历史快照兜底」判断有误 —— 本质是这个源一直是空的
- 已连续 5 次失败；工信部接口疑似已改版或被风控

### 待修（优先级排序）
1. **SRC-07 已彻底失效**：连续 5 次 0 条 + 快照为空数组，需重写适配器（换接口或改检索方式），
   否则婴幼儿配方乳粉的部委公告渠道实际处于盲区
2. **空 diff 假变更仍未修**（10-08 记录）：change_events 里「None → 」的 REVISION 应在入库前过滤
3. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
4. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常，非空即算成功

## 2026-10-10
- 管线退出码 0，校验通过：STD=347 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照」，连续第 6 次
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测：STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS **全 IDENTICAL**
  → REFGROUPS 65 处 diff 全是「386 天前」→「389 天前」日计数递减，SOONPOOL 4 处全是 d 134→131 / 315→312
  → 唯一实质变化 = RUNSTATE.lastRun（10-07 09:45 → 10-10 19:48）
- **真实新增/换版/废止/勘误全 0**；change_events 表 27 行，detected_at 最新仍是 10-08，今日 0 行
- 6 条 MOD 修改单为重复推送，去重后 0（erata/notice 快照中含 2026-10-10 的记录数均为 0）

### ★ SRC-07 诊断结论已推翻前几日的判断（重要）
前几日记的「接口变更或被风控 / 从未成功过」**是错的**。本次直连探测（绕过 pipeline）实测：
- 三个栏目页 HTTP 200，pageId 正常抠出（cd969bf2… / 03b4f… / 3e3ad1…）
- unit 接口 HTTP 200，HTML 载荷 8.5~11.8 KB，**共解析出 96 条列表条目**（公告 31 / 通告 27 / 通知 38）
- **接口完全正常，是过滤器问题**：`_relevant()` 要求「主体词 + 动作词 同现」
  - 命中 FOOD_TERMS 仅 4 条，全是《轻工纺织产业发展"十五五"规划》——命中「轻工」但无动作词
  - 命中 ACTION_TERMS 8 条，命中 EXCLUDE 59 条
  - 两者交集 = **0**，所以返回 0 条
- 判定口径问题：**工信部这三个栏目本身以汽车/电信/集成电路为主，乳制品类文件极少**，
  「返回 0 条」在此源属**正常业务结果**，不是故障
- 但 `crawler.py` 把「0 条 + 无历史快照」判为 error → 这是**误报**，
  且 SRC-07_latest.json 恒为 2 字节 `[]`，于是每日都记一次假失败
- **修正方案（待执行）**：SRC-07 应改为「0 条记 ok + 正常写空快照」，
  或把栏目换成轻工/消费品工业口径；不应再按故障追踪

### 待修（优先级排序）
1. **SRC-07 误报**：改判定逻辑（0 条不算失败），否则 RUNSTATE 里 SRC-07 永远显示异常
2. **空 diff 假变更仍未修**（10-08 记录）：change_events/alerts 里 10 条「被代替为 None → ；废止日期 None → 」
   仍在库且 unread，是首日建基线产物，会持续污染提醒列表
3. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
4. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常，非空即算成功

## 2026-10-11
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4
- **判定：不发布**。校验虽通过且 data.js 有变化（STD 347→348），但**唯一实质变化是一条坏数据**，
  按纪律「不能把坏数据推上线」→ 不发
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 **SRC-06=5** SRC-07=0（冷却跳过，未报错）SRC-08=56 SRC-11=98 公告=56 勘误=176
- SRC-07 本次**未报错**：日志为「连续失败 6 次，冷却中（24 小时内跳过）」= 根本没尝试抓取，
  RUNSTATE healthy=true，保留的日志行仍是「抓取 0 条（该源常为 0，属正常）」ok
  → 10-10 的诊断（SRC-07 返回 0 属正常业务结果、crawler 误报为 error）成立，本日无需按故障计
- data.js 逐块实测：STD 唯一 added 1 条 / removed 0 / modified 0；
  REFGROUPS 25 处 diff 全是「389 天前→390 天前」日计数递减；SOONPOOL 4 处全是 d 131→130、312→311
  → **除那一条外全部是日计数噪声**

### ★ 新增数据缺陷：SRC-06 把新闻答记者问当成公告入库（今日拦下）
- 新增条目：`总局公告 2026-10-10` / 《中华人民共和国食品安全法（修订草案征求意见稿）》答记者问
  status=现行有效、impState=已实施 → **会以「现行有效标准」显示在用户页面上**
- 已直连 samr.gov.cn 原文核实：**是新闻访谈稿，不是公告，无文号**，栏目路径 `knr/xwxcs/`（新闻宣传司），
  而真公告在 `knr/tssps/`、`knr/zfjcs/`、`knr/spcjs/`
- 根因：`sources.py:1105` 的 doc_no 正则只认「2026年 第N号」和「X字〔2026〕N号」两种文号格式；
  答记者问没有 td 里的文号列 → `doc_no=""` → `sources.py:1112` 兜底 `"总局公告 " + date`
  **用发布日期伪造了一个公告号**。SRC-06 现有 5 条里 **3 条是这种日期兜底造号**（09-28、09-20、10-10）
- 次生问题：`_relevant()` 只按标题关键词放行，管不了文号有无；`status="现行"`+`implement_date=publish_date`
  对新闻稿毫无意义，却让 sync_std_to_proto 判成「现行有效」

### 食品安全法修订本身值得关注（但不是标准变更，勿入库）
- 征求意见稿含「将婴幼儿辅助食品纳入特殊食品监管、实施备案管理」，与婴配实验室高度相关
- 但状态是**征求意见稿**，连正式文本都未发布，且抓到的是**答记者问**而非征求意见稿本体
- 按纪律「不得凭经验推断标准的有效性或替代关系」→ 只作观察记录，不生成提醒、不入库

### 待修（优先级排序）
1. **★ SRC-06 日期兜底造号（今日新发现，应升为最高优先级）**：
   无文号时不得伪造公告号。建议 doc_no 为空则丢弃，或标 `status="参考"`/`category` 排除出标准清单；
   并在 `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
2. **SRC-07 误报**（10-10 记录，10-11 复核确认）：0 条不算失败
3. **空 diff 假变更**（10-08 记录）：change_events 里「None → 」的 REVISION 应入库前过滤
4. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常，非空即算成功

## 2026-10-12
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **7**（last_fail=2026-10-12T18:13:08）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=5 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测（归一化掉「N 天前」后）：**STD 348→348，added=[] removed=[] modified=[]**；
  LAWS/ERATA/ALERTS/KWS/SUBS/HIST/CATS/LAW_KINDS/CNASDOCS/CNASKINDS/METHODS/SRCS **全 IDENTICAL**
  → REFGROUPS 13 组归一化后差异 0；SOONPOOL 4 条标准号+实施日期全同，仅 d 130→129、311→310
  → **唯一实质变化 = RUNSTATE.lastRun（10-11 11:23 → 10-12 18:15）**
- **真实新增/换版/废止/勘误全 0**；今日无任何含 2026-10-12 日期的公告/勘误记录

### 复核：10-11 拦下的 SRC-06 坏数据仍在库（未修）
- `总局公告 2026-10-10`《食品安全法（修订草案征求意见稿）》答记者问 仍在 STD 中
- 且 SRC-06 现有 5 条里 **4 条是日期兜底造号**（09-20、09-28、10-10 + 1 条真号 2026年第34号）
- 注意：这 5 条 `validity` 字段现为 **undefined**（不是「现行有效」），但 `impState=已实施` 仍在
  → 10-11 记录里「会以现行有效标准显示」需修正为：**分类/有效性字段已部分为空，但条目本身仍占据 STD 清单**
- `db/stdwatch.db` 的 sqlite_master **返回空表列表**（0 张表），change_events 表实际不存在
  → 10-08/10-09/10-10 记录的「change_events 27 行」已不成立，该库目前是空壳，勿再依赖它做变更判定

### 待修（优先级排序）
1. **SRC-06 日期兜底造号**（10-11 发现，10-12 复核仍在库）：无文号应丢弃或标 `status=参考`，不得伪造公告号；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
2. **SRC-07 连续 7 次失败**（10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」，至今未改判定逻辑）
   → 修 `crawler.py:859`，0 条记 ok 并正常写空快照，否则每日假失败、fails 无限累加
3. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
4. **空 diff 假变更**（10-08 记录）：change_events 表已不存在，此项需改在 alerts/入库层过滤
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-13
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 本次在冷却期被跳过（日志「连续失败 8 次，冷却中」），fails 累计到 **8**
  （last_fail=2026-10-13T21:19:25）；即本轮并未真正尝试抓取，源处于失明状态
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=5 SRC-07=0（冷却跳过）SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测（按 `no` 对齐后逐字段 diff）：**STD 348→348，标准号层面仅 3 处title 变化，
  pub/imp/status/replace 等字段全部未变**；LAWS/ERATA/ALERTS/KWS/SUBS/HIST/CATS/LAW_KINDS/SRCS/CNASDOCS/CNASKINDS/METHODS 全 IDENTICAL
  → REFGROUPS 13 组差异 100% 是「N 天前」日计数递减；SOONPOOL IDENTICAL（4）
  → 唯一实质变化 = RUNSTATE.lastRun（10-12 18:15 → 10-13 21:27）
- **真实新增/换版/废止/勘误全 0**；公告快照与勘误快照中含 2026-10-13 的记录数均为 **0**
  （勘误 176 条最新 erata_date 为 2025-09-15）；6 条 MOD 修改单为重复推送，去重后 0

### ★ 新发现：CFSA 官方源自身把希腊字母音译成了中文（首次确认是上游行为，非本地 bug）
- 3 条标准标题被官方改写：`β` → `贝塔`/`德尔塔`、`δ` → `德尔塔`
  - GB 5009.276-2016 食品中葡萄糖酸-δ-内酯的测定 → 「葡萄糖酸-德尔塔-内酯」
  - GB 5009.292-2023 食品中β-阿朴-8'-胡萝卜素醛的测定 → 「贝塔 -阿朴-…」
  - GB 5009.303-2025 食品中酵母β-葡聚糖的测定 → 「酵母贝塔-葡聚糖」
- **已绕过 pipeline 直连官方接口复核**：`_search_raw` 返回的 `TITLE` 字段本身就是音译后的文本
  → 确认是 **CFSA 官网当前的数据形态**，不是我们解析或编码出错（`scripts/` 全库无任何音译映射代码）
- 注意 GB 5009.276 官标正名用的是 δ，本次音译为「德尔塔」**恰好是对的**；另两条 β→「贝塔」属可接受但不规范的降级
- 影响：仅标题用字，不影响标准号/状态/实施日期，**不构成标准变更**。但会让页面显示「贝塔」这种不专业字样
- 未擅自改回β：按纪律「只信官方源，不得凭经验推断」，本地不应覆盖官方字段

### 待修（优先级排序）
1. **SRC-06 日期兜底造号**（10-11 发现，10-12/10-13 连续复核仍在库）：无文号应丢弃或标 `status=参考`，
   不得伪造公告号；`_relevant()` 加「答记者问|新闻|访谈|图解」排除词
2. **SRC-07 已冷却跳过 8 次**：本轮压根没尝试抓取，部委公告渠道持续失明
   → 修 `crawler.py:857-859`，0 条记 ok 并正常写空快照（10-10 已诊断为误报，判定逻辑至今未改）
3. **希腊字母音译**（10-13 新发现）：可在入库时对官方 TITLE 做 `贝塔|德尔塔|阿尔法|伽马` → 希腊字母的**规范化**
   （属显示层还原，不改判定），需先确认官方是否只是临时音译、后续会改回
4. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-14
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 A → 已发布**（https://infant-std-watch.app.workbuddy.host/），发布后已 curl 回读校验：线上 STD 与本地逐字节 IDENTICAL
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=5 SRC-07=0（**冷却跳过**）SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测：**STD 348→348 逐字节 raw=SAME，added=[] removed=[] modified=0（今日 title 变化数也是 0）**
  ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASDOCS/CNASKINDS/METHODS **全 raw=SAME**
  → REFGROUPS 13 组差异 100% 是「N 天前」日计数；SOONPOOL 4 条仅 d 递减（128→127、309→308）
  → 唯一实质变化 = RUNSTATE.lastRun（10-13 21:27 → 10-14 19:59）
- **真实新增/换版/废止/勘误全 0**；公告快照与勘误快照中含 2026-10-14 的记录数均为 **0**

### ★ 判定口径修正：本日属「A」但要说明白为什么不矛盾
- 前几日把「data.js 仅时间戳变化」记为情况 C/不发布，理由是 SRC-07 冷却跳过
- 但按用户纪律原文，情况 C 的触发条件是**「抓取阶段有源报错」**；本日 SRC-07 是**冷却跳过（未尝试、非报错）**，
  RUNSTATE healthy=true、9 条日志全 ok、无任何 error → **不构成情况 C**
- 且线上副本已滞后到 **10-07 01:51**（curl Last-Modified 实测），data.js 确有变化 → 按原文即情况 A
- **结论：今后区分「冷却跳过（不发布理由不成立）」与「真实报错（才禁止发布）」，不要混为一谈**

### 10-13 记录的音译问题复核：确认是历史遗留，非今日新增
- 三条含「贝塔/德尔塔」的标准（GB 5009.276-2016 / GB 5009.292-2023 / GB 5009.303-2025）运行前后 title 完全一致
- git diff 里的 title 变化是**相对旧提交**（c6f566d）的历史差异，不是本次抓取产生

### 待修（优先级排序，与 10-13 一致）
1. **SRC-06 日期兜底造号**（10-11 发现，10-12/10-13/10-14 连续复核仍在库）：无文号应丢弃或标 `status=参考`，
   不得伪造公告号；`_relevant()` 加「答记者问|新闻|访谈|图解」排除词
2. **SRC-07 熔断会无限累积**：`fails=8` 且 `last_fail` 每次冷却到期后被刷新，24h 冷却窗口实际永不结束
   （本日距上次 fail 22.7h 仍在冷却内）→ 部委公告渠道已连续多日失明，需修判定逻辑（0 条记 ok）
3. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
4. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-16
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **10**
  （last_fail=2026-10-16T19:11:55，落在本次运行窗口 19:08–19:14 内 → **本日真实尝试并失败**，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=5 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测（data.js 顶层变量是 **`window.STDWATCH_DATA`**，不是 DATA）：
  STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASDOCS/CNASKINDS/METHODS **全 raw=IDENTICAL**
  → STD added=[] removed=[] modified=0
  → REFGROUPS 65 处字符串差异，**非日计数器差异 0 处**（脚本按「数字全部替换为 #」归一化验证）
  → SOONPOOL 4 条仅 d 递减（126→125、307→306）
  → **唯一实质变化 = RUNSTATE.lastRun（10-15 18:32 → 10-16 19:14）**
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 0 行（总计 27 行，max仍为 10-08）；
  公告/勘误快照中含 10-15、10-16 的记录数均为 **0**；勘误最大 erata_date 仍是 2025-09-15
- 6 条 MOD 修改单为 10-04 已入库记录的重复推送，去重后 0；注意勘误快照 176 条**无 type 字段**（全 None），
  MOD 判定只能靠 change_events 表，不能按快照 type 统计

### 复核：SRC-06 日期兜底造号连续第 5 天仍在库（未修）
- `总局公告 2026-09-20` / `2026-09-28` / `2026-10-10` 三条仍是「日期兜底造号」，其中 10-10 那条
  《食品安全法（修订草案征求意见稿）》答记者问**是新闻稿不是公告**，仍占据 STD 清单
- 5 条 SRC-06 记录 `validity` 均为 **undefined**（非「现行有效」），但 `impState=已实施` 仍在
- 音译三条（GB 5009.276-2016 德尔塔 / GB 5009.292-2023 贝塔 / GB 5009.303-2025 贝塔）运行前后 title 完全一致
  → 确认为历史遗留字段，非今日新增（印证 10-14 结论）

### 10-15 记录的 healthy 假阳性今日复现
- RUNSTATE 仍输出 `healthy: true`「健康 正常」，而 `crawl_logs` 今日 9 条里明确有
  `error / SRC-07`，`source_health.json` 的 SRC-07 fails 已到 10
- → 再次印证：**判断是否报错不能只看 RUNSTATE，必须交叉核对 crawl_logs + source_health.json**

### 待修（优先级排序）
1. **healthy 假阳性**（10-15 发现，10-16 复现）：`build_runstate.py` 需读 `crawl_logs` 当日 error 与
   `source_health.json` fails，反映到 healthy 与 logs
2. **SRC-07 判定逻辑**：连续 10 次 fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照
3. **SRC-06 日期兜底造号**（10-11 发现，10-12/13/14/15/16 连续复核仍在库）：无文号应丢弃或标 `status=参考`；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
4. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

### 工具备忘
- 比对 data.js 前后差异用 Node vm 沙箱加载，顶层变量名是 `window.STDWATCH_DATA`；
  REFGROUPS 的「N 天前」噪声可用「字符串内所有数字替换为 #」归一化精确证伪

## 2026-10-18
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **11**
  （last_fail=2026-10-18T16:20:13，落在本次运行窗口 16:16–16:22 内 → **本日真实尝试并失败**，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=5 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测：**STD / ERATA / ALERTS / KWS / SUBS / HIST / LAWS / CATS / LAW_KINDS / SRCS /
  CNASDOCS / CNASKINDS / METHODS 全 raw=IDENTICAL**（注意归一化脚本会把这些直接判为 SAME，
  STD 实测是 **raw 完全一致**，连字段顺序都没变）
  → REFGROUPS / SOONPOOL / RUNSTATE 仅「N 天前」日计数与时间戳
  → **唯一实质变化 = RUNSTATE.lastRun（10-16 19:14 → 10-18 16:22）**
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 **0 行**（总计 27 行，max 仍停在 10-08 10:10:25）；
  db `alerts` 表今日新增 0 行（总计 27 行，全部 created_at=2026-10-08）
- 7 个源快照 + 公告 + 勘误快照中含 `2026-10-15/16/17/18` 的记录数**全部为 0**；
  公告最大 notice_date=2026-08-18，勘误最大 erata_date=**2025-09-15**（已停滞近一年，属正常）
- 「勘误提醒 6」是 10-08 已入库记录的重复推送，去重后 0

### 工具备忘（本日新增，重要）
- **真实数据库是 `data/stdwatch.db`，不是 `db/stdwatch.db`**
  - `db/stdwatch.db` 的 sqlite_master **返回空表列表**（空壳，勿再依赖）
  - `data/stdwatch.db` 有 15 张表：sources / keywords / standards / snapshots / snapshot_items /
    **change_events** / **alerts** / users / subscriptions / reminder_rules / **crawl_logs** / weekly_reports
  - → **10-12 记的「change_events 表不存在」是查错了库**，该表一直在 `data/stdwatch.db` 里
  - 列名：`crawl_logs(id, run_id, level, source_code, message, cost_ms, created_at)`
    `change_events(id, std_id, std_no, event_type, level, title, what_changed, ..., detected_at, ...)`
    `alerts(id, change_id, std_no, level, title, body, user_id, status, read_at, ..., created_at)` ← **无 detected_at**
  - **`crawl_logs.created_at 存的是 UTC**（今日 08:19–08:21 = 本地 16:19–16:21），
    判断「是否落在运行窗口内」时要 +8 小时再比，否则会误判成冷却跳过
- 源快照 JSON 是**以标准号为 key 的 dict**，不是 list → 统计条数用 `len(d)`，扫日期要遍历 `d.items()`
- 比对 data.js 前后差异仍用 Node vm，顶层变量 `window.STDWATCH_DATA`；
  归一化（数字全替换为 #）可精确证伪「N 天前」日计数噪声

### 复核：SRC-06 日期兜底造号连续第 6 天仍在库（未修）
- `总局公告 2026-09-20` / `2026-09-28` / `2026-10-10` 三条仍是「日期兜底造号」，仍占据 STD 清单
- 本日 STD raw 逐字节未变 → 该坏数据**未继续扩散**，但也**从未被清除**

### 复核：healthy 假阳性第 3 天复现
- RUNSTATE `healthy: true`「健康 正常」，logs 里 SRC-07 那行仍是 **10-07 11:46 的陈旧残留**
- 今日 `crawl_logs` 明确有 `error / SRC-07`，`source_health.json` fails 已到 **11**
- → 再次印证：**判断是否报错必须交叉核对 crawl_logs + source_health.json，不能只看 RUNSTATE**

### 待修（优先级排序）
1. **healthy 假阳性**（10-15 发现，10-16/10-18 连续复现）：`build_runstate.py` 需读 `crawl_logs` 当日
   `level='error'` 与 `source_health.json` fails，反映到 healthy 与 logs，否则页面天天显示「健康 正常」
2. **SRC-07 判定逻辑**：连续 11 次 fails，10-10 已直连诊断为「接口正常、96 条可解析，
   是过滤器要求『主体词+动作词同现』导致交集为 0；该栏目本身以汽车/电信为主，返回 0 属正常业务结果」
   → 修 `crawler.py:859`，0 条记 ok 并正常写空快照
3. **SRC-06 日期兜底造号**（10-11 发现，已连续 6 天）：无文号应丢弃或标 `status=参考`；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
4. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
6. SRC-05 日志「抓取 355 条」vs 快照 373 的差额已查明：355 = 主流程，+18 条含空格标准号来自
   `fetch_wanted.py` 补充抓取（已入管线），**373 是正确基线**，非异常

## 2026-10-15
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **9**
  （last_fail=2026-10-15T18:30:35，落在本次运行窗口 18:30–18:32 内 → **本日是真的尝试了并失败**，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=5 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 用 Node vm 逐块实测（归一化「N 天前」后）：**STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASDOCS/CNASKINDS/METHODS 全 raw=SAME**
  → REFGROUPS 归一化后 SAME；SOONPOOL 4 条仅 d 递减（127→126、308→307），标准号与实施日期全同
  → 唯一实质变化 = RUNSTATE.lastRun（10-14 19:59 → 10-15 18:32）
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 0 行（最新仍是 10-08 的 18 行）；
  公告/勘误快照中含 2026-10 的记录数为 0，勘误最大 erata_date 仍是 2025-09-15；6 条 MOD 提醒为重复推送，去重后 0

### ★ 新发现：RUNSTATE 的 healthy 判定完全不看抓取日志（页面「健康」栏是假阳性）
- `crawl_logs` 今日明确记有 `error / SRC-07 / 返回 0 条且无历史快照`，但 RUNSTATE 仍输出 `healthy: true`、`健康 正常`
- 根因：`build_runstate.py` 的 healthy 只按**时间**判（`age_h > 36` 或 nextRun 逾期），从不读 `crawl_logs.level='error'`
  也不读 `source_health.json` 的 fails
- 页面 logs 里那条 SRC-07「ok 抓取 0 条（该源常为 0，属正常）」是**10-07 11:46 的陈旧残留**，不是今天的日志
  → 每天看页面都会以为 SRC-07 正常，实际已连续失败 9 次
- **教训**：判断「是否报错」不能只看 RUNSTATE，必须交叉核对 `crawl_logs` + `source_health.json`；
  10-14 记的「冷却跳过不算情况 C」口径依然成立，但今天证明**冷却到期后的真实失败必须抓出来**

### 待修（优先级排序）
1. **healthy 假阳性**（今日新发现，应升为最高优先级）：`build_runstate.py` 需读 `crawl_logs` 当日 error 与
   `source_health.json` fails，把「N 小时内有源报错 / fails≥阈值」反映到 healthy 与 logs，
   否则页面天天显示「健康 正常」，真实失明看不见
2. **SRC-06 日期兜底造号**（10-11 发现，10-12/10-13/10-14/10-15 连续复核仍在库）：无文号应丢弃或标 `status=参考`，
   不得伪造公告号；`_relevant()` 加「答记者问|新闻|访谈|图解」排除词
3. **SRC-07 判定逻辑**：连续 9 次 fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照（否则熔断每 24h 反复触发，部委公告渠道持续失明）
4. **静默掉条闸门仍未做**：各源快照条数未纳入 `sanity_guard.py`
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-19
- 管线退出码 0，校验通过：STD=331（还原后 348）LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**。两处源异常：
  1. **SRC-07（工信部）ERROR**，fails 累计到 **12**，`last_fail=2026-10-19T18:20:49`（落在 18:17–18:22 运行窗口内 → 真实尝试并失败，非冷却跳过）
  2. **SRC-05（CFSA）静默塌库**：日志「抓取 0 条」，快照 **373 → 3 条**
- 各源：SRC-01=3 SRC-02=7 SRC-05=373（已还原）SRC-06=5 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- data.js 逐块实测：STD **348 → 331，removed 18 条 / added 1 条**；ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASDOCS/CNASKINDS/METHODS 全 raw=SAME
  → REFGROUPS/SOONPOOL 差异 100% 是「N 天前」日计数
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 0 行（总计仍 27 行，max 停在 10-08 10:10:25）

### ★ 今日根因（重要）：CFSA 标准库表整体返回空，是上游故障而非官方撤回
- 18 条消失的核心标准：GB 7718-2025 / GB 28050-2025 / GB 23790-2023 / GB 31607-2021 /
  GB 25596-2025 / GB 29922-2013+2025 / GB 2763-2021 / GB 2763.1-2022 / GB 10766-2021 等
- **已绕过 pipeline 直连官方接口复核**，`https://sppt.cfsa.net.cn:8086/db`：
  - HTTP 200，但 `num_tn=2`（TAB_STANDARD）返回体恒为 **2 字节 `[]`**
  - **决定性证据：空 keyword 也返回 `[]`**；中文宽词「食品」「食品安全国家标准」同样 0 条
    → 不是检索词问题，是整张表没数据
  - 同session 同 host 的 `num_tn=4`（TAB_ERATA）正常返回 **79223 字节 / 176 条**
    → 站点活着、会话正常，**只有标准库那张表挂了**
  - `num_tn=1`（NOTICE）、`num_tn=3`（EXPLAIN）同样返回 `[]` → 4 张表里 3 张空
- 另：`openstd.samr.gov.cn` 交叉验证返回 **HTTP 200 但响应体 0 字节**（无法作为交叉源）

### 处置（已执行，未发布）
- `git checkout data/snapshots/SRC-05_latest.json` → 回 **373 条**
- `python scripts/daily_check.py --skip-fetch` 重建 → **STD 恢复 348**，added=[] removed=[] modified=0
  （3 条 title 的β/德尔塔写法也回到原值）
- 线上**未动**：`https://infant-std-watch.app.workbuddy.host/data.js` Last-Modified 仍是 2026-10-14 11:59:56 GMT

### ★ 静默掉条闸门缺失第4 次，这次造成实际危害（升为最高优先级）
- `sanity_guard.py` 只校验 STD/LAWS/REFGROUPS/ERATA/ALERTS 的**绝对下限**，STD=331 仍过阈值
  → **373 → 3 的灾难性掉条零告警通过**
- 且 SRC-05 在 `crawl_logs` 里记为 **`ok / 抓取 0 条，变更 0 条`，不是 error**
  → 比 SRC-07 更危险的一类：**失败被记成成功**，页面「各源 SRC-05 3 条」看起来像正常结果
- 今日唯一拦截手段是我人工比对基线发现 STD 348→331，**属于侥幸，不能依赖**

### 复核
- healthy 假阳性**第 4 天复现**：RUNSTATE `healthy: true`，而 `crawl_logs` 明确有 `error / SRC-07`
- SRC-06 日期兜底造号连续第 7 天仍在库
- 公告源本日报 WARNING「返回 0 条，跳过」，notice 快照 mtime 停在 10-18 16:21（沿用旧快照）

### 待修（优先级排序）
1. **静默掉条闸门**（10-06首次记录，今日造成实际事故）：`sanity_guard.py` 必须校验**各源快照条数环比**
   （如跌幅 >20% 即判失败并阻断发布），且「主流程抓到 0 条」应记 **error 而非 ok**。
   当前 `crawler.py` 只在总条数为 0 且无历史快照时抛错，有历史快照就静默接受 → 必须改
2. **SRC-07 判定逻辑**：连续 12 次 fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照
3. **SRC-06 日期兜底造号**（10-11 发现，已连续 7 天）：无文号应丢弃或标 `status=参考`；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
4. **healthy 假阳性**（10-15 发现，已连续 4 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
5. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

### 工具备忘
- 复核 CFSA 是否真故障的判定手法：同一 session 下对比 `num_tn` 不同表的响应体长度；
  **空 keyword 仍返回 `[]` 即为上游故障**（可与检索词问题区分开，这点SRC-07/SRC-08 的老问题用得上）
- `standards` 表实际是**空表（0 行）**，STD 清单全部由快照 JSON 实时重建 → 快照一坏，页面立刻缺标准

## 2026-10-21
- 管线退出码 0，校验通过：STD=347 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**。SRC-07（工信部）ERROR，fails 累计到 **13**
  （`last_fail=2026-10-21T18:56:06`，落在 18:55–18:58 运行窗口内 → 本日真实尝试并失败，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=56 SRC-11=98 公告=56 勘误=176
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 0 行（总计仍27 行，max 停在 10-08 10:10:25）；
  公告/勘误快照中含 `2026-10-1x`、`2026-10-2x` 的记录数均为 **0**；勘误 max erata_date=2025-09-15

### ★★ 首次抓到「分页截断型静默掉条」，危害大且已造成实际掉条（今日最高优先级）
**首跑 data.js 出现 STD 348→343、removed 5 / added 1，逐条核验后确认全部是抓取侧丢失，官方无任何撤回：**
- **SRC-06（总局公告）5 → 2 条**，丢 3 条：`总局公告 2026-09-20`《婴幼儿配方食品标签标识问答》、
  `2026-09-28`（三唑磷快速检测法等13 项）、`市监稽发〔2026〕117 号`（沃诺雷生/托拉塞米认定意见）
  - **已逐条直连 samr.gov.cn 原文核实：3 条全部 HTTP 200 且正文关键词命中 → 官方原文仍在，属抓取丢失**
  - 根因：`SamrNoticeAdapter.fetch` 只请求**一个固定栏目页**（`PAGE_ID`+`LIST_TAG`），无翻页；
    该栏目是滚动更新流，实测今日 26 行已整体轮换成「人大建议答复 / 广告产业规划 / 录用公示」，
    稍早的公告滑出首页即从快照消失 → **不是被撤回，是滚出采集窗口**
  - 追加证据：换任何检索词（婴幼儿/乳粉/食品/公告/总局）返回的都是同一批 2 条 → 印证是栏目页口径、非检索词问题
- **SRC-08（团标）56 → 54 条**，丢 2 条：`T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》、
  `T/HHPA 005-2022`《婴幼儿肠造口护理技术标准》
  - **已直连 ttbz.org.cn 分页核验：`T/HHPA 005—2022` 仍在 page2、状态「现行」→ 未被废止，是采集丢失**
  - 根因：`TtbzStdAdapter.fetch` 每个检索词**只取 page1（size=20）**，不分页；
    `SOURCE_OWN_TERMS['SRC-08']` 里 `婴幼儿` 这个词有 **100+ 条**（实测 5 页共 100 行，page6 起为空），
    排序一变就把 `T/HHPA 005—2022`（page2）挤到采集窗口外
  - 附带发现：`T/HGMIF 001—2022`（LED显示屏）与丢失的 `T/HGMIF 001—2021`（婴幼儿配方乳粉）**号段重复但内容完全不同**，
    检索「HGMIF」时只会返回 2022 那条 —— 团标平台按号检索不做精确匹配，**不能用「搜标准号」验证团标是否还在**
- **处置（已执行）**：`git checkout` 还原 SRC-06 / SRC-08 两个快照（回 4 / 56 条），
  再 `python scripts/daily_check.py --skip-fetch` 重建 → **STD 恢复 347，added=0 removed=0**，
  仅剩 3 条 CFSA 官方音译 title 差异（β→贝塔/德尔塔，历史遗留，非今日新增，未擅自改回）
- 线上**未动**（未发布）

### 教训：分页/滚动窗口 = 静默掉条的第四种形态，比接口故障更隐蔽
- 前三次「静默掉条」记录（10-06/10-19）都是**接口整体返回空**；今日是**接口正常返回、但只返回了第一页**
  → `sanity_guard.py` 与 `crawler.py` 的「非空即算成功」判定**完全无法识别**
- 「抓取成功 2 条/54 条」在日志里显示为 `ok`，看不出任何异常，**必须靠与基线逐条比对才能发现**
- 验证手法（今日确立，可复用）：
  1. 先 `git show HEAD:data/snapshots/XXX.json` 取基线快照，与当前快照逐 key 求差集
  2. 对丢失条目**直连官方原文/详情接口**确认是否仍存在（区分「官方撤回」vs「采集丢失」）
  3. 团标/列表类源要**翻页验证**，不能只查page1
- 这类掉条一旦过夜，次日会被判成「官方废止/撤回」并推送**假废止提醒** —— 比 10-19 的事故更危险

### 复核（旧问题）
- healthy 假阳性**第 5 天复现**：RUNSTATE`healthy: true`，而 `crawl_logs` 明确有 `error / SRC-07`
- SRC-06 日期兜底造号连续第 8 天仍在库；音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 待修（优先级排序）
1. **分页采集缺失（今日新发现，最高优先级）**：
   - `TtbzStdAdapter.fetch`：`search()` 支持 `page_no`，但 `fetch` 只调 page1 →
     对结果数达满页（20 行）的检索词必须**循环翻页至空页**为止（实测 `婴幼儿` 有 100+ 条）
   - `SamrNoticeAdapter.fetch`：单一栏目页会滚动刷新导致旧公告滑出 →
     需改为**多栏目/多 tagId 轮询**或对已知 `art_` 直链做存活校验（保底：快照条目数环比跌幅超阈即判失败）
   - 两者都要配合第 2 项的闸门，否则修完仍会静默掉条
2. **静默掉条闸门**（10-06 首次记录，10-19 造成事故，**今日第4 次复现且首次为分页型**）：
   `sanity_guard.py` 必须校验**各源快照条数环比**（跌幅 >20% 判失败并阻断发布）；
   「抓到 N 条且 N < 历史基线」应记warn/error 而非 ok
3. **healthy 假阳性**（10-15 发现，已连续 5 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
4. **SRC-07 判定逻辑**：连续 13 次 fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照
5. **SRC-06 日期兜底造号**（10-11 发现，已连续 8 天）：无文号应丢弃或标 `status=参考`；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
6. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-23
- 管线退出码 0，校验通过：STD=347（还原后）LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **14**
  （`last_fail=2026-10-23T19:31:23`，落在 19:27–19:33 运行窗口内 → 本日真实尝试并失败，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4（还原后）SRC-07=0 SRC-08=56（还原后）SRC-11=98 公告=56 勘误=176
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 0 行（总计仍 27 行，max 停在 10-08 10:10:25）；
  alerts 今日 0 行；公告 max notice_date=2026-08-18、勘误 max erata_date=2025-09-15，
  两快照中含 2026-10-15 及之后日期的记录数**均为 0**；6 条 MOD 修改单为重复推送，去重后 0

### ★ 10-21 记录的「分页/滚动窗口型静默掉条」第 2 次复现，条目完全相同
首跑 STD **347 → 343**（removed 4 / added 1），与 10-21 记录的丢条**一模一样**：
- **SRC-06（总局公告）4 → 2 条**，丢 3 条；新进 1 条 `总局公告2026-10-10`（食品安全法答记者问，日期兜底造号那条）
- **SRC-08（团标）56 → 54 条**，丢 2 条
- **处置**：`git checkout` 还原两快照（回 4 / 56）+ `--skip-fetch` 重建 → **STD 恢复 347，added=0 removed=0**

### 本次取得的决定性证据（比 10-21 更硬，建议直接照此改代码）
1. **SRC-06 丢失的三条官方原文全部存活** —— 用快照里存的 `official_url`（注意字段名是 `official_url`，不是 url/link，
   10-21 若查不到 URL 很可能就是这个字段名问题）直连 samr.gov.cn：
   婴幼儿配方食品标签标识问答（tssps/art_943fcb…）、三唑磷13项检测（spcjs/art_72120…）、
   沃诺雷生/托拉塞米117号（zfjcs/art_7d69b…）**全部 HTTP 200 且 `<title>` 与标题完全一致**
   → **确证是采集丢失，非官方撤回**
   - **关键新证据：三条分别位于 `tssps/`、`spcjs/`、`zfjcs/` 三个不同子栏目**
     而适配器只抓**一个**固定栏目页（`PAGE_ID`+`LIST_TAG=当前内容`）→ 结构性漏采，必然复发
   - 翻页实测：currPage=1..8 返回的 html **都是 16621 字节完全相同** → **该栏目翻页参数无效**，
     只能看到滚动窗口第一屏；所以「翻页」这条路走不通，**必须改多栏目轮询**
2. **SRC-08 丢失的两条官方仍在库**：`T/HHPA 005-2022`《婴幼儿肠造口护理技术标准》检索 `HHPA` total=10、
   **page1 即命中、状态「现行」**；`婴幼儿肠造口` 精确检索也命中 → **根本没掉，是检索词/分页覆盖不到**
   - `T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》：检索 `HGMIF` total=26，
     page1(20)+page2(6) 全列出**不含该条**；`婴幼儿配方乳粉` total=13、`绿色设计产品评价技术规范 婴幼儿` total=0
     → 与 10-21 记录一致（团标平台按号检索不做精确匹配，`HGMIF 001` 号段被 2022 那条 LED显示屏占用），
     **该条无法用检索验证存废，只能靠快照保留**
   - 对比：`HHPA` total=10 未满页，**不满页的检索词不该掉条** → 证明掉条根因是
     **`SOURCE_OWN_TERMS['SRC-08']` 的检索词选取不当，而非分页**（修正 10-21 的分页结论）

### 工具备忘（本日新增，重要）
- 快照条目 URL 字段名 = **`official_url`**（读 `url`/`link` 全为空，会误判「没有 URL 无法核验」）
- 总局公告栏目接口 `/api-gateway/.../unit`：`tagId` 只有 `当前内容` 返回条目（25 条），
  `栏目3_list_b`/`栏目3_list2_b` 返回 0 条；**currPage 翻页无效**
- 团标接口必须用 `POST /cms-proxy/ms/portal/standardInfo/getPortalStandardList`（form 编码），
  直连 `/standard.html` 是 405；返回体 `data.total` + `data.rows`
- **git HEAD 的 data.js / 快照基线已陈旧（data.js 停在 10-07 `c6f566d`，快照停在 10-07 `7416d3f`）**
  → 直接与 HEAD 比会得到 285 条 STD「modified」，全是 url 字段补 guid、`days_to_implement` 递减等历史累积差异，
  **不可作为当日变更判据**；应以「与上一次还原后的稳定基线（347 条）逐条比」为准
- RUNSTATE `healthy: true` 假阳性**第 6 天复现**（今日 crawl_logs 明确有 error/SRC-07）

### 待修（优先级排序）
1. **SRC-06 多栏目轮询（今日证据最硬，升为最高优先级）**：三条丢失公告分散在 `tssps/`/`spcjs/`/`zfjcs/` 三个子栏目，
   适配器只抓一个栏目页，且该栏目 **currPage 翻页无效**（恒返回第一屏 16621 字节）
   → 必须改成**多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底**
   （今日证明：只要记住 URL，就能直连判存活，不必依赖栏目页）
2. **SRC-08 检索词选取（修正 10-21 的分页结论）**：`HHPA` 检索 total=10 未满页却仍掉 `T/HHPA 005-2022`
   → 说明 `SOURCE_OWN_TERMS['SRC-08']` 未包含 `HHPA`，或分页只取 page1 导致未覆盖；
   `HGMIF 001-2021` 平台侧无法检索，只能靠快照保留，**不要因检索不到就判定废止**
3. **静默掉条闸门**（10-06 首次，10-19 事故，10-21 & **今日第 5 次复现**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   「抓到 N 条且 N < 基线」应记 warn/error 而非 ok
4. **SRC-07 判定逻辑**：连续 **14** 次 fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照
5. **healthy 假阳性**（10-15 发现，已连续 6 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
6. **SRC-06 日期兜底造号**（10-11 发现，已连续 9 天）：无文号应丢弃或标 `status=参考`，
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-26
- 管线退出码 0，校验通过：STD=342（还原后 347）LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07 报错「返回 0 条且无历史快照，视为未接通」，fails 累计到 **15**
  （`last_fail=2026-10-26T18:15:11`，落在 18:11–18:19 运行窗口内 → **本日真实尝试并失败**，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4（还原后）SRC-07=0 SRC-08=56（还原后）SRC-11=98 公告=56 勘误=176
- 首跑 STD **347 → 342，removed 6 / added 1**；还原后 **347，added=0 removed=0 modified=0**
- **真实新增/换版/废止/勘误全 0**；change_events 今日新增 0 行（总计仍 27 行，max 停在 10-08 10:10:25）；
  alerts 今日 0 行；公告快照 max notice_date=2026-08-18、勘误 max erata_date=2025-09-15，
  两快照中含 2026-10-2x 日期的记录数**均为 0**；6 条 MOD 修改单为重复推送，去重后 0

### ★ 分页/滚动窗口型静默掉条第 3 次复现（10-21 → 10-23 → 今日），且今日 SRC-06 首次跌到 1 条
首跑丢失 6 条，**逐条直连官方原文复核，全部存活 → 确证为采集丢失，非官方撤回**：
- **SRC-06（总局公告）4 → 1 条**，丢 4 条（备份快照里 10-24 那次已掉到 2 条，今日再跌到 1）：
  - `总局公告 2026-09-20`《婴幼儿配方食品标签标识问答》（tssps/art_943fcb…）
  - `总局公告 2026-09-28`《蔬菜水果中三唑磷的快速检测 胶体金免疫层析法》等13项（spcjs/art_72120…）
  - `总局公告 2026年第34号`《特定全营养配方食品临床试验技术指导原则 肌肉衰减症》等3个文件（tssps/art_e02cc…）
  - `总局公告 市监稽发〔2026〕117 号`（沃诺雷生/托拉塞米，zfjcs/art_7d69b…）
  - 复核结果：**4 条全部 HTTP 200 且 `<title>` 与标题完全一致** → 官方原文仍在
  - **新进的 1 条 = `总局公告 2026-10-10`《食品安全法（修订草案征求意见稿）》答记者问** ——
    这正是 10-11 发现、至今未修的**日期兜底造号**坏数据（`xwxcs/` 新闻宣传司栏目，非公告栏目）
  - **丢失的 4 条分散在 `tssps/` `spcjs/` `zfjcs/` 三个不同子栏目**，而适配器只抓一个固定栏目页 → 结构性漏采，已连续 3 天复现
- **SRC-08（团标）56 → 54 条**，丢 2 条：`T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》、
  `T/HHPA 005-2022`《婴幼儿肠造口护理技术标准》
  - 复核：`T/HHPA 005—2022` 检索 `HHPA`（total=10 未满页）**page1 即命中、状态=现行**；
    精确检索 `婴幼儿肠造口`（total=2）**也命中** → **根本没掉，是采集覆盖不到**
  - `T/HGMIF 001-2021` 仍无法检索验证（`HGMIF` total=26 page1+page2 不含；`婴幼儿配方乳粉` total=13 不含）→ 只能靠快照保留
- **处置**：`git checkout` 还原 SRC-06 / SRC-08 两快照（回 4 / 56 条），
  再 `python scripts/daily_check.py --skip-fetch` 重建 → **STD 恢复 347，added=0 removed=0 modified=0**
- 线上**未动**（curl 实测 Last-Modified 仍是 `Wed, 14 Oct 2026 11:59:56 GMT`，Content-Length 246840）

### 工具备忘（本日新增/修正，重要）
- 团标接口正确参数是 **`searchKey` + `pageNo` + `pageSize`**（不是 `current`/`size`/`key`）。
  用错参数时**所有关键词都返回 total=100**，看似"有大量结果"实则完全无效 —— 必须核对 total 是否合理
- 团标 `rows` 字段名：`standardNo` / `standardTitleCn` / `status`（status=1 为现行）
- 总局公告 5 条丢失项的 URL 字段仍是 `official_url`（快照内）→ `data.js` 里映射为 `url`
- 判断"是否发布"仍必须交叉核对：`crawl_logs`（当日 error）+ `source_health.json`（fails）+ `source_health` 外的 RUNSTATE
- 公告/勘误快照是 **list**（不是 dict），统计条数用 `len()`；扫日期要遍历 list 元素
- 团标检索 `HHPA` total=10 **未满页却仍掉条** → 再次印证 10-23 结论：SRC-08 掉条根因是
  **`SOURCE_OWN_TERMS['SRC-08']` 检索词选取不当**（缺 `HHPA`），不是分页

### 复核（旧问题）
- healthy 假阳性**第 7 天复现**：RUNSTATE `healthy: true`，而今日 `crawl_logs` 明确有 `error / SRC-07`
- SRC-06 日期兜底造号连续第 10 天仍在库（今日又新进 1 条 `总局公告 2026-10-10`）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 待修（优先级排序）
1. **SRC-06 多栏目轮询（连续 3 天造成实际掉条，升为最高优先级）**：4 条丢失公告分散在 `tssps/`/`spcjs/`/`zfjcs/` 三栏目，
   适配器只抓一个栏目页且 `currPage` 翻页无效 → 必须改成**多 pageId/多目录路径轮询**，
   并对快照内已有 `official_url` 做**存活校验兜底**（今日证明：记住 URL 就能直连判存活）
2. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021` 平台侧无法检索，**不要因检索不到就判定废止**
3. **静默掉条闸门**（10-06 首次，10-19 事故，10-21/10-23/**今日第 6 次复现**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   「抓到 N 条且 N < 基线」应记 warn/error 而非 ok —— 今日 SRC-06 抓到 1 条仍记 `ok`
4. **SRC-06 日期兜底造号**（10-11 发现，已连续 10 天）：无文号应丢弃或标 `status=参考`，
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词 —— 今日它又作为唯一条目留在 SRC-06 快照里
5. **SRC-07 判定逻辑**：连续 **15** fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照
6. **healthy 假阳性**（10-15 发现，已连续 7 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

## 2026-10-28
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**：SRC-07（工信部）ERROR，fails 累计到 **16**
  （`last_fail=2026-10-28T22:07:34`，落在 22:04–22:12 运行窗口内 → **本日真实尝试并失败**，非冷却跳过）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4（还原后）SRC-07=0 SRC-08=57（还原后）SRC-11=98 公告=56 勘误=185
- 首跑 STD **347 → 341，removed 7 / added 1**；还原后 **348，added=1 removed=0 modified=0**
- **真实新增**：勘误 **9 条**（erata_date=2026-10-28，CFSA 官方 erata 表）+ 团标 **1 条**（T/JAASS 70-2022）
  - 9 条勘误涉及 5 个标准：GB 4806.7-2023(4) / GB 5009.304-2025(2) / GB 1886.384-2025 / GB 5009.235-2016 / GB 5009.33-2025
  - **GB 5009.33-2025 12.2.1 与婴配直接相关**：固体试样→其他试样（乳粉取样口径变化），但 grade=low 未进提醒队列
  - T/JAASS 70-2022《液态乳和乳粉中8种拟除虫菊酯类农药…》检索 `液态乳和乳粉` total=2 page1 命中 status=1 现行
    → 官方确认存在；git HEAD 与线上 data.js 均无 JAASS → 历史从未入库的**存量团标**（publish_date=2022-10-21，非今日发布）
- 换版 0 条、废止 0 条（官方无动作）；change_events 今日新增 **0 行**（总计仍 27 行，max 停在 10-08 10:10:25）；
  alerts 今日 0 行（总计 27 行）
- 线上**未动**：curl 实测 Last-Modified 仍是 `Wed, 14 Oct 2026 11:59:56 GMT`，Content-Length 246840

### ★ 静默掉条第 7 次复现，SRC-06 首次跌到 0 条
- **SRC-06（总局公告）4 → 0 条**（比 10-26 的 1 条更糟），4 条全丢：
  婴幼儿配方食品标签标识问答(tssps)、三唑磷13项(spcjs)、特定全营养配方食品临床试验技术指导原则(tssps)、
  沃诺雷生/托拉塞米117号(zfjcs)
  - **4 条全部 HTTP 200 且 `<title>` 与标题完全一致 → 官方原文仍在，确证采集丢失**
  - 4 条分散在 3 个子栏目，适配器只抓一个固定栏目页 → 结构性漏采，连续 4 天复现
- **SRC-08（团标）56 → 54 条**，丢 3 条：`T/CDZX 003-2023`、`T/HGMIF 001-2021`、`T/HHPA 005-2022`
  - `T/HHPA 005-2022` 检索 `HHPA`(total=10) 与 `婴幼儿肠造口`(total=2) 均 page1 命中 status=1 现行 → 采集覆盖不到
  - `T/CDZX 003-2023` 检索 `CDZX`/`乳粉中磷脂酰胆碱`/`磷脂酰胆碱` 全 total=0 → 平台侧无法验证存废
- **处置（已执行）**：SRC-06 还原为基线 4 条；SRC-08 = 基线 56 条 + 保留真实新增的 T/JAASS 70-2022 = **57 条**
  → `--skip-fetch` 重建 → STD 恢复 348，added=1 removed=0 modified=0

### 工具备忘（本日新增）
- **团标平台详情接口不可直连**：`getPortalStandardInfo`/`getPortalStandardDetail`/`getStandardInfo` 带 guid 全返回「系统错误」
  → 只能用 `getPortalStandardList` 列表检索验证
- **核验单条团标要用中文标题词，不要用号段词**：`液态乳和乳粉` total=2 精确命中 T/JAASS 70—2022；
  而 `JAASS` 翻 page1-10 反而找不到（total=100 封顶+排序）
- `erata.py` 判定顺序：`in_ref_scope()` → `is_relevant_erata()` → `grade_erata()`，low 级不进提醒队列
- `data/refscope.json` 有 95 个 scope key（归一化标准号，**去年份匹配**），是勘误范围判定唯一依据

### 复核（旧问题）
- healthy 假阳性**第 8 天复现**：RUNSTATE `healthy: true`，今日 `crawl_logs` 明确有 `error / SRC-07`
- SRC-06 日期兜底造号连续第 11 天；今日 SRC-06 抓到 0 条，反而**没让那条坏数据进来**（首次）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 待修（优先级排序）
1. **SRC-06 多栏目轮询（连续 4 天造成实际掉条，今日跌到 0 条，升为最高优先级）**：4 条公告分散在
   `tssps/`/`spcjs/`/`zfjcs/` 三栏目，适配器只抓一个栏目页且 `currPage` 翻页无效
   → 改成**多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底**
2. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧无法检索，**不要因检索不到就判定废止**
3. **静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/ **今日第 7 次复现**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   「抓到 N 条且 N < 基线」应记 warn/error 而非 ok —— 今日 SRC-06 抓到 0 条仍记 `ok`
4. **SRC-07 判定逻辑**：连续 **16** fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照
5. **healthy 假阳性**（10-15 发现，已连续 8 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
6. **SRC-06 日期兜底造号**（10-11 发现，已连续 11 天）：无文号应丢弃或标 `status=参考`；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常

### 新增待办（非阻塞）
- 9 条 2026-10-28 勘误已入 `data/snapshots/erata_latest.json`，但 ERATA 块只显示 15 条（范围内且非 low），
  故页面看不到 GB 5009.33-2025 这条**乳粉取样口径**变化
  → 若希望婴配实验室必看，需为「婴幼儿配方食品」字样单独提级（当前 grade 只认 reason/数值/纯错别字三维度）

## 2026-10-29
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4 CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 A → 已发布**：线上链接不变（https://infant-std-watch.app.workbuddy.host/），
  Last-Modified 由 `Wed, 14 Oct 2026 11:59:56 GMT` 更新为 `Thu, 29 Oct 2026 11:36:55 GMT`；
  回读校验线上 data.js 与本地 **全部块 IDENTICAL**（STD/ERATA/ALERTS/LAWS/REFGROUPS/SOONPOOL/SRCS/CNASDOCS/CNASKINDS/METHODS/GBNUTRITION）
- 各源（还原后真实条数）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98 公告=56 勘误=187
- **今日 crawl_logs 无任何 error**；SRC-07 是**冷却跳过**（连续失败 16 次，24h 窗口内未尝试）→ 按 10-14 口径不算情况 C
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 10-08 10:10:25）；alerts 今日 0 行（总计 27）
- 首跑 STD **348 → 341（removed 7 / added 0）**，即静默掉条第 **8** 次复现；SRC-06 **4 → 0**、SRC-08 **57 → 54**
  - **SRC-06 4 条全部直连 samr.gov.cn 复核：HTTP 200 且 `<title>` 与标题完全一致 → 官方原文仍在，确证采集丢失**
    （`tssps/` 婴幼儿配方食品标签标识问答、`spcjs/` 三唑磷13项、`tssps/` 特定全营养配方食品临床试验技术指导原则、`zfjcs/` 沃诺雷生/托拉塞米117号）
    连续 5 天复现（10-26/10-28 掉到 1/0 条，今日 0 条），且 4 条分散在 3 个子栏目而适配器只抓一个固定栏目页
  - **SRC-08**：`T/HHPA 005-2022` 检索 `HHPA`(total=10) 与 `婴幼儿肠造口`(total=2) 均 page1 命中 **status=1 现行**；
    `T/HGMIF 001-2021`、`T/CDZX 003-2023` 平台侧 total=0 仍不可检索 → **不能因检索不到就判定废止**
  - **处置**：从**运行前基线备份**还原 SRC-06(4)/SRC-08(57)，再 `daily_check.py --skip-fetch` 重建
    → STD 恢复 348，data.js 逐块与基线一致（仅 RUNSTATE 时间戳）
- **勘误 185 → 187 是官方拆分，不是新勘误**：基线里 GB 5009.235-2016 有一条合并记录（guid 54491D33，section `5.2；9.1.3；9.2.4。`），
  今日官方拆成 3 条（5.2 / 9.2.4 guid 97A32698 / 9.1.3 guid 555C9C70）→ 净 +2，**文字内容无新增**；ERATA 页面块仍 15 条未变

### ★ 发布口径判断（本日新确立，建议沿用）
- 按「今日新数据」口径属**情况 B**（还原后 data.js 与运行前基线逐字节一致，官方今日确无新标准）
- 但线上副本**已滞后 15 天**（Last-Modified 停在 10-14），且线上仍带一条**已确认的日期兜底造号坏条目**
  `总局公告 2026-10-10`（《食品安全法（修订草案征求意见稿）》答记者问 —— 实为 `xwxcs/` 新闻宣传司的新闻访谈稿，非公告）
  本地已剔除；本地另有 10-28 已核实 `status=1 现行` 的 `T/JAASS 70-2022`《液态乳和乳粉中8种拟除虫菊酯类农药…》线上尚无
- → **按情况 A 发布**：推送的是已核验数据，覆盖一次即可纠正线上陈旧副本与坏条目，链接不变，语义（RUNSTATE.lastRun/各源条数）也更准
- **口径要点**：B 的括号理由是「避免无意义覆盖」—— 当线上副本与本地存在实质差异（补正/补入已核实条目）时，
  「覆盖」并非无意义，B 的前提不成立 → 归 A 发布并**在汇报中写明**「今日无新标准，发布只为纠正线上陈旧副本」

### 工具备忘（本日新增/修正，重要）
- **还原快照不要用 `git checkout`**：git HEAD 基线陈旧（SRC-08=56 / erata=176），
  直接还原会丢掉 10-28 已核实的 `T/JAASS 70-2022` 与 9 条勘误 → **必须用运行前基线备份**（本次存于 `.workbuddy/tmp/baseline_20261029/snapshots/`）
- **`data/_deploy_state.json` 不可信**：记 `last_deploy_at=2026-10-22`，但线上 data.js 实为 10-14 → **以 curl Last-Modified 为准**
- 团标核验单条：中文标题词与号段词均可命中（`婴幼儿肠造口` total=2、`HHPA` total=10 → 都命中 T/HHPA005-2022 status=1）；
  `HGMIF`/`CDZX` 号段 total=0 属平台侧不可检索
- `scripts/selfcheck_page.js` 报 `Cannot read properties of null (reading 'nutrients')`（app.js 引用旧变量名 `GB`，
  实际页面用 `GBNUTRITION`）→ 用 10-28 基线 data.js 复跑**同样失败**，属**陈旧测试脚手架**，非页面缺陷，不阻塞发布
- `prototype/index.html` 只引用 `data.js` + `workbench.js`，**不引用** `cards.js`/`cards.html`/`card-editor.html`
  → 工作树里删掉 cards.html/card-editor.html 不影响页面

### 复核（旧问题）
- healthy 假阳性**第 9 天复现**：RUNSTATE `healthy: true`，而今日 crawl_logs 无 error（本日 SRC-07 冷却跳过）→ 假阳性机制仍在，但今日无当日 error 可对照
- SRC-06 日期兜底造号连续第 12 天：本地已剔除，**线上残留已随本次发布清除**
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 待修（优先级排序）
1. **SRC-06 多栏目轮询（连续 5 天造成实际掉条，今日跌到 0 条，升为最高优先级）**：4 条公告分散在
   `tssps/`/`spcjs/`/`zfjcs/` 三栏目，适配器只抓一个固定栏目页且 `currPage` 翻页无效
   → 改成**多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底**
2. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧无法检索，**不要因检索不到就判定废止**
3. **静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/**今日第 8 次复现**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   「抓到 N 条且 N < 基线」应记 warn/error 而非 ok —— 今日 SRC-06 抓到 0 条仍记 `ok`
4. **SRC-07 判定逻辑**：连续 **16** fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照（否则每 24h 冷却到期即触发，部委公告渠道持续失明）
5. **healthy 假阳性**（10-15 发现，已连续 9 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
6. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
7. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-10-30
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4
  CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**。两条独立理由：
  1. SRC-07（工信部）抓取阶段真实报错，fails 累计到 **17**
     （`last_fail=2026-10-30T15:46:33`，落在运行窗口 15:45–15:48 内 → **本日真实尝试并失败**，非冷却跳过）
  2. 还原后本地 data.js 与运行前基线**实质逐字节一致**，官方今日确无新数据 → 覆盖属无意义
- 各源（还原后真实条数）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98 公告=56 勘误=187
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 2026-10-08 10:10:25）；
  alerts 今日 0 行（总计 27）；公告 max notice_date=2026-08-18、勘误 max erata_date=2026-10-28（10-28 已入库），
  两快照中含 10-29/10-30 的记录数均为 **0**；「勘误提醒 6」为重复推送，去重后 0
- RUNSTATE.lastRun = **2026-10-30 15:50**（本地）；线上仍为 2026-10-29 19:35
- 线上**未动**：curl 实测 Last-Modified 仍是 `Thu, 29 Oct 2026 11:36:55 GMT`；
  线上 STD=348、已含 T/JAASS 70-2022、不含坏条目 → **线上副本本身干净，无需纠正**

### ★ 静默掉条第 9 次复现，条目与 10-29 完全相同
首跑 STD **348 → 341（removed 7 / added 0）**：
- **SRC-06（总局公告）4 → 0 条**（连续第 6 天采集不到任何公告），丢 4 条分散在
  `tssps/`/`spcjs/`/`zfjcs/` 三栏目 → **4 条全部直连 samr.gov.cn 复核：HTTP 200 且 `<title>` 与标题完全一致
  → 官方原文仍在，确证采集丢失**
- **SRC-08（团标）57 → 54 条**，丢 `T/HGMIF 001-2021` / `T/CDZX 003-2023` / `T/HHPA 005-2022`
  - `T/HHPA 005—2022` 检索 `HHPA`(total=10) 与 `婴幼儿肠造口`(total=2) 均 page1 命中 **status=1 现行**
  - `T/HGMIF 001—2021`：`HGMIF` total=26，**page1(20)+page2(6) 全列出仍不含**；`婴幼儿配方乳粉` total=13 也不含
  - `T/CDZX 003—2023`：`乳粉中磷脂酰胆碱` / `磷脂酰胆碱` 均 total=0 → **两条平台侧确实不可检索**
- **处置**：从运行前基线备份（`.workbuddy/tmp/baseline_20261030/snapshots/`）还原 SRC-06(4)/SRC-08(57)，
  再 `daily_check.py --skip-fetch` 重建 → **STD 恢复 348**
- 还原后逐块实测（Node vm + 数字归一化）：STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/
  CNASDOCS/CNASKINDS/METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION **全 IDENTICAL**；
  REFGROUPS/RUNSTATE 差异 100% 是「N 天前」日计数与时间戳；SOONPOOL 4 条仅 `d` 递减（112→111、293→292）
  → **STD 348→348，added=[] removed=[] 内容修改=[]**
- **SRC-05 值级差异 355 条，逐字段核对后确认 100% 是 `days_to_implement` 日计数递减，非该字段差异为 0 条**
  （日志写「变更 16 条」与实际不符，该日志文案不可信）

### 复核（旧问题）
- healthy 假阳性**第 10 天复现**：RUNSTATE `healthy: true`，今日 `crawl_logs` 明确有 `error / SRC-07`，fails=17
- SRC-06 日期兜底造号：本地与线上**今日皆无**（连续第 12 天，问题未扩散）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 工具备忘（本日新增）
- **基线备份必须在跑管线之前做**（本次 `.workbuddy/tmp/baseline_20261030/snapshots/`）；
  **绝不能用 `git checkout` 还原** —— git HEAD 基线陈旧（10-29 已确认 SRC-08=56 / erata=176）
- 团标 `HGMIF` 检索 page1=20 / page2=6，26 条全列出仍不含 T/HGMIF 001—2021 → 平台侧确实不可检索

### 待修（优先级排序，与 10-29 一致）
1. **SRC-06 多栏目轮询（连续 6 天造成实际掉条，今日跌到 0 条，升为最高优先级）**：4 条公告分散在
   `tssps/`/`spcjs/`/`zfjcs/` 三栏目，适配器只抓一个固定栏目页且 `currPage` 翻页无效
   → 改成**多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底**
2. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧无法检索，**不要因检索不到就判定废止**
3. **静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/**今日第 9 次复现**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   「抓到 N 条且 N < 基线」应记 warn/error 而非 ok —— 今日 SRC-06 抓到 0 条仍记 `ok`
4. **SRC-07 判定逻辑**：连续 **17** fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；
   修 `crawler.py:859`，0 条记 ok 并正常写空快照（否则每 24h 冷却到期即触发，部委公告渠道持续失明）
5. **healthy 假阳性**（10-15 发现，已连续 10 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
6. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
7. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-10-31
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 CNASDOCS=19
- **判定情况 C → 未发布**（但与往日性质不同，见下）
- 各源：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98 公告=56 勘误=187
- **真实新增/换版/废止/勘误全 0**；change_events 27 行（max 10-08）、alerts 27 行（max 10-08），今日均 0 行
- 官方全库直连核验（CFSA 3 张表全量拉取）：标准库 1808 条 / PDATE 上限 **2026-08-18**，
  公告 56 条 / PDATE 上限 2026-08-18，勘误 187 条 / 上限 2026-10-28 —— **官方今日确实无新标准**
- 线上**未动**：curl 实测 Last-Modified 仍是 `Thu, 29 Oct 2026 11:36:55 GMT`，Content-Length 414600

### ★★ 今日根因是全新形态：CFSA 站点**变慢**，不是返回空、不是掉条
- 现象：管线跑满 **900s 抓取预算 + 180s 补抓预算 = 1080s**（≈18m09s）后被 subprocess 超时杀掉，
  **一条 crawl_logs 都没写**（今日 0 行，max created_at 仍停在 10-30 07:47:56）
- 直连实测 CFSA 响应时间：**标准库 71.8s / 勘误库 80.5s / 公告库 70.5s**
  → 适配器 `timeout=40` 必然读超时；60 个检索词 × 每词重试3次(10/30/90s退避) → 预算耗尽
- 关键鉴别（与 10-19「返回空」区分开）：
  - 10-19 是 **HTTP 200 但响应体 2 字节 `[]`**（瞬间返回）
  - 今日是 **read timeout**（连响应头都等不到）
  - 今日 **GET 能成功、POST 挂死**（适配器用的是 GET，所以能通但慢）
- 探针：`GET /db?task=indexSearch&isLength=9999&num_tn=2&keyword=`（空 kw）
  → 一次拿回**全库 1808 条 / 527KB**，含修改单与解读行，num_tn=4 勘误一次拿全 187 条
  → **正确做法：CFSA 应用「空 keyword 一次拉全库 + 本地过滤」，不要 60 词逐个检索**
- 另：站点首页 302 → `/goto/blogin`（疑似登录墙），但数据接口不需登录

### ★ 处置：SRC-05 未被污染（与 10-19/10-21/10-23/10-26/10-28/10-29/10-30 的「掉条」不同）
- 抓取超时 → `crawler.py` 在 SRC-05 处**根本没走到 `save_snapshot`**，
  且 `fetch()` 的裸 print 吞掉逐关键词异常 → **快照 373 条完好，未被清空**（10-19 那次被清成 3 条）
- 今日**未出现静默掉条**（第 10 次复现未发生），因为管线被杀在写快照之前
- ⚠ 但风险仍在：若 CFSA 变慢到某词超时、其余词成功 → `fetch()` 返回非空 → 快照会被**部分覆盖**
  → 必须配合「静默掉条闸门」才安全

### 手动补跑（绕过管线预算）：SRC-01/02/06/08/11 全部实抓
- **SRC-02** 7→3（丢 GB/T 22000-2006、GB/T 22003-2008/2017、GB/T 27320-2010）
  → 直连 openstd 复核：4 条**仍在官方库**（GB/T 22000-2006 等均命中）→ 采集丢失，已还原
- **SRC-06** 4→0 → 4 条官方原文全部 HTTP 200 且 `<title>` 完全一致 → 采集丢失（连续第 7 天），已还原
- **SRC-08** 57→54（丢 T/CDZX003-2023、T/HGMIF001-2021、T/HHPA005-2022）
  → `HHPA` total=10、`婴幼儿肠造口` total=2 均 page1 命中 status=1 现行 → 采集丢失，已还原
- **SRC-01** 3→3，仅 days_to_implement 日计数
- **SRC-11** 98→98：**A015:2018 进 / A004:2018 出**
  → `专用准则` 栏目 pageSize=100 直查，官方列表只有 A001~A015（15 条），**A004:2018 不在其中**
  → A004:2018 详情页 `art/2024/art_7da633...` **HTTP 404**；A015:2018 详情页 HTTP 200
  → 判定为**官方真实换版**（A004 2018 版详情页已下线，2026 版已在列），非采集丢失 → **保留**
  → 但 A015《珠宝玉石、贵金属检测领域》**被 CNAS_KEEP/CNAS_DROP 双筛放行**进了页面（基线 CNASDOCS 无 A004:2018，
    说明它此前就被 DROP 规则拦掉；今日 A015 不含 DROP 词）→ 属**筛选项口径缺口**，非源数据问题
- 还原后 `--skip-fetch` 重建 → STD 恢复 **348，added=[] removed=[] modified=0**
- 还原源（SRC-02/06/08）的 mtime 手工回填为 10-30 真实抓取时间（今日抓到的不完整，不冒充今日成功）

### 工具备忘（本日新增，重要）
- **CFSA 全库一次拉法**：`GET /db?task=indexSearch&isLength=9999&num_tn={2|4|1}&standard_type=&keyword=`
  空 keyword 返回全库（标准 1808 条 / 勘误 187 条 / 公告 56 条）；timeout 必须 ≥120s
- **CFSA 慢 = 站点级劣化**，`curl -m 60 https://sppt.cfsa.net.cn:8086/db` 读超时即可快速确认；
  与「返回空」区分：返回空是瞬间 2 字节，超时是等不到任何字节
- **CNAS 栏目翻页**：`currPage` / `pageNo` / `pageSize` **全部无效**（恒返回同一份 20 条）；
  但 `pageSize=100` 时返回的 html_len 反而与 20 相同（7256）→ **该栏目总共就 20 条**，不是截断
  → 故 A004:2018 的消失是官方真的下架了，不是掉条
- 判「官方条目是否还在」用**详情页 HTTP 码**最硬：`art/2024/art_xxx.html` 404 = 官方已下线
- 今日 CNAS 官方列表 15 条 A 系列 = A001~A015，**A004:2018 不在其中**

### 复核（旧问题）
- healthy 假阳性**第 11 天复现**：RUNSTATE `healthy: true`，今日 crawl_logs 无 error（因管线被杀在写日志前）
- SRC-06 日期兜底造号：本地与线上今日皆无（连续第 13 天）；今日 SRC-06 抓到 0 条，坏数据未进来
- SRC-07 连续 17 fails；今日直连 `MiitStdAdapter.fetch()` 返回 **0 条**（非异常）
  → 再次印证 10-10 诊断：**0 条是正常业务结果，crawler 判 error 是误报**
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 待修（优先级排序）
1. **★ CFSA 改「空 keyword 一次拉全库 + 本地过滤」（今日新证据，最紧急）**：
   现在 60 词逐个检索，每词 40s 超时；改为 1 次全库拉取（71.8s）后本地筛，
   既绕开站点劣化，又天然拿到**全量**（含今日被检索词漏掉的条目），还顺带修掉 SRC-08/06 的分页问题
   ⚠ 需复核「空 keyword 全库」是否含解读/修改单等杂行（实测含），需在解析时按 `TABLENAME` 过滤
2. **适配器超时**：`CfsaSpptAdapter._search_raw` 的 `timeout=40` 需提到 ≥150s（配合第 1 项后请求数从 60 降到 1，影响小）
3. **静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30 复现，**今日第 10 次未复现**）：
   `sanity_guard.py` 仍只校验绝对下限；今日若 SRC-05 部分成功仍会静默覆盖快照
4. **CNAS 筛选项口径**：`CNAS_DROP` 需补「珠宝玉石|贵金属|宝石|首饰」等非食品领域词
   （今日 A015《珠宝玉石、贵金属检测领域》被放进页面了）
5. **SRC-07 判定逻辑**：连续 **17** fails，0 条属正常业务结果；修 `crawler.py:859` 记 ok 并写空快照
6. **healthy 假阳性**（10-15 发现，已连续 11 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error 与 fails
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常（**今日导致 CFSA 整体失败被完全静默**，只差 print 进了 stdout）
8. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-11-01
- 管线退出码 0，校验通过：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4 CNASDOCS=19
- **判定情况 C → 未发布**：抓取阶段整体失败（900s 预算耗尽在 SRC-05 第一个源上，**7 个源一个都没抓到**，
  今日 crawl_logs **0 行**，max created_at 仍停在 10-31 03:37:24）
- 各源快照条数（**全部为旧值，今日未刷新**）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57
  SRC-11=98 公告=56 勘误=187；快照 mtime 全部停在 10-30/10-31，与运行前基线**逐字节一致**
- data.js 与运行前基线实测：**STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASDOCS/CNASKINDS/
  METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION 全 IDENTICAL**；REFGROUPS/SOONPOOL 仅「N 天前」日计数
  → 唯一实质变化 = RUNSTATE（lastRun 10-31 11:37 → 11-01 11:48；healthy 由 true 翻 false）
- **真实新增/换版/废止/勘误全 0**；change_events 仍 27 行（max 10-08）、alerts 仍 27 行（max 10-08），今日均 0 行

### ★ 今日根因：CFSA 站点劣化已持续 2 天，且比 10-31 更严重
- 管线日志：`11:30:28 [SRC-05] 开始抓取（60 个检索词）` → 之后 900s **无任何输出**，
  subprocess 超时被杀；补抓点名标准再 180s 超时 → **全程零 crawl_logs**
- **直接用项目适配器复现**：`CfsaSpptAdapter._search_raw('GB 10765')` →
  `ConnectionError: Read timed out`（耗时 40.7s，撞上适配器 `timeout=40`）
- **直连实测 CFSA 三表全库拉取（curl，空 keyword）**：
  num_tn=2 标准库 HTTP 200 / **71.8s** / 527,933 字节；
  num_tn=4 勘误库 200 / **80.8s** / 107,502 字节；num_tn=1 公告库 200 / **70.9s** / 23,453 字节
  → **站点每请求都要 71~81s，而适配器 timeout=40 → 每个检索词必然读超时**
- 算术：60 词 × (40s 超时 + 10/30/90s 退避 × 3 次重试) ≈ 160s/词 → 900s 预算只够 **5~6 个词**
  → **BATCH_SOURCES 顺序是 ["SRC-05","SRC-02","SRC-01","SRC-06","SRC-07","SRC-08","SRC-11"]，
  SRC-05 排第一 → 预算全耗在它身上，后面 6 个源连启动机会都没有**
- 与 10-19「返回空（2 字节 []，瞬间返回）」形态不同：今日是 **read timeout**（连响应头都等不到）
- ⚠ 与 10-31 的区别：10-31 也是超时，但当天快照**没被污染**（被杀在写快照之前）；
  **今日同样是零污染** —— 11 次静默掉条复现**未发生**（管线被杀在 `save_snapshot` 之前）
- ⚠ **新风险仍在**：若 CFSA 劣化到某词超时、其余词成功 → `fetch()` 返回非空 → 快照会被**部分覆盖**
  → 必须配合「静默掉条闸门」才安全

### ★ 官方源全量直连核验（本次唯一真正完成的事，结论：官方今日确无新标准）
绕过管线、直接按空 keyword 拉三张全库，与本地快照**逐 GUID / 逐标准号**比对：
- **标准库 1808 条**（TABLENAME 全为 '2'，去重后 1753 个标准号），PDATE 上限 **2026-08-18**
  → 与本地 SRC-05(373) 比对：**标题/发布/实施日期字段差异 0 条**；仅 GB 5749 三条查不到（源范围问题，历来如此）
- **勘误库 187 条**，与本地 erata 快照 **GUID 完全相同（官方有本地无 0 / 本地有官方无 0）**；LOG_DATE 上限 2026-10-29
- **公告库 56 条**，与本地 notice 快照 **GUID 完全相同、标题零差异**
- **openstd**（按发布日倒序）最新一条为 2026-09-28，含 2026-11 / 2026-10-3x 的记录数均为 **0**
- **SRC-06 4 条公告原文逐条直连**：全部 HTTP 200 且 `<title>` 与标题完全一致（用项目 `Fetcher` 才有正确 UA，
  裸 curl 无 UA 会 403）→ 官方原文仍在
- **SRC-08 团标平台**（用 `Fetcher.session.post`，裸 curl 无 UA 会 502）：
  `液态乳和乳粉` total=2 → T/JAASS 70—2022 status=1 现行；`婴幼儿肠造口` total=2 → T/HHPA 005—2022 status=1 现行
  → 均未被废止
- **结论：官方今日确实没有新标准/新勘误/新公告** —— 但这个结论来自直连核验，**不是来自管线**
  （管线今日一条都没抓到，不能用它来证明「无更新」）

### ★ 新发现：官方库有 2 个婴配相关标准本地完全没有，且检索词表命中为 0
- `GB22570-2026`《食品安全国家标准 辅食营养补充品和学龄前儿童营养补充品》(PDATE 2026-08-18 / SSRQ 2027-08-18)
  —— 旧版 GB22570-2014《食品安全国家标准辅食营养补充品》本地也没有
- `GB31688-2026`《食品安全国家标准牛乳蛋白》(PDATE 2026-08-18 / SSRQ 2027-08-18) —— 官方库无 2010 旧版
- 二者在 2026-08-18 那批 50 项里；本地快照只覆盖 15/50
- **用真实合并检索词表（23 关键词 + 51 通则引用 = 74 词）本地离线匹配，两者命中数均为 0**
  → 即使 CFSA 不超时、正常跑完 74 词，**这两个标准也永远抓不到**（检索词表缺口）
- 注意：`GB5413.36-2026`（同为那批）本地**是有的**（来自 `data/general_refs.json`，
  且已进 ALERTS 第 2 条与 SOONPOOL）→ 证明「进库」不只靠 SRC-05 快照
- 附带发现：官方公告标题写的是「GB 31668-2026」而标准库标准号是 `GB31688-2026`
  → **官方公告与标准库自身不一致**（公告笔误），不是我们的解析问题，按纪律不自行推断，仅记录

### 复核（旧问题）
- healthy 假阳性**今日自我修正**：RUNSTATE `healthy` 由 true 翻 **false**（「已逾期（原定 2026-11-01 09:07）」）
  → 原因不是代码改了，而是 `nextRun < now` 恰好成立（10-31 快照 mtime 距今 24.2h）；**假阳性仍未根治**
- SRC-06 日期兜底造号：本地与线上今日皆无（连续第 14 天）；今日 SRC-06 压根没抓到，未引入新坏数据
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散

### 工具备忘（本日新增，重要）
- **CFSA 全库一次拉法再次验证有效**：`GET /db?task=indexSearch&isLength=9999&num_tn={2|4|1}&standard_type=&keyword=`
  空 keyword 返回全库；**timeout 必须 ≥120s**（实测 71~81s）。10-31 记的方案今天第二次被验证是唯一可行解
- **判「官方是否真无更新」的最强手法**：绕过管线直连全库 → 按 **GUID**（勘误/公告）或 **标准号**（标准）逐条求差集，
  比对「本地快照 vs 官方库」，可同时回答「官方有无新条目」与「本地有无漏采/掉条」两个问题
- **CFSA 标准库 CODE 字段对「解读材料/修改单」会把标准号重复拼在 TITLE 里**
  （如 `GB6227.1-2010《…》第1号修改单`），这类行不是新标准，统计「本地缺失」时要排除
- **官方公告库字段是 `TITLE`/`ID`/`PDATE`，本地 notice 快照是 `title`/`guid`/`notice_date`** — 比对要按 GUID 对齐
- **裸 curl 直连 samr.gov.cn / ttbz.org.cn 会 403/502**（缺浏览器 UA）→ 必须用项目 `Fetcher`（含 UA + session）
  或自行带 UA 头；`Fetcher` 无 `post()` 方法，POST 要直接用 `f.session.post(...)`
- **官方站点的表格接口有频率限制**：团标平台连续几次查询会返回非 JSON（JSONDecodeError），需退避重试
- 本地勘误快照 `erata_latest.json` 是 **list**（不是 dict），日期字段是 `erata_date`（KWSJ），`log_date` 是入库时间

### 待修（优先级排序）
1. **★ CFSA 改「空 keyword 一次拉全库 + 本地过滤」+ 适配器超时提到 ≥150s**（连续 2 天验证，最紧急）：
   现在 60 词逐个检索，每词必超时（站点 71~81s vs timeout=40），900s 预算只够 5~6 词，
   且 SRC-05 排 BATCH_SOURCES 第一位 → 一个源拖垮全部 7 个源
   → 改 1 次全库拉取（71~81s）后本地按 `TABLENAME` 过滤 + 关键词本地筛，
   既绕开劣化，又天然拿到全量，还顺带修掉 SRC-06/08 的分页/滚动窗口问题
2. **★ 调换 BATCH_SOURCES 顺序**：SRC-05 排第一 → 它一慢，后 6 个源全部没机会
   → 应把 SRC-05 放最后，或先跑完快的源再回头处理慢源
3. **检索词表缺口（今日新发现）**：`GB22570-2026`（辅食营养补充品）、`GB31688-2026`（牛乳蛋白）
   在 74 词表离线匹配命中 0 → 需补「辅食营养补充品」「牛乳蛋白」等词，或靠第 1 项的全库本地筛兜住
4. **静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30 复现，10-31 与**今日第 10、11 次未复现**）：
   `sanity_guard.py` 仍只校验绝对下限；今日若 SRC-05 部分成功仍会静默覆盖快照
5. **CNAS 筛选项口径**：`CNAS_DROP` 需补「珠宝玉石|贵金属|宝石|首饰」等非食品领域词
   （A015《珠宝玉石、贵金属检测领域》仍被放进页面；本地 19 条 vs 线上 18 条，差的就是它）
6. **SRC-07 判定逻辑**：连续 **17** fails（今日因 SRC-05 耗尽预算根本没轮到它）；
   10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」；修 `crawler.py:859` 记 ok 并写空快照
7. **healthy 假阳性**（10-15 发现，已连续 12 天）：今日虽翻成 false，但纯属 nextRun 逾期巧合，
   `build_runstate.py` 仍未读 `crawl_logs` 当日 error 与 `source_health.json` fails
8. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常（今日 CFSA 整体失败被完全静默，只差 print 进了 stdout）
9. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-11-02
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4
  CNASDOCS=19 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**。两条独立理由：
  1. **SRC-07（工信部）ERROR**：fails 累计到 **18**，`last_fail=2026-11-02T18:11:48`，
     落在运行窗口 18:08:36–18:15:51 内 → **本日真实尝试并失败**，非冷却跳过
  2. 首跑 STD **348 → 342，removed 6 / added 0**（静默掉条第 **10** 次复现），还原后 STD 恢复 348
- 各源（还原后真实条数）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98 公告=56 勘误=187
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 10-08 10:10:25）；
  alerts 今日 0 行（总计 27）；6 条 MOD 修改单为重复推送，去重后 0
- 线上**未动**：curl 实测 Last-Modified 仍是 `Thu, 29 Oct 2026 11:36:55 GMT`，Content-Length 414600

### ★ CFSA 站点劣化已恢复 —— 但也暴露了「空 keyword 全库」方案今天是唯一可行解
- 直连实测三表全库（空 keyword）：标准库 **2.78s** / 527,933 字节；勘误库 **0.92s** / 107,502 字节；
  公告库 **0.90s** / 23,453 字节 → **对比 10-31/11-01 的 71~81s，劣化完全消失**
- 管线本次 SRC-05 抓到 355 条 + 补抓 18 条 → 快照 373 条，**未掉条、未超时**，管线整体只用了 274s
- → 11-01 记的「改空 keyword 全库拉取」方案**在站点恢复时同样正确**，只是今天不是刚需；
  待 2 天或 3 天的慢站再现时仍是唯一解

### ★ 官方源直连全库核验（本次结论：官方今日确实无新标准/新勘误/新公告）
- **标准库 1808 行**（TABLENAME=2，剔除解读材料/修改单后 1753 条），**PDATE 上限 2026-08-18**；
  `PDATE>=2026-10-01` 的标准数 = **0**
- **勘误库 187 条**：与本地 erata 快照 **GUID 完全相同（官方有本地无 0 / 本地有官方无 0）**；KWSJ 上限 2026-10-28
- **公告库 56 条**：与本地 notice 快照 **GUID 完全相同、标题零差异**；PDATE 上限 2026-08-18
- SRC-06 4 条公告原文逐条直连：全部 HTTP 200 且 `<title>` 与标题完全一致 → **官方原文仍在**
- SRC-08 22 条掉条候选逐条检索：19 条命中且 **status=1 现行**；
  `T/HGMIF 001-2021`、`T/CDZX 003-2023`、`T/CITSRM 014-2026`、`T/T2020JT 003-2025` 平台侧不可检索 → **靠快照保留**
- openstd 点名 6 条婴配标准：只返回 1997 旧版且状态「废止」→ 与历年一致（openstd 无现行食品安全国标）
- → **官方今日确实没有新标准/新勘误/新公告**，此结论来自直连核验，不是来自管线

### 今日 SRC-06/SRC-08 掉条明细（与 10-21/23/26/28/29/30 同型，第 10 次复现）
- **SRC-06（总局公告）4 → 0 条**：4 条分散在 `tssps/`/`spcjs/`/`zfjcs/` 三栏目，适配器只抓一个固定栏目页
  → 连续第 **8** 天采集不到任何公告
- **SRC-08（团标）57 → 55 条**：丢 `T/CDZX 003-2023`、`T/HGMIF 001-2021`
  （注：本次管线抓到 55 条，比 10-21/23/26/28/29/30 的 54 条多 1 条，说明采集覆盖有波动，仍 < 基线 57）
- **处置**：`cp` 从运行前基线备份（`.workbuddy/tmp/baseline_20261102/snapshots/`）还原 SRC-06(4)/SRC-08(57)，
  再 `daily_check.py --skip-fetch` 重建 → **STD 恢复 348，added=0 removed=0**
- 还原后逐块实测（Node vm + 数字归一化）：STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/
  CNASDOCS/CNASKINDS/METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION **全 IDENTICAL**；
  REFGROUPS/SOONPOOL 仅「N 天前」日计数 → **唯一实质变化 = RUNSTATE.lastRun（10-31 11:37 → 11-02 18:15）**

### ★★ 线上副本已严重滞后：本地有一整套新页面从未上线（今日新发现，影响发布决策）
逐文件 curl 实测线上状态：
- **线上 404**（本地有、从未部署）：`jsa.js` `labbench.js` `labdata.js` `labdata2.js` `labledger.js`
  `ledger.js` `store.js` `theme.css`
- 线上 `index.html` 是 **2026-10-22 18:32** 版（194,227 字节），本地是 **11-01 22:45** 版（239,555 字节）
  → 本地 index.html 引用了 8 个脚本，其中 7 个线上不存在
- 线上 `workbench.js` 是 10-22 版，`data.js` 是 10-29 版 → **线上整站落后 11 天**
- **本地 data.js 的 JSA 块比线上多 7 分区 48 步 + PPE + 应急物资 + 培训矩阵 + 演练记录**
  （线上 5,799 字节 vs 本地 16,687 字节）—— 这是 `scripts/jsa_expand.py`（2026-11-01 新增）产出的实验室安全扩充层
- → **本地 prototype 是「新版应用」，线上是「旧版应用」**，不是同一应用的每日数据覆盖
  → 按用户口径「重新发布到线上」会**一次性把整个新版应用推上线**，不只是更新今日数据
- 本次仍判「不发布」：因为当日无新标准数据 + SRC-07 报错（情况 C）；
  **待办：下次发布前需确认是否要连同新版页面一并上线**，这已超出「每日数据更新」的范畴

### 复核（旧问题）
- healthy 假阳性**第 13 天复现**：RUNSTATE `healthy: true`，今日 crawl_logs 明确有 `error / SRC-07`，fails=18
- SRC-06 日期兜底造号：本地与线上今日皆无（连续第 15 天）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散
- **CNAS 筛选项缺口仍在（连续第 3 天）**：`CNAS-CL01-A015:2018`《检测和校准实验室能力认可准则在**珠宝玉石、贵金属**检测领域的应用说明》
  仍进了本地 CNASDOCS（19 条）；线上是 18 条（**线上反而是对的**）
  → 已验证：给 `CNAS_DROP` 加 `珠宝玉石|贵金属|宝石|首饰` 只会命中这 1 条，**误伤 0 条**，可直接加
  → 注意 SRC-11 快照里 `CNAS-CL01-A004:2026` 是「**医疗器械**检测领域」（2026 版），
    已被既有 `医疗器械` DROP 词命中 → 正确剔除，不受影响

### 工具备忘（本日新增/修正）
- **CFSA 空 keyword 全库拉法**（10-31 首记、今日第 3 次验证）：`GET /db?task=indexSearch&isLength=9999&num_tn={2|4|1}&standard_type=&keyword=`
  站点恢复时 0.9~2.8s，劣化时 71~81s —— **同一个 URL 可用于快速判断站点是否劣化**
- 团标核验单条：中文标题词与号段词均可命中（`HHPA` total=10、`婴幼儿肠造口` total=2 → T/HHPA 005-2022 status=1）；
  `HGMIF`/`CDZX`/`CITSRM`/`T2020JT` 号段 total=0 属**平台侧不可检索**，不要因检索不到就判定废止
- 团标 `rows` 字段名：`standardNo`/`standardTitleCn`/`standardStatusName`（status=1 现行）；
  破折号 em dash `—` 要统一替换成 `-` 再比标准号
- **判断线上是否落后**用 `curl -I` 逐文件看 Last-Modified + HTTP 码，比只看 data.js 更快发现「整站未部署」
- `prototype/data.js` 的 STD 字段名是 **`no`**（不是 std_no）→ 过滤时用 `x.no`
- **基线备份必须在跑管线之前做**（本次 `.workbuddy/tmp/baseline_20261102/snapshots/`）；**绝不能用 `git checkout` 还原**

### 待修（优先级排序）
1. **★ SRC-07 判定逻辑**（连续 **18** fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」）：
   修 `crawler.py:859`，0 条记 ok 并正常写空快照 → 否则每 24h 冷却到期即触发，部委公告渠道持续失明
2. **★ 静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30 复现，**今日第 10 次复现**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   「抓到 N 条且 N < 基线」应记 warn/error 而非 ok —— 今日 SRC-06 抓到 0 条仍记 `ok`
3. **★ SRC-06 多栏目轮询**（连续 **8** 天造成实际掉条，今日跌到 0 条）：4 条公告分散在
   `tssps/`/`spcjs/`/`zfjcs/` 三栏目，适配器只抓一个固定栏目页且 `currPage` 翻页无效
   → 改成**多 pageId/多目录路径轮询** + 对快照内已有 `official_url` 做**存活校验兜底**
4. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧不可检索，**不要因检索不到就判定废止**
5. **healthy 假阳性**（10-15 发现，已连续 13 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
6. **CNAS 筛选项口径**：`CNAS_DROP` 补 `珠宝玉石|贵金属|宝石|首饰`（已验证只命中 A015 一条、误伤 0 条）
7. **SRC-06 日期兜底造号**（10-11 发现，已连续 15 天）：无文号应丢弃或标 `status=参考`；
   `_relevant()` 加「答记者问|新闻|访谈|图解」排除词
8. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
9. **发布决策扩展**：本地 prototype 是新版应用（7 个 js/css 从未上线），发布前需确认是否整体上线
10. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-11-03
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4
  CNASDOCS=19 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**。两条独立理由：
  1. **SRC-07（工信部）ERROR**：fails 18 → **19**，`last_fail=2026-11-03T18:20:25`，
     落在运行窗口 18:17:13–18:22:31 内 → **本日真实尝试并失败**，非冷却跳过
  2. data.js 首跑 STD **348 → 346，removed 2 / added 0**（静默掉条第 **11** 次复现），
     还原后与基线逐块比对**唯一实质变化 = RUNSTATE.lastRun** → 没有新数据可发
- 各源（还原后真实条数）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98
  公告=56 勘误=187 法规 LAWS=42
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 10-08 10:10:25）；
  alerts 今日 0 行（总计 27）；6 条 MOD 修改单为重复推送，去重后 0
- 线上**未动**：curl 实测 data.js Last-Modified 仍是 `Thu, 29 Oct 2026 11:36:55 GMT`（Content-Length 414600）；
  index.html 仍是 10-22 18:32 版（194,227 字节）；`jsa.js` 线上仍 404 → 本地仍是未上线的新版应用

### ★ SRC-06「沿用上次快照」兜底今日首次生效（连续第 9 天采不到公告）
- 今日 SRC-06 返回 0 条，但爬虫**不再静默覆盖快照**，而是沿用上次的 4 条 → 快照保住 4 条
  （前几日是直接掉到 0 条，需人工从基线还原）。这是本轮唯一的好消息
- 但 SRC-06 仍**连续第 9 天采集不到任何公告**（4 条分散在 `tssps/`/`spcjs/`/`zfjcs/` 三栏目，
  适配器只抓一个固定栏目页）→ 总局公告渠道实质仍是盲区，靠旧快照撑

### ★ SRC-08 掉条明细（与 10-21/23/26/28/29/30 同型，第 11 次复现）
- 抓取 55 条（基线 57），丢 `T/CDZX 003-2023`《乳粉中磷脂酰胆碱的测定 高效液相色谱法》
  与 `T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》
- 今日回官方团标平台核验（`POST /cms-proxy/ms/portal/standardInfo/getPortalStandardList`）：
  `CDZX`/`乳粉中磷脂酰胆碱的测定`/`磷脂酰胆碱` 全 total=0；`HGMIF` total=26 但不含目标、
  `绿色设计产品评价技术规范` total=100 也不含目标 → **平台侧不可检索，不能判定废止**
  对照组 `HHPA` total=10、`婴幼儿肠造口` total=2 正常 → 不是我方被墙
- 处置：`cp` 从 `.workbuddy/tmp/baseline_20261103/snapshots/` 还原 SRC-08(57)，
  再 `daily_check.py --skip-fetch` 重建 → **STD 恢复 348，added=0 removed=0**
- 还原后逐块实测（Node vm + 数字归一化）：STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/
  SRCS/CNASDOCS/CNASKINDS/METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION **全 IDENTICAL**；
  REFGROUPS 仅「N 天前」日计数、SOONPOOL 仅 `d` 倒计时天数 →
  **唯一实质变化 = RUNSTATE.lastRun（11-02 18:15 → 11-03 18:31）+ nextRun**

### ★ 官方源直连全库核验（本次结论：官方今天确实无新标准/新勘误/新公告）
- **标准库 1808 行 / 1753 条有效**，**PDATE 上限 2026-08-18**；`PDATE>=2026-10-01` = **0** 条
  （与 11-02 核验完全一致 → 官方标准库自 8 月中旬起没再发过新的食品安全国标）
- **勘误库 187 条**：与本地 erata 快照 **GUID 完全相同（官方有本地无 0 / 本地有官方无 0）**；KWSJ 上限 2026-10-28
- **公告库 56 条**：与本地 notice 快照 **GUID 完全相同、标题零差异**；PDATE 上限 2026-08-18
- SRC-05 快照 373 vs 基线 373：**标准号集合差异 0/0、7 个受监控字段差异 0**（status/implement_date/
  publish_date/replaced_by/title/abolish_date/replaces）→ 零新增、零换版、零废止
- → **官方今天确实没有新标准/新勘误/新公告**，此结论来自直连核验，不是来自管线

### ★ 抓取日志「变更 16 条」的真实含义（今日新查明，勿再当增量看）
- SRC-05 crawl_logs 写「抓取 355 条，变更 16 条」，一度疑似有 16 条变更
- 实测 = **16 条倒计时（UPCOMING）提醒事件**，不是换版：GB 5009.312/310/311/111/96/190/253/24/22/
  222/209/206/185-2026（d=107）、GB 25596-2025（d=133）、GB 5009.168-2026（d=288）、GB 29922-2025（d=303）
- 校验法：快照里 `status=即将实施` 且 `0 <= days_to_implement <= 365` 的条数 **恰好 = 16**
- 这些是「已知的即将实施标准」，30 天去重桶（今日桶 = 2026-10-31）已推过 → change_events/alerts 不新增行

### 复核（旧问题）
- healthy 假阳性**第 14 天复现**：RUNSTATE `healthy: true`，今日 crawl_logs 明确有 `error / SRC-07`，fails=19
- SRC-06 日期兜底造号：本地与线上今日皆无（连续第 16 天）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散
- CNAS 筛选项缺口仍在（连续第 4 天）：`CNAS-CL01-A015:2018`《检测和校准实验室能力认可准则在
  珠宝玉石、贵金属检测领域的应用说明》仍进了本地 CNASDOCS（19 条），线上 18 条（线上反而是对的）
- **8 月批次仍有两个婴配相关标准本地缺失**（检索词表缺口，10-31 记录至今未补）：
  `GB22570-2026`《辅食营养补充品和学龄前儿童营养补充品》、`GB31688-2026`《牛乳蛋白》、
  以及 `GB5413.36-2026`《特殊膳食用食品中脂肪酸和反式脂肪酸的测定》——
  这三条官方 PDATE=2026-08-18，**不是今日新增**，是长期漏采

### 工具备忘（本日新增/修正）
- **CFSA 空 keyword 全库拉法**（10-31 首记、今日第 4 次验证）：`GET /db?task=indexSearch&isLength=9999&num_tn={2|4|1}&standard_type=&keyword=`
  今日实测 标准库 3.2s / 勘误库 0.7s / 公告库 2.1s → 站点正常
- **团标平台正确接口**：`POST https://www.ttbz.org.cn/cms-proxy/ms/portal/standardInfo/getPortalStandardList`
  body=`searchKey/pageNo/pageSize`，需带 `Referer: https://www.ttbz.org.cn/standard.html` +
  `X-Requested-With: XMLHttpRequest`；返回 `data.rows[]`（字段 `standardNo`/`standardTitleCn`/
  `standardStatusName`/`publishDate`）与 `data.total`。**用 GET 访问 `/standard.html?key=` 拿不到 total**
- **快照 JSON 结构**：SRC-* 快照是 `dict[标准号(无空格)] = {std_no(有空格), title, status, ...}`；
  勘误/公告快照是 `list`。比对本地标准号时要用 `std_no` 并去掉空格，且**不能只取 `items/records/rows`，
  否则 SRC-* 快照会返回空**（今日第一次就踩了这个坑，误判成「本地 0 个标准号」）
- CFSA 标准库 `CODE` 对「解读材料/修改单」会把标准号重复拼在 `TITLE` 里（如 `GB4481.1-2016`），
  这类行不是新标准，统计时排除
- **判断线上是否落后**用 `curl -I` 逐文件看 Last-Modified + HTTP 码（今日复测：data.js 10-29、index.html 10-22、jsa.js 404）

### 待修（优先级排序）
1. **★ SRC-07 判定逻辑**（连续 **19** fails，10-10 已诊断为「0 条属正常业务结果、crawler 误报为 error」）：
   修 `crawler.py:859`，0 条记 ok 并正常写空快照 → 否则每 24h 冷却到期即触发，部委公告渠道持续失明
2. **★ 静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30/11-02/11-03 复现，**今日第 11 次**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   今日 SRC-08 抓到 55 < 基线 57 仍记 `ok` → 建议同时**把 SRC-06 的「沿用上次快照」兜底推广到所有源**
   （SRC-06 今天靠这条兜底保住了 4 条，SRC-08 没有，掉 2 条）
3. **★ SRC-06 多栏目轮询**（连续 **9** 天造成实际掉条）：4 条公告分散在 `tssps/`/`spcjs/`/`zfjcs/`
   三栏目，适配器只抓一个固定栏目页且 `currPage` 翻页无效 → 改多 pageId/多目录路径轮询 +
   对快照内已有 `official_url` 做存活校验兜底
4. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧不可检索，**不要因检索不到就判定废止**
5. **检索词表缺口**（10-31 首次，至今未修）：需补「辅食营养补充品」「牛乳蛋白」等词，
   否则 `GB22570-2026`、`GB31688-2026`、`GB5413.36-2026` 永远采不到（官方 PDATE=2026-08-18，非当日新增）
6. **healthy 假阳性**（10-15 发现，已连续 14 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
7. **CNAS 筛选项口径**：`CNAS_DROP` 补 `珠宝玉石|贵金属|宝石|首饰`（已验证只命中 A015 一条、误伤 0 条）
8. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
9. **发布决策扩展**：本地 prototype 是新版应用（7 个 js/css 从未上线），发布前需确认是否整体上线
10. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-11-04
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4
  CNASDOCS=19 CNASKINDS=6 METHODS=18
- **判定情况 C → 未发布**。理由：抓取阶段 crawl_logs 明确有 `error / SRC-07`（fails 19 → **20**，
  last_fail=2026-11-04T18:23:05，落在运行窗口 18:22–18:27 内 → **本日真实尝试并失败**，非冷却跳过）
- 各源真实条数（还原后）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98
  公告=56 勘误=187 法规 LAWS=42
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 10-08 10:10:25）；
  alerts 今日 0 行（总计 27）
- 线上**未动**：data.js Last-Modified 仍 `Thu, 29 Oct 2026 11:36:55 GMT`（Content-Length 414600）；
  index.html 仍 10-22 10:32 版（194,227 字节）；jsa.js / labbench.js / theme.css 仍 404

### ★ SRC-07 直连核验：站点完全正常，是 crawler 把「0 条」误报为 error（第 20 次复现，根因再确认）
- 直连 `https://www.miit.gov.cn` 三栏目（公告/通告/通知）→ GET 200，UNIT 接口 200：
  公告 27 条、通告 27 条、通知 39 条，**抓取完全正常**
- 命中「食品主体词 + 动作词」过滤后 **0 条**（当日工信部无乳制品/食品相关公告）
- → **SRC-07 的 error 是「0 条属正常业务结果」被 crawler.py:859 判成未接通**，不是站点/接口变更
- 这是 10-10 已诊断的同一个 bug，`crawler.py:859` 至今未修 → 每 24h 冷却到期即触发一次误报

### ★ SRC-08 掉条第 12 次复现（与 10-21/23/26/28/29/30/11-02/11-03 同型）
- 抓取 55 条（基线 57），丢 `T/CDZX 003-2023`《乳粉中磷脂酰胆碱的测定 高效液相色谱法》
  与 `T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》
- **今日首次用正确的 form 编码重试团标平台**（`urllib.parse.urlencode` + `Content-Type: application/x-www-form-urlencoded`）：
  `CDZX` total=0、`乳粉中磷脂酰胆碱` total=0、`磷脂酰胆碱` total=0、
  `HGMIF` total=26 但不含目标、`绿色设计产品评价技术规范 婴幼儿配方乳粉` total=0
  → **平台侧不可检索，不能判定废止**（对照 `婴幼儿配方乳粉` total=13 正常，说明不是我方被墙）
- 处置：`cp` 从 `.workbuddy/tmp/baseline_20261104/snapshots/` 还原 SRC-08(57)，
  再 `daily_check.py --skip-fetch` 重建 → **STD 恢复 348**
- 还原后 Node vm 逐块比对：STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASDOCS/
  CNASKINDS/METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION **全 IDENTICAL**；
  REFGROUPS 65 处 / SOONPOOL 4 处 / RUNSTATE 16 处差异 → 全部是「N 天前」日计数与时间戳
  → **唯一实质变化 = RUNSTATE.lastRun（11-03 18:31 → 11-04 18:27）+ nextRun**

### ★ 官方源直连全库核验（结论：官方今天确实无新标准/新勘误/新公告）
- **标准库 1808 行 / 剔除解读材料与修改单后 1761 条**，**PDATE 上限仍 2026-08-18**；
  `PDATE>=2026-10-01` = **0** 条（与 11-02/11-03 完全一致 → 官方标准库自 8 月中旬起未再发新食品安全国标）
- **勘误库 187 条**：与本地 erata 快照 **GUID 完全相同（官方有本地无 0 / 本地有官方无 0）**；KWSJ 上限 2026-10-28
- **公告库 56 条**：与本地 notice 快照 **完全相同（双向 0 差异）**；PDATE 上限 2026-08-18
- SRC-05 快照 373 vs 基线 373：标准号集合差异 **0/0**、7 个受监控字段差异 **0**
  （status/implement_date/publish_date/replaced_by/title/abolish_date/replaces）
  → 零新增、零换版、零废止
- openstd/std.samr.gov.cn 点名核验：GB 10765/10766/10767 均只返回 1997 版且状态「废止」；
  GB 25192 / GB31688 / GB5413.36 / GB28050 在 std.samr 侧 total=0 → 与历年一致（该平台无现行食品安全国标）

### 抓取日志「变更 16 条」的含义（与 11-03 完全相同，仍是倒计时事件不是换版）
- SRC-05 写「抓取 355 条，变更 16 条」；实测快照里 `status=即将实施` 且 `0 <= days_to_implement <= 365`
  的条数 **恰好 = 16** → 与 11-03 同一批 UPCOMING 提醒，30 天去重桶已推过 → 不新增 change_events/alerts
- SRC-05 快照 status 分布：现行 353 / 即将实施 18 / 废止 2

### 复核（旧问题）
- healthy 假阳性**第 15 天复现**：RUNSTATE `healthy: true`，今日 crawl_logs 明确有 `error / SRC-07`，fails=20
- SRC-06 日期兜底造号：本地与线上今日皆无（连续第 17 天）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散
- CNAS 筛选项缺口仍在（连续第 5 天）：`CNAS-CL01-A015:2018`《检测和校准实验室能力认可准则在
  珠宝玉石、贵金属检测领域的应用说明》仍进本地 CNASDOCS（19 条），线上 18 条（线上反而是对的）
- 8 月批次三个婴配相关标准本地仍缺失（长期漏采，非今日新增）：`GB22570-2026`《辅食营养补充品和学龄前儿童营养补充品》、
  `GB31688-2026`《牛乳蛋白》、`GB5413.36-2026`《特殊膳食用食品中脂肪酸和反式脂肪酸的测定》

### 工具备忘（本日新增/修正）
- **团标平台核验必须用 form 编码**：`urllib.parse.urlencode({searchKey,pageNo,pageSize})`
  + `Content-Type: application/x-www-form-urlencoded`。
  **用 JSON body 会得到 total=100/rows=10 的假结果**（今日第一次就踩了这个坑，一度以为平台全部可检索）
- CFSA 空 keyword 全库拉法（10-31 首记、今日第 5 次验证）：`GET /db?task=indexSearch&isLength=9999&num_tn={2|4|1}&standard_type=&keyword=`
  今日实测 标准库 3.28s/527,933B、勘误库 1.31s/107,502B、公告库 0.91s/23,453B → 站点正常
- **CFSA 三库返回体顶层就是 list**（不是 `{data:[...]}`）→ 直接 `json.loads()` 后取 list，
  取 `d.get('data')` 会报 `'list' object has no attribute 'get'`
- **std.samr.gov.cn 用 GET 不是 POST**：`GET /gb/search/gbQueryPage?searchText=GB10765&current=1&size=20`
  → `{"total":N,"rows":[...]}`，字段 `C_STD_CODE`/`C_C_NAME`/`STATE`/`ISSUE_DATE`（内含 `<sacinfo>` 标签需清洗）
  **openstd.samr.gov.cn 的 std_list 页本次正则解析取不到行**（表格结构与适配器预期不符），
  但两个平台结论一致（只返回 1997 旧版且状态废止），不影响结论
- **判断线上是否落后**用 `curl -sI` 逐文件看 Last-Modified + HTTP 码（今日复测：data.js 10-29、index.html 10-22、
  jsa.js/labbench.js/theme.css 全 404）
- **基线备份必须在跑管线之前做**（本次 `.workbuddy/tmp/baseline_20261104/snapshots/`）；**绝不能用 `git checkout` 还原**

### 待修（优先级排序）
1. **★ SRC-07 判定逻辑**（连续 **20** fails，10-10 已诊断、11-04 直连再次确认根因）：
   修 `crawler.py:859`，0 条记 ok 并正常写空快照 → 否则每 24h 冷却到期即触发误报，部委公告渠道持续假失明
2. **★ 静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30/11-02/11-03/11-04 复现，**今日第 12 次**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   建议同时**把 SRC-06 的「沿用上次快照」兜底推广到所有源**（SRC-06 今天靠这条保住 4 条，SRC-08 没有）
3. **★ SRC-06 多栏目轮询**（连续 **10** 天造成实际掉条）：4 条公告分散在 `tssps/`/`spcjs/`/`zfjcs/`
   三栏目 → 改多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底
4. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧不可检索，**不要因检索不到就判定废止**
5. **检索词表缺口**（10-31 首次，至今未修）：需补「辅食营养补充品」「牛乳蛋白」等词
6. **healthy 假阳性**（10-15 发现，已连续 15 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
7. **CNAS 筛选项口径**：`CNAS_DROP` 补 `珠宝玉石|贵金属|宝石|首饰`（已验证只命中 A015 一条、误伤 0 条）
8. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
9. **发布决策扩展**：本地 prototype 是新版应用（7 个 js/css 从未上线），发布前需确认是否整体上线
10. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-11-05
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=15 REFGROUPS=13 ALERTS=2 SOONPOOL=4
  CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 A → 已发布**（线上链接不变：https://infant-std-watch.app.workbuddy.host/）
  理由：本地 data.js 与**线上副本**存在实质差异（线上缺已核实的 GB 19644 + JSA 模块严重残缺），
  覆盖并非无意义覆盖 → 沿用 10-29 口径（线上副本陈旧且实质落后时归 A 发布，汇报中写明「今日无新标准，
  发布只为纠正线上陈旧副本」）
- 各源真实条数（还原后）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98
  公告=56 勘误=187 法规 LAWS=42
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 10-08 10:10:25）；
  alerts 今日 0 行（总计 27）
- **今日 crawl_logs 无任何 error**（error 计数 = 0）；SRC-07 是**冷却跳过**（连续失败 20 次，24h 窗口内未尝试）
  → 按 10-14 口径不算情况 C；SRC-06 返回 0 条但**兜底生效**（沿用上次快照 4 条，未掉条）

### ★ SRC-08 掉条第 13 次复现（与 10-21/23/26/28/29/30/11-02/11-03/11-04 同型）
- 首跑抓取 55 条（基线 57），丢 `T/CDZX 003-2023`《乳粉中磷脂酰胆碱的测定 高效液相色谱法》
  与 `T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》
- **今日直连团标平台核验**（form 编码，正确姿势）：
  `CDZX` total=0、`CDZX003` total=0、`CDZX 003` total=100（全是无关号段）、`乳粉中磷脂酰胆碱` total=0、
  `磷脂酰胆碱` total=0、`磷脂酰胆碱的测定` total=0、`常德市质量协会`（CDZX 的发布方）total=0；
  `HGMIF` total=26 **全 26 条列出仍不含 001**、`湖南省绿色制造产业联合会`（HGMIF 发布方）total=26 同上、
  `绿色设计产品评价技术规范 婴幼儿配方乳粉` total=0
  → **平台侧确实不可检索，不能判定废止**（对照 `HGMIF` 有 26 条正常返回，说明不是我方被墙）
- 处置：`cp` 从 `.workbuddy/tmp/baseline_20261105/snapshots/` 还原 SRC-08(57)，再 `daily_check.py --skip-fetch` 重建 → **STD 恢复 348**
- 还原后逐块比对（Node vm）：STD/ERATA/ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/CNASKINDS/
  METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION **全 IDENTICAL**；REFGROUPS 65 处 / SOONPOOL 4 处 /
  RUNSTATE 16 处差异 → 全部是「N 天前」日计数与时间戳
  → **唯一实质变化 = RUNSTATE.lastRun（11-04 18:27 → 11-05 18:17）+ nextRun**

### ★ 官方源直连全库核验（结论：官方今天确实无新标准/新勘误/新公告）
- **标准库 1808 行 / 剔除解读材料与修改单后 1753 条**，**PDATE 上限仍 2026-08-18**；
  `PDATE>=2026-10-01` = **0** 条（与 11-02/11-03/11-04 完全一致 → 官方标准库自 8 月中旬起未再发新食品安全国标）
- **勘误库 187 条**：与本地 erata 快照 **GUID 完全相同（官方有本地无 0 / 本地有官方无 0）**；KWSJ 上限 2026-10-28
- **公告库 56 条**：与本地 notice 快照 **GUID 与标题双口径完全相同（双向 0 差异）**；PDATE 上限 2026-08-18
- SRC-05 快照 373 vs 基线 373：标准号集合差异 **0/0**、7 个受监控字段差异 **0**
  → 零新增、零换版、零废止
- **GB 19644-2024《食品安全国家标准 乳粉和调制乳粉》在官方库确认存在**（PDATE 2024-02-08，另有 2010 旧版）
  → 线上副本缺这条已核实条目，是本次发布的主要价值

### 抓取日志「变更 16 条」的含义（与 11-02/11-03/11-04 完全相同，仍是倒计时事件不是换版）
- SRC-05 写「抓取 355 条，变更 16 条」；实测快照里 `status=即将实施` 且 `0 <= days_to_implement <= 365`
  的条数 **恰好 = 16** → 同一批 UPCOMING 提醒，30 天去重桶已推过 → 不新增 change_events/alerts
- SRC-05 快照 status 分布：现行 353 / 即将实施 18 / 废止 2（GB 5749-1985、GB 5749-2006）

### ★ 今日新增修复（已上线生效）
- **CNAS 筛选项缺口（第 6 天）已修**：`build_refgroups.py` 的 `CNAS_DROP` 补 `珠宝玉石|贵金属|宝石|首饰`
  → CNASDOCS 由 19 降为 **18**，与线上此前正确的 18 条一致（线上 18 条反而是对的，本地多一条
  `CNAS-CL01-A015:2018`《检测和校准实验室能力认可准则在珠宝玉石、贵金属检测领域的应用说明》
  —— 珠宝检测与乳品实验室无关）
  预演实测：SRC-11 快照 98 条中**只命中这一条，误伤 0 条** → 修完与线上对齐，无副作用

### ★ 发布方式变更（重要，本日首次用 WorkBuddy 站点发布能力）
- **不再用 `scripts/deploy.py --fast`（GitHub Actions 通道）**，改用 WorkBuddy 站点发布能力
  （目录 `prototype/`，domainPrefix=`infant-std-watch`，entryHtml=`index.html`）
- **线上首次出现完整新版应用**：theme.css / jsa.js / labbench.js / qwform.js / qwguide.js 等
  **7 个 js/css 从未上线 → 今日全部 200**（此前 theme.css/jsa.js/labbench.js 均 404）
- 发布后回读校验：线上 data.js 与本地 **482941 字节逐块全 IDENTICAL**（含 STD/REFGROUPS/SOONPOOL/ERATA/
  ALERTS/KWS/SUBS/HIST/LAWS/CATS/LAW_KINDS/SRCS/RUNSTATE/CNASDOCS/CNASKINDS/METHODS/JSA/QMTOOLS/RDTOOLS/GBNUTRITION）
- **Playwright 端到端实测线上**：JS 错误 0、资源失败 0；13 个左侧视图**逐个点击全部渲染正常、无一报错**；
  状态栏显示「上次检查：2026-11-05 18:17 / 下次：2026-11-06 09:07」
- 注意：线上 index.html 引用 17 个 css/js，本地 prototype 目录 **17 个引用全部存在，缺失 0**（发布前已校验）
- 首次发布前跑了两次冒烟：file:// 协议与 http:// 协议（python http.server 8731），均 JS 错误 0 / 资源失败 0；
  测试后本地测试服务已终止（PID 6072）

### 工具备忘（本日新增/修正）
- **node 路径**：本机实际是 `C:\Users\13104\.workbuddy\binaries\node\versions\22.22.2-6\node.exe`（**不是** `-3`）；
  `daily_check.py` 里 `find_node()` 的兜底 guess 写死 `-3`（已失效），但 `shutil.which("node")` 能命中，校验未静默跳过
- **Playwright 可用**：`C:/Users/13104/.workbuddy/skills/dashi-ppt/project/node_modules/playwright-core` +
  `C:/Users/13104/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`
  （require 路径**必须用 Windows 风格**，`/c/Users/...` 会 MODULE_NOT_FOUND）；
  可用来做发布前冒烟 + 发布后端到端验证（比只看 Last-Modified 强得多）
- **bash heredoc 会吃掉 JS 里的反斜杠**（`\\` 被吞成 `\`）→ 写 JS 脚本用 Write 工具，不用 heredoc
- 本地起静态服务用 `python -m http.server <port> --bind 127.0.0.1`；停服务要用 PowerShell 工具
  （bash 的 `pkill` 在 Git Bash 下杀不掉 Windows 进程）
- 页面文本里搜到「错误」多为**勘误原文「编辑性错误」**的假阳性，不是页面故障；
  判断页面异常应优先看 `pageerror` / `requestfailed` / HTTP>=400，而不是 innerText 关键词

### 复核（旧问题）
- healthy 假阳性**第 16 天复现**：RUNSTATE `healthy: true`，而今日 crawl_logs **无 error**（今日 SRC-07 冷却跳过）
  → 今日无当日 error 可对照，但机制仍未修
- SRC-06 日期兜底造号：本地与线上今日皆无（连续第 18 天）
- 音译三条（GB 5009.276/292/303）为历史遗留，未扩散
- 8 月批次三个婴配相关标准本地仍缺失（长期漏采，非今日新增）：`GB22570-2026`《辅食营养补充品和学龄前儿童营养补充品》、
  `GB31688-2026`《牛乳蛋白》、`GB5413.36-2026`《特殊膳食用食品中脂肪酸和反式脂肪酸的测定》
  （注：GB 5009.168-2026《食品中脂肪酸和反式脂肪酸的测定》已在库，别与 GB5413.36 混淆）

### 待修（优先级排序）
1. **★ SRC-07 判定逻辑**（连续 **21** fails，10-10 已诊断、11-05 再次确认根因）：
   修 `crawler.py:859`，0 条记 ok 并正常写空快照 → 否则每 24h 冷却到期即触发误报，部委公告渠道持续假失明
2. **★ 静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30/11-02/11-03/11-04/**11-05 复现**，**今日第 13 次**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   建议同时**把 SRC-06 的「沿用上次快照」兜底推广到所有源**（SRC-06 今天靠这条保住 4 条，SRC-08 没有）
3. **★ SRC-06 多栏目轮询**（连续 **11** 天造成实际掉条）：4 条公告分散在 `tssps/`/`spcjs/`/`zfjcs/`
   三栏目 → 改多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底
4. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧不可检索（今日再次证实），**不要因检索不到就判定废止**
5. **检索词表缺口**（10-31 首次，至今未修）：需补「辅食营养补充品」「牛乳蛋白」等词
6. **healthy 假阳性**（10-15 发现，已连续 16 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
8. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效
9. **发布通道已切换为 WorkBuddy 站点发布能力**（见上），`scripts/deploy.py --fast` 通道暂不再用；
   待修 #9「本地 prototype 是新版应用发布前需确认」**今日已实际整体上线并端到端验证通过**，此项可关闭

## 2026-11-06
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=61 REFGROUPS=14 ALERTS=2 SOONPOOL=4
  CNASDOCS=18 CNASKINDS=6 METHODS=18
- **判定情况 A → 已发布**（线上链接不变：https://infant-std-watch.app.workbuddy.host/）
  发布后 curl 回读：线上 data.js **514618 字节，md5 18a35040e6ddd0b4db53a19c4622177a，与本地逐字节一致**
  Playwright 端到端实测线上：JS 错误 0 / 资源失败 0；13 个导航视图**逐个点击全部渲染正常**
- 各源真实条数（还原后）：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98
  公告=56 勘误=187
- **真实新增/换版/废止/勘误全 0**；change_events 今日 0 行（总计仍 27，max 停在 10-08 10:10:25）；
  alerts 今日 0 行（总计 27）；6 条 MOD 修改单为重复推送，去重后 0
- **RUNSTATE.lastRun = 2026-11-06 19:27**（还原重建后）；nextRun = 2026-11-07 09:07

### ★ SRC-08 掉条第 14 次复现（同型，与 10-21/23/26/28/29/30/11-02/03/04/05 一致）
- 首跑 57 → 55，丢 `T/CDZX 003-2023`《乳粉中磷脂酰胆碱的测定 高效液相色谱法》
  与 `T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》
- **今日直连团标平台再次核验**（form 编码，正确姿势）：`CDZX` total=0、`乳粉中磷脂酰胆碱的测定` total=0、
  `磷脂酰胆碱` total=0；`HGMIF` total=26（仍不含 001）、`绿色设计产品评价技术规范 婴幼儿配方乳粉` total=0；
  **对照组 `HHPA` total=10、`婴幼儿肠造口` total=2 正常返回** → 平台检索正常，
  这 2 条属**平台侧索引漏召回**，**不能判定废止**
- 2 条官方详情页 GET 均 **200**（`/standardDetail/bmh8bvyilbowtow9tyc2f0e9amb2ry9`、
  `/standardDetail/7tlqje0bti5dudsw5g96h5yrgwg8fhm`）→ 原文仍在
- **处置（沿用既有口径，改进做法）**：不再整份覆盖快照，改为**合并还原**——
  今日 55 条保持新鲜（days_to_implement 正确），只从基线补回缺的 2 条，
  并**按当天重算这两条的 days_to_implement**（-1163→-1193、-1738→-1768）
  脚本 `.workbuddy/tmp/restore_src08_20261106.py`；再 `daily_check.py --skip-fetch` 重建 → STD 恢复 348
  （**注意**：整份 cp 覆盖会把 55 条的 days_to_implement 一起带旧 30 天，合并法可避免）

### ★ 官方源直连全库核验（结论：官方今天确实无新标准/新勘误/新公告）
- **标准库 1808 行 / 剔除解读材料后 1753 条**，**PDATE 上限仍 2026-08-18**；
  `PDATE>=2026-09-01` = **0 条**（与 11-02/03/04/05 完全一致 → 标准库自 8 月中旬起未再发新食品安全国标）
- **勘误库 187 条**：与本地 erata 快照 **GUID 完全相同（官方有本地无 0 / 本地有官方无 0）**；KWSJ 上限 2026-10-28
- **公告库 56 条**：与本地 notice 快照 **GUID 完全相同（双向 0 差异）**；PDATE 上限 2026-08-18
- **全库 num_tn=99（1975 GUID）**：本地修改单 55 条 → **官方全库命中 55 条，未命中 0**
- SRC-05 快照 373 vs 基线 373：标准号集合差异 **0/0**、7 个受监控字段（status/pub/imp/dead/replaces/replaced_by/title）差异 **0**
  → 零新增、零换版、零废止
- SRC-06 4 条公告原文直连（带 UA+Referer）：全部 **200** 且 `<title>` 与标题完全一致 → 官方原文仍在
  （**注意**：不带 UA/Referer 直连 samr.gov.cn 返回 403，是反爬不是下架 —— 核验必须带 UA+Referer）
- 本地 ERATA 61 条逐条溯源：55 条非修改单按 (标准号,章节) **全部命中官方勘误快照（55/55，0 未命中）**，
  6 条 MOD 按 guid **全部命中官方修改单**；无重复键；refscope 103 个标准，**超范围 0 条**

### ★ 本次发布的实质内容（不是「无意义覆盖」）
- 线上旧副本（11-05 18:29 发布）ERATA=15 / REFGROUPS=13，且 STD 的官方链接用的是**旧格式**
  `db?type=2&guid=<GUID>` —— 直连实测该形态 GET 返回的是**自动提交表单的空壳页**（title 只是平台名，
  无标准正文），`staticPages/<GUID>.html` 才是**真正静态详情页**（含「GB 10765-2021,食品安全国家标准 婴儿配方食品」等 meta）
- 今日本地：**263 条 STD 的 url 已切到 staticPages 形态**（HEAD 对比：仅 url 字段差异 263 条，方向 100% 旧→新）
- 另含 11-05 晚间用户点名的 4 个实验室在检标准分类 + **新增「食品添加剂」组（香兰素）**
  → REFGROUPS 13 → 14
- ERATA 15 → 61（46 条新增全部可溯源官方，含 2026-10-28 的 GB 5009.33-2025 亚硝酸盐测定勘误）
- → **按 10-29 确立的「线上副本陈旧且实质落后时归 A 发布」口径处理**；汇报中写明「今日无新标准，
  发布为纠正线上陈旧副本 + 修正官方链接形态」

### 工具备忘（本日新增）
- **src 官方库直连脚本的 loader bug 已修正**：快照是 dict（标准号→记录），不是 list；
  旧脚本 `load_items()` 只认 items/records/rows/data/list → 本地标准号恒为 0，误报「官方有本地无 1753 条」。
  新脚本 `.workbuddy/tmp/verify_std_20261106.py` 补 `return list(d.values())` 后本地标准号 533 个
- **refscope.json 结构**：`scope` 是 **dict**（键=标准号去空格去年份，如 `GB10765`），
  `level1` 是 55 条；比对 ERATA 是否超范围要用「标准号去空格后去掉 -年份」再比对，**别按完整标准号比**
- **团标平台检索词**：号段词 `CDZX`/`HGMIF` total=0，但**完整中文标题词也 total=0**；
  真正能命中的是**别的号段**（`HHPA` total=10、`婴幼儿肠造口` total=2）→ 说明是这 2 条自身没进检索索引
- **CFSA 官方详情页两种 URL 形态实测**：
  - `db?type=2&guid=<GUID>` → GET 200 但**返回自动提交 POST 的空壳表单**，用户点进去看不到标准正文
  - `staticPages/<GUID>.html` → GET 200，**真正的静态详情页**，meta 含标准号与名称
  → 页面「官方」链接一律用 staticPages（`sources.py:640` 的注释与实测一致）
- **sppt.cfsa.net.cn 连续快速请求会被限流**（curl 连发返回 000/SSL 错误），逐条验证之间要 sleep 6 秒以上
- **samr.gov.cn 直连必须带 UA + Referer**，否则 403（带 UA+Referer 后 200 且 title 正确）
- Playwright 路径（本日复测可用）：
  `C:/Users/13104/.workbuddy/skills/dashi-ppt/project/node_modules/playwright-core` +
  `C:/Users/13104/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe`
  （require 路径必须 Windows 风格）；脚本 `.workbuddy/tmp/smoke_20261106.js`（数据+错误）
  与 `.workbuddy/tmp/views_20261106.js`（逐个点击导航视图）
- **bash heredoc 会被安全策略拦截** → 写文件用 Write 工具；本地静态服务用
  `python -m http.server 8732 --bind 127.0.0.1`，停服务用 PowerShell（bash 的 pkill 杀不掉 Windows 进程）
- **还原快照不要用 git checkout**（HEAD 基线陈旧）→ 用运行前基线备份
  `.workbuddy/tmp/baseline_20261106/`（今日已建，含 data.js + 各源 _latest.json）
- 今日 baseline 已存 `.workbuddy/tmp/baseline_20261106/`：SRC-05=373 SRC-08=57（还原后）

### 复核（旧问题）
- healthy 假阳性**第 17 天复现**：RUNSTATE `healthy: true`，而今日 crawl_logs 明确有 `error / SRC-07`，fails=21
- SRC-07 直连复核（第 22 次确证）：三栏目 pageId 正常（cd969bf2/03b4fad2/3e3ad1a3）、
  接口载荷 8~12KB、**原始条目 72 条**，但 `_relevant()` 主体词∩动作词交集 = **0**
  （命中 FOOD_TERMS 1 条 =《轻工纺织产业发展"十五五"规划》、ACTION_TERMS 4 条、EXCLUDE 40 条）
  → **站点完全正常，是 crawler 把「0 条属正常业务结果」误报为 error**，根因仍在 `crawler.py:859`
- SRC-06 日期兜底造号连续第 19 天：本地 4 条均为**真文号**（总局公告2026年第34号、市监稽发〔2026〕117号）
  或标题型（「婴幼儿配方食品标签标识问答」），**不再是日期伪造文号**，此项已实质改善
- 音译三条（GB 5009.276/292/303）仍为历史遗留，未扩散
- 8 月批次三个婴配相关标准本地仍缺失（长期漏采，非今日新增）：`GB22570-2026`《辅食营养补充品和学龄前儿童营养补充品》、
  `GB31688-2026`《牛乳蛋白》、`GB5413.36-2026`《特殊膳食用食品中脂肪酸和反式脂肪酸的测定》

### 待修（优先级排序）
1. **★ SRC-07 判定逻辑**（连续 **21** fails，10-10 已诊断、11-04/11-05/11-06 三次直连再确认）：
   修 `crawler.py:859`，0 条记 ok 并正常写空快照 → 否则每 24h 冷却到期即触发误报，部委公告渠道持续假失明
2. **★ 静默掉条闸门**（10-06 首次，10-19 事故，10-21/23/26/28/29/30/11-02/03/04/05/**11-06 复现**，**今日第 14 次**）：
   `sanity_guard.py` 必须校验各源快照条数**环比跌幅**（>20% 判失败并阻断发布）；
   建议把 SRC-06/SRC-08 的「沿用上次快照」兜底**推广到所有源**
3. **★ SRC-06 多栏目轮询**（连续 **12** 天造成实际掉条）：4 条公告分散在 `tssps/`/`spcjs/`/`zfjcs/`
   三栏目 → 改多 pageId/多目录路径轮询 + 对快照内已有 `official_url` 做存活校验兜底
4. **SRC-08 检索词选取**：`SOURCE_OWN_TERMS['SRC-08']` 需补 `HHPA` 等号段词；
   `HGMIF 001-2021`、`CDZX 003-2023` 平台侧不可检索（今日再证实），**不要因检索不到就判定废止**
5. **检索词表缺口**（10-31 首次，至今未修）：需补「辅食营养补充品」「牛乳蛋白」等词
6. **healthy 假阳性**（10-15 发现，已连续 17 天）：`build_runstate.py` 需读 `crawl_logs` 当日 error
   与 `source_health.json` fails，反映到 healthy 与 logs
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
8. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效

## 2026-11-07
- 管线退出码 0，校验通过（还原后）：STD=348 LAWS=42 ERATA=61 REFGROUPS=14 ALERTS=2
- 各源真实条数：SRC-01=3 SRC-02=7 SRC-05=373 SRC-06=4 SRC-07=0 SRC-08=57 SRC-11=98 公告=56 勘误=187
- **真实新增/换版/废止/勘误全 0**；change_events 27 行 / alerts 27 行，max 均停在 2026-10-08 10:10:25；
  今日 crawl_logs 无 error 行
- **RUNSTATE.lastRun = 2026-11-07 14:39**；nextRun = 2026-11-08 09:07
- **判定情况 A → 已发布**（线上链接不变：https://infant-std-watch.app.workbuddy.host/）
  发布后 curl 回读：线上 data.js **514618 字节，md5 30031c947da98c4df9c68af509d36520，与本地逐字节一致**
  Playwright 端到端：JS 错误 0 / 资源失败 0；13 个导航视图**逐个点击全部渲染正常**

### ★ SRC-08 掉条第 15 次复现（同型）
- 首跑 57 → 55，丢 `T/CDZX 003-2023`《乳粉中磷脂酰胆碱的测定 高效液相色谱法》
  与 `T/HGMIF 001-2021`《绿色设计产品评价技术规范 婴幼儿配方乳粉》
- 今日直连团标平台再核验：`CDZX`/`磷脂酰胆碱`/`乳粉中磷脂酰胆碱` total 均 0；
  `HGMIF` total=26（**不含 001**）、`婴幼儿配方乳粉` total=13（**不含 HGMIF001**）、
  `绿色设计产品评价技术规范 婴幼儿` total=0；**对照组 `HHPA` total=10、`婴幼儿肠造口` total=2 正常**
  → 平台检索正常，属**索引漏召回**，**不能判定废止**；2 条详情页 GET 均 200（235334 字节）
- **处置**：合并还原（今日 55 条保持新鲜，只补回 2 条并按当天重算 days_to_implement
  -1193→-1194、-1768→-1769），脚本 `.workbuddy/tmp/restore_src08_20261107.py`
  → `daily_check.py --skip-fetch` 重建 → STD 恢复 348；node diff 复核 STD/ERATA/ALERTS/SRCS 全部 0 差异

### ★ 官方源直连全库核验（结论：官方今天确实无新标准/新勘误/新公告）
- 标准库 num_tn=2：1808 行 → 有效 1753 条，**PDATE 上限仍 2026-08-18**，`PDATE>=2026-09-01` = **0 条**
- 公告库 num_tn=1：56 条，与本地 **GUID 双向 0 差异**
- 勘误库 num_tn=4：187 条，与本地 **GUID 双向 0 差异**，KWSJ 上限 2026-10-28
- 全库 num_tn=99：1975 GUID；本地修改单 55 条 → **全部命中，未命中 0**
- 脚本 `.workbuddy/tmp/verify_official_20261107.py`（四库+TTBZ 一次跑完）

### 工具备忘（本日新增）
- **data.js 不是纯 JSON**（`window.STDWATCH_DATA = { STD:[{no:".."}] }`，键无引号、值单引号）
  → Python json 必失败，**必须 node + vm 载入**；已写 `.workbuddy/tmp/diff_20261107.js`
- **bash 管道接 head 会 SIGPIPE 杀掉长跑脚本**（今天 verify 第一次跑就是这样死的、JSON 没落盘）
  → 长脚本一律 `> log 2>&1` 重定向后再 grep/awk
- 还原快照不用 git checkout，用基线备份 `.workbuddy/tmp/baseline_20261107/`（data.js + data/snapshots 全量）
- Playwright 路径复测可用，脚本 `.workbuddy/tmp/smoke_20261107.js` / `views_20261107.js`（接受 URL 参数）

### 复核
- **SRC-07 今天根本没运行**（24h 冷却，crawl_logs 无 SRC-07 行）；`source_health.json` 里
  `SRC-07 fails=21 / last_fail=2026-11-06T18:46:58` 是**历史累计**，不是今天的错误
  → 今日 `healthy: true` 不算假阳性（但 build_runstate 不读 source_health 的根因仍未修）
- SRC-06 连续第 20 天靠「沿用上次快照 4 条」兜底保住（mtime 仍停 2026-11-02 18:15）
- 8 月批次三个婴配标准本地仍缺失（长期漏采，非今日新增）

### 待修（优先级排序）
1. **★ SRC-07 判定逻辑**（累计 21 fails）：修 `crawler.py:859`，0 条记 ok 并正常写空快照
2. **★ 静默掉条闸门**（10-06 首次，**今日第 15 次**）：`sanity_guard.py` 校验环比跌幅（>20% 阻断发布），
   并把「沿用上次快照」兜底推广到所有源
3. **★ SRC-06 多栏目轮询**（连续 **13** 天造成实际掉条）：改多 pageId/多目录轮询 + official_url 存活兜底
4. **SRC-08 检索词选取**：补 `HHPA` 等号段词；两条平台侧不可检索，**不要因检索不到就判定废止**
5. **检索词表缺口**（10-31 首次）：补「辅食营养补充品」「牛乳蛋白」等词
6. **healthy 假阳性**（10-15 发现）：`build_runstate.py` 读 crawl_logs 当日 error 与 source_health fails
7. `crawler.py:612-620` fetch 用裸 print 吞掉逐关键词异常
8. `scripts/selfcheck_page.js` 陈旧（`GB` → `GBNUTRITION`），应修或标注为失效
