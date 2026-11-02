/* ================================================================
   labdata2.js —— 实验室管理新增 8 个模块的种子数据（2026-11-01）
   ================================================================
   与 labdata.js 的关系：
     labdata.js   设备/试剂/样品/QC/PT/人员/能力矩阵/记录模板
     labdata2.js  委托单/CAPA/排班/配制/出入库/报告/内审/环境监控

   全部数据为「行业典型值」，按婴配粉检测实验室的真实作业场景写。
   用户可在页面上直接改，改完落盘（ledger.<key>），刷新不丢。

   数据基准年份：2026
   ================================================================ */

(function (global) {
  "use strict";

  /* ================================================================
     ① 检验委托单台账
     ================================================================
     实验室一天的开始。四个环节：
       受理 → 在检 → 待复核 → 已出报告
     每个环节都有交接人和时间，交接要签字 —— 样品丢了要能查谁经手过。
     ================================================================ */
  var ORDERS = [
    {no:"WT2609-0142", recv:"2026-09-01", client:"委托方 A 乳业", sample:"金装婴儿配方奶粉 1 段 800g",
     batch:"A26081501", qty:"6 罐", items:"蛋白质、脂肪、水分、灰分、钙磷、钠、DHA/ARA、铅、菌落总数",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-09-01 09:12", testStart:"2026-09-01 14:30", reportDate:"2026-09-04",
     reportNo:"BG2609-0142", price:"3860", remark:"常规全项"},
    {no:"WT2609-0143", recv:"2026-09-01", client:"委托方 A 乳业", sample:"金装较大婴儿配方奶粉 2 段 900g",
     batch:"A26081502", qty:"6 罐", items:"蛋白质、脂肪、水分、灰分、钙磷、钠、铅、菌落总数",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-09-01 09:20", testStart:"2026-09-02 08:40", reportDate:"2026-09-05",
     reportNo:"BG2609-0143", price:"2980", remark:""},
    {no:"WT2609-0168", recv:"2026-09-03", client:"委托方 B 乳业", sample:"有机婴儿配方奶粉 1 段",
     batch:"B26082001", qty:"4 罐", items:"全项 32 项（含DHA/ARA、脂肪酸、维生素 8 项）",
     urgent:"是", status:"已出报告", receiver:"李国强", tester:"刘振华", reviewer:"周敏",
     recvTime:"2026-09-03 08:55", testStart:"2026-09-03 09:30", reportDate:"2026-09-08",
     reportNo:"BG2609-0168", price:"7860", remark:"有机认证，报告需带有机标识声明"},
    {no:"WT2609-0171", recv:"2026-09-05", client:"委托方 B 乳业", sample:"早产/低出生体重婴儿配方奶粉",
     batch:"B26082002", qty:"4 罐", items:"全项 32 项 + 维生素 D 加密",
     urgent:"是", status:"已出报告", receiver:"李国强", tester:"孙婷", reviewer:"周敏",
     recvTime:"2026-09-05 10:02", testStart:"2026-09-05 13:20", reportDate:"2026-09-11",
     reportNo:"BG2609-0171", price:"8420", remark:"维生素 D 临界值，客户要求复检"},
    {no:"WT2609-0203", recv:"2026-09-08", client:"委托方 C 牧场", sample:"全脂乳粉 FM-02",
     batch:"RM26083007", qty:"5 kg", items:"蛋白质、脂肪、水分、灰分、菌落总数、抗生素",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-09-08 08:40", testStart:"2026-09-08 14:10", reportDate:"2026-09-11",
     reportNo:"BG2609-0203", price:"2180", remark:"原料检验"},
    {no:"WT2609-0204", recv:"2026-09-08", client:"委托方 D 乳品", sample:"脱盐乳清粉 D90",
     batch:"WP26083002", qty:"5 kg", items:"蛋白质、脂肪、水分、灰分、钙磷、菌落总数",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-09-08 08:48", testStart:"2026-09-08 15:00", reportDate:"2026-09-12",
     reportNo:"BG2609-0204", price:"1960", remark:"原料检验"},
    {no:"WT2609-0219", recv:"2026-09-09", client:"委托方 D 乳品", sample:"浓缩乳清蛋白粉 WPC80",
     batch:"WP26090105", qty:"2 kg", items:"蛋白质、脂肪、水分、灰分、铅、镉",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-09-09 09:05", testStart:"2026-09-10 08:50", reportDate:"2026-09-14",
     reportNo:"BG2609-0219", price:"1860", remark:"蛋白超标复测一次"},
    {no:"WT2609-0244", recv:"2026-09-15", client:"委托方 E 食品", sample:"儿童调制乳粉（3 岁以上）",
     batch:"E26090501", qty:"6 罐", items:"蛋白质、脂肪、水分、钙磷、钠、菌落总数",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"孙婷", reviewer:"周敏",
     recvTime:"2026-09-15 08:35", testStart:"2026-09-15 13:40", reportDate:"2026-09-18",
     reportNo:"BG2609-0244", price:"1760", remark:"按 GB 19644 判定"},
    {no:"WT2609-0250", recv:"2026-09-16", client:"委托方 G 包材", sample:"马口铁罐（900g 规格）",
     batch:"PK26090512", qty:"10 只", items:"GB 4806.9 全迁移 + 铅/镉迁移",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"周敏", reviewer:"周敏",
     recvTime:"2026-09-16 09:20", testStart:"2026-09-17 08:30", reportDate:"2026-09-25",
     reportNo:"BG2609-0250", price:"3800", remark:"包材迁移试验，周期长"},
    {no:"WT2609-0251", recv:"2026-09-16", client:"委托方 G 包材", sample:"内壁涂料（马口铁罐）",
     batch:"PK26090513", qty:"6 只", items:"GB 4806.2 重金属迁移",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"周敏", reviewer:"周敏",
     recvTime:"2026-09-16 09:26", testStart:"2026-09-17 09:10", reportDate:"2026-09-24",
     reportNo:"BG2609-0251", price:"2400", remark:""},
    {no:"WT2609-0261", recv:"2026-09-18", client:"委托方 F 营养", sample:"婴儿配方奶粉（豆基）1 段",
     batch:"F26091003", qty:"4 罐", items:"全项 32 项（蛋白按豆基判定）",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"刘振华", reviewer:"周敏",
     recvTime:"2026-09-18 10:15", testStart:"2026-09-18 14:20", reportDate:"2026-09-26",
     reportNo:"BG2609-0261", price:"7940", remark:"大豆蛋白配方"},
    {no:"WT2609-0268", recv:"2026-09-21", client:"委托方 A 乳业", sample:"金装幼儿配方奶粉 3 段 900g",
     batch:"A26091501", qty:"6 罐", items:"全项 32 项",
     urgent:"否", status:"待复核", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-09-21 09:05", testStart:"2026-09-21 13:30", reportDate:"",
     reportNo:"", price:"7860", remark:"数据已出，待质量负责人复核"},
    {no:"WT2609-0272", recv:"2026-09-22", client:"委托方 H 商贸", sample:"婴儿配方奶粉 1 段（市场抽检）",
     batch:"M26091802", qty:"3 罐", items:"蛋白质、脂肪、钙磷、钠、铅、菌落总数、阪崎肠杆菌",
     urgent:"否", status:"在检", receiver:"李国强", tester:"赵敏", reviewer:"周敏",
     recvTime:"2026-09-22 11:40", testStart:"2026-09-22 14:00", reportDate:"",
     reportNo:"", price:"3200", remark:"第三方抽检，需加做阪崎肠杆菌"},
    {no:"WT2609-0275", recv:"2026-09-23", client:"委托方 I 乳业", sample:"早产儿配方奶粉（液态）",
     batch:"L26092005", qty:"6 盒", items:"蛋白质、脂肪、钙磷、DHA/ARA、铅",
     urgent:"是", status:"在检", receiver:"李国强", tester:"孙婷", reviewer:"周敏",
     recvTime:"2026-09-23 08:50", testStart:"2026-09-23 13:20", reportDate:"",
     reportNo:"", price:"2480", remark:"客户催货，需优先排"},
    {no:"WT2609-0279", recv:"2026-09-24", client:"委托方 J 乳业", sample:"乳糖粉（调制乳粉基料）",
     batch:"M26092103", qty:"3 kg", items:"水分、蛋白质、脂肪、灰分、钙磷",
     urgent:"否", status:"受理", receiver:"李国强", tester:"", reviewer:"",
     recvTime:"2026-09-24 10:30", testStart:"", reportDate:"",
     reportNo:"", price:"1280", remark:"待分配检验员"}
  ];

  /* ================================================================
     ② 不符合工作与 CAPA
     ================================================================
     实验室出问题不能只在微信群里说一句。
     CNAS 要求：不符合要做原因分析、纠正措施、纠正措施有效性验证。
     闭环链条：发现 → 原因分析 → 措施 → 落实 → 有效性验证 → 关闭
     ================================================================ */
  var CAPA = [
    {no:"NC-2026-011", date:"2026-09-10", src:"QC 超限", item:"蛋白质 QC 平行样 RSD 3.6%，超 3% 限值",
     level:"中", impact:"涉及 BG2609-0219 批次 8 份样品的数据有效性",
     cause:"更换硫酸钾供应商批次后，试剂氮本底升高（空白由 0.11mg 升至 0.22mg），叠加消解管清洗不彻底",
     action:"① 更换硫酸钾批次并做空白验证；② 消解管改用一次性使用；③ 每日做空白，空白 >0.15mg 即停做",
     owner:"王海涛", due:"2026-09-11", fixDate:"2026-09-11", verifyDate:"2026-09-14",
     verify:"连续 3 批 QC 空白均 <0.10mg、平行样 RSD 均 <2%，验证有效",
     status:"已关闭", close:"2026-09-14", note:"复测批次数据已作废重做"},
    {no:"NC-2026-012", date:"2026-09-14", src:"客户投诉", item:"客户反映 2 罐粉开罐后有结块，怀疑水分超标",
     level:"中", impact:"批次 A26081501 的市场反馈，涉及 3 罐",
     cause:"留样水分复测 4.62%，符合标准（≤5.0%）；判定为运输储存受潮结块，非产品问题",
     action:"① 复测留样水分并留数据；② 向客户说明储存条件；③ 出具复测报告",
     owner:"孙婷", due:"2026-09-15", fixDate:"2026-09-15", verifyDate:"2026-09-16",
     verify:"复测报告已发客户，客户确认无异议",
     status:"已关闭", close:"2026-09-16", note:"投诉不成立但已闭环"},
    {no:"NC-2026-013", date:"2026-09-18", src:"设备", item:"原子荧光分光光度计（EQ-035）氩气路压力不稳，检出限漂移",
     level:"高", impact:"期间不能出具铅、砷、镉、汞的检验报告",
     cause:"氩气瓶减压阀老化，输出压力波动超 5%",
     action:"① 立即送修，期间铅砷项目送有资质单位；② 更换减压阀；③ 恢复后重新做检出限验证",
     owner:"周敏", due:"2026-09-25", fixDate:"2026-09-24", verifyDate:"",
     verify:"",
     status:"整改中", close:"", note:"送修中，预计 9-25 恢复"},
    {no:"NC-2026-014", date:"2026-09-20", src:"记录", item:"原始记录 GC-2609-021 检验人签字缺失",
     level:"中", impact:"该份记录对应的报告 BG2609-0204 已发出",
     cause:"检验人当天下班早退，签字时记录已归档",
     action:"① 立即暂停该批次记录归档流程；② 书面说明情况并由检验人补签；③ 开展记录审核培训",
     owner:"王海涛", due:"2026-09-22", fixDate:"2026-09-22", verifyDate:"",
     verify:"",
     status:"待验证", close:"", note:"已补签，但需质量部核查有效性"},
    {no:"NC-2026-015", date:"2026-09-22", src:"留样", item:"3 份留样编号与台账不符，无法定位",
     level:"中", impact:"涉及 2026-07 批次留样，复检时无法调取",
     cause:"留样时手工写标签，与台账录入不是同一个人，编号规则未统一",
     action:"① 全面盘点在库留样；② 启用条码/统一编号规则；③ 留样存取双人签字",
     owner:"李国强", due:"2026-09-30", fixDate:"", verifyDate:"",
     verify:"",
     status:"整改中", close:"", note:"盘点进行中"},
    {no:"NC-2026-016", date:"2026-09-25", src:"环境", item:"微生物室培养箱温度 37.2℃，超出 36±1℃ 上限",
     level:"高", impact:"期间培养的 4 份菌落总数结果存疑",
     cause:"培养箱控温探头偏移，压缩机启停异常",
     action:"① 期间培养结果作废重做；② 更换探头；③ 接入温度超限自动报警",
     owner:"赵敏", due:"2026-09-28", fixDate:"", verifyDate:"",
     verify:"",
     status:"整改中", close:"", note:"探头已到货待更换"}
  ];

  /* ================================================================
     ③ 人员排班与工作量
     ================================================================
     谁在做哪批、忙闲如何、加班多少 —— 排班和产能都要有数。
     依据：实验室人员休假、交叉培训要求
     ================================================================ */
  var SCHEDULE = [
    {week:"2026-W37", person:"王海涛", role:"理化", days:"一~五", hours:40, orders:"BG2609-0142、0143、0203、0204、0268",
     load:"中", overtime:0, note:"理化主力"},
    {week:"2026-W37", person:"孙婷", role:"理化/维生素", days:"一~五", hours:40, orders:"BG2609-0244",
     load:"轻", overtime:0, note:""},
    {week:"2026-W37", person:"刘振华", role:"色谱", days:"一~五", hours:40, orders:"BG2609-0168、0261",
     load:"中", overtime:0, note:"全项样品主检"},
    {week:"2026-W37", person:"陈晓芸", role:"理化/元素", days:"一~五", hours:40, orders:"BG2609-0250、0251",
     load:"轻", overtime:0, note:"包材迁移"},
    {week:"2026-W37", person:"赵敏", role:"微生物", days:"一~五", hours:40, orders:"BG2609-0272",
     load:"轻", overtime:0, note:""},
    {week:"2026-W37", person:"李国强", role:"样品管理", days:"一~五", hours:40, orders:"全部收样与留样",
     load:"重", overtime:2, note:"样品接收与留样盘点并行"},
    {week:"2026-W38", person:"王海涛", role:"理化", days:"一~五", hours:40, orders:"BG2609-0268、0279",
     load:"中", overtime:0, note:""},
    {week:"2026-W38", person:"孙婷", role:"理化/维生素", days:"一~五", hours:40, orders:"BG2609-0275",
     load:"中", overtime:6, note:"客户催货，加班赶工"},
    {week:"2026-W38", person:"刘振华", role:"色谱", days:"一~五", hours:40, orders:"BG2609-0275",
     load:"中", overtime:6, note:"DHA/ARA 项目"},
    {week:"2026-W38", person:"陈晓芸", role:"理化/元素", days:"一~五", hours:40, orders:"BG2609-0279",
     load:"轻", overtime:0, note:""},
    {week:"2026-W38", person:"赵敏", role:"微生物", days:"一~四", hours:32, orders:"BG2609-0272",
     load:"轻", overtime:0, note:"周二、周五休息"},
    {week:"2026-W38", person:"李国强", role:"样品管理", days:"一~五", hours:40, orders:"全部收样与留样",
     load:"重", overtime:4, note:"留样盘点未完成"}
  ];

  /* ================================================================
     ④ 试剂配制记录
     ================================================================
     配制的试剂不是「买来的成品」—— 它有自己的配制日、效期、
     浓度确认、标定人。实验室最常见的争议就是「这瓶标液谁配的、准不准」。
     ================================================================ */
  var PREP = [
    {no:"PF2609-001", name:"硫酸标准溶液 0.0500 mol/L", spec:"0.0500 mol/L", form:"GB/T 6026",
     mat:"浓硫酸（AR）", calc:"c = 0.0500 mol/L；V(H₂SO₄) = c×V/cₒ",
     vol:"1000 mL", date:"2026-09-01", exp:"2026-12-01", store:"试剂柜 A-6（常温避光）",
     base:"GB/T 6026 标线法配制，25℃ 标定",
     conc:"0.04987 mol/L", std:"标定 3 次，极差 0.15%，相对偏差 ≤0.2%",
     maker:"王海涛", checker:"周敏", status:"在用", use:"凯氏定氮滴定 / 糖量测定"},
    {no:"PF2609-002", name:"氢氧化钠标准溶液 0.1000 mol/L", spec:"0.1000 mol/L", form:"GB/T 6026",
     mat:"NaOH（AR）", calc:"称取 4.000 g NaOH（基准试剂）",
     vol:"1000 mL", date:"2026-09-01", exp:"2026-10-01", store:"试剂柜 A-6（橡胶塞，勿用玻璃塞）",
     base:"GB/T 6026 基准试剂法",
     conc:"0.09982 mol/L", std:"标定 3 次，极差 0.12%",
     maker:"王海涛", checker:"周敏", status:"在用", use:"酸碱滴定"},
    {no:"PF2609-003", name:"抗坏血酸标准溶液 0.1 mg/mL", spec:"0.1 mg/mL", form:"实验室配制",
     mat:"抗坏血酸标准品（GBW(E)080291）", calc:"称取 10.0 mg 标准品，0.1% 草酸溶液定容至 100 mL",
     vol:"100 mL", date:"2026-09-10", exp:"2026-09-24", store:"冰箱 4℃（避光）",
     base:"按 GB 5413.17 附录 A",
     conc:"0.0988 mg/mL", std:"与厂商标称值偏差 1.2%（合格）",
     maker:"孙婷", checker:"周敏", status:"在用", use:"维生素 C 测定"},
    {no:"PF2609-004", name:"亚硝酸盐标准溶液 100 μg/mL", spec:"100 μg/mL", form:"GB/T 974",
     mat:"亚硝酸钠标准溶液（GBW(E)080012）", calc:"移取 1.00 mL 1000 μg/mL 母液定容至 10 mL",
     vol:"10 mL", date:"2026-09-05", exp:"2026-12-05", store:"试剂柜 A-6",
     base:"GB/T 974",
     conc:"100 μg/mL", std:"稀释倍数核算无误",
     maker:"赵敏", checker:"周敏", status:"在用", use:"亚硝酸盐测定"},
    {no:"PF2609-005", name:"淀粉酶工作液", spec:"0.5% 淀粉酶", form:"实验室配制",
     mat:"淀粉酶（sigma A3176）", calc:"称取 0.50 g 淀粉酶，用 40℃ 缓冲液溶解并定容至 100 mL",
     vol:"100 mL", date:"2026-09-08", exp:"2026-09-22", store:"冰箱 4℃",
     base:"按 GB 5009.6 第三法",
     conc:"0.5%", std:"碘液检验水解完全",
     maker:"孙婷", checker:"王海涛", status:"在用", use:"脂肪测定（淀粉酶解）"},
    {no:"PF2609-006", name:"刚果红指示液", spec:"0.5%", form:"实验室配制",
     mat:"刚果红（AR）", calc:"称取 0.50 g 刚果红，加水溶解并定容至 100 mL",
     vol:"100 mL", date:"2026-09-06", exp:"2026-12-06", store:"试剂柜 A-6",
     base:"按 GB 5009.6 第三法",
     conc:"0.5%", std:"外观无沉淀",
     maker:"孙婷", checker:"王海涛", status:"在用", use:"脂肪测定水相染色"},
    {no:"PF2609-007", name:"硫代硫酸钠标准溶液 0.0500 mol/L", spec:"0.0500 mol/L", form:"GB/T 6025",
     mat:"Na₂S₂O₃·5H₂O（AR）", calc:"称取 6.200 g，溶解定容至 1000 mL，暗处放置 14 天后标定",
     vol:"1000 mL", date:"2026-08-20", exp:"2026-11-20", store:"试剂柜 A-6（棕色瓶）",
     base:"GB/T 6025",
     conc:"0.04991 mol/L", std:"标定 3 次，极差 0.18%",
     maker:"陈晓芸", checker:"周敏", status:"在用", use:"碘量法"},
    {no:"PF2609-008", name:"盐酸标准溶液 0.1000 mol/L", spec:"0.1000 mol/L", form:"GB/T 6026",
     mat:"浓盐酸（AR）", calc:"移取浓盐酸约 9 mL 定容至 1000 mL",
     vol:"1000 mL", date:"2026-09-15", exp:"2026-12-15", store:"试剂柜 A-6（通风处）",
     base:"GB/T 6026",
     conc:"0.09988 mol/L", std:"标定 3 次，极差 0.11%",
     maker:"陈晓芸", checker:"周敏", status:"在用", use:"酸水解 / pH 调节"},
    {no:"PF2609-009", name:"亚硝酸盐显色液（萘乙二胺磺酸）", spec:"0.5%", form:"实验室配制",
     mat:"N-1-萘基乙二胺盐酸盐（AR）", calc:"称取 0.50 g，用 100 mL 盐酸（2 mol/L）溶解",
     vol:"100 mL", date:"2026-09-05", exp:"2026-09-20", store:"棕色瓶，冰箱 4℃",
     base:"GB 5009.18",
     conc:"0.5%", std:"空白无干扰",
     maker:"赵敏", checker:"周敏", status:"即将到期", use:"亚硝酸盐显色"},
    {no:"PF2609-010", name:"考马斯亮蓝工作液", spec:"0.1%", form:"实验室配制",
     mat:"考马斯亮蓝 G-250（BR）", calc:"称取 0.10 g，溶于 100 mL 磷酸-醋酸缓冲液",
     vol:"100 mL", date:"2026-09-12", exp:"2026-09-27", store:"试剂柜 A-6",
     base:"按 GB 5009.5 附录",
     conc:"0.1%", std:"与 BSA 标准液显色正常",
     maker:"陈晓芸", checker:"王海涛", status:"在用", use:"蛋白快速测定"}
  ];

  /* ================================================================
     ⑤ 样品出入库与物流
     ================================================================
     样品从进门到出门，每一步都要有人签字。
     出库＝寄给客户或销毁；入库＝收样或退样。
     ================================================================ */
  var FLOWS = [
    {no:"RK2609-001", time:"2026-09-01 09:12", type:"入库", sample:"金装婴儿配方奶粉 1 段 800g",
     batch:"A26081501", qty:"6 罐", from:"委托方 A 乳业", to:"样品室冷藏 C-1 第 1 层",
     reason:"收样", handler:"李国强", receiver:"李国强", status:"已入库"},
    {no:"RK2609-002", time:"2026-09-01 09:20", type:"入库", sample:"金装较大婴儿配方奶粉 2 段 900g",
     batch:"A26081502", qty:"6 罐", from:"委托方 A 乳业", to:"样品室冷藏 C-1 第 1 层",
     reason:"收样", handler:"李国强", receiver:"李国强", status:"已入库"},
    {no:"RK2609-003", time:"2026-09-03 08:55", type:"入库", sample:"有机婴儿配方奶粉 1 段",
     batch:"B26082001", qty:"4 罐", from:"委托方 B 乳业", to:"样品室冷藏 C-1 第 2 层",
     reason:"收样", handler:"李国强", receiver:"李国强", status:"已入库"},
    {no:"RK2609-010", time:"2026-09-04 16:30", type:"转存", sample:"金装婴儿配方奶粉 1 段 800g",
     batch:"A26081501", qty:"2 罐", from:"样品室冷藏 C-1 第 1 层", to:"留样柜 R-1 第 2 层",
     reason:"留样", handler:"李国强", receiver:"李国强", status:"已转存"},
    {no:"CK2609-006", time:"2026-09-04 17:10", type:"出库", sample:"金装婴儿配方奶粉 1 段 800g（复测留样）",
     batch:"A26081501", qty:"1 罐", from:"留样柜 R-1 第 2 层", to:"委托方 A 乳业（EMS 顺丰 7729...)",
     reason:"客户复测申请", handler:"李国强", receiver:"周敏", status:"已寄出"},
    {no:"CK2609-009", time:"2026-09-05 15:40", type:"出库", sample:"全脂乳粉 FM-02（客户留样）",
     batch:"RM26083007", qty:"1 kg", from:"留样柜 R-3 第 1 层", to:"委托方 C 牧场（顺丰 6612...)",
     reason:"客户要求退还留样", handler:"李国强", receiver:"周敏", status:"已寄出"},
    {no:"CK2609-015", time:"2026-09-12 11:20", type:"出库", sample:"脱盐乳清粉 D90（剩余样品）",
     batch:"WP26083002", qty:"2 kg", from:"样品室常温柜 W-1", to:"委托方 D 乳品（德邦 3308...)",
     reason:"余样退还", handler:"李国强", receiver:"周敏", status:"已寄出"},
    {no:"FH2609-001", time:"2026-09-30 16:00", type:"销毁", sample:"金装婴儿配方奶粉 1 段 800g（留样）",
     batch:"A26081501", qty:"2 罐", from:"留样柜 R-1 第 2 层", to:"—",
     reason:"留样期满销毁（保留期 2029-02-15，未到期，本次为客户同意提前处置）",
     handler:"李国强", receiver:"周敏", status:"待审批"},
    {no:"FH2609-002", time:"2026-09-30 16:05", type:"销毁", sample:"婴儿配方奶粉（豆基）1 段（留样）",
     batch:"F26091003", qty:"1 罐", from:"留样柜 R-2 第 2 层", to:"—",
     reason:"留样期满销毁", handler:"李国强", receiver:"周敏", status:"待审批"},
    {no:"FH2609-003", time:"2026-09-30 16:10", type:"销毁", sample:"早产/低出生体重婴儿配方奶粉（留样）",
     batch:"B26082002", qty:"1 罐", from:"留样柜 R-2 第 1 层", to:"—",
     reason:"留样期满销毁", handler:"李国强", receiver:"周敏", status:"待审批"}
  ];

  /* ================================================================
     ⑥ 检测报告模板
     ================================================================
     报告模板要素：依据方法、结果与判定、结论、签发。
     模板要能被「填值 → 出报告」，签发人按 CNAS 授权。
     ================================================================ */
  var REPORT_TPL = [
    {key:"report_std", name:"检验报告（标准模板）", forType:"婴配成品",
     method:"按委托检验项目所对应的现行有效国家标准方法检验",
     items:"依委托单所列检验项目",
     judge:"各项指标符合 GB 10765 / GB 10766 / GB 10767 相应段位要求",
     concl:"经检验，所检项目均符合上述标准要求。",
     limit:"检验结果仅对来样负责。",
     signer:"周敏（授权签字人）", reviewer:"王海涛", days:"5 个工作日",
     note:"婴配成品报告必须体现段位（1/2/3段）与产品类型（乳基/豆基）"},
    {key:"report_raw", name:"检验报告（原料）", forType:"原料（乳粉/乳清粉）",
     method:"按原料检验项目对应的现行有效国家标准方法检验",
     items:"依委托单所列检验项目",
     judge:"各项指标符合相应的原料质量标准与备案要求",
     concl:"经检验，所检项目符合相应质量标准要求。",
     limit:"检验结果仅对来样负责。",
     signer:"周敏（授权签字人）", reviewer:"陈晓芸", days:"5 个工作日",
     note:"原料报告要注明是原料检验，不能直接用于成品放行"},
    {key:"report_pkg", name:"检验报告（包材迁移）", forType:"食品接触材料",
     method:"按 GB 4806 系列现行有效标准方法检验",
     items:"依委托单所列迁移项目",
     judge:"各项迁移量符合 GB 4806 相应材料的要求",
     concl:"经检验，所检项目符合上述标准要求。",
     limit:"检验结果仅对来样负责。",
     signer:"周敏（授权签字人）", reviewer:"周敏", days:"8 个工作日",
     note:"包材报告要注明「模拟物」「接触条件」等试验条件"},
    {key:"report_micro", name:"检验报告（微生物专项）", forType:"微生物专项",
     method:"按 GB 4789 系列现行有效标准方法检验",
     items:"依委托单所列微生物项目",
     judge:"各项指标符合 GB 10765 / GB 10767 微生物限量要求",
     concl:"经检验，所检项目符合上述标准要求。",
     limit:"检验结果仅对来样负责。",
     signer:"周敏（授权签字人）", reviewer:"赵敏", days:"5 个工作日",
     note:"阪崎肠杆菌必须逐批检测，不得检出"},
    {key:"report_pt", name:"检验报告（能力验证）", forType:"能力验证样品",
     method:"按 PT 方案所指定方法检验",
     items:"按 PT 方案项目",
     judge:"按 PT 方案评价方式（Z 值 / 判定值）",
     concl:"按 PT 报告格式评价。",
     limit:"本报告为能力验证结果，不作为产品质量证明。",
     signer:"周敏（授权签字人）", reviewer:"周敏", days:"按 PT 方案时限",
     note:"PT 报告只能发给 PT 组织方，不得对外提供"},
    {key:"report_retest", name:"复检报告", forType:"复检",
     method:"按原检验单相同方法检验",
     items:"同原检验单",
     judge:"同原检验单",
     concl:"复检结果详见结果表。",
     limit:"本报告为复检报告，仅对本次复检样品负责，与原报告为独立结论。",
     signer:"周敏（授权签字人）", reviewer:"孙婷", days:"3 个工作日",
     note:"复检报告必须写明「复检」字样，不能与原报告混用"}
  ];

  /* ================================================================
     ⑦ 内审检查表
     ================================================================
     按 CNAS-CL01 条款逐条自查 —— 内审表本身就是「条款 × 证据」的对照。
     每条要有：审核对象、证据、结论、发现。
     ================================================================ */
  var AUDIT = [
    {no:"4.1", clause:"人员", item:"人员配备与职责", obj:"检测人员 7 名，岗位覆盖理化/色谱/元素/微生物/样品管理",
     evidence:"人员档案、岗位说明书、资质证书", method:"查阅 + 访谈",
     result:"符合", finding:"", owner:"周敏", date:"2026-09-10"},
    {no:"4.2", clause:"人员", item:"人员培训与监督", obj:"新员工培训记录、上岗考核",
     evidence:"培训签到表、考核试卷、上岗授权记录", method:"查阅 + 抽查 3 人",
     result:"符合", finding:"", owner:"周敏", date:"2026-09-10"},
    {no:"4.2.5", clause:"人员", item:"人员监督与授权", obj:"在岗人员授权范围与监督记录",
     evidence:"授权签字人任命书、监督记录", method:"查阅",
     result:"基本符合", finding:"2 名新入职检验员仅授权本岗位项目，监督记录仅 1 次，建议补足 3 次以上",
     owner:"周敏", date:"2026-09-10"},
    {no:"5.3", clause:"设施与环境", item:"实验室环境条件监控", obj:"温湿度、洁净区压差、洁净度",
     evidence:"环境监控记录、压差记录、HEPA 检漏报告", method:"查阅 + 现场核查",
     result:"不符合", finding:"培养箱控温探头偏移，9-22 温度超出 36±1℃；已开 NC-2026-016。环境记录表有 3 天漏记",
     owner:"赵敏", date:"2026-09-11"},
    {no:"5.5", clause:"设施与环境", item:"设备维护与期间核查", obj:"25 台设备的校准状态与期间核查",
     evidence:"校准证书、期间核查记录", method:"查阅 + 现场核查",
     result:"不符合", finding:"EQ-035 氩气路压力不稳导致检出限漂移，已开 NC-2026-013；另有 2 台设备期间核查记录超期",
     owner:"周敏", date:"2026-09-11"},
    {no:"6.2", clause:"设备", item:"计量溯源", obj:"全部有量值要求的设备",
     evidence:"校准/检定证书（含溯源链）", method:"查阅",
     result:"符合", finding:"", owner:"周敏", date:"2026-09-11"},
    {no:"6.4", clause:"设备", item:"设备唯一性标识", obj:"设备编号与台账、标签一致",
     evidence:"设备台账、实物标签", method:"现场核对 10 台",
     result:"基本符合", finding:"2 台移液器编号与台账不一致（现场无标签）",
     owner:"陈晓芸", date:"2026-09-12"},
    {no:"7.2", clause:"方法", item:"方法选择与验证", obj:"非标方法与超范围方法的验证记录",
     evidence:"方法验证报告", method:"查阅",
     result:"符合", finding:"", owner:"刘振华", date:"2026-09-12"},
    {no:"7.5", clause:"方法", item:"记录与报告", obj:"原始记录、记录修改、报告审核",
     evidence:"原始记录 30 份、报告 20 份", method:"抽查",
     result:"不符合", finding:"GC-2609-021 检验人签字缺失，已开 NC-2026-014；3 份记录有涂改未杠改签署",
     owner:"王海涛", date:"2026-09-12"},
    {no:"8.4", clause:"质量保证", item:"内部质量控制", obj:"12 个项目的 QC 方案与执行记录",
     evidence:"QC 方案、执行记录", method:"查阅",
     result:"基本符合", finding:"蛋白质 QC 空白超限一次，已开 NC-2026-011 并闭环；建议将空白纳入日常台账",
     owner:"王海涛", date:"2026-09-12"},
    {no:"8.5", clause:"质量保证", item:"能力验证与比对", obj:"2026 年度 PT 参与情况",
     evidence:"PT 报告、评价结果", method:"查阅",
     result:"符合", finding:"4 次 PT，1 次可疑值已做原因分析", owner:"周敏", date:"2026-09-13"},
    {no:"8.6", clause:"质量保证", item:"测量不确定度", obj:"各检测项目的不确定度评定",
     evidence:"不确定度评定文件", method:"查阅",
     result:"基本符合", finding:"不确定度评定为 2023 年版本，原料乳指标未覆盖，建议补充",
     owner:"周敏", date:"2026-09-13"},
    {no:"9.2", clause:"质量管理体系", item:"文件控制", obj:"体系文件、作业指导书的现行有效版本",
     evidence:"文件清单、发放记录、作废回收记录", method:"查阅 + 抽查",
     result:"符合", finding:"", owner:"周敏", date:"2026-09-13"},
    {no:"9.3", clause:"质量管理体系", item:"不符合工作与纠正措施", obj:"NC-2026 年度台账",
     evidence:"NC 台账、原因分析、有效性验证", method:"查阅",
     result:"基本符合", finding:"6 项 NC 中 2 项尚在整改中，闭环率 66.7%，低于 90% 的内控目标",
     owner:"周敏", date:"2026-09-13"},
    {no:"10.2", clause:"投诉与不符合产品", item:"客户投诉处理", obj:"2026 年度投诉记录",
     evidence:"投诉记录、复测报告、答复记录", method:"查阅",
     result:"符合", finding:"2 起投诉均已复测并闭环", owner:"周敏", date:"2026-09-13"},
    {no:"10.5", clause:"记录", item:"记录保存与保密", obj:"记录保存期限、访问控制",
     evidence:"记录归档清单、权限设置", method:"查阅",
     result:"符合", finding:"", owner:"李国强", date:"2026-09-13"}
  ];

  /* ================================================================
     ⑧ 环境与洁净区监控
     ================================================================
     实验室环境不是「感觉还行」—— 要有记录、有趋势、有报警。
     依据：GB 19489 实验室生物安全通用要求、洁净区温度湿度要求
     ================================================================ */
  var ENV = [
    {date:"2026-09-20", zone:"微生物检验室", temp:23.4, humid:48, press:"-12 Pa", clean:"—",
     status:"合格", note:"压差正常", by:"赵敏"},
    {date:"2026-09-20", zone:"理化前处理间", temp:25.8, humid:52, press:"—", clean:"—",
     status:"合格", note:"", by:"王海涛"},
    {date:"2026-09-20", zone:"色谱室", temp:23.1, humid:45, press:"—", clean:"—",
     status:"合格", note:"温湿度对色谱基线有利", by:"刘振华"},
    {date:"2026-09-21", zone:"微生物检验室", temp:23.6, humid:47, press:"-11 Pa", clean:"—",
     status:"合格", note:"", by:"赵敏"},
    {date:"2026-09-21", zone:"理化前处理间", temp:26.2, humid:54, press:"—", clean:"—",
     status:"合格", note:"略高，注意通风", by:"王海涛"},
    {date:"2026-09-21", zone:"色谱室", temp:23.0, humid:45, press:"—", clean:"—",
     status:"合格", note:"", by:"刘振华"},
    {date:"2026-09-22", zone:"微生物检验室", temp:23.8, humid:49, press:"-12 Pa", clean:"—",
     status:"合格", note:"", by:"赵敏"},
    {date:"2026-09-22", zone:"理化前处理间", temp:26.5, humid:55, press:"—", clean:"—",
     status:"合格", note:"", by:"王海涛"},
    {date:"2026-09-22", zone:"色谱室", temp:23.2, humid:46, press:"—", clean:"—",
     status:"合格", note:"", by:"刘振华"},
    {date:"2026-09-22", zone:"试剂室（危化品）", temp:27.8, humid:44, press:"—", clean:"—",
     status:"关注", note:"温度偏高，易燃溶剂储存区要求 ≤25℃", by:"陈晓芸"},
    {date:"2026-09-23", zone:"微生物检验室", temp:24.0, humid:48, press:"-12 Pa", clean:"—",
     status:"合格", note:"", by:"赵敏"},
    {date:"2026-09-23", zone:"理化前处理间", temp:26.4, humid:53, press:"—", clean:"—",
     status:"合格", note:"", by:"王海涛"},
    {date:"2026-09-23", zone:"色谱室", temp:23.1, humid:45, press:"—", clean:"—",
     status:"合格", note:"", by:"刘振华"},
    {date:"2026-09-23", zone:"试剂室（危化品）", temp:28.3, humid:43, press:"—", clean:"—",
     status:"超限", note:"超 25℃ 上限 3.3℃，已调低空调温度并加装排风", by:"陈晓芸"},
    {date:"2026-09-24", zone:"微生物检验室", temp:23.7, humid:48, press:"-12 Pa", clean:"—",
     status:"合格", note:"", by:"赵敏"},
    {date:"2026-09-24", zone:"理化前处理间", temp:26.1, humid:52, press:"—", clean:"—",
     status:"合格", note:"", by:"王海涛"},
    {date:"2026-09-24", zone:"色谱室", temp:23.2, humid:46, press:"—", clean:"—",
     status:"合格", note:"", by:"刘振华"},
    {date:"2026-09-24", zone:"试剂室（危化品）", temp:26.9, humid:44, press:"—", clean:"—",
     status:"关注", note:"仍偏高，继续观察", by:"陈晓芸"},
    {date:"2026-09-25", zone:"微生物检验室", temp:23.5, humid:47, press:"-11 Pa", clean:"ISO 7 级",
     status:"合格", note:"季度洁净度检测合格", by:"赵敏"},
    {date:"2026-09-25", zone:"理化前处理间", temp:25.9, humid:51, press:"—", clean:"—",
     status:"合格", note:"", by:"王海涛"},
    {date:"2026-09-25", zone:"色谱室", temp:23.0, humid:45, press:"—", clean:"—",
     status:"合格", note:"", by:"刘振华"},
    {date:"2026-09-25", zone:"试剂室（危化品）", temp:25.6, humid:45, press:"—", clean:"—",
     status:"合格", note:"已降至限值内", by:"陈晓芸"},
    {date:"2026-09-26", zone:"培养箱（EQ-041）", temp:37.2, humid:44, press:"—", clean:"—",
     status:"超限", note:"超出 36±1℃ 上限，已开 NC-2026-016，期间培养结果作废重做", by:"赵敏"},
    {date:"2026-09-26", zone:"灭菌间", temp:24.2, humid:50, press:"—", clean:"—",
     status:"合格", note:"高压灭菌器自检正常", by:"赵敏"}
  ];

  /* ================================================================
     导出
     ================================================================ */
  global.LABDATA2 = {
    ORDERS: ORDERS,
    CAPA: CAPA,
    SCHEDULE: SCHEDULE,
    PREP: PREP,
    FLOWS: FLOWS,
    REPORT_TPL: REPORT_TPL,
    AUDIT: AUDIT,
    ENV: ENV
  };

})(window);
