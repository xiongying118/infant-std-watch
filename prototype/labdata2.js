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
    {no:"JY2611-001", recv:"2026-11-03", client:"原料库", sample:"脱盐乳清粉 D90（进厂）",
     batch:"WP26110102", qty:"2 kg", items:"蛋白质、脂肪、水分、灰分、钙磷、三聚氰胺、菌落总数",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-11-03 08:40", testStart:"2026-11-03 10:00", reportDate:"2026-11-05",
     reportNo:"BG2611-001", price:"内部核算", remark:"进厂原料批批检，判定依据 GB 11674"},
    {no:"JY2611-002", recv:"2026-11-03", client:"原料库", sample:"浓缩乳清蛋白粉 WPC80（进厂）",
     batch:"WP26110105", qty:"1 kg", items:"蛋白质、脂肪、水分、灰分、铅、镉",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-11-03 08:45", testStart:"2026-11-03 10:20", reportDate:"2026-11-06",
     reportNo:"BG2611-002", price:"内部核算", remark:"蛋白含量≥80% 核验，低于 78% 整批退"},
    {no:"JY2611-003", recv:"2026-11-04", client:"原料库", sample:"植物油（OPO 结构脂）",
     batch:"OIL26110201", qty:"500 mL", items:"酸价、过氧化值、脂肪酸组成、塑化剂",
     urgent:"否", status:"已出报告", receiver:"李国强", tester:"刘振华", reviewer:"周敏",
     recvTime:"2026-11-04 09:10", testStart:"2026-11-04 13:30", reportDate:"2026-11-07",
     reportNo:"BG2611-003", price:"内部核算", remark:"油脂进厂，酸价/过氧化值批批检"},
    {no:"JY2611-004", recv:"2026-11-04", client:"原料库", sample:"维生素预混料（VA/VD/VE/VK1）",
     batch:"VIT26110203", qty:"500 g", items:"维生素 A、D、E、K1 含量",
     urgent:"是", status:"在检", receiver:"李国强", tester:"孙婷", reviewer:"周敏",
     recvTime:"2026-11-04 09:20", testStart:"2026-11-04 14:00", reportDate:"",
     reportNo:"", price:"内部核算", remark:"预混料含量核验，偏差超 ±10% 整批退"},
    {no:"JY2611-005", recv:"2026-11-04", client:"原料库", sample:"矿物质预混料（钙铁锌硒）",
     batch:"MIN26110204", qty:"500 g", items:"钙、铁、锌、硒",
     urgent:"否", status:"在检", receiver:"李国强", tester:"陈晓芸", reviewer:"周敏",
     recvTime:"2026-11-04 09:25", testStart:"2026-11-04 14:30", reportDate:"",
     reportNo:"", price:"内部核算", remark:"与配方标示量核对"},
    {no:"JY2611-006", recv:"2026-11-05", client:"原料库", sample:"乳糖粉（基料）",
     batch:"LAC26110301", qty:"2 kg", items:"水分、乳糖含量、灰分、菌落总数",
     urgent:"否", status:"待复核", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-11-05 08:50", testStart:"2026-11-05 10:10", reportDate:"",
     reportNo:"", price:"内部核算", remark:"数据已出，待质量负责人复核"},
    {no:"JY2611-007", recv:"2026-11-05", client:"生产一部", sample:"干混后过程样（1 段基粉）",
     batch:"B26110301", qty:"500 g", items:"混合均匀度（10 点 RSD）、水分、维生素 A",
     urgent:"是", status:"在检", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-11-05 10:30", testStart:"2026-11-05 13:00", reportDate:"",
     reportNo:"", price:"内部核算", remark:"换批后首件，RSD 超 5% 停线排查"},
    {no:"JY2611-008", recv:"2026-11-05", client:"生产一部", sample:"内包装前裸粉",
     batch:"B26110302", qty:"300 g", items:"菌落总数、阪崎肠杆菌、沙门氏菌、金黄色葡萄球菌",
     urgent:"是", status:"在检", receiver:"李国强", tester:"赵敏", reviewer:"周敏",
     recvTime:"2026-11-05 10:35", testStart:"2026-11-05 11:00", reportDate:"",
     reportNo:"", price:"内部核算", remark:"内包前微生物放行，未出结果不得开包"},
    {no:"JY2611-009", recv:"2026-11-06", client:"成品库", sample:"金装婴儿配方奶粉 1 段 800g",
     batch:"A26110201", qty:"6 罐", items:"全项（蛋白质、脂肪、水分、灰分、维生素 13 项、矿物质 9 项、污染物、微生物）",
     urgent:"否", status:"在检", receiver:"李国强", tester:"王海涛", reviewer:"周敏",
     recvTime:"2026-11-06 08:30", testStart:"2026-11-06 09:30", reportDate:"",
     reportNo:"", price:"内部核算", remark:"出厂检验，全项合格方可放行"},
    {no:"JY2611-010", recv:"2026-11-06", client:"成品库", sample:"金装较大婴儿配方奶粉 2 段 900g",
     batch:"A26110202", qty:"6 罐", items:"全项",
     urgent:"否", status:"受理", receiver:"李国强", tester:"", reviewer:"",
     recvTime:"2026-11-06 08:35", testStart:"", reportDate:"",
     reportNo:"", price:"内部核算", remark:"待分配检验员"},
    {no:"JY2611-011", recv:"2026-11-06", client:"成品库", sample:"金装幼儿配方奶粉 3 段 900g",
     batch:"A26110203", qty:"6 罐", items:"全项",
     urgent:"否", status:"受理", receiver:"李国强", tester:"", reviewer:"",
     recvTime:"2026-11-06 08:40", testStart:"", reportDate:"",
     reportNo:"", price:"内部核算", remark:"待分配检验员"},
    {no:"JY2611-012", recv:"2026-11-06", client:"品控部", sample:"市场投诉样品（开罐结块）",
     batch:"M26102001", qty:"1 罐", items:"水分、水分活度、感官、菌落总数",
     urgent:"是", status:"已出报告", receiver:"李国强", tester:"孙婷", reviewer:"周敏",
     recvTime:"2026-11-06 11:20", testStart:"2026-11-06 13:10", reportDate:"2026-11-07",
     reportNo:"BG2611-012", price:"内部核算", remark:"投诉复核：留样与投诉样比对，7 日内答复"},
    {no:"JY2611-013", recv:"2026-11-07", client:"研发部", sample:"新配方小试（低敏豆基 1 段）",
     batch:"R26110401", qty:"300 g", items:"蛋白质、脂肪、维生素 A/D、氨基酸组成、溶解度",
     urgent:"否", status:"在检", receiver:"李国强", tester:"刘振华", reviewer:"周敏",
     recvTime:"2026-11-07 09:00", testStart:"2026-11-07 10:00", reportDate:"",
     reportNo:"", price:"内部核算", remark:"配方评价，与目标值比对"},
    {no:"JY2611-014", recv:"2026-11-07", client:"留样室", sample:"1 段留样 6 月点（稳定性）",
     batch:"A26050101", qty:"2 罐", items:"水分、过氧化值、维生素 A/E、菌落总数",
     urgent:"否", status:"受理", receiver:"李国强", tester:"", reviewer:"",
     recvTime:"2026-11-07 09:30", testStart:"", reportDate:"",
     reportNo:"", price:"内部核算", remark:"保质期 24 个月，每 6 个月取点"},
    {no:"JY2611-015", recv:"2026-11-07", client:"品控部", sample:"洁净区沉降菌（内包间）",
     batch:"HJ26110501", qty:"φ90mm 平皿 6 个", items:"沉降菌（暴露 30 min）",
     urgent:"否", status:"已出报告", receiver:"赵敏", tester:"赵敏", reviewer:"周敏",
     recvTime:"2026-11-07 14:00", testStart:"2026-11-07 14:10", reportDate:"2026-11-10",
     reportNo:"BG2611-015", price:"内部核算", remark:"每月一次，内包间限度 ≤10 CFU/皿"},
    {no:"JY2611-016", recv:"2026-11-08", client:"包材库", sample:"马口铁罐（900g 规格）",
     batch:"PK26110101", qty:"10 只", items:"铅、镉迁移（4% 乙酸，40℃×10 d）",
     urgent:"否", status:"在检", receiver:"李国强", tester:"陈晓芸", reviewer:"周敏",
     recvTime:"2026-11-08 09:15", testStart:"2026-11-08 10:00", reportDate:"",
     reportNo:"", price:"内部核算", remark:"包材进厂，按 GB 4806.9 迁移试验"}
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
    {no:"NC-2026-012", date:"2026-09-14", src:"市场反馈", item:"市场反馈 2 罐开罐结块，怀疑水分超标",
     level:"中", impact:"批次 A26081501 市场反馈，涉及 2 罐",
     cause:"留样水分复测 4.62%，符合标准（≤5.0%）；判定为运输储存受潮结块，非产品问题",
     action:"① 复测留样水分并留数据；② 出复核结论反馈品控与销售；③ 复测报告归档",
     owner:"孙婷", due:"2026-09-15", fixDate:"2026-09-15", verifyDate:"2026-09-16",
     verify:"复核结论已反馈品控，销售按结论答复",
     status:"已关闭", close:"2026-09-16", note:"非产品问题，已闭环"},
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
    {week:"2026-W45", person:"王海涛", role:"理化组", days:"一~五", hours:40, orders:"JY2611-001、002、006、007",
     load:"重", overtime:4, note:"原料集中到货 + 过程样"},
    {week:"2026-W45", person:"孙婷", role:"理化组/维生素", days:"一~五", hours:40, orders:"JY2611-004、012",
     load:"中", overtime:0, note:"维生素预混料核验"},
    {week:"2026-W45", person:"刘振华", role:"仪器组", days:"一~五", hours:40, orders:"JY2611-003、013",
     load:"中", overtime:0, note:"油脂脂肪酸 + 小试氨基酸"},
    {week:"2026-W45", person:"陈晓芸", role:"仪器组/元素", days:"一~五", hours:40, orders:"JY2611-005、016",
     load:"中", overtime:2, note:"矿物预混料 + 包材迁移"},
    {week:"2026-W45", person:"赵敏", role:"微生物组", days:"一~五", hours:40, orders:"JY2611-008、015",
     load:"中", overtime:0, note:"内包前裸粉 + 沉降菌"},
    {week:"2026-W45", person:"李国强", role:"样品管理", days:"一~五", hours:40, orders:"全部收样/分样/留样",
     load:"重", overtime:2, note:"留样盘点并行"},
    {week:"2026-W46", person:"王海涛", role:"理化组", days:"一~五", hours:40, orders:"JY2611-009、014",
     load:"重", overtime:6, note:"1 段全项出厂检验"},
    {week:"2026-W46", person:"孙婷", role:"理化组/维生素", days:"一~五", hours:40, orders:"JY2611-009",
     load:"重", overtime:6, note:"1 段维生素 13 项"},
    {week:"2026-W46", person:"刘振华", role:"仪器组", days:"一~五", hours:40, orders:"JY2611-009、014",
     load:"中", overtime:2, note:"脂肪酸 + 稳定性过氧化值"},
    {week:"2026-W46", person:"陈晓芸", role:"仪器组/元素", days:"一~五", hours:40, orders:"JY2611-009",
     load:"中", overtime:2, note:"矿物质 9 项"},
    {week:"2026-W46", person:"赵敏", role:"微生物组", days:"一~四", hours:32, orders:"JY2611-009",
     load:"中", overtime:0, note:"周五休（调休）"},
    {week:"2026-W46", person:"李国强", role:"样品管理", days:"一~五", hours:40, orders:"全部收样/留样/销毁",
     load:"中", overtime:0, note:"留样期满处置走审批"}
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
     出库＝领用/退样/销毁；入库＝收样/转存。
     ================================================================ */
  var FLOWS = [
    {no:"RK2611-001", time:"2026-11-03 08:40", type:"入库", sample:"脱盐乳清粉 D90（进厂）",
     batch:"WP26110102", qty:"2 kg", from:"原料库", to:"样品室 W-1 常温柜",
     reason:"原料报检收样", handler:"李国强", receiver:"李国强", status:"已入库"},
    {no:"RK2611-002", time:"2026-11-06 08:30", type:"入库", sample:"金装婴儿配方奶粉 1 段 800g",
     batch:"A26110201", qty:"6 罐", from:"成品库", to:"样品室 C-1 冷藏柜",
     reason:"出厂检验收样", handler:"李国强", receiver:"李国强", status:"已入库"},
    {no:"FL2611-001", time:"2026-11-03 10:00", type:"分样", sample:"脱盐乳清粉 D90",
     batch:"WP26110102", qty:"200 g", from:"样品室 W-1", to:"理化室前处理台",
     reason:"理化项目分样", handler:"李国强", receiver:"王海涛", status:"已交接"},
    {no:"FL2611-002", time:"2026-11-03 10:10", type:"分样", sample:"脱盐乳清粉 D90",
     batch:"WP26110102", qty:"25 g", from:"样品室 W-1", to:"微生物室传递窗",
     reason:"微生物项目分样", handler:"李国强", receiver:"赵敏", status:"已交接"},
    {no:"FL2611-003", time:"2026-11-06 09:20", type:"转存", sample:"金装婴儿配方奶粉 1 段 800g",
     batch:"A26110201", qty:"2 罐", from:"样品室 C-1", to:"留样柜 R-1 第 2 层",
     reason:"成品留样（保质期+6 个月）", handler:"李国强", receiver:"李国强", status:"已转存"},
    {no:"FL2611-004", time:"2026-11-07 13:10", type:"领用", sample:"1 段留样（复检）",
     batch:"A26110201", qty:"1 罐", from:"留样柜 R-1 第 2 层", to:"理化室",
     reason:"投诉复核复测", handler:"李国强", receiver:"孙婷", status:"已领用"},
    {no:"FL2611-005", time:"2026-11-07 09:30", type:"领用", sample:"1 段留样 6 月点（稳定性）",
     batch:"A26050101", qty:"2 罐", from:"留样柜 R-1 第 1 层", to:"仪器室",
     reason:"稳定性考察取点", handler:"李国强", receiver:"刘振华", status:"已领用"},
    {no:"FL2611-006", time:"2026-11-07 14:10", type:"入库", sample:"洁净区沉降菌平皿",
     batch:"HJ26110501", qty:"6 皿", from:"内包间（采样点）", to:"微生物室培养箱",
     reason:"环境监测采样", handler:"赵敏", receiver:"赵敏", status:"已入库"},
    {no:"FL2611-007", time:"2026-11-08 16:00", type:"销毁", sample:"留样期满（2026-10 批次）",
     batch:"A26040101", qty:"2 罐", from:"留样柜 R-1 第 4 层", to:"—",
     reason:"留样期满处置（保质期+6 个月）", handler:"李国强", receiver:"周敏", status:"待审批"},
    {no:"FL2611-008", time:"2026-11-08 16:10", type:"退样", sample:"乳糖粉（余样）",
     batch:"LAC26110301", qty:"1.5 kg", from:"样品室 W-1", to:"原料库",
     reason:"检验完成余样退回", handler:"李国强", receiver:"原料库保管员", status:"已退回"}
  ];

  /* ================================================================
     ⑥ 检测报告模板
     ================================================================
     报告模板要素：依据方法、结果与判定、结论、签发。
     模板要能被「填值 → 出报告」，签发人按 CNAS 授权。
     ================================================================ */
  var REPORT_TPL = [
    {key:"report_coa", name:"出厂检验报告（COA）", forType:"婴配成品（1/2/3 段）",
     method:"按产品执行标准及 GB 5009 / GB 4789 系列现行有效方法",
     items:"全项：感官、净含量、蛋白质、脂肪、碳水、水分、灰分、维生素、矿物质、污染物、微生物、真菌毒素",
     judge:"符合 GB 10765 / GB 10766 / GB 10767 相应段位及产品企业标准",
     concl:"经检验，该批产品所检项目符合上述标准要求，准予放行。",
     limit:"本报告仅对本批留样负责；报告随批存档，保存期不少于产品保质期满后 6 个月。",
     signer:"周敏（授权签字人）", reviewer:"王海涛", days:"3 个工作日",
     note:"出厂检验报告是放行依据，必须与批记录、留样一一对应"},
    {key:"report_raw", name:"原料验收报告", forType:"进厂原辅料",
     method:"按原料标准及 GB 5009 / GB 4789 系列方法",
     items:"按原料风险等级确定：乳清粉查蛋白/水分/三聚氰胺；油脂查酸价/过氧化值；预混料查标示量",
     judge:"符合原料验收标准及供应商备案指标",
     concl:"经检验，该批原料符合验收标准，准予入库使用。",
     limit:"本报告仅对来样负责；不合格原料不得入库，按不合格品程序处置。",
     signer:"周敏（授权签字人）", reviewer:"陈晓芸", days:"2 个工作日",
     note:"乳清粉、WPC 等蛋白原料须批批检三聚氰胺"},
    {key:"report_env", name:"环境监测报告", forType:"洁净区 / 实验室环境",
     method:"GB 4789.2 沉降菌、GB/T 16292 悬浮粒子、压差与温湿度现场监测",
     items:"温度、相对湿度、压差、沉降菌、悬浮粒子（季度）",
     judge:"内包间：温度 16~25℃、RH<65%、相对正压≥10 Pa、沉降菌≤10 CFU/皿",
     concl:"本次监测各点位符合洁净区控制要求。",
     limit:"本报告仅反映监测时段环境状态；超限须启动偏差调查并复测。",
     signer:"周敏（授权签字人）", reviewer:"赵敏", days:"2 个工作日",
     note:"环境监测是内包工序放行的前提条件之一"},
    {key:"report_retain", name:"留样观察报告", forType:"成品留样",
     method:"按产品标准项目在 0/6/12/18/24 月点取点检测",
     items:"感官、水分、过氧化值、维生素 A/E、菌落总数",
     judge:"各时点均符合产品标准；与 0 月数据比对无明显劣变趋势",
     concl:"该批留样在观察期内质量稳定，符合保质期要求。",
     limit:"本报告基于留样考察，不代表货架末端全部批次。",
     signer:"周敏（授权签字人）", reviewer:"孙婷", days:"5 个工作日",
     note:"留样观察是保质期设定与变更的依据"},
    {key:"report_stab", name:"稳定性考察报告", forType:"新品 / 配方变更",
     method:"加速试验（37℃/45℃）+ 实时留样，按方案时点检测",
     items:"水分、水分活度、过氧化值、维生素、益生菌（如适用）、感官",
     judge:"加速 6 个月 + 实时 12 个月数据支持 24 个月保质期",
     concl:"稳定性数据支持该配方 24 个月保质期。",
     limit:"本报告仅适用于考察批及同工艺产品；配方/工艺变更须重新考察。",
     signer:"周敏（授权签字人）", reviewer:"刘振华", days:"按方案",
     note:"加速试验只作佐证，保质期以实时留样为准"},
    {key:"report_retest", name:"复检报告", forType:"复检 / 投诉复核",
     method:"与原检验相同方法；必要时加做确认方法",
     items:"同原检验项目；投诉样加做留样比对",
     judge:"同原判定依据",
     concl:"复检结果见结果表，与原报告为独立结论。",
     limit:"本报告为复检报告，仅对本次复检样品负责，不得替代原报告。",
     signer:"周敏（授权签字人）", reviewer:"孙婷", days:"2 个工作日",
     note:"复检须由不同检验员执行，原始数据一并存档"}
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
    {no:"10.2", clause:"投诉与不符合产品", item:"市场反馈与投诉处理", obj:"2026 年度投诉记录",
     evidence:"投诉记录、复测报告、答复记录", method:"查阅",
     result:"符合", finding:"2 起投诉均已复测并闭环", owner:"周敏", date:"2026-09-13"},
    {no:"10.5", clause:"记录", item:"记录保存与保密", obj:"记录保存期限、访问控制",
     evidence:"记录归档清单、权限设置", method:"查阅",
     result:"符合", finding:"", owner:"李国强", date:"2026-09-13"},
    {no:"SC-1.3", clause:"生产许可审查细则", item:"检验能力与出厂检验", obj:"婴配粉出厂检验全项自检能力",
     evidence:"检验设备清单、方法验证、检验人员授权、出厂检验报告", method:"查阅 + 现场核查",
     result:"符合", finding:"", owner:"周敏", date:"2026-09-14"},
    {no:"SC-3.2", clause:"生产许可审查细则", item:"留样与记录", obj:"成品留样量、留样条件、留样记录",
     evidence:"留样台账、留样柜温湿度记录、留样处置审批", method:"现场核对 10 批",
     result:"基本符合", finding:"2 批留样标签手写、与台账编号规则不一致，已开 NC-2026-015 整改",
     owner:"李国强", date:"2026-09-14"},
    {no:"GMP-8.2.7", clause:"GB 23790-2023", item:"清洁作业区环境监控", obj:"内包间沉降菌、悬浮粒子、压差",
     evidence:"环境监测报告、沉降菌平皿记录、压差记录", method:"查阅 + 现场复核",
     result:"符合", finding:"沉降菌月均 3 CFU/皿，低于 ≤10 的内控限", owner:"赵敏", date:"2026-09-15"},
    {no:"DI-1", clause:"数据完整性", item:"电子数据与审计追踪", obj:"LIMS/Excel 台账的权限、修改留痕、备份",
     evidence:"账号权限表、修改记录、备份记录", method:"查阅 + 抽查",
     result:"基本符合", finding:"Excel 台账无修改留痕，建议关键台账迁入 LIMS 或启用版本留痕",
     owner:"周敏", date:"2026-09-15"}
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
     status:"合格", note:"高压灭菌器自检正常", by:"赵敏"},
    {date:"2026-09-26", zone:"洁净走廊（内包间外）", temp:24.2, humid:50, press:"+15 Pa", clean:"沉降菌 2 CFU/皿",
     status:"合格", note:"相对内包间正压 15 Pa", by:"赵敏"},
    {date:"2026-09-26", zone:"天平室", temp:22.8, humid:46, press:"—", clean:"—",
     status:"合格", note:"天平室控温 20~25℃", by:"李国强"},
    {date:"2026-09-26", zone:"培养箱（EQ-041）", temp:36.1, humid:45, press:"—", clean:"—",
     status:"合格", note:"更换探头后恢复 36±1℃", by:"赵敏"},
    {date:"2026-09-27", zone:"微生物检验室", temp:23.9, humid:48, press:"-12 Pa", clean:"沉降菌 1 CFU/皿",
     status:"合格", note:"", by:"赵敏"},
    {date:"2026-09-27", zone:"洁净走廊（内包间外）", temp:24.0, humid:49, press:"+14 Pa", clean:"沉降菌 3 CFU/皿",
     status:"合格", note:"", by:"赵敏"},
    {date:"2026-09-27", zone:"试剂室（危化品）", temp:24.6, humid:45, press:"—", clean:"—",
     status:"合格", note:"空调调整后稳定在 25℃ 以下", by:"陈晓芸"}
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
