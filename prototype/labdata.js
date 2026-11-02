/* ================================================================
   labdata.js —— 实验室自己的台账数据（2026-11-01 新增）
   ================================================================
   为什么单独一个文件，不塞进 data.js：

     data.js      = 官方抓来的（标准、法规、方法原理、勘误）→ 云端独占写入
     labdata.js   = 实验室自己的（设备、试剂、留样、质控、人员）→ 本机维护

   台账数据不该每次抓官网都重新生成 —— 它是本厂的东西。
   而且台账要能被用户改，改完落盘到 localStorage，
   所以结构是「种子数据 + 本机覆盖」两层。

   数据基准：婴幼儿配方奶粉检测实验室的实际配置。
   ---------------------------------------------------------------- */

(function (global) {
  "use strict";

  /* ================================================================
     ① 计量设备与标准物质台账
     ================================================================
     依据：CNAS-CL01 检测和校准实验室能力认可准则
           · 所有有量值要求的仪器设备须在有效校准/检定周期内
           · 须有唯一性标识 + 溯源证书
           · 期间核查：关键设备在两次校准之间做核查
     周期规则：
       强制检定设备（天平、移液器等）→ 一年一次
       校准设备（色谱、光谱）→ 建议一年一次
       期间核查 → 每半年一次关键设备
     ================================================================ */
  var EQUIPMENT = [
    // —— 天平 ——
    {id:"EQ-001", name:"电子分析天平", brand:"梅特勒勒 MS204", model:"MS204",
     sn:"2043-S1108", type:"强制检定", verify:"检定", cycle:12,
     location:"天平室 A", status:"在用", buyDate:"2022-04-18", lastCal:"2026-04-20",
     nextCal:"2027-04-20", cert:"JN2026-0420-118", inCharge:"周敏",
     use:"称量试样与试剂，精度 0.1 mg", critical:true},
    {id:"EQ-002", name:"电子分析天平", brand:"赛多利斯 BCE224I", model:"BCE224I",
     sn:"BCE-1183", type:"强制检定", verify:"检定", cycle:12,
     location:"天平室 A", status:"在用", buyDate:"2023-09-05", lastCal:"2026-05-12",
     nextCal:"2027-05-12", cert:"JN2026-0512-207", inCharge:"周敏",
     use:"水分与灰分称量，精度 0.1 mg", critical:true},
    {id:"EQ-003", name:"电子天平", brand:"上海精科 JA5003", model:"JA5003",
     sn:"JA50-3391", type:"强制检定", verify:"检定", cycle:12,
     location:"称量间", status:"在用", buyDate:"2019-08-22", lastCal:"2025-09-15",
     nextCal:"2026-09-15", cert:"JN2025-0915-043", inCharge:"李国强",
     use:"配液、样品分装，精度 1 mg", critical:false},
    // —— 量器 ——
    {id:"EQ-010", name:"移液器（套装）", brand:" eppendorf 3121", model:"3121 1000µL",
     sn:"EP-3121-A07", type:"强制检定", verify:"检定", cycle:12,
     location:"试剂室", status:"在用", buyDate:"2023-03-11", lastCal:"2026-03-20",
     nextCal:"2027-03-20", cert:"JN2026-0320-155", inCharge:"陈晓芸",
     use:"移取 100 µL~1000 µL，12 支套装", critical:true},
    {id:"EQ-011", name:"移液器（套装）", brand:"Thermo F1", model:"F1 200µL",
     sn:"TH-F1-B12", type:"强制检定", verify:"检定", cycle:12,
     location:"试剂室", status:"在用", buyDate:"2024-01-08", lastCal:"2026-02-14",
     nextCal:"2027-02-14", cert:"JN2026-0214-088", inCharge:"陈晓芸",
     use:"标准溶液配制，8 支套装", critical:true},
    {id:"EQ-012", name:"容量玻璃器皿组", brand:"德国 DURAN", model:"A 级量具",
     sn:"DU-2023-G11", type:"内部校准", verify:"校准", cycle:12,
     location:"玻璃器皿室", status:"在用", buyDate:"2023-06-01", lastCal:"2026-06-10",
     nextCal:"2027-06-10", cert:"NB2026-0610-012", inCharge:"李国强",
     use:"容量瓶、移液管、量筒 A 级校准", critical:false},
    // —— 消解与前处理 ——
    {id:"EQ-020", name:"电子消解仪", brand:"莱伯泰科 DAB-28", model:"DAB-28",
     sn:"DAB28-2231", type:"内部校准", verify:"校准", cycle:12,
     location:"前处理间", status:"在用", buyDate:"2024-05-19", lastCal:"2025-11-22",
     nextCal:"2026-11-22", cert:"NB2025-1122-331", inCharge:"王海涛",
     use:"凯氏定氮消解，控温 400℃", critical:true},
    {id:"EQ-021", name:"电热鼓风干燥箱", brand:"天津泰斯特 101-2AB", model:"101-2AB",
     sn:"TS101-8871", type:"内部校准", verify:"校准", cycle:12,
     location:"前处理间", status:"在用", buyDate:"2021-11-30", lastCal:"2026-04-02",
     nextCal:"2027-04-02", cert:"NB2026-0402-076", inCharge:"王海涛",
     use:"水分测定烘干，150℃±2℃", critical:true},
    {id:"EQ-022", name:"马弗炉", brand:"上海博迅 6215", model:"6215",
     sn:"BX6215-1140", type:"内部校准", verify:"校准", cycle:12,
     location:"灰分间", status:"在用", buyDate:"2020-03-15", lastCal:"2026-03-08",
     nextCal:"2027-03-08", cert:"NB2026-0308-201", inCharge:"王海涛",
     use:"灰分测定，550℃±25℃", critical:false},
    {id:"EQ-023", name:"超声波清洗器", brand:"昆山超声 KQ-500", model:"KQ-500",
     sn:"KQ500-3382", type:"内部校准", verify:"校准", cycle:24,
     location:"前处理间", status:"在用", buyDate:"2022-08-20", lastCal:"2025-08-25",
     nextCal:"2027-08-25", cert:"NB2025-0825-410", inCharge:"孙婷",
     use:"器皿清洗与有机物萃取前处理", critical:false},
    // —— 色谱光谱 ——
    {id:"EQ-030", name:"气相色谱仪", brand:"安捷伦 8890A", model:"8890A",
     sn:"GC-8890A-0271", type:"内部校准", verify:"校准", cycle:12,
     location:"色谱室", status:"在用", buyDate:"2023-06-15", lastCal:"2026-01-20",
     nextCal:"2027-01-20", cert:"NB2026-0120-566", inCharge:"刘振华",
     use:"脂肪酸组成、反式脂肪酸测定，带 FID", critical:true},
    {id:"EQ-031", name:"液相色谱仪", brand:"安捷伦 1260", model:"1260 Infinity II",
     sn:"LC-1260-1142", type:"内部校准", verify:"校准", cycle:12,
     location:"色谱室", status:"在用", buyDate:"2022-10-08", lastCal:"2026-02-05",
     nextCal:"2027-02-05", cert:"NB2026-0205-433", inCharge:"刘振华",
     use:"维生素、矿物质、氨基酸、液相方法", critical:true},
    {id:"EQ-032", name:"液相色谱-质谱联用仪", brand:"安捷伦 6475", model:"6475",
     sn:"LCMS-6475-0088", type:"内部校准", verify:"校准", cycle:12,
     location:"质谱室", status:"在用", buyDate:"2024-03-22", lastCal:"2026-03-15",
     nextCal:"2027-03-15", cert:"NB2026-0315-902", inCharge:"刘振华",
     use:"多残留、违禁药物筛查", critical:true},
    {id:"EQ-033", name:"电感耦合等离子体发射光谱仪", brand:"赛默飞 iCAP 7400", model:"iCAP 7400",
     sn:"ICP-7400-0455", type:"内部校准", verify:"校准", cycle:12,
     location:"元素室", status:"在用", buyDate:"2023-02-27", lastCal:"2026-02-18",
     nextCal:"2027-02-18", cert:"NB2026-0218-720", inCharge:"周敏",
     use:"钙、磷、铁、钠等元素测定", critical:true},
    {id:"EQ-034", name:"紫外分光光度计", brand:"岛津 UV-2550", model:"UV-2550",
     sn:"UV2550-2231", type:"内部校准", verify:"校准", cycle:12,
     location:"常规室", status:"在用", buyDate:"2021-09-14", lastCal:"2026-01-08",
     nextCal:"2027-01-08", cert:"NB2026-0108-288", inCharge:"孙婷",
     use:"维生素 C、色度、浊度等", critical:false},
    {id:"EQ-035", name:"原子荧光分光光度计", brand:"海光 AF-2030", model:"AF-2030",
     sn:"AF2030-0907", type:"内部校准", verify:"校准", cycle:12,
     location:"元素室", status:"维修中", buyDate:"2020-11-05", lastCal:"2025-12-10",
     nextCal:"2026-12-10", cert:"NB2025-1210-515", inCharge:"周敏",
     use:"总砷、无机砷、汞等痕量元素", critical:true},
    // —— 微生物 ——
    {id:"EQ-040", name:"生物安全柜", brand:"苏州安泰 AT-II-B2", model:"AT-II-B2",
     sn:"BSC-2213-0077", type:"内部校准", verify:"校准", cycle:12,
     location:"微生物室", status:"在用", buyDate:"2023-04-19", lastCal:"2026-04-25",
     nextCal:"2027-04-25", cert:"NB2026-0425-630", inCharge:"赵敏",
     use:"微生物接种操作，Ⅱ级 B2", critical:true},
    {id:"EQ-041", name:"恒温培养箱", brand:"天津泰斯特 HP-150", model:"HP-150",
     sn:"HP150-4412", type:"内部校准", verify:"校准", cycle:12,
     location:"微生物室", status:"在用", buyDate:"2022-01-11", lastCal:"2026-01-30",
     nextCal:"2027-01-30", cert:"NB2026-0130-344", inCharge:"赵敏",
     use:"菌落总数、致病菌培养 36±1℃", critical:true},
    {id:"EQ-042", name:"高压蒸汽灭菌器", brand:"上海申安 YXQ-L-50", model:"YXQ-L-50",
     sn:"YX50-6620", type:"内部校准", verify:"校准", cycle:12,
     location:"灭菌间", status:"在用", buyDate:"2021-05-06", lastCal:"2026-05-15",
     nextCal:"2027-05-15", cert:"NB2026-0515-477", inCharge:"赵敏",
     use:"培养基灭菌 121℃", critical:true},
    {id:"EQ-043", name:"菌落计数仪", brand:"杭州先科 Icount-212", model:"Icount-212",
     sn:"IC-212-0398", type:"内部校准", verify:"校准", cycle:24,
     location:"微生物室", status:"在用", buyDate:"2023-03-30", lastCal:"2025-09-18",
     nextCal:"2027-09-18", cert:"NB2025-0918-260", inCharge:"赵敏",
     use:"菌落自动计数与图像分析", critical:false},
    {id:"EQ-044", name:"超低温冰箱", brand:"海尔 DW-40L508", model:"DW-40L508",
     sn:"HRL-40L-2210", type:"内部校准", verify:"校准", cycle:12,
     location:"试剂室", status:"在用", buyDate:"2022-07-13", lastCal:"2026-06-28",
     nextCal:"2027-06-28", cert:"NB2026-0628-155", inCharge:"陈晓芸",
     use:"试剂、菌种、留样保存 -20℃", critical:true},
    {id:"EQ-045", name:"纯水机", brand:"Milli-Q IQ 7000", model:"IQ 7000",
     sn:"MQ-7000-1130", type:"内部校准", verify:"校准", cycle:12,
     location:"纯水间", status:"在用", buyDate:"2023-09-25", lastCal:"2026-09-25",
     nextCal:"2027-09-25", cert:"NB2026-0925-088", inCharge:"李国强",
     use:"实验用水，电阻率 18.2 MΩ·cm", critical:true},
    {id:"EQ-046", name:"水分测定仪（卡尔费休）", brand:"梅特勒勒 DL55", model:"DL55",
     sn:"DL55-7712", type:"内部校准", verify:"校准", cycle:12,
     location:"常规室", status:"在用", buyDate:"2023-12-04", lastCal:"2026-05-28",
     nextCal:"2027-05-28", cert:"NB2026-0528-390", inCharge:"王海涛",
     use:"微量水分测定", critical:false},
    {id:"EQ-047", name:"水分蒸发皿与称量瓶组", brand:"天津天科 30mL", model:"30mL 瓷皿",
     sn:"CP-30-0142", type:"内部校准", verify:"校准", cycle:12,
     location:"常规室", status:"在用", buyDate:"2022-06-16", lastCal:"2026-06-05",
     nextCal:"2027-06-05", cert:"NB2026-0605-112", inCharge:"王海涛",
     use:"烘箱法水分测定，恒重称量", critical:false},
    {id:"EQ-048", name:"旋转蒸发仪", brand:"Heidolph Hei-VAP", model:"Hei-VAP P3000",
     sn:"HV3000-5521", type:"内部校准", verify:"校准", cycle:24,
     location:"前处理间", status:"在用", buyDate:"2024-01-22", lastCal:"2025-10-08",
     nextCal:"2027-10-08", cert:"NB2025-1008-198", inCharge:"孙婷",
     use:"溶剂回收、乙醚萃取浓缩", critical:false}
  ];

  /* ================================================================
     ② 试剂、耗材与标准物质台账
     ================================================================
     依据：
       · 试剂按 GB 26878 / 实验室安全通则管理，危险品需分类标识
       · 标准物质须有证书，有效期内使用
       · 配制试剂要记录：名称、浓度、配制日期、配制人、有效期
     危险品分类（GB 13690）：
       ①易燃液体 ②氧化剂 ③腐蚀品 ④毒害品 ⑤压缩气体 ⑥易制毒
     ================================================================ */
  var REAGENTS = [
    {id:"RG-001", name:"硫酸（优级纯）", cas:"7664-93-9", grade:"GPR 优级纯", spec:"500 mL/瓶",
     qty:6, unit:"瓶", location:"试剂柜 A-1", hazard:"腐蚀品", hazardClass:"③",
     maker:"国药集团", prodNo:"20260317", expiry:"2028-03-17", mfgDate:"2026-03-17",
     owner:"王海涛", status:"在库"},
    {id:"RG-002", name:"氢氧化钠（分析纯）", cas:"1310-73-2", grade:"AR 分析纯", spec:"500 g/瓶",
     qty:4, unit:"瓶", location:"试剂柜 A-1", hazard:"腐蚀品", hazardClass:"③",
     maker:"国药集团", prodNo:"20260228", expiry:"2029-02-28", mfgDate:"2026-02-28",
     owner:"王海涛", status:"在库"},
    {id:"RG-003", name:"硫酸铜（分析纯）", cas:"7758-99-8", grade:"AR 分析纯", spec:"500 g/瓶",
     qty:3, unit:"瓶", location:"试剂柜 A-2", hazard:"无", hazardClass:"—",
     maker:"西陇化工", prodNo:"20260115", expiry:"2029-01-15", mfgDate:"2026-01-15",
     owner:"王海涛", status:"在库"},
    {id:"RG-004", name:"硫酸钾（分析纯）", cas:"7757-79-1", grade:"AR 分析纯", spec:"500 g/瓶",
     qty:3, unit:"瓶", location:"试剂柜 A-2", hazard:"无", hazardClass:"—",
     maker:"西陇化工", prodNo:"20260115", expiry:"2029-01-15", mfgDate:"2026-01-15",
     owner:"王海涛", status:"在库"},
    {id:"RG-005", name:"硼酸（分析纯）", cas:"10043-35-3", grade:"AR 分析纯", spec:"500 g/瓶",
     qty:5, unit:"瓶", location:"试剂柜 A-2", hazard:"无", hazardClass:"—",
     maker:"国药集团", prodNo:"20251120", expiry:"2029-11-20", mfgDate:"2025-11-20",
     owner:"王海涛", status:"在库"},
    {id:"RG-006", name:"无水乙醚（分析纯）", cas:"60-29-7", grade:"AR 分析纯", spec:"500 mL/瓶",
     qty:8, unit:"瓶", location:"易燃柜 E-1", hazard:"易燃液体", hazardClass:"①",
     maker:"西陇化工", prodNo:"20260403", expiry:"2027-04-03", mfgDate:"2026-04-03",
     owner:"孙婷", status:"在库"},
    {id:"RG-007", name:"石油醚 60~90℃（分析纯）", cas:"8032-32-4", grade:"AR 分析纯", spec:"500 mL/瓶",
     qty:7, unit:"瓶", location:"易燃柜 E-1", hazard:"易燃液体", hazardClass:"①",
     maker:"西陇化工", prodNo:"20260403", expiry:"2027-04-03", mfgDate:"2026-04-03",
     owner:"孙婷", status:"在库"},
    {id:"RG-008", name:"氨水（分析纯）", cas:"1336-21-6", grade:"AR 分析纯", spec:"500 mL/瓶",
     qty:5, unit:"瓶", location:"试剂柜 A-3", hazard:"腐蚀品", hazardClass:"③",
     maker:"国药集团", prodNo:"20260210", expiry:"2028-02-10", mfgDate:"2026-02-10",
     owner:"孙婷", status:"在库"},
    {id:"RG-009", name:"甲醇（色谱纯）", cas:"67-56-1", grade:"HPLC 级", spec:"4 L/瓶",
     qty:4, unit:"瓶", location:"易燃柜 E-2", hazard:"易燃液体 毒性", hazardClass:"①④",
     maker:"默克", prodNo:"LC-2026-018", expiry:"2028-06-30", mfgDate:"2026-06-30",
     owner:"刘振华", status:"在库"},
    {id:"RG-010", name:"乙腈（色谱纯）", cas:"75-05-8", grade:"HPLC 级", spec:"4 L/瓶",
     qty:3, unit:"瓶", location:"易燃柜 E-2", hazard:"易燃液体 毒性", hazardClass:"①④",
     maker:"默克", prodNo:"LC-2026-022", expiry:"2028-06-30", mfgDate:"2026-06-30",
     owner:"刘振华", status:"在库"},
    {id:"RG-011", name:"正己烷（色谱纯）", cas:"110-54-3", grade:"HPLC 级", spec:"4 L/瓶",
     qty:2, unit:"瓶", location:"易燃柜 E-2", hazard:"易燃液体 毒性", hazardClass:"①④",
     maker:"默克", prodNo:"LC-2025-140", expiry:"2027-08-31", mfgDate:"2025-08-31",
     owner:"刘振华", status:"在库"},
    {id:"RG-012", name:"异丙醇（色谱纯）", cas:"67-63-0", grade:"HPLC 级", spec:"4 L/瓶",
     qty:3, unit:"瓶", location:"易燃柜 E-2", hazard:"易燃液体", hazardClass:"①",
     maker:"默克", prodNo:"LC-2026-031", expiry:"2028-06-30", mfgDate:"2026-06-30",
     owner:"刘振华", status:"在库"},
    {id:"RG-013", name:"甲基红指示剂", cas:"14920-04-8", grade:"指示剂", spec:"25 g/瓶",
     qty:2, unit:"瓶", location:"试剂柜 A-4", hazard:"无", hazardClass:"—",
     maker:"国药集团", prodNo:"20250812", expiry:"2029-08-12", mfgDate:"2025-08-12",
     owner:"王海涛", status:"在库"},
    {id:"RG-014", name:"溴甲酚绿指示剂", cas:"131-53-9", grade:"指示剂", spec:"25 g/瓶",
     qty:2, unit:"瓶", location:"试剂柜 A-4", hazard:"无", hazardClass:"—",
     maker:"国药集团", prodNo:"20250812", expiry:"2029-08-12", mfgDate:"2025-08-12",
     owner:"王海涛", status:"在库"},
    {id:"RG-015", name:"刚果红指示剂", cas:"989-38-8", grade:"指示剂", spec:"25 g/瓶",
     qty:2, unit:"瓶", location:"试剂柜 A-4", hazard:"无", hazardClass:"—",
     maker:"国药集团", prodNo:"20251103", expiry:"2029-11-03", mfgDate:"2025-11-03",
     owner:"孙婷", status:"在库"},
    {id:"RG-016", name:"淀粉酶（试剂级）", cas:"9000-90-2", grade:"酶制剂", spec:"100 g/瓶",
     qty:2, unit:"瓶", location:"冷藏 4℃", hazard:"无", hazardClass:"—",
     maker:"sigma", prodNo:"A3176-2026", expiry:"2027-03-10", mfgDate:"2026-03-10",
     owner:"孙婷", status:"在库"},
    {id:"RG-017", name:"抗坏血酸（维生素C 标准品）", cas:"50-81-7", grade:"GB/T 14754", spec:"1 g",
     qty:2, unit:"支", location:"标准物质柜 S-1", hazard:"无", hazardClass:"—",
     maker:"国家标准物质中心", prodNo:"GBW(E)080291", expiry:"2027-06-30", mfgDate:"2026-06-30",
     owner:"孙婷", status:"在库", cert:"CRM-2026-0612"},
    {id:"RG-018", name:"葡萄糖酸锌标准溶液", cas:"592-12-1", grade:"GB/T 19428", spec:"100 mg/mL",
     qty:1, unit:"支", location:"标准物质柜 S-1", hazard:"无", hazardClass:"—",
     maker:"国家标准物质中心", prodNo:"GBW(E)080618", expiry:"2027-08-31", mfgDate:"2026-08-31",
     owner:"孙婷", status:"在库", cert:"CRM-2026-0815"},
    {id:"RG-019", name:"维生素 A 标准品", cas:"68-26-8", grade:"HPLC 级", spec:"1 g",
     qty:1, unit:"支", location:"标准物质柜 S-2（避光）", hazard:"无", hazardClass:"—",
     maker:"sigma", prodNo:"A9512-2026", expiry:"2027-02-28", mfgDate:"2026-02-28",
     owner:"刘振华", status:"在库"},
    {id:"RG-020", name:"铅标准溶液", cas:"7439-92-1", grade:"GB/T 574", spec:"1000 μg/mL",
     qty:1, unit:"支", location:"标准物质柜 S-2", hazard:"毒害品", hazardClass:"④",
     maker:"国家标准物质中心", prodNo:"GBW(E)080177", expiry:"2027-05-31", mfgDate:"2026-05-31",
     owner:"周敏", status:"在库", cert:"CRM-2026-0601"},
    {id:"RG-021", name:"砷标准溶液", cas:"7440-38-2", grade:"GB/T 575", spec:"1000 μg/mL",
     qty:1, unit:"支", location:"标准物质柜 S-2", hazard:"毒害品", hazardClass:"④",
     maker:"国家标准物质中心", prodNo:"GBW(E)080179", expiry:"2027-05-31", mfgDate:"2026-05-31",
     owner:"周敏", status:"在库", cert:"CRM-2026-0601"},
    {id:"RG-022", name:"沙门氏菌显色培养基", cas:"—", grade:"检验培养基", spec:"250 g/瓶",
     qty:3, unit:"瓶", location:"培养基冷库", hazard:"无", hazardClass:"—",
     maker:"北京陆桥", prodNo:"BBL-2026-114", expiry:"2027-02-10", mfgDate:"2026-02-10",
     owner:"赵敏", status:"在库"},
    {id:"RG-023", name:"金黄色葡萄球菌显色培养基", cas:"—", grade:"检验培养基", spec:"250 g/瓶",
     qty:3, unit:"瓶", location:"培养基冷库", hazard:"无", hazardClass:"—",
     maker:"北京陆桥", prodNo:"BBL-2026-115", expiry:"2027-02-10", mfgDate:"2026-02-10",
     owner:"赵敏", status:"在库"},
    {id:"RG-024", name:"亚硫酸氢钠标准溶液", cas:"7631-90-5", grade:"GB/T 6026", spec:"0.1 mol/L",
     qty:1, unit:"支", location:"标准物质柜 S-1", hazard:"无", hazardClass:"—",
     maker:"国家标准物质中心", prodNo:"GBW(E)080012", expiry:"2027-04-30", mfgDate:"2026-04-30",
     owner:"王海涛", status:"在库"},
    {id:"RG-025", name:"无菌生理盐水", cas:"7647-14-5", grade:"微生物检验用", spec:"500 mL/袋",
     qty:12, unit:"袋", location:"培养基冷库", hazard:"无", hazardClass:"—",
     maker:"北京陆桥", prodNo:"NS-2026-088", expiry:"2027-06-30", mfgDate:"2026-06-30",
     owner:"赵敏", status:"在库"},
    {id:"RG-026", name:"考马斯亮蓝 G-250 试剂", cas:"6104-58-1", grade:"BR 生物级", spec:"5 g",
     qty:1, unit:"瓶", location:"试剂柜 A-5", hazard:"无", hazardClass:"—",
     maker:"sigma", prodNo:"B-8500-2026", expiry:"2028-12-31", mfgDate:"2026-01-10",
     owner:"陈晓芸", status:"在库"},
    {id:"RG-027", name:"考马斯亮蓝（BSA）标准品", cas:"9048-46-8", grade:"生物级", spec:"1 g",
     qty:1, unit:"支", location:"标准物质柜 S-2", hazard:"无", hazardClass:"—",
     maker:"sigma", prodNo:"A8806-2025", expiry:"2027-09-30", mfgDate:"2025-09-30",
     owner:"陈晓芸", status:"在库"},
    {id:"RG-028", name:"抗坏血酸标准溶液（配制）", cas:"50-81-7", grade:"实验室配制", spec:"0.1 mg/mL",
     qty:1, unit:"瓶", location:"试剂柜 A-6", hazard:"无", hazardClass:"—",
     maker:"本实验室配制", prodNo:"PF-2026-1015", expiry:"2026-11-15", mfgDate:"2026-10-15",
     owner:"王海涛", status:"在库", isPrepared:true},
    {id:"RG-029", name:"乙醚（工业级，萃取用）", cas:"60-29-7", grade:"工业级", spec:"20 L/桶",
     qty:1, unit:"桶", location:"危化品间 W-1", hazard:"易燃液体", hazardClass:"①",
     maker:"中石化", prodNo:"20260920", expiry:"2028-09-20", mfgDate:"2026-09-20",
     owner:"孙婷", status:"在库"},
    {id:"RG-030", name:"亚硝酸钠标准溶液（配制）", cas:"7632-00-0", grade:"实验室配制", spec:"100 μg/mL",
     qty:1, unit:"瓶", location:"试剂柜 A-6", hazard:"毒害品", hazardClass:"④",
     maker:"本实验室配制", prodNo:"PF-2026-1020", expiry:"2026-11-20", mfgDate:"2026-10-20",
     owner:"赵敏", status:"在库", isPrepared:true}
  ];

  /* ================================================================
     ③ 样品与留样台账
     ================================================================
     依据：
       · GB 14881 取样与留样：留样保存至保质期满后 6 个月（婴配可更长）
       · 每批留样需能追溯到原生产批
       · 留样是打假、复检、投诉调查唯一的物证
     字段：样品编号 / 类别 / 委托单位 / 批号 / 生产日期 / 到样日期 /
           检验状态 / 留样位置 / 留样到期 / 留样量 / 处置
     ================================================================ */
  var SAMPLES = [
    {id:"YP2609-001", cat:"婴配成品", name:"金装婴儿配方奶粉 1 段 800g", batch:"A26081501",
     maker:"委托方 A 乳业", prodDate:"2026-08-15", recvDate:"2026-08-18", qty:"6 罐",
     status:"已检验", retainPos:"留样柜 R-1 第 2 层", retainUntil:"2029-02-15", retainQty:"2 罐",
     testNo:"BG2609-0142", result:"合格", note:"常规送检"},
    {id:"YP2609-002", cat:"婴配成品", name:"金装较大婴儿配方奶粉 2 段 900g", batch:"A26081502",
     maker:"委托方 A 乳业", prodDate:"2026-08-15", recvDate:"2026-08-18", qty:"6 罐",
     status:"已检验", retainPos:"留样柜 R-1 第 2 层", retainUntil:"2029-02-15", retainQty:"2 罐",
     testNo:"BG2609-0143", result:"合格", note:""},
    {id:"YP2609-003", cat:"婴配成品", name:"金装幼儿配方奶粉 3 段 900g", batch:"A26081503",
     maker:"委托方 A 乳业", prodDate:"2026-08-15", recvDate:"2026-08-18", qty:"6 罐",
     status:"已检验", retainPos:"留样柜 R-1 第 3 层", retainUntil:"2029-02-15", retainQty:"2 罐",
     testNo:"BG2609-0144", result:"合格", note:""},
    {id:"YP2609-004", cat:"婴配成品", name:"有机婴儿配方奶粉 1 段", batch:"B26082001",
     maker:"委托方 B 乳业", prodDate:"2026-08-20", recvDate:"2026-08-23", qty:"4 罐",
     status:"已检验", retainPos:"留样柜 R-1 第 3 层", retainUntil:"2029-02-20", retainQty:"1 罐",
     testNo:"BG2609-0168", result:"合格", note:"有机认证产品"},
    {id:"YP2609-005", cat:"婴配成品", name:"早产/低出生体重婴儿配方奶粉", batch:"B26082002",
     maker:"委托方 B 乳业", prodDate:"2026-08-20", recvDate:"2026-08-23", qty:"4 罐",
     status:"复检中", retainPos:"留样柜 R-2 第 1 层", retainUntil:"2029-02-20", retainQty:"1 罐",
     testNo:"BG2609-0171", result:"待定", note:"维生素 D 临界值，客户要求复检"},
    {id:"YP2609-006", cat:"全脂乳粉", name:"全脂乳粉 FM-02", batch:"RM26083007",
     maker:"委托方 C 牧场", prodDate:"2026-08-30", recvDate:"2026-09-02", qty:"5 kg",
     status:"已检验", retainPos:"留样柜 R-3 第 1 层", retainUntil:"2028-08-30", retainQty:"1 kg",
     testNo:"BG2609-0203", result:"合格", note:"原料检验"},
    {id:"YP2609-007", cat:"乳清粉", name:"脱盐乳清粉 D90", batch:"WP26083002",
     maker:"委托方 D 乳品", prodDate:"2026-08-30", recvDate:"2026-09-02", qty:"5 kg",
     status:"已检验", retainPos:"留样柜 R-3 第 1 层", retainUntil:"2028-08-30", retainQty:"1 kg",
     testNo:"BG2609-0204", result:"合格", note:"原料检验"},
    {id:"YP2609-008", cat:"乳清粉", name:"浓缩乳清蛋白粉 WPC80", batch:"WP26090105",
     maker:"委托方 D 乳品", prodDate:"2026-09-01", recvDate:"2026-09-04", qty:"2 kg",
     status:"已检验", retainPos:"留样柜 R-3 第 2 层", retainUntil:"2028-09-01", retainQty:"0.5 kg",
     testNo:"BG2609-0219", result:"合格", note:"原料检验"},
    {id:"YP2609-009", cat:"调制乳粉", name:"儿童调制乳粉（3 岁以上）", batch:"E26090501",
     maker:"委托方 E 食品", prodDate:"2026-09-05", recvDate:"2026-09-08", qty:"6 罐",
     status:"已检验", retainPos:"留样柜 R-1 第 4 层", retainUntil:"2029-03-05", retainQty:"2 罐",
     testNo:"BG2609-0244", result:"合格", note:"GB 19644 适用"},
    {id:"YP2609-010", cat:"婴配成品", name:"婴儿配方奶粉（豆基）1 段", batch:"F26091003",
     maker:"委托方 F 营养", prodDate:"2026-09-10", recvDate:"2026-09-14", qty:"4 罐",
     status:"检验中", retainPos:"留样柜 R-2 第 2 层", retainUntil:"2029-03-10", retainQty:"1 罐",
     testNo:"BG2609-0261", result:"待定", note:"大豆蛋白配方，蛋白项目按豆基判定"},
    {id:"YP2609-011", cat:"包材", name:"马口铁罐（900g 规格）", batch:"PK26090512",
     maker:"委托方 G 包材", prodDate:"2026-09-05", recvDate:"2026-09-09", qty:"10 只",
     status:"已检验", retainPos:"留样柜 R-4 第 1 层", retainUntil:"2028-09-05", retainQty:"2 只",
     testNo:"BG2609-0250", result:"合格", note:"GB 4806.9 迁移试验"},
    {id:"YP2609-012", cat:"包材", name:"内壁涂料（马口铁罐）", batch:"PK26090513",
     maker:"委托方 G 包材", prodDate:"2026-09-05", recvDate:"2026-09-09", qty:"6 只",
     status:"已检验", retainPos:"留样柜 R-4 第 1 层", retainUntil:"2028-09-05", retainQty:"1 只",
     testNo:"BG2609-0251", result:"合格", note:"GB 4806.2 重金属迁移"}
  ];

  /* ================================================================
     ④ 质量控制方案与记录
     ================================================================
     依据：CNAS-CL01 + JJF 1050（化学分析测量不确定度）
           每个检测项目都要有 QC 手段，常用四种：
             空白试验  —— 排除试剂/器皿本底
             平行样    —— 检验精密度
             加标回收  —— 检验准确度（系统偏差）
             标准物质  —— 检验准确度（最权威）
           QC 频次：常规每批（10 样以内按批），加标回收每 20 样一次
     ================================================================ */
  var QC_PLANS = [
    {id:"QC-001", item:"蛋白质（凯氏定氮）", method:"GB 5009.5-2025", itemCat:"蛋白质与基础成分",
     blank:"每批", dup:"每批（平行 2 份）", spike:"每 20 样", refMat:"每季度 1 次",
     criteria:"空白氮含量 < 0.15 mg；平行样相对偏差 ≤ 3%；加标回收率 95%~105%；与 CRM 偏差 ≤ 5%",
     critHigh:"平行样相对偏差 > 3% 或回收率超出 95%~105%", owner:"王海涛", freq:"每批"},
    {id:"QC-002", item:"脂肪（碱水解法）", method:"GB 5009.6-2025", itemCat:"蛋白质与基础成分",
     blank:"每批", dup:"每批（平行 2 份）", spike:"每 20 样", refMat:"每半年 1 次",
     criteria:"空白 < 0.05 g；平行样相对偏差 ≤ 5%；回收率 90%~110%",
     critHigh:"平行样偏差 > 5% 或回收率超出 90%~110%", owner:"孙婷", freq:"每批"},
    {id:"QC-003", item:"水分（105℃ 烘干法）", method:"GB 5009.3-2016", itemCat:"蛋白质与基础成分",
     blank:"每批", dup:"每批（平行 2 份）", spike:"不适用", refMat:"每半年 1 次",
     criteria:"空白 < 0.02 g；平行样相对偏差 ≤ 2%",
     critHigh:"平行样偏差 > 2%", owner:"王海涛", freq:"每批"},
    {id:"QC-004", item:"灰分（550℃）", method:"GB 5009.4-2016", itemCat:"蛋白质与基础成分",
     blank:"每批", dup:"每批（平行 2 份）", spike:"不适用", refMat:"每半年 1 次",
     criteria:"平行样相对偏差 ≤ 3%；灰分含量应在 3.0%~3.8%（婴配粉）",
     critHigh:"平行样偏差 > 3%", owner:"王海涛", freq:"每批"},
    {id:"QC-005", item:"维生素 C（抗坏血酸）", method:"GB 5413.17-2010", itemCat:"维生素与矿物质",
     blank:"每批", dup:"每批（平行 2 份）", spike:"每 20 样", refMat:"每季度 1 次",
     criteria:"回收率 90%~110%；平行样相对偏差 ≤ 5%",
     critHigh:"回收率超出 90%~110%（维生素 C 极易降解，立即排查）", owner:"孙婷", freq:"每批"},
    {id:"QC-006", item:"钙、磷（ICP-AES）", method:"GB 10767-2021", itemCat:"维生素与矿物质",
     blank:"每批", dup:"每 10 样", spike:"每 20 样", refMat:"每季度 1 次",
     criteria:"平行样相对偏差 ≤ 3%；钙磷比在 1.2~2.0 之间",
     critHigh:"钙磷比超出 1.2~2.0 或平行样偏差 > 3%", owner:"周敏", freq:"每 10 样"},
    {id:"QC-007", item:"铅（原子荧光）", method:"GB 2762-2022", itemCat:"污染物",
     blank:"每批", dup:"每 10 样", spike:"每 20 样", refMat:"每季度 1 次",
     criteria:"空白 < 定量限；加标回收率 90%~110%；定量限 ≤ 0.01 mg/kg",
     critHigh:"空白超过定量限（污染源，须查试剂与器皿）", owner:"周敏", freq:"每批"},
    {id:"QC-008", item:"菌落总数", method:"GB 4789.2-2022", itemCat:"微生物",
     blank:"每批（培养基空白）", dup:"不适用", spike:"不适用", refMat:"每半年 1 次",
     criteria:"培养基空白无菌落；平行样计数偏差 ≤ 10%",
     critHigh:"培养基空白有菌落（培养基或无菌操作污染，整批作废）", owner:"赵敏", freq:"每批"},
    {id:"QC-009", item:"阪崎肠杆菌", method:"GB 4789.30-2016", itemCat:"微生物",
     blank:"每批（培养基空白）", dup:"不适用", spike:"不适用", refMat:"每半年 1 次",
     criteria:"培养基空白无菌落；阳性对照生长良好；阴性对照无菌落",
     critHigh:"阴性对照有菌落 → 培养基灭菌或无菌操作失效，该批作废", owner:"赵敏", freq:"每批"},
    {id:"QC-010", item:"金黄色葡萄球菌", method:"GB 4789.10-2016", itemCat:"微生物",
     blank:"每批（培养基空白）", dup:"不适用", spike:"不适用", refMat:"每半年 1 次",
     criteria:"培养基空白无菌落；阳性对照生长良好；阴性对照无菌落",
     critHigh:"阴性对照有菌落 → 该批作废并排查灭菌记录", owner:"赵敏", freq:"每批"},
    {id:"QC-011", item:"脂肪酸组成（GC）", method:"GB 5009.168-2026", itemCat:"脂肪酸",
     blank:"每批", dup:"每 10 样", spike:"每 20 样", refMat:"每季度 1 次",
     criteria:"平行样相对偏差 ≤ 5%；反式脂肪酸回收率 90%~110%",
     critHigh:"平行样偏差 > 5%（色谱进样与峰面积积分波动）", owner:"刘振华", freq:"每 10 样"},
    {id:"QC-012", item:"DHA、ARA（GC）", method:"GB 10767-2021", itemCat:"脂肪酸",
     blank:"每批", dup:"每 10 样", spike:"每 20 样", refMat:"每季度 1 次",
     criteria:"回收率 85%~115%；平行样相对偏差 ≤ 10%（痕量组分）",
     critHigh:"回收率超出 85%~115%（标准品或衍生化步骤问题）", owner:"刘振华", freq:"每 10 样"}
  ];

  /* QC 执行记录（近期实际执行的） */
  var QC_RECORDS = [
    {id:"QCR-260901", planId:"QC-001", date:"2026-09-01", item:"蛋白质", batch:"BG2609-0142",
     blank:"0.09 mg", dup:"RSD 1.8%", spike:"回收率 99.2%", refMat:"—",
     verdict:"合格", by:"王海涛", note:""},
    {id:"QCR-260901-2", planId:"QC-008", date:"2026-09-01", item:"菌落总数", batch:"BG2609-0142",
     blank:"无菌落", dup:"—", spike:"—", refMat:"—",
     verdict:"合格", by:"赵敏", note:""},
    {id:"QCR-260903", planId:"QC-001", date:"2026-09-03", item:"蛋白质", batch:"BG2609-0168",
     blank:"0.11 mg", dup:"RSD 2.4%", spike:"回收率 100.8%", refMat:"CRM 偏差 2.1%",
     verdict:"合格", by:"王海涛", note:""},
    {id:"QCR-260905", planId:"QC-007", date:"2026-09-05", item:"铅", batch:"BG2609-0171",
     blank:"<0.003 mg/kg", dup:"RSD 2.9%", spike:"回收率 96.5%", refMat:"—",
     verdict:"合格", by:"周敏", note:"临界样品，加做一次"},
    {id:"QCR-260908", planId:"QC-001", date:"2026-09-08", item:"蛋白质", batch:"BG2609-0203",
     blank:"0.13 mg", dup:"RSD 1.2%", spike:"回收率 97.9%", refMat:"—",
     verdict:"合格", by:"王海涛", note:""},
    {id:"QCR-260910", planId:"QC-001", date:"2026-09-10", item:"蛋白质", batch:"BG2609-0219",
     blank:"0.22 mg", dup:"RSD 3.6%", spike:"回收率 97.1%", refMat:"—",
     verdict:"超限", by:"王海涛", note:"空白与平行样同时超限 —— 排查试剂氮本底与消解管洁净度，已更换硫酸钾批次并复测合格"},
    {id:"QCR-260911", planId:"QC-001", date:"2026-09-11", item:"蛋白质", batch:"BG2609-0219（复测）",
     blank:"0.08 mg", dup:"RSD 1.5%", spike:"回收率 98.6%", refMat:"—",
     verdict:"合格", by:"王海涛", note:"更换试剂批次后复测，连续 3 批合格，关闭不符合项"},
    {id:"QCR-260915", planId:"QC-002", date:"2026-09-15", item:"脂肪", batch:"BG2609-0244",
     blank:"0.02 g", dup:"RSD 3.1%", spike:"回收率 97.2%", refMat:"—",
     verdict:"合格", by:"孙婷", note:""},
    {id:"QCR-260916", planId:"QC-009", date:"2026-09-16", item:"阪崎肠杆菌", batch:"BG2609-0244",
     blank:"无菌落", dup:"—", spike:"—", refMat:"—",
     verdict:"合格", by:"赵敏", note:"阳性对照生长良好"},
    {id:"QCR-260918", planId:"QC-006", date:"2026-09-18", item:"钙、磷", batch:"BG2609-0251",
     blank:"<0.02 mg", dup:"RSD 1.1%", spike:"回收率 99.8%", refMat:"—",
     verdict:"合格", by:"周敏", note:""},
    {id:"QCR-260921", planId:"QC-011", date:"2026-09-21", item:"脂肪酸组成", batch:"BG2609-0261",
     blank:"无干扰峰", dup:"RSD 2.2%", spike:"回收率 96.1%", refMat:"—",
     verdict:"合格", by:"刘振华", note:"用 2026 版方法做的前处理确认，色谱条件已切换"}
  ];

  /* ================================================================
     ⑤ 人员资质与培训
     ================================================================
     依据：CNAS 要求从事检测活动的人员经培训、考核持证上岗；
           授权签字人须经 CNAS 授权。
     ================================================================ */
  var STAFF = [
    {id:"S-001", name:"周敏", title:"实验室主任 / 授权签字人", dept:"质量部",
     certs:"CNAS 授权签字人（化学检测）", certNo:"CNAS-PT-2019-114",
     certUntil:"2028-06-30", train:"全部检测项目", trainDate:"2026-03-15",
     level:"授权签字人", status:"在岗"},
    {id:"S-002", name:"王海涛", title:"高级检验员", dept:"理化室",
     certs:"理化检测（蛋白/水分/灰分/脂肪）", certNo:"JC-2024-0331",
     certUntil:"2027-12-31", train:"理化前处理与滴定分析", trainDate:"2026-04-20",
     level:"资深", status:"在岗"},
    {id:"S-003", name:"孙婷", title:"检验员", dept:"理化室",
     certs:"理化检测（脂肪/维生素/水分）", certNo:"JC-2025-0114",
     certUntil:"2027-11-30", train:"脂肪提取与维生素测定", trainDate:"2026-05-08",
     level:"中级", status:"在岗"},
    {id:"S-004", name:"刘振华", title:"检验员", dept:"色谱室",
     certs:"色谱检测（脂肪酸/维生素/氨基酸）", certNo:"JC-2025-0207",
     certUntil:"2027-10-31", train:"GC 与 HPLC 仪器操作", trainDate:"2026-06-12",
     level:"中级", status:"在岗"},
    {id:"S-005", name:"陈晓芸", title:"检验员", dept:"理化室",
     certs:"理化检测（钙磷/铁/钠/标准溶液配制）", certNo:"JC-2026-0108",
     certUntil:"2028-01-31", train:"元素分析与标准物质管理", trainDate:"2026-07-03",
     level:"初级", status:"在岗"},
    {id:"S-006", name:"赵敏", title:"检验员", dept:"微生物室",
     certs:"微生物检测（菌落总数/致病菌）", certNo:"JC-2025-0319",
     certUntil:"2027-09-30", train:"无菌操作与培养基管理", trainDate:"2026-08-05",
     level:"中级", status:"在岗"},
    {id:"S-007", name:"李国强", title:"实验室技术员", dept:"样品管理",
     certs:"样品管理 / 天平称量 / 器皿校准", certNo:"JC-2024-0522",
     certUntil:"2027-08-31", train:"样品流转与留样管理", trainDate:"2026-09-01",
     level:"初级", status:"在岗"}
  ];

  /* ================================================================
     ⑥ 能力验证与实验室间比对
     ================================================================
     依据：CNAS-CL01 要求实验室参加能力验证；
           参加 PT 是证明检测能力的外部证据，客户审厂必查。
     ================================================================ */
  var PT_PLANS = [
    {id:"PT-2026-01", year:2026, name:"婴配粉营养素能力验证（省所）",
     org:"省市场监督管理局计量院", cat:"营养成分",
     items:"蛋白质、脂肪、碳水、钙、磷、钠、DHA、ARA",
     planDate:"2026-03-18", recvDate:"2026-04-10", reportDate:"2026-04-28",
     result:"全部满意", status:"已出报告", reportNo:"PT2026-0412",
     note:"8 项全部满意，评价为满意"},
    {id:"PT-2026-02", year:2026, name:"婴配粉污染物能力验证",
     org:"国家食品安全风险评估中心", cat:"污染物",
     items:"铅、砷、镉、汞、亚硝酸盐",
     planDate:"2026-06-05", recvDate:"2026-07-02", reportDate:"2026-07-20",
     result:"4 项满意，1 项可疑", status:"已出报告", reportNo:"PT2026-0708",
     note:"亚硝酸盐为可疑（Z 值 2.1），已排查标准溶液配制与显色时间，属测量不确定度内"},
    {id:"PT-2026-03", year:2026, name:"微生物能力验证",
     org:"省市场监督管理局计量院", cat:"微生物",
     items:"菌落总数、阪崎肠杆菌、金黄色葡萄球菌",
     planDate:"2026-09-15", recvDate:"2026-10-12", reportDate:"—",
     result:"待出", status:"进行中", reportNo:"—",
     note:"样品已于 10-12 接收，10-25 前完成检测"},
    {id:"PT-2026-04", year:2026, name:"实验室间比对（婴配粉水分）",
     org:"省质量监督检验研究院", cat:"基础成分",
     items:"水分",
     planDate:"2026-04-08", recvDate:"2026-05-06", reportDate:"2026-05-22",
     result:"满意", status:"已出报告", reportNo:"PT2026-0522",
     note:""}
  ];

  /* ================================================================
     ⑦ 检测能力矩阵（由「项目 → 方法 → 设备 → 试剂 → 周期」组成）
     ================================================================
     这张表回答客户最常问的三句话：
       「你们能测什么？」「用什么方法？」「多久出结果？」
     收费与周期为行业常见区间，供报价参考。
     ================================================================ */
  var CAPABILITY = [
    {item:"蛋白质", method:"GB 5009.5-2025 第一法 凯氏定氮法", cat:"营养成分",
     eq:["EQ-001","EQ-002","EQ-020"], rg:["RG-001","RG-002","RG-003","RG-004","RG-005"],
     days:3, price:"180 元/样", acc:"GB 10765-2021 强制", staff:"S-002"},
    {item:"脂肪", method:"GB 5009.6-2025 第三法 碱水解法", cat:"营养成分",
     eq:["EQ-001","EQ-021","EQ-048"], rg:["RG-006","RG-007","RG-008","RG-015","RG-016"],
     days:3, price:"220 元/样", acc:"GB 10765-2021 强制", staff:"S-003"},
    {item:"水分", method:"GB 5009.3-2016 105℃ 烘干法", cat:"营养成分",
     eq:["EQ-021","EQ-047","EQ-002"], rg:[],
     days:2, price:"120 元/样", acc:"GB 10765-2021 强制", staff:"S-002"},
    {item:"灰分", method:"GB 5009.4-2016 550℃ 灼烧法", cat:"营养成分",
     eq:["EQ-022","EQ-002"], rg:[],
     days:2, price:"120 元/样", acc:"GB 10765-2021 强制", staff:"S-002"},
    {item:"钙", method:"GB 5009.6 附注 / ICP-AES", cat:"矿物质",
     eq:["EQ-033","EQ-001"], rg:["RG-011","RG-012"],
     days:4, price:"200 元/样", acc:"GB 10765-2021 强制", staff:"S-005"},
    {item:"磷", method:"GB 5009.6 附注 / ICP-AES", cat:"矿物质",
     eq:["EQ-033","EQ-001"], rg:["RG-011","RG-012"],
     days:4, price:"200 元/样", acc:"GB 10765-2021 强制", staff:"S-005"},
    {item:"钠", method:"GB 5009.91-2017 火焰光度法 / ICP-AES", cat:"矿物质",
     eq:["EQ-033","EQ-001"], rg:[],
     days:3, price:"160 元/样", acc:"GB 10765-2021 强制", staff:"S-005"},
    {item:"维生素 C", method:"GB 5413.17-2010 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031","EQ-034"], rg:["RG-009","RG-010","RG-012","RG-017","RG-028"],
     days:4, price:"280 元/样", acc:"GB 10765-2021 强制", staff:"S-003"},
    {item:"维生素 A", method:"GB 5413.13-2019 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010","RG-019"],
     days:4, price:"280 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"维生素 D", method:"GB 5413.11-2017 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:5, price:"320 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"维生素 E", method:"GB 5413.9-2011 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:4, price:"260 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"烟酸", method:"GB 5413.16-2010 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:4, price:"260 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"叶酸", method:"GB 5413.12-2010 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:5, price:"300 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"生物素", method:"GB 5413.14-2010 HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:5, price:"300 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"胆碱", method:"GB 5413.20-2011 离子色谱法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-011"],
     days:4, price:"260 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"肌醇", method:"GB 5413.20-2011 离子色谱法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-011"],
     days:4, price:"260 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"牛磺酸", method:"GB 10767 附录 / HPLC 法", cat:"维生素与矿物质",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:4, price:"240 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"DHA、ARA", method:"GB 5009.168-2026 气相色谱法", cat:"脂肪酸",
     eq:["EQ-030","EQ-001"], rg:["RG-009","RG-011"],
     days:5, price:"380 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"脂肪酸组成（反式脂肪酸）", method:"GB 5009.168-2026 气相色谱法", cat:"脂肪酸",
     eq:["EQ-030","EQ-001"], rg:["RG-009","RG-011"],
     days:5, price:"420 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"亚油酸、α-亚麻酸", method:"GB 5009.168-2026 气相色谱法", cat:"脂肪酸",
     eq:["EQ-030"], rg:["RG-009","RG-011"],
     days:5, price:"380 元/样", acc:"GB 10765-2021 强制", staff:"S-004"},
    {item:"乳糖", method:"GB 5413.19-2010 HPLC 法", cat:"碳水化合物",
     eq:["EQ-031"], rg:["RG-009","RG-010"],
     days:4, price:"260 元/样", acc:"GB 10767-2021 强制", staff:"S-004"},
    {item:"总糖", method:"GB 5009.7-2016 滴定法", cat:"碳水化合物",
     eq:["EQ-002","EQ-001"], rg:["RG-024"],
     days:3, price:"180 元/样", acc:"参考项", staff:"S-002"},
    {item:"铅", method:"GB 5009.12-2023 原子荧光法", cat:"污染物",
     eq:["EQ-035","EQ-001"], rg:["RG-020","RG-011","RG-012"],
     days:5, price:"320 元/样", acc:"GB 2762-2022 强制", staff:"S-005"},
    {item:"总砷及无机砷", method:"GB 5009.11-2014 原子荧光法", cat:"污染物",
     eq:["EQ-035","EQ-001"], rg:["RG-021","RG-011","RG-012"],
     days:6, price:"380 元/样", acc:"GB 2762-2022 强制", staff:"S-005"},
    {item:"镉", method:"GB 5009.17-2023 原子荧光法", cat:"污染物",
     eq:["EQ-035","EQ-001"], rg:["RG-011","RG-012"],
     days:6, price:"360 元/样", acc:"GB 2762-2022 强制", staff:"S-005"},
    {item:"汞", method:"GB 5009.17-2023 原子荧光法", cat:"污染物",
     eq:["EQ-035","EQ-001"], rg:["RG-011","RG-012"],
     days:6, price:"360 元/样", acc:"GB 2762-2022 强制", staff:"S-005"},
    {item:"亚硝酸盐", method:"GB 5009.18-2016 分光光度法", cat:"污染物",
     eq:["EQ-034","EQ-001"], rg:["RG-030"],
     days:3, price:"220 元/样", acc:"GB 2762-2022 强制", staff:"S-002"},
    {item:"抗生素残留（青霉素等）", method:"GB 4789.27-2012 酶联免疫法", cat:"污染物",
     eq:["EQ-031"], rg:["RG-009","RG-010","RG-011"],
     days:5, price:"380 元/样", acc:"GB 2762-2022 强制", staff:"S-004"},
    {item:"三聚氰胺", method:"GB 22388-2008 液相色谱法", cat:"污染物",
     eq:["EQ-031","EQ-032"], rg:["RG-009","RG-010"],
     days:5, price:"350 元/样", acc:"GB 2762-2022 强制", staff:"S-004"},
    {item:"菌落总数", method:"GB 4789.2-2022 平板计数法", cat:"微生物",
     eq:["EQ-041","EQ-043","EQ-040"], rg:["RG-025"],
     days:3, price:"200 元/样", acc:"GB 10765-2021 强制", staff:"S-006"},
    {item:"大肠菌群", method:"GB 4789.3-2016 MPN 法", cat:"微生物",
     eq:["EQ-041","EQ-040"], rg:["RG-025"],
     days:3, price:"200 元/样", acc:"GB 10765-2021 强制", staff:"S-006"},
    {item:"阪崎肠杆菌", method:"GB 4789.30-2016 显色培养法", cat:"微生物",
     eq:["EQ-041","EQ-040"], rg:["RG-022","RG-025"],
     days:4, price:"280 元/样", acc:"GB 10765-2021 强制", staff:"S-006"},
    {item:"金黄色葡萄球菌", method:"GB 4789.10-2016 显色培养法", cat:"微生物",
     eq:["EQ-041","EQ-040"], rg:["RG-023","RG-025"],
     days:4, price:"280 元/样", acc:"GB 10765-2021 强制", staff:"S-006"},
    {item:"沙门氏菌", method:"GB 4789.4-2016 显色培养法", cat:"微生物",
     eq:["EQ-041","EQ-040"], rg:["RG-022","RG-025"],
     days:5, price:"320 元/样", acc:"GB 10765-2021 强制", staff:"S-006"},
    {item:"单增李斯特氏菌", method:"GB 4789.30-2016 显色培养法", cat:"微生物",
     eq:["EQ-041","EQ-040"], rg:["RG-022","RG-025"],
     days:6, price:"380 元/样", acc:"GB 10767-2021 强制", staff:"S-006"},
    {item:"能量（计算值）", method:"按 GB 28050 计算", cat:"基础成分",
     eq:["EQ-002"], rg:[],
     days:1, price:"50 元/样", acc:"GB 10765-2021 强制", staff:"S-002"},
    {item:"不溶性指数", method:"GB 5413.30-2016", cat:"基础成分",
     eq:["EQ-002","EQ-001"], rg:[],
     days:2, price:"150 元/样", acc:"GB 10765-2021 强制", staff:"S-002"},
    {item:"杂质度", method:"GB 5413.30-2016", cat:"基础成分",
     eq:["EQ-002"], rg:[],
     days:2, price:"150 元/样", acc:"GB 10765-2021 强制", staff:"S-002"},
    {item:"水分（糖醇）", method:"GB 5009.3-2016", cat:"基础成分",
     eq:["EQ-021","EQ-047"], rg:[],
     days:2, price:"120 元/样", acc:"参考项", staff:"S-002"},
    {item:"铅（包材迁移）", method:"GB 4806.9-2023 迁移试验", cat:"包材",
     eq:["EQ-035","EQ-001"], rg:["RG-020","RG-011"],
     days:8, price:"600 元/项", acc:"GB 4806.9-2023 强制", staff:"S-005"},
    {item:"重金属（包材）", method:"GB 4806.9-2023 迁移试验", cat:"包材",
     eq:["EQ-035"], rg:["RG-020","RG-021"],
     days:8, price:"600 元/项", acc:"GB 4806.9-2023 强制", staff:"S-005"}
  ];

  /* ================================================================
     ⑧ 原始记录模板字段定义
     ================================================================
     每种方法类型对应一套原始记录要素。
     原始记录要满足：真实、及时、完整、不得事后补记（CNAS-CL01 5.5）
     ================================================================ */
  var RECORD_TEMPLATES = {
    "凯氏定氮法": {
      fields:[
        {k:"样品编号", type:"text", hint:"如 YP2609-001"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"收样日期", type:"date"},
        {k:"检验日期", type:"date"},
        {k:"称样量 (g)", type:"number", hint:"准确至 0.0001 g"},
        {k:"消化温度 (℃)", type:"number", hint:"约 400℃"},
        {k:"消化时间 (min)", type:"number"},
        {k:"空白消耗标准酸 (mL)", type:"number"},
        {k:"试样消耗标准酸 (mL)", type:"number"},
        {k:"标准酸浓度 (mol/L)", type:"number"},
        {k:"折算系数", type:"number", hint:"按 GB 5009.5 附录取"},
        {k:"平行样结果 (%)", type:"text", hint:"两个值及相对偏差"},
        {k:"环境温度 (℃)", type:"number"},
        {k:"相对湿度 (%)", type:"number"},
        {k:"使用的标准物质证书号", type:"text"},
        {k:"电子天平编号", type:"text", hint:"EQ-001 / EQ-002"},
        {k:"消解仪编号", type:"text", hint:"EQ-020"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"结果(%) = (V试 − V空) × c × 5.91 × m系数 / m × 100"
    },
    "碱水解法": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"称样量 (g)", type:"number"},
        {k:"淀粉酶用量 (mL)", type:"number"},
        {k:"酶解温度 (℃)", type:"number", hint:"45℃ 或 65℃"},
        {k:"酶解时间 (min)", type:"number"},
        {k:"氨水用量 (mL)", type:"number"},
        {k:"水解温度 (℃)", type:"number"},
        {k:"水解时间 (min)", type:"number"},
        {k:"乙醇用量 (mL)", type:"number"},
        {k:"乙醚-石油醚体积比", type:"text", hint:"1:1"},
        {k:"萃取次数", type:"number"},
        {k:"刚果红用量 (滴)", type:"number"},
        {k:"回收溶剂后蒸发皿质量 (g)", type:"number"},
        {k:"恒重质量 (g)", type:"number"},
        {k:"平行样结果 (%)", type:"text"},
        {k:"电子天平编号", type:"text"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"脂肪(%) = (m2 − m1) / m × 100"
    },
    "气相色谱法": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"衍生化方法", type:"text", hint:"酸催化甲酯化 / 甲酯化-分取"},
        {k:"称样量 (g)", type:"number"},
        {k:"内标加入量 (μL)", type:"number"},
        {k:"色谱柱型号", type:"text"},
        {k:"柱温 (℃)", type:"number"},
        {k:"进样口温度 (℃)", type:"number"},
        {k:"载气 / 流速", type:"text"},
        {k:"进样量 (μL)", type:"number"},
        {k:"标准曲线范围", type:"text"},
        {k:"标准曲线相关系数 R", type:"number", hint:"≥ 0.999"},
        {k:"峰面积（试样）", type:"text"},
        {k:"峰面积（标样）", type:"text"},
        {k:"平行样结果 (%)", type:"text"},
        {k:"气相色谱仪编号", type:"text", hint:"EQ-030"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"各脂肪酸含量按外标法曲线换算，反式脂肪酸按 GB 5009.168 附录计算"
    },
    "原子荧光法": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"消解方式", type:"text", hint:"微波消解 / 湿法消解"},
        {k:"称样量 (g)", type:"number"},
        {k:"消解定容体积 (mL)", type:"number"},
        {k:"进样体积 (mL)", type:"number"},
        {k:"标准物质证书号", type:"text"},
        {k:"标准曲线相关系数 R", type:"number"},
        {k:"标准溶液浓度 (μg/mL)", type:"number"},
        {k:"试样荧光强度", type:"text"},
        {k:"空白荧光强度", type:"text"},
        {k:"定量限 (μg/kg)", type:"number"},
        {k:"加标回收率 (%)", type:"number"},
        {k:"平行样结果 (μg/kg)", type:"text"},
        {k:"原子荧光分光光度计编号", type:"text", hint:"EQ-035"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"含量 = (试样荧光 − 空白荧光) / (标样荧光 − 空白荧光) × 标样浓度 × 定容体积 / 称样量 × 稀释倍数"
    },
    "高压液相色谱法": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"前处理方法", type:"text"},
        {k:"称样量 (g)", type:"number"},
        {k:"定容体积 (mL)", type:"number"},
        {k:"进样体积 (μL)", type:"number"},
        {k:"流动相组成", type:"text"},
        {k:"流速 (mL/min)", type:"number"},
        {k:"柱温 (℃)", type:"number"},
        {k:"检测波长 (nm)", type:"number"},
        {k:"标准物质证书号", type:"text"},
        {k:"标准曲线相关系数 R", type:"number"},
        {k:"峰面积（试样）", type:"text"},
        {k:"峰面积（标样）", type:"text"},
        {k:"平行样结果", type:"text"},
        {k:"液相色谱仪编号", type:"text", hint:"EQ-031"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"按外标法 / 内标法曲线换算，含量需做回收率校正"
    },
    "培养计数法": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"样品稀释度", type:"text"},
        {k:"接种量 (mL)", type:"number"},
        {k:"培养基批号", type:"text"},
        {k:"培养基灭菌记录号", type:"text"},
        {k:"培养温度 (℃)", type:"number"},
        {k:"培养时间 (h)", type:"number"},
        {k:"培养基空白结果", type:"text", hint:"应无菌落"},
        {k:"阳性对照结果", type:"text", hint:"应生长良好"},
        {k:"阴性对照结果", type:"text", hint:"应无菌落"},
        {k:"菌落计数结果", type:"text"},
        {k:"计数平板编号", type:"text"},
        {k:"生物安全柜编号", type:"text", hint:"EQ-040"},
        {k:"培养箱编号", type:"text", hint:"EQ-041"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"菌落总数 = 菌落数 × 稀释倍数 × 1 / 接种体积"
    },
    "烘干法": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"称量皿编号", type:"text"},
        {k:"称量皿空重 (g)", type:"number"},
        {k:"试样质量 (g)", type:"number"},
        {k:"干燥温度 (℃)", type:"number", hint:"105±5℃"},
        {k:"干燥时间 (h)", type:"number"},
        {k:"恒重质量 (g)", type:"number"},
        {k:"恒重间隔 (h)", type:"number", hint:"±0.0002 g"},
        {k:"干燥箱编号", type:"text", hint:"EQ-021"},
        {k:"电子天平编号", type:"text"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"水分(%) = (m1 − m2) / m × 100"
    },
    "通用": {
      fields:[
        {k:"样品编号", type:"text"},
        {k:"样品名称", type:"text"},
        {k:"生产批号", type:"text"},
        {k:"检验日期", type:"date"},
        {k:"检验依据（方法号）", type:"text"},
        {k:"主要仪器编号", type:"text"},
        {k:"环境条件", type:"text"},
        {k:"检验结果", type:"text"},
        {k:"检验人", type:"text"},
        {k:"复核人", type:"text"},
        {k:"备注", type:"text"}
      ],
      calc:"按检验依据方法公式计算"
    }
  };

  /* 方法名 → 模板类型的映射（供原始记录生成器用） */
  var METHOD_TPL_MAP = {
    "第一法 凯氏定氮法":"凯氏定氮法",
    "第二法 凯氏定氮法":"凯氏定氮法",
    "第三法 凯氏定氮法":"凯氏定氮法",
    "第四法 凯氏定氮法":"凯氏定氮法",
    "第一法 索氏提取法":"碱水解法",
    "第二法 酸水解法":"碱水解法",
    "第三法 碱水解法":"碱水解法",
    "气相色谱法":"气相色谱法",
    "原子荧光光谱法":"原子荧光法",
    "原子吸收光谱法":"原子荧光法",
    "高效液相色谱法":"高压液相色谱法",
    "液相色谱法":"高压液相色谱法",
    "平板计数法":"培养计数法",
    "滤膜法":"培养计数法",
    "MPN 法":"培养计数法",
    "烘干法":"烘干法",
    "灼烧法":"烘干法"
  };

  /* ================================================================
     导出
     ================================================================ */
  var LAB = {
    EQUIPMENT: EQUIPMENT,
    REAGENTS: REAGENTS,
    SAMPLES: SAMPLES,
    QC_PLANS: QC_PLANS,
    QC_RECORDS: QC_RECORDS,
    STAFF: STAFF,
    PT_PLANS: PT_PLANS,
    CAPABILITY: CAPABILITY,
    RECORD_TEMPLATES: RECORD_TEMPLATES,
    METHOD_TPL_MAP: METHOD_TPL_MAP
  };

  global.LABDATA = LAB;

  /* 本机覆盖层：用户改过的数据存在 localStorage，优先于种子数据 */
  if (global.Store) {
    LAB.override = function (key) {
      var saved = global.Store.get("lab." + key, null);
      return saved || null;
    };
    LAB.save = function (key, arr) {
      global.Store.set("lab." + key, arr);
    };
  }

})(window);
