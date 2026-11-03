/* ================================================================
   labledger.js —— 实验室台账注册（2026-11-01）
   ================================================================
   把「可编辑 · 可联动 · 可交付」的台账统一注册到 ledger.js 框架上。

   三大要求怎么落地：
     ① 可编辑 —— 表格里直接改；改「下次校准」→ 剩余天数自动重算
     ② 可联动 —— 设备超期 → 检测能力矩阵里依赖它的项目被标红；
                 样品流转 → 留样台账的位置跟着变；
                 QC 超限 → 不符合工作台账自动生成一条待闭环项
     ③ 可交付 —— 一键导出 CSV / Word；设备台账另加一键导入

   注册的台账：
     ① equip     计量设备台账（★ 支持一键导入导出）
     ② reagent   试剂与危化品
     ③ sample    样品与留样
     ④ prep      试剂配制记录
     ⑤ orders    检验委托单
     ⑥ capa      不符合工作与 CAPA
     ⑦ schedule  人员排班与工作量
     ⑧ flows     样品出入库与物流
     ⑨ audit     内审检查表
     ⑩ env       环境与洁净区监控
   ================================================================ */

(function (global) {
  "use strict";

  var L = global.Ledger;
  if(!L) return;

  function esc(s){
    return String(s==null?"":s).replace(/[&<>"]/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];
    });
  }
  function daysTo(d){
    if(!d) return null;
    var t = new Date(d + "T00:00:00");
    if(isNaN(t.getTime())) return null;
    return Math.round((t.getTime() - Date.now())/86400000);
  }
  function addMonths(dateStr, m){
    if(!dateStr) return "";
    var t = new Date(dateStr + "T00:00:00");
    if(isNaN(t.getTime())) return "";
    var d = new Date(t.getFullYear(), t.getMonth()+m, t.getDate());
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  function seedOf(key){
    var D2 = global.LABDATA2 || {};
    var D1 = global.LABDATA || {};
    var map = {
      equip:"EQUIPMENT", reagent:"REAGENTS", sample:"SAMPLES", prep:"PREP",
      capability:"CAPABILITY",
      orders:"ORDERS", capa:"CAPA", schedule:"SCHEDULE", flows:"FLOWS",
      audit:"AUDIT", env:"ENV",
      qcplan:"QC_PLANS", qcrec:"QC_RECORDS", pt:"PT_PLANS"
    };
    var k = map[key];
    return D2[k] || D1[k] || [];
  }

  /* ================================================================
     ① 计量设备台账（★ 一键导入导出）
     ================================================================ */
  L.register({
    key:"equip",
    title:"计量设备与标准物质台账",
    subtitle:"CNAS 要求：全部有溯源证书 + 在有效校准/检定周期内",
    exportName:"计量设备台账",
    seed: seedOf("equip"),
    hint:"改「上次校准」或「周期」→ 下次校准自动重算",
    notice:"<b>超期的设备出的数据不能用于出报告</b> —— 用之前要有偏离处理，或用有效设备复测。"
         + "「关键设备」需在两次校准之间做期间核查（天平日核查、标样核查），记录要留。",
    cardMode:true,
    columns:[
      {k:"id",   label:"编号",   ro:true, ph:"如 EQ-049"},
      {k:"name", label:"设备名称", ph:"如 气相色谱仪"},
      {k:"brand",label:"品牌",   ph:"如 安捷伦"},
      {k:"model",label:"型号",   ph:"如 8890A"},
      {k:"sn",   label:"出厂序列号", ph:"如 GC-8890A-0271"},
      {k:"type", label:"类型",   type:"select", opts:["强制检定","内部校准","非计量设备"]},
      {k:"verify",label:"校准/检定方式", type:"select", opts:["检定","校准","自校"]},
      {k:"cycle",label:"周期(月)", type:"number"},
      {k:"lastCal",label:"上次校准", type:"date"},
      {k:"nextCal",label:"下次校准", type:"date"},
      {k:"cert", label:"溯源证书号", ph:"如 JN2026-0420-118"},
      {k:"status",label:"状态",  type:"select", opts:["在用","维修中","停用","报废"]},
      {k:"location",label:"安装位置", ph:"如 天平室 A"},
      {k:"inCharge",label:"责任人", ph:"如 周敏"},
      {k:"use",  label:"用途",   ph:"用于什么检测"},
      {k:"critical",label:"关键设备", type:"check", def:false}
    ],
    /* 卡片式：左身份 + 右校准信息 */
    cardHead:function(r, i){
      return '<div class="lcard-h">'
        +'<input type="text" class="lc-id" value="'+esc(r.id)+'" readonly>'
        +'<input type="text" class="lc-nm" value="'+esc(r.name)+'"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'name\',this.value)">'
        +'<input type="checkbox" '+(r.critical?"checked":"")+' title="关键设备（两次校准之间要期间核查）"'
        +' onchange="Ledger.setCell(\'equip\','+i+',\'critical\',this.checked)">'
        +'<span class="muted lc-sub">'
        +'<input type="text" class="lc-in" value="'+esc(r.brand)+'" placeholder="品牌"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'brand\',this.value)">'
        +'<input type="text" class="lc-in" value="'+esc(r.model)+'" placeholder="型号"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'model\',this.value)">'
        +'<input type="text" class="lc-in" value="'+esc(r.sn)+'" placeholder="SN"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'sn\',this.value)">'
        +'</span></div>'
        +'<div class="lcard-use">'
        +'<input type="text" class="lc-full" value="'+esc(r.use||"")+'" placeholder="用途（用于什么检测）"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'use\',this.value)">'
        +'<span class="muted">'
        +'<input type="text" class="lc-in" value="'+esc(r.location)+'" placeholder="安装位置"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'location\',this.value)">'
        +' · <input type="text" class="lc-in" value="'+esc(r.inCharge)+'" placeholder="责任人"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'inCharge\',this.value)">'
        +'</span></div>';
    },
    cardFields:function(r, i){
      var d = daysTo(r.nextCal);
      var cls = d===null?"":(d<0?"t-high":(d<=60?"t-mid":"t-low"));
      var opts = function(arr, cur){
        return arr.map(function(o){
          return '<option'+(cur===o?" selected":"")+'>'+o+'</option>'; }).join("");
      };
      return '<div class="lcard-f">'
        +'<label>上次校准<input type="date" value="'+esc(r.lastCal||"")+'"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'lastCal\',this.value)"></label>'
        +'<label>下次校准<input type="date" value="'+esc(r.nextCal||"")+'"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'nextCal\',this.value)"></label>'
        +'<label>剩余<span class="tag '+cls+'">'+(d===null?"—":(d<0?Math.abs(d)+" 天前":d+" 天"))+'</span></label>'
        +'<label>周期(月)<input type="number" value="'+esc(r.cycle)+'"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'cycle\',this.value)"></label>'
        +'<label>类型<select onchange="Ledger.setCell(\'equip\','+i+',\'type\',this.value)">'
        +opts(["强制检定","内部校准","非计量设备"], r.type)+'</select></label>'
        +'<label>状态<select onchange="Ledger.setCell(\'equip\','+i+',\'status\',this.value)">'
        +opts(["在用","维修中","停用","报废"], r.status)+'</select></label>'
        +'<label class="wide">溯源证书号<input type="text" value="'+esc(r.cert||"")+'"'
        +' oninput="Ledger.setCell(\'equip\','+i+',\'cert\',this.value)"></label>'
        +'</div>';
    },
    /* 派生：改「上次校准」或「周期」→ 自动算「下次校准」 */
    derive:function(r, rs, key){
      if(r.lastCal && r.cycle && !r.nextCal){
        r.nextCal = addMonths(r.lastCal, parseInt(r.cycle)||12);
      }
    },
    /* 剩余天数（只读显示） */
    rowClass:function(r){
      var d = daysTo(r.nextCal);
      if(d===null) return "";
      if(d<0) return "bad";
      if(d<=60) return "warn";
      return "";
    },
    summary:function(rs){
      var over = rs.filter(function(e){ var d=daysTo(e.nextCal); return d!==null&&d<0; });
      var soon = rs.filter(function(e){ var d=daysTo(e.nextCal); return d!==null&&d>=0&&d<=60; });
      var noCert = rs.filter(function(e){ return !e.cert; });
      return [
        {k:"设备总数", v:rs.length, d:"在用 "+rs.filter(function(e){return e.status==="在用";}).length+" 台"},
        {k:"已超期", v:over.length, d:over.length?"不得用于出报告的数据":"无", cls:over.length?"hi":""},
        {k:"60 天内到期", v:soon.length, d:"提前约检，别等超期", cls:soon.length?"hi":""},
        {k:"缺溯源证书", v:noCert.length, d:"关键设备 "+rs.filter(function(e){return e.critical;}).length+" 台", cls:noCert.length?"hi":""}
      ];
    },
    exportNote:"剩余天数 = 下次校准日期 − 今天（负数表示已超期）。关键设备需在两次校准之间做期间核查。"
  });

  /* ================================================================
     ② 试剂与危化品
     ================================================================ */
  L.register({
    key:"reagent",
    cardMode:true,
    title:"试剂、耗材与标准物质台账",
    subtitle:"按 GB 30000.1 分类；标准物质看证书有效期",
    exportName:"试剂与危化品台账",
    seed: seedOf("reagent"),
    hint:"改「有效期」→ 预警自动重算",
    notice:"<b>剧毒标准物质（如黄曲霉毒素 M1）</b>要双人双锁、领用精确到 μg、台账可追溯 —— 这一条也是 JSA 里的红线。",
    columns:[
      {k:"id",   label:"编号", w:76, ro:true},
      {k:"name", label:"名称", w:200},
      {k:"cas",  label:"CAS号", w:110},
      {k:"grade",label:"级别", w:100, ph:"如 分析纯"},
      {k:"spec", label:"规格", w:100},
      {k:"qty",  label:"库存量", w:76, type:"number"},
      {k:"unit", label:"单位", w:60},
      {k:"location",label:"储存位置", w:130},
      {k:"hazard",label:"危险品", w:110, type:"select",
       opts:["无","易燃液体","氧化剂","腐蚀品","毒害品","压缩气体","易制毒","易燃液体 毒性"]},
      {k:"hazardClass",label:"GB 30000.1 类别", w:100, ph:"如 ①④"},
      {k:"maker",label:"生产厂家", w:130},
      {k:"prodNo",label:"批号", w:120},
      {k:"mfgDate",label:"配制日", w:104, type:"date"},
      {k:"expiry",label:"有效期", w:104, type:"date"},
      {k:"owner",label:"责任人", w:80},
      {k:"status",label:"状态", w:86, type:"select", opts:["在库","已领用","待用完","作废","已废弃"]},
      {k:"cert", label:"标准物质证书", w:120, ph:"CRM 编号（标准物质填）"}
    ],
    rowClass:function(r){
      var d = daysTo(r.expiry);
      if(d===null) return "";
      if(d<0) return "bad";
      if(d<=60) return "warn";
      return "";
    },
    summary:function(rs){
      var exp = rs.filter(function(r){ var d=daysTo(r.expiry); return d!==null&&d<60; });
      var haz = rs.filter(function(r){ return r.hazard && r.hazard!=="无"; });
      var noCert = rs.filter(function(r){ return /标准|CRM/.test(r.name||"") && !r.cert; });
      return [
        {k:"试剂在库", v:rs.length, d:"含标准物质"},
        {k:"60 天内到期", v:exp.length, d:exp.length?"过期须作废隔离":"无", cls:exp.length?"hi":""},
        {k:"危险品", v:haz.length, d:"按 GB 30000.1 分区存放"},
        {k:"自配试剂", v:rs.filter(function(r){return r.isPrepared||/配制/.test(r.maker||"");}).length, d:"按配制日算效期"}
      ];
    },
    exportNote:"危险品分类依据 GB 30000.1（GB 13690-2009 已于 2025-08-01 废止）。过期试剂应贴「作废」标签移入废弃区，不得退回货架。"
  });

  /* ================================================================
     ③ 样品与留样
     ================================================================ */
  L.register({
    key:"sample",
    cardMode:true,
    title:"样品与留样台账",
    subtitle:"留样是复检、投诉调查唯一的物证 —— 找不到就等于没有证据",
    exportName:"样品与留样台账",
    seed: seedOf("sample"),
    hint:"改「留样到期」→ 到期提醒自动重算",
    notice:"<b>留存期限</b>：GB 14881 要求样品保存至保质期满后 6 个月；"
         + "涉及争议时按合同与法规孰严者执行。",
    columns:[
      {k:"id",   label:"样品编号", w:118, ro:true},
      {k:"name", label:"样品名称", w:210},
      {k:"cat",  label:"类别", w:88, type:"select",
       opts:["婴配成品","全脂乳粉","乳清粉","调制乳粉","包材","液态乳","其他"]},
      {k:"batch",label:"生产批号", w:116},
      {k:"maker",label:"委托单位", w:130},
      {k:"prodDate",label:"生产日期", w:104, type:"date"},
      {k:"recvDate",label:"收样日期", w:104, type:"date"},
      {k:"qty",  label:"来样数量", w:80},
      {k:"status",label:"检验状态", w:96, type:"select",
       opts:["受理","检验中","复检中","已检验","已退回","已销毁"]},
      {k:"testNo",label:"检验报告号", w:116},
      {k:"result",label:"结论", w:80, type:"select", opts:["待定","合格","不合格"]},
      {k:"retainPos",label:"留样位置", w:140},
      {k:"retainQty",label:"留样量", w:80},
      {k:"retainUntil",label:"留样到期", w:104, type:"date"},
      {k:"note", label:"备注", w:180, type:"textarea"}
    ],
    rowClass:function(r){
      var d = daysTo(r.retainUntil);
      if(d===null) return "";
      if(d<0) return "warn";
      if(d<90) return "warn";
      return "";
    },
    summary:function(rs){
      var due = rs.filter(function(s){ var d=daysTo(s.retainUntil); return d!==null&&d<90&&d>=0; });
      var doing = rs.filter(function(s){ return s.status==="检验中"||s.status==="复检中"; });
      var covered = rs.filter(function(s){ return s.retainQty; }).length;
      return [
        {k:"在库样品", v:rs.length, d:new Set(rs.map(function(s){return s.cat;})).size+" 个类别"},
        {k:"90 天内留样到期", v:due.length, d:due.length?"需处置":"无", cls:due.length?"hi":""},
        {k:"检验中", v:doing.length, d:"含复检", cls:doing.length?"hi":""},
        {k:"留样覆盖率", v:Math.round(covered/(rs.length||1)*100), unit:"%", d:covered+" / "+rs.length+" 份有留样"}
      ];
    },
    exportNote:"留样到期前 30 天应提醒处置；处置需双人确认并留存销毁记录。"
  });

  /* ================================================================
     ④ 试剂配制记录
     ================================================================ */
  L.register({
    key:"prep",
    cardMode:true,
    title:"试剂配制记录",
    subtitle:"配制的试剂有自己的配制日、效期、浓度确认与标定人",
    exportName:"试剂配制记录",
    seed: seedOf("prep"),
    hint:"改「配制日」或「有效期」→ 状态自动重算",
    notice:"实验室最常见的争议是「这瓶标液谁配的、准不准」—— "
         + "配制记录要能追溯到人、到浓度确认、到所用的标准物质证书。",
    columns:[
      {k:"no",   label:"记录号", w:100, ro:true},
      {k:"name", label:"试剂名称", w:230},
      {k:"spec", label:"规格浓度", w:130},
      {k:"form", label:"依据方法", w:130, ph:"如 GB/T 6026"},
      {k:"mat",  label:"原料", w:180},
      {k:"calc", label:"配制计算式", w:260, type:"textarea"},
      {k:"vol",  label:"配制体积", w:90},
      {k:"date", label:"配制日期", w:104, type:"date"},
      {k:"exp",  label:"有效期至", w:104, type:"date"},
      {k:"store",label:"存放位置", w:150},
      {k:"base", label:"配制方法要点", w:220, type:"textarea"},
      {k:"conc", label:"标定浓度", w:110, ph:"如 0.04987 mol/L"},
      {k:"std",  label:"标定结果", w:200, type:"textarea"},
      {k:"maker",label:"配制人", w:80},
      {k:"checker",label:"复核人", w:80},
      {k:"status",label:"状态", w:96, type:"select", opts:["在用","即将到期","已过期","已废弃"]},
      {k:"use",  label:"用途", w:170}
    ],
    rowClass:function(r){
      var d = daysTo(r.exp);
      if(d===null) return "";
      if(d<0) return "bad";
      if(d<=14) return "warn";
      return "";
    },
    summary:function(rs){
      var exp = rs.filter(function(r){ var d=daysTo(r.exp); return d!==null&&d<14; });
      var noChk = rs.filter(function(r){ return !r.checker; });
      return [
        {k:"配制记录", v:rs.length, d:"含标准溶液与工作液"},
        {k:"14 天内到期", v:exp.length, d:exp.length?"到期须重配":"无", cls:exp.length?"hi":""},
        {k:"缺复核人", v:noChk.length, d:"配制必须双人", cls:noChk.length?"hi":""},
        {k:"标准溶液", v:rs.filter(function(r){return /标准溶液/.test(r.name||"");}).length, d:"需标定"}
      ];
    },
    exportNote:"配制人 + 复核人是双人控制，缺一不可。标准溶液须标定并记录极差。"
  });

  /* ================================================================
     ⑤ 检验委托单台账
     ================================================================ */
  L.register({
    key:"orders",
    cardMode:true,
    title:"检验委托单台账",
    subtitle:"受理 → 在检 → 待复核 → 已出报告，每一步都要有交接人",
    exportName:"检验委托单台账",
    seed: seedOf("orders"),
    hint:"改「状态」→ 统计与待复核清单自动变",
    notice:"样品丢了要能查谁经手过 —— 交接人和时间必须记。<b>加急件</b>要提前排产，别等到报告日才发现来不及。",
    columns:[
      {k:"no",   label:"委托单号", w:112, ro:true},
      {k:"recv", label:"收样日期", w:104, type:"date"},
      {k:"client",label:"委托单位", w:130},
      {k:"sample",label:"样品名称", w:210},
      {k:"batch",label:"批号", w:110},
      {k:"qty",  label:"数量", w:70},
      {k:"items",label:"检验项目", w:280, type:"textarea"},
      {k:"urgent",label:"加急", w:60, type:"check", def:false},
      {k:"status",label:"状态", w:96, type:"select",
       opts:["受理","在检","待复核","已出报告","已取消"]},
      {k:"receiver",label:"收样人", w:80},
      {k:"tester",label:"检验人", w:80},
      {k:"reviewer",label:"复核人", w:80},
      {k:"recvTime",label:"收样时间", w:140, ph:"2026-09-01 09:12"},
      {k:"testStart",label:"开检时间", w:140},
      {k:"reportDate",label:"报告日期", w:104, type:"date"},
      {k:"reportNo",label:"报告编号", w:116},
      {k:"price",label:"收费(元)", w:92, type:"number"},
      {k:"remark",label:"备注", w:180, type:"textarea"}
    ],
    rowClass:function(r){
      if(r.urgent && r.status!=="已出报告") return "warn";
      if(r.status==="待复核") return "";
      return "";
    },
    summary:function(rs){
      var doing = rs.filter(function(o){ return o.status==="在检"||o.status==="受理"; });
      var wait  = rs.filter(function(o){ return o.status==="待复核"; });
      var urg   = rs.filter(function(o){ return o.urgent && o.status!=="已出报告"; });
      var rev   = rs.filter(function(o){ return o.status==="已出报告"; });
      return [
        {k:"在办委托", v:doing.length, d:"受理 + 在检"},
        {k:"待复核", v:wait.length, d:"数据已出等签字", cls:wait.length?"hi":""},
        {k:"加急件", v:urg.length, d:urg.length?"要优先排产":"无", cls:urg.length?"hi":""},
        {k:"已出报告", v:rev.length, d:"累计收费 "+(rev.reduce(function(s,o){return s+(+o.price||0);},0)/10000).toFixed(1)+" 万元"}
      ];
    },
    exportNote:"状态流转：受理 → 在检 → 待复核 → 已出报告。报告编号与检验委托单号一一对应。"
  });

  /* ================================================================
     ⑥ 不符合工作与 CAPA
     ================================================================ */
  L.register({
    key:"capa",
    cardMode:true,
    title:"不符合工作与 CAPA",
    subtitle:"CNAS 要求：不符合要做原因分析、纠正措施、有效性验证",
    exportName:"不符合工作与 CAPA台账",
    seed: seedOf("capa"),
    hint:"改「状态」→ 闭环率与未闭环清单自动变",
    notice:"<b>闭环链条</b>：发现 → 原因分析 → 措施 → 落实 → 有效性验证 → 关闭。"
         + "只有「已关闭」才算闭环；改状态时若缺有效性验证结论会提示。",
    columns:[
      {k:"no",   label:"编号", w:108, ro:true},
      {k:"date", label:"发现日期", w:104, type:"date"},
      {k:"src",  label:"来源", w:100, type:"select",
       opts:["QC 超限","客户投诉","设备","记录","留样","环境","方法","其他"]},
      {k:"item", label:"不符合描述", w:280, type:"textarea"},
      {k:"level",label:"严重程度", w:88, type:"select", opts:["低","中","高"]},
      {k:"impact",label:"影响范围", w:220, type:"textarea"},
      {k:"cause",label:"原因分析", w:280, type:"textarea"},
      {k:"action",label:"纠正措施", w:300, type:"textarea"},
      {k:"owner",label:"责任人", w:80},
      {k:"due",  label:"计划完成", w:104, type:"date"},
      {k:"fixDate",label:"落实日期", w:104, type:"date"},
      {k:"verifyDate",label:"验证日期", w:104, type:"date"},
      {k:"verify",label:"有效性验证结论", w:260, type:"textarea"},
      {k:"status",label:"状态", w:92, type:"select",
       opts:["待分析","整改中","待验证","已关闭","已作废"]},
      {k:"close",label:"关闭日期", w:104, type:"date"},
      {k:"note", label:"备注", w:180, type:"textarea"}
    ],
    rowClass:function(r){
      if(r.level==="高" && r.status!=="已关闭") return "bad";
      if(r.status==="待验证") return "warn";
      return "";
    },
    summary:function(rs){
      var closed = rs.filter(function(c){ return c.status==="已关闭"; });
      var open   = rs.filter(function(c){ return c.status!=="已关闭" && c.status!=="已作废"; });
      var high   = open.filter(function(c){ return c.level==="高"; });
      var noCause= rs.filter(function(c){ return c.status!=="已关闭" && !c.cause; });
      return [
        {k:"NC 总数", v:rs.length, d:"本年度累计"},
        {k:"闭环率", v:Math.round(closed.length/(rs.length||1)*100), unit:"%", d:closed.length+" / "+rs.length+" 已关闭"},
        {k:"未闭环", v:open.length, d:open.length?"需跟进":"全部闭环", cls:open.length?"hi":""},
        {k:"高风险未闭环", v:high.length, d:high.length?"必须最高管理者关注":"无", cls:high.length?"hi":""}
      ];
    },
    exportNote:"高风险不符合项必须由最高管理者批准；「已关闭」需有有效性验证结论支撑。"
  });

  /* ================================================================
     ⑦ 人员排班与工作量
     ================================================================ */
  L.register({
    key:"schedule",
    title:"人员排班与工作量",
    subtitle:"谁在做哪批、忙闲如何、加班多少",
    exportName:"人员排班表",
    seed: seedOf("schedule"),
    hint:"改「负荷」或「加班」→ 产能统计自动变",
    notice:"<b>交叉培训</b>要求：关键项目至少 2 人会做 —— 排班时要避免「只有一个人会」的单点。"
         + "长期加班是人员流失的前兆，排班表要看得出来。",
    columns:[
      {k:"week", label:"周次", w:104, ro:true},
      {k:"person",label:"人员", w:88},
      {k:"role", label:"岗位", w:130},
      {k:"days", label:"出勤日", w:110, ph:"如 一~五"},
      {k:"hours",label:"工时", w:76, type:"number"},
      {k:"orders",label:"承担批次", w:280, type:"textarea"},
      {k:"load", label:"负荷", w:78, type:"select", opts:["轻","中","重","超载"]},
      {k:"overtime",label:"加班(h)", w:86, type:"number"},
      {k:"note", label:"备注", w:180, type:"textarea"}
    ],
    rowClass:function(r){
      if(r.load==="超载") return "bad";
      if(r.load==="重") return "warn";
      return "";
    },
    summary:function(rs){
      var ot = rs.reduce(function(s,r){ return s+(+r.overtime||0); }, 0);
      var heavy = rs.filter(function(r){ return r.load==="重"||r.load==="超载"; });
      var people = new Set(rs.map(function(r){ return r.person; })).size;
      return [
        {k:"在册人员", v:people, d:"本周排班人数"},
        {k:"重负荷人次", v:heavy.length, d:"重 + 超载", cls:heavy.length?"hi":""},
        {k:"加班合计", v:ot, unit:"h", d:ot>40?"偏高，注意疲劳":"在合理范围", cls:ot>40?"hi":""},
        {k:"平均工时", v:Math.round(rs.reduce(function(s,r){return s+(+r.hours||0);},0)/(rs.length||1)), unit:"h", d:"人均每周"}
      ];
    },
    exportNote:"负荷用于产能平衡，加班小时数应纳入职业健康与安全管理。"
  });

  /* ================================================================
     ⑧ 样品出入库与物流
     ================================================================ */
  L.register({
    key:"flows",
    cardMode:true,
    title:"样品出入库与物流",
    subtitle:"样品从进门到出门，每一步都要有人签字",
    exportName:"样品出入库记录",
    seed: seedOf("flows"),
    hint:"改「类型」或「状态」→ 统计自动变",
    notice:"<b>销毁要审批</b>：留样销毁必须双人确认并留存记录 —— 这是评审必查项。",
    columns:[
      {k:"no",   label:"记录号", w:104, ro:true},
      {k:"time", label:"时间", w:140, ph:"2026-09-01 09:12"},
      {k:"type", label:"类型", w:80, type:"select", opts:["入库","出库","转存","销毁","退样"]},
      {k:"sample",label:"样品", w:250},
      {k:"batch",label:"批号", w:110},
      {k:"qty",  label:"数量", w:72},
      {k:"from", label:"来源", w:190},
      {k:"to",   label:"去向", w:190},
      {k:"reason",label:"事由", w:200},
      {k:"handler",label:"经办人", w:80},
      {k:"receiver",label:"接收人", w:80},
      {k:"status",label:"状态", w:88, type:"select", opts:["已入库","已转存","已寄出","待审批","已销毁"]}
    ],
    rowClass:function(r){
      if(r.status==="待审批") return "warn";
      return "";
    },
    summary:function(rs){
      var pending = rs.filter(function(f){ return f.status==="待审批"; });
      var out = rs.filter(function(f){ return f.type==="出库"; });
      var destroy = rs.filter(function(f){ return f.type==="销毁"; });
      return [
        {k:"流转记录", v:rs.length, d:"入库 + 出库 + 转存 + 销毁"},
        {k:"待审批销毁", v:pending.length, d:pending.length?"需双人确认":"无", cls:pending.length?"hi":""},
        {k:"累计出库", v:out.length, d:"含退样与复测"},
        {k:"销毁记录", v:destroy.length, d:"留样处置"}
      ];
    },
    exportNote:"销毁记录须双人签字；出库须记录承运方与运单号。"
  });

  /* ================================================================
     ⑨ 内审检查表
     ================================================================ */
  L.register({
    key:"audit",
    cardMode:true,
    title:"内部审核检查表",
    subtitle:"按 CNAS-CL01 条款逐条自查 —— 条款 × 证据 的对照",
    exportName:"内审检查表",
    seed: seedOf("audit"),
    hint:"改「结论」→ 符合率与不符合项清单自动变",
    notice:"<b>不符合项必须转成 NC</b> —— 内审发现的问题不进不符合工作台账，等于没发现。",
    columns:[
      {k:"no",   label:"条款号", w:88, ro:true},
      {k:"clause",label:"条款", w:110},
      {k:"item", label:"审核要点", w:180},
      {k:"obj",  label:"审核对象", w:240, type:"textarea"},
      {k:"evidence",label:"审核证据", w:220, type:"textarea"},
      {k:"method",label:"审核方法", w:120},
      {k:"result",label:"结论", w:90, type:"select", opts:["符合","基本符合","不符合","不适用"]},
      {k:"finding",label:"不符合项描述", w:300, type:"textarea"},
      {k:"owner",label:"责任人", w:80},
      {k:"date", label:"审核日期", w:104, type:"date"}
    ],
    rowClass:function(r){
      if(r.result==="不符合") return "bad";
      if(r.result==="基本符合") return "warn";
      return "";
    },
    summary:function(rs){
      var ok  = rs.filter(function(a){ return a.result==="符合"; });
      var bad = rs.filter(function(a){ return a.result==="不符合"; });
      var ba  = rs.filter(function(a){ return a.result==="基本符合"; });
      var noFind = bad.filter(function(a){ return !a.finding; });
      return [
        {k:"审核条款", v:rs.length, d:new Set(rs.map(function(a){return a.clause;})).size+" 个条款组"},
        {k:"符合率", v:Math.round(ok.length/(rs.length||1)*100), unit:"%", d:ok.length+" 条完全符合", cls:(bad.length+ba.length)?"hi":""},
        {k:"不符合项", v:bad.length, d:bad.length?"须转 NC 台账":"无", cls:bad.length?"hi":""},
        {k:"基本符合", v:ba.length, d:"需持续改进"}
      ];
    },
    exportNote:"内审不符合项应 3 个工作日内转入不符合工作（NC）台账跟踪闭环。"
  });

  /* ================================================================
     ⑩ 环境与洁净区监控
     ================================================================ */
  L.register({
    key:"env",
    title:"环境与洁净区监控记录",
    subtitle:"实验室环境不是「感觉还行」—— 要有记录、有趋势、有报警",
    exportName:"环境监控记录",
    seed: seedOf("env"),
    hint:"改温度或状态 → 超限统计自动变",
    notice:"<b>限值参考</b>：一般实验室区 18~28℃、相对湿度 45%~75%；"
         + "洁净区按相应等级要求；易燃溶剂储存区建议 ≤25℃。",
    columns:[
      {k:"date", label:"日期", w:104, type:"date"},
      {k:"zone", label:"区域", w:150},
      {k:"temp", label:"温度(℃)", w:88, type:"number"},
      {k:"humid",label:"湿度(%)", w:86, type:"number"},
      {k:"press",label:"压差", w:90, ph:"如 -12 Pa"},
      {k:"clean",label:"洁净度", w:110, ph:"如 ISO 7 级"},
      {k:"status",label:"判定", w:86, type:"select", opts:["合格","关注","超限"]},
      {k:"note", label:"异常说明与处置", w:280, type:"textarea"},
      {k:"by",   label:"记录人", w:80}
    ],
    rowClass:function(r){
      if(r.status==="超限") return "bad";
      if(r.status==="关注") return "warn";
      return "";
    },
    summary:function(rs){
      var bad = rs.filter(function(e){ return e.status==="超限"; });
      var wat = rs.filter(function(e){ return e.status==="关注"; });
      var zones = new Set(rs.map(function(e){return e.zone;})).size;
      return [
        {k:"监控区域", v:zones, d:rs.length+" 条记录"},
        {k:"超限", v:bad.length, d:bad.length?"须开 NC 并追溯":"无", cls:bad.length?"hi":""},
        {k:"关注", v:wat.length, d:"接近限值", cls:wat.length?"hi":""},
        {k:"合格率", v:Math.round((rs.length-bad.length)/(rs.length||1)*100), unit:"%", d:"超限即扣"}
      ];
    },
    exportNote:"环境记录应连续、不可补记；超限须立即处置并评估对已出数据的影响。"
  });

  /* ================================================================
     ⑭ 检测能力矩阵（也挂到 ledger 上，便于统一导出与备份）
     ================================================================
     这个表有专门的视图（labbench.js 的 viewCapability），
     但数据源统一放 ledger，避免两处各存一份。
     ================================================================ */
  L.register({
    key:"capability",
    title:"检测能力矩阵",
    subtitle:"能测什么 · 什么方法 · 多久 · 多少钱 · 谁做",
    exportName:"检测能力矩阵",
    seed: seedOf("capability"),
    word:true,
    columns:[
      {k:"item", label:"检测项目", w:130},
      {k:"method",label:"检验方法", w:240},
      {k:"cat",  label:"类别", w:90},
      {k:"days", label:"周期(天)", w:80, type:"number"},
      {k:"price",label:"参考报价", w:110},
      {k:"acc",  label:"强制性", w:120},
      {k:"staffName",label:"主检人", w:90}
    ],
    summary:function(rs){
      return [
        {k:"可检项目", v:rs.length, d:new Set(rs.map(function(c){return c.cat;})).size+" 个类别"},
        {k:"强制项目", v:rs.filter(function(c){return /强制/.test(c.acc||"");}).length, d:"国标强制判定"},
        {k:"平均周期", v:(rs.reduce(function(s,c){return s+(+c.days||0);},0)/(rs.length||1)).toFixed(1), unit:"天", d:"含前处理与复核"},
        {k:"最快出报告", v:Math.min.apply(null,rs.map(function(c){return +c.days||99;})), unit:"天", d:"计算项等"}
      ];
    },
    exportNote:"报价与周期为行业常见区间，仅供报价参考；强制性依据对应国标。"
  });

  /* ================================================================
     ⑪ 质量控制方案
     ================================================================ */
  L.register({
    key:"qcplan",
    cardMode:true,
    title:"质量控制方案",
    subtitle:"每个检测项目该做哪些 QC：空白查本底 · 平行样查精密度 · 加标查准确度 · 标准物质查准确度",
    exportName:"质量控制方案",
    seed: seedOf("qcplan"),
    hint:"改「判定标准」或「责任人」→ 统计自动变",
    notice:"<b>QC 不是可选项</b> —— 没做 QC 的数据在评审时等于没有数据。"
         + "本表给出每个项目的 QC 组合与判定标准，照着执行即可。",
    columns:[
      {k:"id",   label:"编号", w:80, ro:true},
      {k:"item", label:"检测项目", w:150},
      {k:"method",label:"检验方法", w:180},
      {k:"itemCat",label:"类别", w:120},
      {k:"blank",label:"空白试验", w:90},
      {k:"dup",  label:"平行样", w:120},
      {k:"spike",label:"加标回收", w:90},
      {k:"refMat",label:"标准物质", w:100},
      {k:"criteria",label:"判定标准", w:250, type:"textarea"},
      {k:"critHigh",label:"超限条件", w:220, type:"textarea"},
      {k:"owner",label:"责任人", w:80},
      {k:"freq", label:"频次", w:80}
    ],
    summary:function(rs){
      var noCrit = rs.filter(function(r){ return !r.criteria; });
      return [
        {k:"QC 方案", v:rs.length, d:new Set(rs.map(function(r){return r.itemCat;})).size+" 个类别"},
        {k:"每批必做", v:rs.filter(function(r){return /每批/.test(r.freq||"");}).length, d:"空白 + 平行样"},
        {k:"标准物质覆盖", v:rs.filter(function(r){return r.refMat && r.refMat!=="不适用";}).length, d:"定期核对准确度"},
        {k:"缺判定标准", v:noCrit.length, d:"没标准就没法判", cls:noCrit.length?"hi":""}
      ];
    },
    exportNote:"判定标准须量化（回收率范围、相对偏差限值），不能写「正常」。"
  });

  /* ================================================================
     ⑫ 质量控制执行记录
     ================================================================ */
  L.register({
    key:"qcrec",
    cardMode:true,
    title:"质量控制执行记录",
    subtitle:"每次 QC 的实际数据 —— 超限必须有处置与闭环",
    exportName:"质量控制记录",
    seed: seedOf("qcrec"),
    hint:"改「判定」→ 超限数与合格率自动变",
    notice:"<b>QC 超限的处理：</b>① 暂停出报告；② 排查原因（试剂/器皿/人员/仪器）；"
         + "③ 受影响批次数据作废重做；④ 措施落实后复测；⑤ 连续 3 批合格才算闭环。",
    columns:[
      {k:"id",    label:"记录号", w:110, ro:true},
      {k:"planId",label:"方案编号", w:90},
      {k:"date",  label:"日期", w:104, type:"date"},
      {k:"item",  label:"检测项目", w:110},
      {k:"batch", label:"批次", w:150},
      {k:"blank", label:"空白", w:120},
      {k:"dup",   label:"平行样", w:110},
      {k:"spike", label:"加标回收", w:110},
      {k:"refMat",label:"标准物质", w:130},
      {k:"verdict",label:"判定", w:80, type:"select", opts:["合格","超限","待复核"]},
      {k:"by",    label:"执行人", w:80},
      {k:"note",  label:"处置与闭环说明", w:280, type:"textarea"}
    ],
    rowClass:function(r){
      if(r.verdict==="超限") return "bad";
      if(r.verdict==="待复核") return "warn";
      return "";
    },
    summary:function(rs){
      var bad = rs.filter(function(r){ return r.verdict==="超限"; });
      var noNote = bad.filter(function(r){ return !r.note; });
      var ok = rs.length-bad.length;
      return [
        {k:"执行记录", v:rs.length, d:"近 30 天"},
        {k:"超限", v:bad.length, d:bad.length?"须闭环":"无", cls:bad.length?"hi":""},
        {k:"超限未写处置", v:noNote.length, d:"必须写处置过程", cls:noNote.length?"hi":""},
        {k:"合格率", v:Math.round(ok/(rs.length||1)*100), unit:"%", d:ok+" / "+rs.length}
      ];
    },
    exportNote:"超限项须在「处置与闭环说明」中写明：原因、影响批次、重做结果、复测结果。"
  });

  /* ================================================================
     ⑬ 能力验证与实验室间比对
     ================================================================ */
  L.register({
    key:"pt",
    cardMode:true,
    title:"能力验证与实验室间比对",
    subtitle:"CNAS 要求参加能力验证；这是客户审厂必查项",
    exportName:"能力验证记录",
    seed: seedOf("pt"),
    hint:"改「结果」→ 满意率统计自动变",
    notice:"<b>可疑值不等于失败</b>，但必须做原因分析并留档 —— 客户审厂会问"
         + "「可疑值你们查了吗、为什么」。",
    columns:[
      {k:"id",   label:"编号", w:110, ro:true},
      {k:"year", label:"年份", w:66, type:"number"},
      {k:"name", label:"名称", w:210},
      {k:"org",  label:"组织方", w:180},
      {k:"cat",  label:"类别", w:90},
      {k:"items",label:"项目", w:200, type:"textarea"},
      {k:"planDate",label:"计划日期", w:104, type:"date"},
      {k:"recvDate",label:"收样日期", w:104, type:"date"},
      {k:"reportDate",label:"报告日期", w:104, type:"date"},
      {k:"result",label:"结果", w:110, type:"select", opts:["满意","可疑","不满意","待出"]},
      {k:"status",label:"状态", w:90, type:"select", opts:["计划中","进行中","已出报告","已取消"]},
      {k:"reportNo",label:"报告编号", w:120},
      {k:"note", label:"说明 / 原因分析", w:260, type:"textarea"}
    ],
    rowClass:function(r){
      if(r.result==="不满意") return "bad";
      if(r.result==="可疑") return "warn";
      return "";
    },
    summary:function(rs){
      var sat = rs.filter(function(p){ return p.result==="满意"; });
      var doubt = rs.filter(function(p){ return p.result==="可疑"||p.result==="不满意"; });
      var doing = rs.filter(function(p){ return p.status==="进行中"; });
      return [
        {k:"PT 计划", v:rs.length, d:"含实验室间比对"},
        {k:"满意", v:sat.length, d:"外部能力证明"},
        {k:"可疑/不满意", v:doubt.length, d:doubt.length?"须做原因分析":"无", cls:doubt.length?"hi":""},
        {k:"进行中", v:doing.length, d:doing.length?doing[0].name:"无"}
      ];
    },
    exportNote:"可疑值需在「说明」中记录原因分析结论与采取的纠正措施。"
  });


  /* ================================================================
     联动关系
     ================================================================
     设备改了 → 检测能力矩阵里依赖它的项目要提示
     样品改了 → 留样到期提醒变
     CAPA 关了 → 未闭环数变
     环境超限 → 应该提示开 NC
     ================================================================ */

  /* 设备超期 → 能力矩阵联动 */
  L.on("equip", function(rs){
    var bad = {};
    rs.forEach(function(e){
      var d = daysTo(e.nextCal);
      if(d!==null && d<0) bad[e.id] = e;
    });
    global.LAB_EQ_OVERDUE = bad;
    if(global.LAB && global.LAB.onEquipChange) global.LAB.onEquipChange(bad);
  });

  /* CAPA 关闭 → 联动 */
  L.on("capa", function(rs){
    if(global.LAB && global.LAB.onCapaChange) global.LAB.onCapaChange(rs);
  });

  /* 环境超限 → 提示开 NC */
  L.on("env", function(rs){
    if(global.LAB && global.LAB.onEnvChange) global.LAB.onEnvChange(rs);
  });

  /* QC 超限 → 检查 CAPA 台账里有没有对应的不符合项
     ★ 这是最实用的联动：QC 超了，要看有没有 NC 跟上来 ★ */
  L.on("qcrec", function(rs){
    var bad = rs.filter(function(r){ return r.verdict==="超限"; });
    if(!bad.length) return;
    var capa = L.rows("capa");
    var open = capa.filter(function(c){ return c.status!=="已关闭" && c.status!=="已作废"; });
    /* 已有的对应 NC（按批次或项目名匹配） */
    var covered = bad.filter(function(b){
      return capa.some(function(c){
        var t = (c.item||"")+(c.impact||"");
        return t.indexOf(b.batch)>=0 || t.indexOf(b.item)>=0;
      });
    });
    global.LAB_QC_GAP = { bad:bad, covered:covered, openCapa:open };
    if(global.LAB && global.LAB.onQcChange) global.LAB.onQcChange(global.LAB_QC_GAP);
  });

  /* 样品流转 → 留样位置联动
     转存到「留样柜」→ 样品台账的留样位置跟着变 */
  L.on("flows", function(rs){
    var moves = rs.filter(function(f){
      return f.type==="转存" && /留样/.test(f.to||"");
    });
    if(!moves.length) return;
    var samples = L.rows("sample");
    var changed = 0;
    moves.forEach(function(m){
      samples.forEach(function(s){
        if(s.batch && m.batch && s.batch===m.batch){
          if(s.retainPos !== m.to){ s.retainPos = m.to; changed++; }
        }
      });
    });
    if(changed) L.save("sample");
    if(global.LAB && global.LAB.onFlowsChange) global.LAB.onFlowsChange(moves, changed);
  });

  /* 内审不符合 → 检查 CAPA */
  L.on("audit", function(rs){
    var bad = rs.filter(function(a){ return a.result==="不符合"; });
    if(!bad.length) return;
    var capa = L.rows("capa");
    var noNc = bad.filter(function(a){
      return !capa.some(function(c){
        var t = (c.item||"")+(c.source||"")+(c.note||"");
        return t.indexOf(a.item)>=0 || t.indexOf(a.clause)>=0;
      });
    });
    global.LAB_AUDIT_GAP = { bad:bad, noNc:noNc };
    if(global.LAB && global.LAB.onAuditChange) global.LAB.onAuditChange(global.LAB_AUDIT_GAP);
  });

})(window);
