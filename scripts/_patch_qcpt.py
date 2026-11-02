# -*- coding: utf-8 -*-
"""把质量控制与能力验证也改成 ledger 台账（可编辑 + 可导入导出）。

QC 保留「超限闭环」专门视图，但方案与记录本身可编辑；
PT 改为纯 ledger 台账。
"""
import io

# ------------------------------------------------------------------
# 1) labledger.js：注册 qcplan / qcrec / pt 三个台账
# ------------------------------------------------------------------
P = "prototype/labledger.js"
t = io.open(P, encoding="utf-8").read()

anchor = """    /* ================================================================
       联动关系
       ================================================================ */"""
assert t.count(anchor) == 1, "联动段锚点没找到"

NEW = '''  /* ================================================================
     ⑪ 质量控制方案
     ================================================================ */
  L.register({
    key:"qcplan",
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
      var noStd = rs.filter(function(r){ return !r.refMat || r.refMat==="不适用"; });
      return [
        {k:"QC 方案", v:rs.length, d:new Set(rs.map(function(r){return r.itemCat;})).size+" 个类别"},
        {k:"每批必做", v:rs.filter(function(r){return /每批/.test(r.freq||"");}).length, d:"空白 + 平行样"},
        {k:"标准物质覆盖", v:rs.length-noStd.length, d:"每季/半年核对准确度"},
        {k:"方案缺判定标准", v:rs.filter(function(r){return !r.criteria;}).length, d:"没标准就没法判", cls:rs.filter(function(r){return !r.criteria;}).length?"hi":""}
      ];
    },
    exportNote:"判定标准须量化（回收率范围、相对偏差限值），不能写「正常」。
  });

  /* ================================================================
     ⑫ 质量控制执行记录
     ================================================================ */
  L.register({
    key:"qcrec",
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
      if(r.status==="进行中") return "";
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

''' + anchor

t = t.replace(anchor, NEW)
io.open(P, "w", encoding="utf-8").write(t)
print("labledger.js 已注册 qcplan / qcrec / pt")

# ------------------------------------------------------------------
# 2) labbench.js：QC 页签改成两个 ledger 台账 + PT 走 ledger
# ------------------------------------------------------------------
P2 = "prototype/labbench.js"
t2 = io.open(P2, encoding="utf-8").read()

old = '''    var LEDGER_TABS = ["equip","reagent","prep","sample","flows",
                       "orders","capa","audit","schedule","env"];'''
new = '''    var LEDGER_TABS = ["equip","reagent","prep","sample","flows","orders",
                       "capa","audit","schedule","env","qcplan","qcrec","pt"];'''
assert t2.count(old) == 1, "LEDGER_TABS 没找到"
t2 = t2.replace(old, new)

old2 = '''    if(TAB==="capability") host.innerHTML = viewCapability();
    else if(TAB==="qc")        host.innerHTML = viewQC();
    else if(TAB==="pt")        host.innerHTML = viewPT();
    else host.innerHTML = viewRecord();'''
new2 = '''    if(TAB==="capability") host.innerHTML = viewCapability();
    else host.innerHTML = viewRecord();'''
assert t2.count(old2) == 1, "渲染分发没找到"
t2 = t2.replace(old2, new2)

# 页签改成两个 QC
old3 = '''      ["qc",        "质量控制"],
      ["pt",        "能力验证"],'''
new3 = '''      ["qcplan",    "QC 方案"],
      ["qcrec",     "QC 记录"],'''
assert t2.count(old3) == 1, "QC 页签没找到"
t2 = t2.replace(old3, new3)

# PT 页签加回来
old4 = '''      ["qcplan",    "QC 方案"],
      ["qcrec",     "QC 记录"],'''
new4 = '''      ["qcplan",    "QC 方案"],
      ["qcrec",     "QC 记录"],
      ["pt",        "能力验证"],'''
t2 = t2.replace(old4, new4)

io.open(P2, "w", encoding="utf-8").write(t2)
print("labbench.js 已切换 QC/PT")
