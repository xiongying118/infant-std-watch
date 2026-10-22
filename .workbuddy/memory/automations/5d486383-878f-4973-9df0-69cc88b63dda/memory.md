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
