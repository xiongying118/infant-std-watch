/* ================================================================
   labbench.js —— 实验室管理工具台（2026-11-01 新增）
   ================================================================
   实验室版块原来只有两个只读页（JSA + 方法原理），
   日常真正要管的东西一样都没有：
     · 设备校准到期了没人知道
     · 试剂过期还在用
     · 留样找不到 / 过期没处置
     · QC 超限没闭环
     · 客户问「你们能测什么」要翻半天才找到
     · 原始记录每次现编，格式各不相同

   这里补齐 7 个工具，都是台账型（能查、能算、能导出）：
     ① 检测能力矩阵   能测什么 · 什么方法 · 多久 · 多少钱
     ② 计量设备台账   校准到期预警 · 溯源证书 · 关键设备标记
     ③ 试剂与危化品   效期预警 · 危险品分类 · 配制试剂有效期
     ④ 样品与留样台账 留存期限 · 到期处置 · 双向追溯
     ⑤ 质量控制记录   空白/平行/加标/标准物质 · 超限项闭环
     ⑥ 能力验证记录   PT/比对 计划 · 结果 · 可疑值处置
     ⑦ 原始记录生成器 选方法 → 出记录表（可填可导出可打印）

   数据源：prototype/labdata.js（种子）＋ localStorage 覆盖（本机修改）
   ================================================================ */

(function (global) {
  "use strict";

  var TAB = "capability";     // capability | equip | reagent | sample | qc | pt | record
  var ST = {};                // 本机覆盖层
  var REC = null;             // 当前原始记录草稿

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
  function today(){
    var d=new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  function num(x){ var v=parseFloat(x); return isNaN(v)?null:v; }

  /* 取数据：优先 ledger 台账的当前数据（用户改过的），
     其次本机覆盖，最后种子数据。
     ★ 这条很关键：能力矩阵要显示设备超期，就必须读 ledger 里改过的设备，
       读种子数据就看不到用户的修改，联动等于没做。★ */
  var LEDGER_KEY = {
    EQUIPMENT:"equip", REAGENTS:"reagent", SAMPLES:"sample",
    QC_PLANS:"qcplan", QC_RECORDS:"qcrec", PT_PLANS:"pt",
    PREP:"prep", ORDERS:"orders", CAPA:"capa", SCHEDULE:"schedule",
    FLOWS:"flows", AUDIT:"audit", ENV:"env"
  };
  function data(key){
    var lk = LEDGER_KEY[key];
    if(lk && global.Ledger && global.Ledger._defs[lk]){
      return global.Ledger.rows(lk);
    }
    var ov = global.Store ? global.Store.get("lab."+key, null) : null;
    if(ov) return ov;
    return (global.LABDATA && global.LABDATA[key]) || [];
  }
  function saveData(key, arr){
    if(global.Store) global.Store.set("lab."+key, arr);
  }

  /* ================================================================
     渲染
     ================================================================ */
  function render(){
    var host = document.getElementById("labBody");
    if(!host) return;

    var TABS = [
      ["board",     "需要处理"],
      ["capability","检测能力矩阵"],
      ["equip",     "计量设备台账"],
      ["reagent",   "试剂与危化品"],
      ["prep",      "试剂配制记录"],
      ["sample",    "样品与留样"],
      ["flows",     "样品出入库"],
      ["orders",    "检验委托单"],
      ["qcplan",    "QC 方案"],
      ["qcrec",     "QC 记录"],
      ["pt",        "能力验证"],
      ["capa",      "不符合与 CAPA"],
      ["audit",     "内审检查表"],
      ["schedule",  "排班与工作量"],
      ["env",       "环境监控"],
      ["record",    "原始记录生成"],
    ];
    var el = document.getElementById("labTabs");
    if(el){
      var nb = linkBoard().length;
      el.innerHTML = TABS.map(function(t){
        var cnt = (t[0]==="board" && nb) ? `<span class="cnt">${nb}</span>` : "";
        return `<button class="tab ${TAB===t[0]?"on":""}" data-lab="${t[0]}">${t[1]}${cnt}</button>`;
      }).join("");
      [].forEach.call(el.querySelectorAll("button"), function(b){
        b.onclick = function(){ TAB = b.dataset.lab; render(); };
      });
    }
    var badge = document.getElementById("labBadge");
    if(badge) badge.textContent = global.LABDATA ? global.LABDATA.CAPABILITY.length : "—";

    /* ★ 走 ledger 框架的台账（可编辑 · 可导入 · 可导出 · 可联动）★
       顺序很重要：先让 Ledger 渲染台账，再把联动看板插到最前面。
       反过来会被 Ledger 的 innerHTML 赋值冲掉。 */
    var LEDGER_TABS = ["equip","reagent","prep","sample","flows","orders",
                       "capa","audit","schedule","env","qcplan","qcrec","pt"];
    if(TAB==="board"){ host.innerHTML = boardView(); return; }
    if(LEDGER_TABS.indexOf(TAB) >= 0){
      global.Ledger.render(TAB);
      return;
    }
    if(TAB==="capability"){ host.innerHTML = viewCapability(); }
    else host.innerHTML = viewRecord();
  }

  /* 「需要处理」独立页 —— 不再在每个台账页重复出现 */
  function boardView(){
    var board = linkBoard();
    var hi = board.filter(function(b){ return b.lvl==="高"; }).length;
    var mid = board.filter(function(b){ return b.lvl==="中"; }).length;
    var lo = board.filter(function(b){ return b.lvl==="低"; }).length;
    var head = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi hi"><div class="k">高优</div><div class="v">${hi}</div><div class="d">设备超期、环境超限这类必须马上处理</div></div>
      <div class="kpi"><div class="k">中</div><div class="v">${mid}</div><div class="d">内审不符合未转 NC、QC 超限未闭环</div></div>
      <div class="kpi"><div class="k">低</div><div class="v">${lo}</div><div class="d">留样到期、委托单积压</div></div>
      <div class="kpi"><div class="k">合计</div><div class="v">${board.length}</div><div class="d">台账之间互相牵动出来的</div></div>
    </div>`;
    if(!board.length){
      return head + `<div class="card empty">当前没有需要处理的事 —— 各台账之间没有发现互相牵动的问题。</div>`;
    }
    var html = board.map(function(b){
        return `<div class="alert a-${b.lvl==="高"?"high":(b.lvl==="中"?"mid":"low")}" style="margin-bottom:9px">
          <div class="h"><div class="t">${b.t}</div>
            <span class="tag ${b.lvl==="高"?"t-high":(b.lvl==="中"?"t-mid":"t-low")}">${b.lvl}</span>
            ${b.tab?`<span class="tag t-gray">${b.tab}</span>`:""}</div>
          <div class="kv">${b.d}</div>
          <div class="foot"><div class="sp" style="flex:1"></div>
            ${b.go?`<button class="btn sm" onclick="LAB.go(&quot;${b.go}&quot;)">去处理 →</button>`:""}
          </div></div>`;
      }).join("");
    return head + `<div class="card">
      <div class="card-h"><h3>需要处理</h3>
        <span class="muted">这些是台账之间互相牵动出来的，单看一个表看不出来</span></div>
      ${html}</div>`;
  }

  /* 旧版：把联动看板插到每个台账页最前面。
     2026-11-02 用户反馈「每个功能区都出现这个需要处理的，重复了」，
     改成独立的「需要处理」页签，这里只留函数不再调用。 */
  function prependBoard(host){
    var board = linkBoard();
    if(!board.length) return;
    var html = '<div class="card" style="margin-bottom:14px">'
      + '<div class="card-h"><h3>需要处理</h3>'
      + '<span class="muted">这些是台账之间互相牵动出来的，单看一个表看不出来</span></div>'
      + board.map(function(b){
          return '<div class="alert a-'+(b.lvl==="高"?"high":(b.lvl==="中"?"mid":"low"))+'" style="margin-bottom:9px">'
            + '<div class="h"><div class="t">'+b.t+'</div>'
            + '<span class="tag '+(b.lvl==="高"?"t-high":(b.lvl==="中"?"t-mid":"t-low"))+'">'+b.lvl+'</span>'
            + (b.tab?'<span class="tag t-gray">'+b.tab+'</span>':'')+'</div>'
            + '<div class="kv">'+b.d+'</div>'
            + '<div class="foot"><div class="sp" style="flex:1"></div>'
            + (b.go?'<button class="btn sm" onclick="LAB.go(&quot;'+b.go+'&quot;)">去处理 →</button>':'')
            + '</div></div>';
        }).join("")
      + '</div>';
    host.insertAdjacentHTML("afterbegin", html);
  }

  /* ================================================================
     联动看板
     ================================================================
     每个台账单独看都"正常"，串起来才有问题：
       设备超期 → 依赖它的检测项目还能不能接单
       QC 超限   → 有没有对应的 NC 跟上来
       内审不符合 → 有没有转成 NC
       环境超限 → 有没有开 NC
       留样到期 → 有没有处置
       委托单   → 待复核的有几单、压着几天了
     ================================================================ */
  function linkBoard(){
    var out = [];
    var L = global.Ledger;
    if(!L) return out;

    /* ① 设备超期 → 能力矩阵 */
    try{
      var eq = L.rows("equip");
      var over = eq.filter(function(e){ var d=daysTo(e.nextCal); return d!==null&&d<0; });
      if(over.length){
        var cap = capData();
        var hit = [];
        cap.forEach(function(c){
          (c.eq||[]).forEach(function(id){
            if(over.some(function(e){ return e.id===id; })) hit.push(c.item+"（"+id+"）");
          });
        });
        out.push({
          lvl:"高", tab:"设备",
          t:over.length+" 台设备校准已超期",
          d:"超期设备出的数据不能用于出报告。涉及 "+(hit.length?hit.join("、"):"未知项目")
            +"。先复测或停用该设备。",
          go:"equip"
        });
      }
    }catch(e){}

    /* ② QC 超限 → NC 跟上了没 */
    try{
      var qc = L.rows("qcrec");
      var bad = qc.filter(function(r){ return r.verdict==="超限"; });
      if(bad.length){
        var capa = L.rows("capa");
        var noNc = bad.filter(function(b){
          return !capa.some(function(c){
            var t=(c.item||"")+(c.impact||"");
            return t.indexOf(b.batch)>=0 || t.indexOf(b.item)>=0;
          });
        });
        if(noNc.length){
          out.push({
            lvl:"高", tab:"QC",
            t:noNc.length+" 条 QC 超限还没对应的 NC",
            d:noNc.map(function(b){return b.date+" "+b.item+"（"+b.batch+"）";}).join("；")
              +"。QC 超限要开不符合工作台账跟踪闭环，否则评审时会问「这个超限后来怎么处理的」。",
            go:"capa"
          });
        }
      }
    }catch(e){}

    /* ③ 内审不符合 → 转 NC */
    try{
      var au = L.rows("audit");
      var badAu = au.filter(function(a){ return a.result==="不符合"; });
      if(badAu.length){
        var capa2 = L.rows("capa");
        var miss = badAu.filter(function(a){
          return !capa2.some(function(c){
            var t=(c.item||"")+(c.note||"");
            return t.indexOf(a.item)>=0 || t.indexOf(a.clause)>=0;
          });
        });
        if(miss.length){
          out.push({
            lvl:"中", tab:"内审",
            t:miss.length+" 项内审不符合还没转成 NC",
            d:miss.map(function(a){return a.clause+" "+a.item;}).join("；")
              +"。内审发现的问题要进 NC 台账闭环，否则内审报告没有下文。",
            go:"capa"
          });
        }
      }
    }catch(e){}

    /* ④ 环境超限 → 开 NC */
    try{
      var env = L.rows("env");
      var badEnv = env.filter(function(e){ return e.status==="超限"; });
      if(badEnv.length){
        out.push({
          lvl:"高", tab:"环境",
          t:badEnv.length+" 条环境监控超限",
          d:badEnv.map(function(e){return e.date+" "+e.zone+"（"+e.temp+"℃）";}).join("；")
            +"。超限期间的数据要评估是否受影响，必要时开 NC。",
          go:"env"
        });
      }
    }catch(e){}

    /* ⑤ 留样到期 */
    try{
      var sm = L.rows("sample");
      var due = sm.filter(function(s){ var d=daysTo(s.retainUntil); return d!==null&&d>=0&&d<90; });
      if(due.length){
        out.push({
          lvl:"中", tab:"留样",
          t:due.length+" 份留样 90 天内到期",
          d:due.map(function(s){return s.id+"（"+s.retainUntil+"）";}).join("；")
            +"。到期要出库退还或销毁，销毁需双人确认并留记录。",
          go:"sample"
        });
      }
    }catch(e){}

    /* ⑥ 委托单待复核 / 加急 */
    try{
      var od = L.rows("orders");
      var wait = od.filter(function(o){ return o.status==="待复核"; });
      var urg = od.filter(function(o){ return o.urgent && o.status!=="已出报告"; });
      if(wait.length){
        out.push({
          lvl:"中", tab:"委托",
          t:wait.length+" 单待复核"+(urg.length?"（其中 "+urg.length+" 单加急）":""),
          d:wait.map(function(o){return o.no+" "+o.client;}).join("；")
            +"。数据已出，等质量负责人签字 —— 这一步卡住，报告就发不出去。",
          go:"orders"
        });
      }
    }catch(e){}

    /* ⑦ CAPA 高风险未闭环 */
    try{
      var cp = L.rows("capa");
      var hi = cp.filter(function(c){ return c.level==="高" && c.status!=="已关闭" && c.status!=="已作废"; });
      if(hi.length){
        out.push({
          lvl:"高", tab:"CAPA",
          t:hi.length+" 项高风险不符合未闭环",
          d:hi.map(function(c){return c.no+" "+c.item;}).join("；")
            +"。高风险项必须由最高管理者批准才能关闭。",
          go:"capa"
        });
      }
    }catch(e){}

    return out;
  }

  /* 跳转（页签名 → 切过去） */
  function go(tab){
    TAB = tab;
    render();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  /* ---------- ① 检测能力矩阵 ---------- */
  function viewCapability(){
    var cap = data("CAPABILITY");
    var eq = data("EQUIPMENT"), rg = data("REAGENTS"), st = data("STAFF");
    var eqMap={}, rgMap={}, stMap={};
    eq.forEach(function(x){ eqMap[x.id]=x; });
    rg.forEach(function(x){ rgMap[x.id]=x; });
    st.forEach(function(x){ stMap[x.id]=x; });

    var cats = [];
    cap.forEach(function(c){ if(cats.indexOf(c.cat)<0) cats.push(c.cat); });

    var html = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">可检项目</div><div class="v">${cap.length}</div><div class="d">${cats.length} 个类别</div></div>
      <div class="kpi"><div class="k">强制项目</div><div class="v">${cap.filter(function(c){return /强制/.test(c.acc||"");}).length}</div><div class="d">国标强制判定</div></div>
      <div class="kpi"><div class="k">平均周期</div><div class="v">${(cap.reduce(function(s,c){return s+(+c.days||0);},0)/cap.length).toFixed(1)}<span style="font-size:14px"> 天</span></div><div class="d">含前处理与复核</div></div>
      <div class="kpi"><div class="k">最快出报告</div><div class="v">${Math.min.apply(null,cap.map(function(c){return +c.days||99;}))}<span style="font-size:14px"> 天</span></div><div class="d">能量等计算项</div></div>
    </div>`;

    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>检测能力矩阵</h3>
        <span class="muted">客户问「能测什么、什么方法、多久、多少钱」，这张表就是答案</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.addCapability()">+ 加一个项目</button>
        <button class="btn sm" onclick="LAB.exportCapability()">⬇ 导出报价表</button></div>
      <div class="flex" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="search" style="width:280px"><span class="muted">🔍</span>
          <input id="capQ" placeholder="搜项目、方法、标准号" oninput="LAB.render()"></div>
        <span class="muted" id="capCnt"></span>
        <div class="sp" style="flex:1"></div>
        <span class="muted">点「方法」看原理与试剂 →</span>
      </div>
      <div class="twrap"><table>
        <thead><tr><th style="width:120px">检测项目</th><th style="width:220px">检验方法</th>
          <th style="width:76px">类别</th><th style="width:100px">周期</th><th style="width:110px">参考报价</th>
          <th style="width:110px">强制性</th><th style="width:90px">主检人</th><th>依赖资源</th><th style="width:40px"></th></tr></thead>
        <tbody>
        ${cap.map(function(c, ci){
          var q = (global.LAB_Q||"").trim().toLowerCase();
          if(q && (c.item+c.method+c.acc).toLowerCase().indexOf(q)<0) return "";
          var s = stMap[c.staff];
          var eqs = (c.eq||[]).map(function(id){ return eqMap[id]; }).filter(Boolean);
          /* ★ 联动：依赖的设备超期 → 该项目标红提示 ★ */
          var over = eqs.filter(function(e){ var d=daysTo(e.nextCal); return d!==null && d<0; });
          var soon = eqs.filter(function(e){ var d=daysTo(e.nextCal); return d!==null && d>=0 && d<=60; });
          return `<tr class="${over.length?"bad":""}">
            <td><input type="text" value="${esc(c.item)}" oninput="LAB.setCap(${ci},'item',this.value)"></td>
            <td><input type="text" value="${esc(c.method)}" oninput="LAB.setCap(${ci},'method',this.value)"></td>
            <td><input type="text" value="${esc(c.cat)}" oninput="LAB.setCap(${ci},'cat',this.value)"></td>
            <td class="num"><input type="number" value="${c.days}" style="width:58px;text-align:center"
              oninput="LAB.setCap(${ci},'days',this.value)"> 天</td>
            <td class="num"><input type="text" value="${esc(c.price)}" style="width:92px;text-align:right"
              oninput="LAB.setCap(${ci},'price',this.value)"></td>
            <td><input type="text" value="${esc(c.acc)}" style="width:100%"
              oninput="LAB.setCap(${ci},'acc',this.value)"></td>
            <td><input type="text" value="${s?s.name:""}" style="width:76px"
              oninput="LAB.setCap(${ci},'staffName',this.value)"
              title="主检人姓名（改这里）"></td>
            <td style="font-size:11.5px" class="muted">
              设备 ${eqs.map(function(e){ return e.name; }).join("、")||"—"}
              ${over.length?`<div style="color:var(--high)">⛔ ${over.length} 台设备校准已超期，该项目暂停接单</div>`:""}
              ${soon.length&&!over.length?`<div style="color:var(--mid)">⚠ ${soon.length} 台设备 60 天内到期</div>`:""}
            </td>
            <td style="text-align:center"><button class="x" onclick="LAB.delCap(${ci})" title="删除">×</button></td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
    </div>`;
    return html;
  }

  /* ---------- ② 计量设备台账 ---------- */
  function viewEquip(){
    var eq = data("EQUIPMENT");
    var over = eq.filter(function(e){ var d=daysTo(e.nextCal); return d!==null && d<0; });
    var soon = eq.filter(function(e){ var d=daysTo(e.nextCal); return d!==null && d>=0 && d<=60; });
    var st = data("STAFF");
    var stMap={}; st.forEach(function(x){ stMap[x.id]=x; });

    var html = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">设备总数</div><div class="v">${eq.length}</div><div class="d">在用 ${eq.filter(function(e){return e.status==="在用";}).length} 台</div></div>
      <div class="kpi ${over.length?"hi":""}"><div class="k">已超期</div><div class="v">${over.length}</div><div class="d">超期设备不得用于出具报告的数据</div></div>
      <div class="kpi ${soon.length?"hi":""}"><div class="k">60 天内到期</div><div class="v">${soon.length}</div><div class="d">提前约检，别等超期</div></div>
      <div class="kpi"><div class="k">关键设备</div><div class="v">${eq.filter(function(e){return e.critical;}).length}</div><div class="d">需做期间核查</div></div>
    </div>`;

    if(over.length){
      html += `<div class="notice warn" style="margin-bottom:12px"><span>⛔</span><div>
        <b>${over.length} 台设备的校准/检定已超期：</b>
        ${over.map(function(e){return esc(e.name+"（"+e.id+"，超期 "+Math.abs(daysTo(e.nextCal))+" 天）");}).join("；")}。
        <b>超期设备出的数据不能用于出报告</b> —— 用之前要有偏离处理或用有效设备复测。</div></div>`;
    }

    html += `<div class="card">
      <div class="card-h"><h3>计量设备与标准物质台账</h3>
        <span class="muted">CNAS 要求：全部有溯源证书 + 在有效周期内</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.exportEquip()">⬇ 导出</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:76px">编号</th><th style="width:170px">设备名称</th>
          <th style="width:150px">品牌型号</th><th style="width:90px">类型</th>
          <th style="width:96px">上次校准</th><th style="width:96px">下次校准</th>
          <th style="width:76px">剩余</th><th style="width:120px">溯源证书</th>
          <th style="width:70px">状态</th><th>用途 / 责任人</th></tr></thead>
        <tbody>
        ${eq.map(function(e){
          var d = daysTo(e.nextCal);
          var cls = d===null?"":(d<0?"t-high":(d<=60?"t-mid":"t-low"));
          return `<tr>
            <td class="mono">${esc(e.id)}</td>
            <td><b>${esc(e.name)}</b>${e.critical?` <span class="tag t-soon">关键</span>`:""}</td>
            <td class="muted" style="font-size:11.5px">${esc(e.brand)}<br>SN ${esc(e.sn)}</td>
            <td class="muted">${esc(e.type)}<br><span style="font-size:11px">${esc(e.verify)} / ${e.cycle} 个月</span></td>
            <td class="mono muted">${esc(e.lastCal||"—")}</td>
            <td class="mono">${esc(e.nextCal||"—")}</td>
            <td class="num"><span class="tag ${cls}">${d===null?"—":(d<0?Math.abs(d)+" 天前":d+" 天")}</span></td>
            <td class="mono muted" style="font-size:11px">${esc(e.cert||"—")}</td>
            <td><span class="tag ${e.status==="在用"?"t-low":(e.status==="维修中"?"t-mid":"t-gray")}">${esc(e.status)}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(e.use)}<br>${esc(e.location)} · ${esc(e.inCharge)}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        <b>期间核查</b>：关键设备在两次校准之间要自查（如天平日核查、砷标准物质核查、GC 标样核查），记录要留。
      </div>
    </div>`;
    return html;
  }

  /* ---------- ③ 试剂与危化品 ---------- */
  function viewReagent(){
    var rg = data("REAGENTS");
    var exp = rg.filter(function(r){ var d=daysTo(r.expiry); return d!==null && d<60; });
    var haz = {};
    rg.forEach(function(r){ if(r.hazard && r.hazard!=="无"){ haz[r.hazard]=(haz[r.hazard]||0)+1; } });
    var prep = rg.filter(function(r){ return r.isPrepared; });

    var html = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">试剂在库</div><div class="v">${rg.length}</div><div class="d">${Object.keys(haz).length} 类危险品</div></div>
      <div class="kpi ${exp.length?"hi":""}"><div class="k">60 天内到期</div><div class="v">${exp.length}</div><div class="d">过期试剂须作废隔离</div></div>
      <div class="kpi"><div class="k">危险品</div><div class="v">${rg.length - (haz["无"]||0) - (rg.filter(function(r){return r.hazard==="无";}).length)}</div><div class="d">${Object.keys(haz).filter(function(k){return k!=="无";}).map(function(k){return k+" "+haz[k];}).join(" · ")||"—"}</div></div>
      <div class="kpi"><div class="k">自配试剂</div><div class="v">${prep.length}</div><div class="d">按配制日算效期</div></div>
    </div>`;

    if(exp.length){
      html += `<div class="notice warn" style="margin-bottom:12px"><span>⚠</span><div>
        <b>${exp.length} 项试剂 60 天内到期：</b>
        ${exp.map(function(r){ return esc(r.name+"（"+r.expiry+(daysTo(r.expiry)<0?"，已过期":"")+"）"); }).join("；")}。
        到期前用完或换新，<b>过期的贴「作废」标签移入废弃区</b>，不能退回货架。</div></div>`;
    }

    html += `<div class="card">
      <div class="card-h"><h3>试剂、耗材与标准物质台账</h3>
        <span class="muted">按 GB 30000.1 分类；标准物质看证书有效期</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.exportReagent()">⬇ 导出</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:72px">编号</th><th style="width:200px">名称</th>
          <th style="width:90px">级别</th><th style="width:66px">库存</th>
          <th style="width:130px">储存位置</th><th style="width:130px">危险品分类</th>
          <th style="width:96px">有效期</th><th style="width:76px">剩余</th>
          <th style="width:70px">状态</th><th>批号 / 责任人</th></tr></thead>
        <tbody>
        ${rg.map(function(r){
          var d = daysTo(r.expiry);
          var cls = d===null?"":(d<0?"t-high":(d<=60?"t-mid":"t-low"));
          return `<tr>
            <td class="mono">${esc(r.id)}</td>
            <td><b>${esc(r.name)}</b>${r.isPrepared?` <span class="tag t-cur">自配</span>`:""}
              ${r.cert?` <span class="tag t-gray" title="标准物质证书">CRM</span>`:""}</td>
            <td class="muted" style="font-size:11.5px">${esc(r.grade)}<br>CAS ${esc(r.cas)}</td>
            <td class="num">${r.qty} ${esc(r.unit)}</td>
            <td class="muted" style="font-size:11.5px">${esc(r.location)}</td>
            <td>${r.hazard && r.hazard!=="无"
              ? `<span class="tag ${/毒|易制毒/.test(r.hazard)?"t-high":(/易燃|氧化/.test(r.hazard)?"t-mid":"t-soon")}">${esc(r.hazardClass)} ${esc(r.hazard)}</span>`
              : `<span class="muted">非危险品</span>`}</td>
            <td class="mono">${esc(r.expiry||"—")}</td>
            <td class="num"><span class="tag ${cls}">${d===null?"—":(d<0?"已过期":d+" 天")}</span></td>
            <td><span class="tag ${r.status==="在库"?"t-low":"t-gray"}">${esc(r.status)}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(r.prodNo)}<br>${esc(r.owner)}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        <b>剧毒标准物质（如黄曲霉毒素 M1）</b>要双人双锁、领用精确到 μg、台账可追溯 —— 这一条 JSA 里也是红线。
      </div>
    </div>`;
    return html;
  }

  /* ---------- ④ 样品与留样 ---------- */
  function viewSample(){
    var sm = data("SAMPLES");
    var due = sm.filter(function(s){ var d=daysTo(s.retainUntil); return d!==null && d<90; });
    var inProgress = sm.filter(function(s){ return s.status==="检验中" || s.status==="复检中"; });

    var html = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">在库样品</div><div class="v">${sm.length}</div><div class="d">${new Set(sm.map(function(s){return s.cat;})).size} 个类别</div></div>
      <div class="kpi ${due.length?"hi":""}"><div class="k">90 天内到期</div><div class="v">${due.length}</div><div class="d">留存期满需处置</div></div>
      <div class="kpi ${inProgress.length?"hi":""}"><div class="k">检验中</div><div class="v">${inProgress.length}</div><div class="d">含复检</div></div>
      <div class="kpi"><div class="k">留样覆盖率</div><div class="v">${Math.round(sm.filter(function(s){return s.retainQty;}).length/sm.length*100)}<span style="font-size:14px">%</span></div><div class="d">有留样的样品占比</div></div>
    </div>`;

    html += `<div class="card">
      <div class="card-h"><h3>样品与留样台账</h3>
        <span class="muted">留样是复检、投诉调查唯一的物证 —— 找不到就等于没有证据</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.exportSample()">⬇ 导出</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:120px">样品编号</th><th style="width:210px">样品名称</th>
          <th style="width:76px">类别</th><th style="width:110px">批号</th>
          <th style="width:130px">委托单位</th><th style="width:96px">生产日期</th>
          <th style="width:80px">状态</th><th style="width:130px">留样位置</th>
          <th style="width:96px">留样到期</th><th style="width:70px">剩余</th><th>备注</th></tr></thead>
        <tbody>
        ${sm.map(function(s){
          var d = daysTo(s.retainUntil);
          var cls = d===null?"":(d<0?"t-gray":(d<90?"t-mid":"t-low"));
          return `<tr>
            <td class="mono">${esc(s.id)}</td>
            <td>${esc(s.name)}</td>
            <td><span class="tag t-gray">${esc(s.cat)}</span></td>
            <td class="mono muted" style="font-size:11.5px">${esc(s.batch)}</td>
            <td class="muted" style="font-size:11.5px">${esc(s.maker)}</td>
            <td class="mono muted">${esc(s.prodDate)}</td>
            <td><span class="tag ${s.status==="已检验"?"t-low":(s.status==="检验中"||s.status==="复检中"?"t-soon":"t-gray")}">${esc(s.status)}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(s.retainPos)}<br>${esc(s.retainQty)}</td>
            <td class="mono">${esc(s.retainUntil)}</td>
            <td class="num"><span class="tag ${cls}">${d===null?"—":(d<0?"已到期":d+" 天")}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(s.note||"—")}
              ${s.result&&s.result!=="合格"?`<div style="color:var(--high)">${esc(s.result)}</div>`:""}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        <b>留存期限</b>：GB 14881 要求样品保存至保质期满后 6 个月；婴幼儿配方食品涉及争议时按合同与法规孰严者执行。
      </div>
    </div>`;
    return html;
  }

  /* ---------- ⑤ 质量控制 ---------- */
  function viewQC(){
    var plans = data("QC_PLANS"), recs = data("QC_RECORDS");
    var planMap={}; plans.forEach(function(p){ planMap[p.id]=p; });
    var bad = recs.filter(function(r){ return r.verdict!=="合格"; });
    var open = recs.filter(function(r){
      var p = planMap[r.planId];
      return p && p.critHigh && r.verdict!=="合格";
    });

    var html = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">QC 方案</div><div class="v">${plans.length}</div><div class="d">覆盖 ${new Set(plans.map(function(p){return p.itemCat;})).size} 个类别</div></div>
      <div class="kpi"><div class="k">执行记录</div><div class="v">${recs.length}</div><div class="d">近 30 天</div></div>
      <div class="kpi ${bad.length?"hi":""}"><div class="k">超限</div><div class="v">${bad.length}</div><div class="d">${bad.length?"需闭环":"全部合格"}</div></div>
      <div class="kpi"><div class="k">合格率</div><div class="v">${recs.length?Math.round((recs.length-bad.length)/recs.length*100):100}<span style="font-size:14px">%</span></div><div class="d">${recs.length-bad.length}/${recs.length} 条</div></div>
    </div>`;

    if(bad.length){
      html += `<div class="card" style="margin-bottom:14px">
        <div class="card-h"><h3>⚠ 超限项与闭环</h3><span class="muted">QC 超限必须闭环，否则同批数据全部存疑</span></div>
        ${bad.map(function(r){
          var p = planMap[r.planId]||{};
          return `<div class="alert a-high">
            <div class="h"><span class="no">${esc(r.id)}</span><div class="t">${esc(r.item)} · ${esc(r.date)} · ${esc(r.batch)}</div>
              <span class="tag t-high">超限</span></div>
            <div class="kv">空白 ${esc(r.blank)} ｜ 平行样 ${esc(r.dup)} ｜ 加标回收 ${esc(r.spike)} ｜ 标准物质 ${esc(r.refMat)}</div>
            <div class="why"><span class="lb">判定标准</span>${esc(p.criteria||"—")}</div>
            <div class="act"><span class="lb">超限条件</span>${esc(p.critHigh||"—")}</div>
            <div class="act"><span class="lb">处置与闭环</span>${esc(r.note||"—")}</div>
            <div class="foot"><span class="muted">执行 ${esc(r.by)}</span><div class="sp" style="flex:1"></div>
              <span class="tag ${r.note?"t-low":"t-soon"}">${r.note?"已记录处置":"待处置"}</span></div>
          </div>`;
        }).join("")}
      </div>`;
    }

    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>QC 方案（每项目该做什么）</h3>
        <span class="muted">空白查本底 · 平行样查精密度 · 加标查准确度 · 标准物质查准确度</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.exportQCPlan()">⬇ 导出方案</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:150px">检测项目</th><th style="width:190px">检验方法</th>
          <th style="width:80px">空白</th><th style="width:110px">平行样</th>
          <th style="width:90px">加标回收</th><th style="width:100px">标准物质</th>
          <th style="width:230px">判定标准</th><th style="width:60px">责任人</th></tr></thead>
        <tbody>
        ${plans.map(function(p){
          return `<tr>
            <td><b>${esc(p.item)}</b></td>
            <td class="mono muted" style="font-size:11.5px">${esc(p.method)}</td>
            <td class="muted">${esc(p.blank)}</td>
            <td class="muted">${esc(p.dup)}</td>
            <td class="muted">${esc(p.spike)}</td>
            <td class="muted">${esc(p.refMat)}</td>
            <td class="muted" style="font-size:11.5px">${esc(p.criteria)}</td>
            <td class="muted">${esc(p.owner)}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
    </div>`;

    html += `<div class="card">
      <div class="card-h"><h3>执行记录</h3><span class="muted">${recs.length} 条</span>
        <div class="sp"></div><button class="btn sm" onclick="LAB.exportQCRec()">⬇ 导出</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:110px">记录号</th><th style="width:90px">日期</th>
          <th style="width:110px">检测项目</th><th style="width:150px">批次</th>
          <th style="width:100px">空白</th><th style="width:120px">平行样</th>
          <th style="width:110px">加标回收</th><th style="width:110px">标准物质</th>
          <th style="width:66px">判定</th><th>备注</th></tr></thead>
        <tbody>
        ${recs.map(function(r){
          return `<tr class="${r.verdict==="合格"?"":"bad"}">
            <td class="mono">${esc(r.id)}</td>
            <td class="mono muted">${esc(r.date)}</td>
            <td><b>${esc(r.item)}</b></td>
            <td class="mono muted" style="font-size:11.5px">${esc(r.batch)}</td>
            <td class="muted">${esc(r.blank)}</td>
            <td class="muted">${esc(r.dup)}</td>
            <td class="muted">${esc(r.spike)}</td>
            <td class="muted">${esc(r.refMat)}</td>
            <td><span class="tag ${r.verdict==="合格"?"t-low":"t-high"}">${esc(r.verdict)}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(r.note||"—")}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
    </div>`;
    return html;
  }

  /* ---------- ⑥ 能力验证 ---------- */
  function viewPT(){
    var pt = data("PT_PLANS");
    var doing = pt.filter(function(p){ return p.status==="进行中"; });
    var sat = pt.filter(function(p){ return /满意/.test(p.result); });
    var doubtful = pt.filter(function(p){ return /可疑|不满意/.test(p.result); });

    var html = `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">PT 计划</div><div class="v">${pt.length}</div><div class="d">${pt.length?pt[0].year+" 年":""}</div></div>
      <div class="kpi"><div class="k">进行中</div><div class="v">${doing.length}</div><div class="d">${doing.length?esc(doing[0].name):"—"}</div></div>
      <div class="kpi"><div class="k">满意</div><div class="v">${sat.length}</div><div class="d">外部能力证明</div></div>
      <div class="kpi ${doubtful.length?"hi":""}"><div class="k">可疑/不满意</div><div class="v">${doubtful.length}</div><div class="d">${doubtful.length?"需分析原因":"无"}</div></div>
    </div>`;

    if(doubtful.length){
      html += `<div class="notice warn" style="margin-bottom:12px"><span>⚠</span><div>
        <b>${doubtful.length} 项能力验证结果需分析：</b>
        ${doubtful.map(function(p){return esc(p.name+"（"+p.result+"）");}).join("；")}。
        可疑值不是失败，但<b>必须做原因分析并留档</b> —— 客户审厂会问。</div></div>`;
    }

    html += `<div class="card">
      <div class="card-h"><h3>能力验证与实验室间比对</h3>
        <span class="muted">CNAS 要求参加能力验证；这是客户审厂必查项</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.exportPT()">⬇ 导出</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:110px">编号</th><th style="width:210px">名称</th>
          <th style="width:170px">组织方</th><th style="width:100px">类别</th>
          <th style="width:190px">项目</th><th style="width:96px">收样日期</th>
          <th style="width:96px">报告日期</th><th style="width:110px">结果</th>
          <th style="width:80px">状态</th><th>备注</th></tr></thead>
        <tbody>
        ${pt.map(function(p){
          return `<tr>
            <td class="mono">${esc(p.id)}</td>
            <td><b>${esc(p.name)}</b></td>
            <td class="muted" style="font-size:11.5px">${esc(p.org)}</td>
            <td><span class="tag t-gray">${esc(p.cat)}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(p.items)}</td>
            <td class="mono muted">${esc(p.recvDate||"—")}</td>
            <td class="mono muted">${esc(p.reportDate||"—")}</td>
            <td><span class="tag ${/满意/.test(p.result)?"t-low":(/待/.test(p.result)?"t-gray":"t-high")}">${esc(p.result)}</span></td>
            <td><span class="tag ${p.status==="已出报告"?"t-low":"t-soon"}">${esc(p.status)}</span></td>
            <td class="muted" style="font-size:11.5px">${esc(p.note||"—")}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
    </div>`;
    return html;
  }

  /* ---------- ⑦ 原始记录生成器 ---------- */
  /* ================================================================
     方法候选清单
     ================================================================
     三个来源合并去重，只剔除**明确被替代**的版本。
     ★ 教训：不能因为「抓取源没收录」就判过期 ——
       GB 5413.x（乳与乳制品）在标准清单里只有 14 条，
       但 GB 5413.30-2016 等全是现行有效的，用来做原始记录完全没问题。 */
  function methodOptions(){
    var D = global.STDWATCH_DATA || {};
    var L = global.LABDATA || {};
    var norm = function(s){ return String(s||"").replace(/\s+/g,"").toUpperCase(); };

    /* ① 明确被替代的标准号 */
    var sup = {};
    (D.REFGROUPS||[]).forEach(function(g){
      (g.items||[]).forEach(function(it){
        String(it.olds||"").split(/[、,，;；]/).forEach(function(x){
          x=x.trim(); if(x) sup[norm(x)]=1;
        });
      });
    });
    (D.STD||[]).forEach(function(s){ if(s.status!=="现行有效") sup[norm(s.no)]=1; });

    var map = L.METHOD_TPL_MAP || {};
    var tplOf = function(text){
      var key=null;
      Object.keys(map).forEach(function(k){ if(text && text.indexOf(k)>=0) key=k; });
      return key||"通用";
    };
    /* 官方标题里「食品安全国家标准 」是废话，列表里去掉 */
    var cleanTitle = function(s){
      return String(s||"").replace(/^食品安全国家标准\s*/,"").trim();
    };
    var STDRE = /(GB|GB\/T|JJF|QB|SN)\s*[\/]?\s*[A-Z0-9.]+(?:-\d{4})?/i;

    var byNo = {}, order = [];
    function put(no, title, method, group, src){
      no = String(no||"").trim();
      if(!no) return;
      /* 方法名里常带完整标准号（"GB 5009.4-2016 550℃ 灼烧法"），
         列表里标准号已经单独一列，这里去掉重复的部分 */
      method = String(method||"").replace(STDRE, function(m0){
        return norm(m0)===norm(no) ? "" : m0;
      }).trim();
      var key = norm(no);
      if(sup[key]) return;                       /* 过期：直接剔除 */
      if(!byNo[key]){
        byNo[key] = {no:no, title:cleanTitle(title), method:method||"",
                     group:group||"", src:src||"",
                     tpl:tplOf((method||"")+" "+(title||""))};
        order.push(key);
      } else {
        var o = byNo[key];
        if(!o.title && title) o.title = cleanTitle(title);
        if(!o.method && method) o.method = method;
        if(!o.group && group) o.group = group;
        if(o.src.indexOf(src)<0) o.src += "+"+src;
      }
    }

    /* ② 通则引用标准（用户明确要求加进来） */
    (D.REFGROUPS||[]).forEach(function(g){
      (g.items||[]).forEach(function(it){
        if(it.validity && it.validity!=="现行有效") return;
        put(it.no, it.title, "", g.g, "通则");
      });
    });
    /* ③ 方法原理（方法名在这里） */
    (D.METHODS||[]).forEach(function(m){
      put(m.stdNo, m.title, m.method, "方法原理", "原理");
    });
    /* ④ 能力矩阵（补漏） */
    (L.CAPABILITY||[]).forEach(function(c){
      var mm = String(c.method||"").match(STDRE);
      if(!mm) return;
      put(mm[0], c.item, c.method, "能力矩阵", "矩阵");
    });

    return order.map(function(k){ return byNo[k]; });
  }

  /* 人工添加的方法（本次会话内有效，不写进种子数据） */
  var MANUAL = [];

  function viewRecord(){
    var tpls = global.LABDATA.RECORD_TEMPLATES || {};
    var opts = methodOptions();

    /* 按分组归类，没有分组的放「其它」 */
    var groups = {}, gorder = [];
    opts.forEach(function(o){
      var g = o.group || "其它方法";
      if(!groups[g]){ groups[g]=[]; gorder.push(g); }
      groups[g].push(o);
    });

    var html = `<div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>原始记录生成器</h3>
        <span class="muted">选方法 → 出记录表框架 → 填数据 → 导出打印签字</span></div>
      <div class="notice" style="margin-bottom:12px"><span>📋</span>
        <div><b>原始记录不能事后补记。</b>这里出的是<b>空白表单框架</b>，
          检验时按实际情况手填并签字 —— 不能在电脑上填完再打印，那不叫原始记录。</div></div>
      <div class="flex" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
        <label style="flex:1 1 240px;min-width:200px">
          <span class="muted" style="font-size:12px;display:block;margin-bottom:4px">搜索方法</span>
          <input type="search" id="recSearch" placeholder="输入标准号或名称，如 5009.5 / 蛋白 / 维生素"
            style="width:100%" oninput="LAB.filterMethods(this.value)">
        </label>
        <label style="flex:2 1 380px;min-width:260px">
          <span class="muted" style="font-size:12px;display:block;margin-bottom:4px">选检测方法</span>
          <select id="recMethod" onchange="LAB.pickMethod(this.value)" style="width:100%">
            <option value="">— 选择方法 —</option>
            ${gorder.map(function(g){
              return `<optgroup label="${esc(g)}">`+
                groups[g].map(function(o){
                  var sel = (REC && REC.opt===o.no) ? " selected" : "";
                  /* 标准号 · 标准名称 · 方法名（有的才带） */
                  var parts = [o.no, o.title, o.method].filter(Boolean);
                  var label = parts.join(" · ");
                  return `<option value="${esc(o.no)}"${sel}>${esc(label)}</option>`;
                }).join("") + `</optgroup>`;
            }).join("")}
            ${MANUAL.map(function(o,i){
              var sel = (REC && REC.manual && REC.opt===("__m"+i+"__")) ? " selected" : "";
              return `<option value="__m${i}__"${sel}>✏️ ${esc(o.no+" "+(o.title||""))}</option>`;
            }).join("")}
            <option value="__manual__">✏️ 人工添加方法…</option>
          </select>
        </label>
      </div>
      <div class="muted" style="margin-top:8px;font-size:11.5px" id="recCount"></div>
    </div>`;
    /* 初始就把「共 N 个方法」显示出来（不然要手动输入才有提示） */
    setTimeout(function(){ if(global.LAB) global.LAB.filterMethods(""); }, 0);

    /* 人工添加表单 */
    if(REC && REC.manualForm){
      html += `<div class="card" style="margin-bottom:14px">
        <div class="card-h"><h3>人工添加方法</h3>
          <span class="muted">标准库里没有的、但你们实验室在用的方法</span></div>
        <div class="flex" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
          <label style="flex:1 1 200px"><span class="muted" style="font-size:12px;display:block;margin-bottom:4px">标准号</span>
            <input type="text" id="mNo" placeholder="如 GB 5009.5-2025" style="width:100%"
              value="${esc(REC.manualForm.no||"")}" oninput="LAB.setManualField('no',this.value)"></label>
          <label style="flex:2 1 260px"><span class="muted" style="font-size:12px;display:block;margin-bottom:4px">方法名称</span>
            <input type="text" id="mTitle" placeholder="如 第一法 凯氏定氮法" style="width:100%"
              value="${esc(REC.manualForm.title||"")}" oninput="LAB.setManualField('title',this.value)"></label>
          <label style="flex:1 1 170px"><span class="muted" style="font-size:12px;display:block;margin-bottom:4px">记录表模板</span>
            <select id="mTpl" style="width:100%" onchange="LAB.setManualField('tpl',this.value)">
              ${Object.keys(tpls).map(function(k){
                return `<option value="${esc(k)}"${REC.manualForm.tpl===k?" selected":""}>${esc(k)}</option>`;
              }).join("")}
            </select></label>
          <button class="btn pri" onclick="LAB.addManualMethod()">生成记录表</button>
          <button class="btn" onclick="LAB.cancelManual()">取消</button>
        </div>
      </div>`;
    }

    if(!REC){
      html += `<div class="card empty">先在上面选一个方法（可以直接搜），就出来对应的原始记录表。</div>`;
      return html;
    }

    var tpl = tpls[REC.tpl] || tpls["通用"];
    html += `<div class="card">
      <div class="card-h"><h3>${esc(REC.stdNo)} · ${esc(REC.title||"")}</h3>
        <span class="muted">模板：${esc(REC.tpl)}</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.printRecord()">🖨 打印空白表</button>
        <button class="btn sm" onclick="LAB.exportRecord()">⬇ 导出 CSV</button></div>
      <div class="notice" style="margin-bottom:12px"><span>∑</span>
        <div><b>计算式：</b><span class="mono">${esc(tpl.calc)}</span></div></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:220px">记录项</th><th style="width:280px">填写</th>
          <th style="width:180px">提示</th></tr></thead>
        <tbody>
        ${tpl.fields.map(function(f,i){
          return `<tr>
            <td><b>${esc(f.k)}</b></td>
            <td>${f.type==="date"
              ? `<input type="date" value="${esc(REC.vals[f.k]||"")}" oninput="LAB.setRec('${esc(f.k)}',this.value)">`
              : `<input type="${f.type==="number"?"number":"text"}" value="${esc(REC.vals[f.k]||"")}"
                 ${f.type==="number"?'step="any"':""}
                 oninput="LAB.setRec('${esc(f.k)}',this.value)">`}</td>
            <td class="muted" style="font-size:11.5px">${esc(f.hint||"—")}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="flex" style="margin-top:14px;flex-wrap:wrap;gap:10px">
        ${["检验人","复核人"].map(function(k){
          return `<label style="flex:0 1 200px"><span class="muted" style="font-size:12px;display:block;margin-bottom:4px">${k}</span>
            <input type="text" value="${esc(REC.sign[k]||"")}" oninput="LAB.setSign('${k}',this.value)"
              style="width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:6px;font-family:inherit"></label>`;
        }).join("")}
        <label style="flex:0 1 200px"><span class="muted" style="font-size:12px;display:block;margin-bottom:4px">检验日期</span>
          <input type="date" value="${esc(REC.sign["日期"]||"")}" oninput="LAB.setSign('日期',this.value)"
            style="width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:6px;font-family:inherit"></label>
      </div>
    </div>`;
    return html;
  }

  /* ================================================================
     交互
     ================================================================ */
  /* 选中方法。value 是标准号（不是索引），所以重渲染后能保持选中。 */
  function pickMethod(val){
    if(val===""){ REC=null; render(); return; }
    if(val==="__manual__"){
      REC = {manualForm:{no:"", title:"", tpl:"通用"}, vals:{}, sign:{}};
      render();
      return;
    }
    var o = null;
    var mi = /^__m(\d+)__$/.exec(val);
    if(mi){ o = MANUAL[+mi[1]]; }
    else{
      var opts = methodOptions();
      for(var i=0;i<opts.length;i++){
        if(opts[i].no===val){ o=opts[i]; break; }
      }
    }
    if(!o) return;
    var saved = global.Store ? global.Store.get("lab.record."+o.no, null) : null;
    REC = {stdNo:o.no, title:o.title||"", method:o.method||"", tpl:o.tpl||"通用",
           opt:val, manual:!!mi,
           vals:(saved&&saved.vals)||{}, sign:(saved&&saved.sign)||{}};
    render();
  }

  /* 搜索过滤：只改 select 的 option，不重渲染整页（否则会丢焦点） */
  function filterMethods(kw){
    kw = String(kw||"").trim().toUpperCase();
    var sel = document.getElementById("recMethod");
    if(!sel) return;
    var opts = methodOptions();
    var shown = 0;
    for(var i=0;i<sel.options.length;i++){
      var op = sel.options[i];
      if(op.value==="" || op.value==="__manual__"){ continue; }
      var hit = !kw || (op.textContent||"").toUpperCase().indexOf(kw)>=0;
      op.hidden = !hit;
      op.disabled = !hit;
      if(hit) shown++;
    }
    var cnt = document.getElementById("recCount");
    if(cnt){
      cnt.textContent = kw
        ? ("匹配 " + shown + " 个方法（标准库里共 " + opts.length + " 个现行有效方法）")
        : ("标准库里共 " + opts.length + " 个现行有效方法，已按分组归类；找不到就用「✏️ 人工添加方法」");
    }
  }

  /* 人工添加方法的表单 */
  function setManualField(k, v){
    if(!REC) return;
    if(!REC.manualForm || typeof REC.manualForm!=="object"){
      REC.manualForm = {no:"", title:"", tpl:"通用"};
    }
    REC.manualForm[k] = v;
  }
  function cancelManual(){
    REC = null;
    render();
  }
  function addManualMethod(){
    var f = (REC && REC.manualForm) || {};
    if(!String(f.no||"").trim()){
      global.toast("先填标准号", "warn"); return;
    }
    var no = String(f.no).trim();
    /* 同号已存在就不重复加 */
    for(var i=0;i<MANUAL.length;i++){
      if(MANUAL[i].no===no){ pickMethod("__m"+i+"__"); return; }
    }
    MANUAL.push({no:no, title:String(f.title||"").trim(), tpl:f.tpl||"通用"});
    REC = null;
    render();
    setTimeout(function(){ LAB.pickMethod("__m"+(MANUAL.length-1)+"__"); }, 30);
    global.toast("已添加：" + no);
  }

  function setRec(k,v){
    if(!REC) return;
    REC.vals[k]=v;
    if(global.Store) global.Store.set("lab.record."+REC.stdNo, {vals:REC.vals, sign:REC.sign});
  }
  function setSign(k,v){
    if(!REC) return;
    REC.sign[k]=v;
    if(global.Store) global.Store.set("lab.record."+REC.stdNo, {vals:REC.vals, sign:REC.sign});
  }
  function openMethod(methodStr){
    /* 从方法原理页里找到对应标准并打开 */
    var no = (methodStr.match(/(GB[\s/]?T?\s*\d+(?:\.\d+)?(?:\-\d+)?)/)||[])[0];
    if(!no){ global.toast("这个方法不在方法原理库里", "warn"); return; }
    var methods = global.METHODS || [];
    var hit = methods.filter(function(m){
      return (m.stdNo||"").replace(/\s/g,"").indexOf(no.replace(/\s/g,""))>=0;
    })[0];
    if(hit && global.openMethodDetail) global.openMethodDetail(hit.stdNo);
    else global.toast("方法原理库里还没有 " + no, "warn");
  }

  /* ---------- 能力矩阵的编辑动作 ---------- */
  function capData(){
    if(global.Ledger && global.Ledger._defs.capability) return global.Ledger.rows("capability");
    var ov = global.Store ? global.Store.get("lab.CAPABILITY", null) : null;
    return ov || (global.LABDATA ? global.LABDATA.CAPABILITY : []);
  }
  function saveCap(){
    if(global.Ledger && global.Ledger._defs.capability){ global.Ledger.save("capability"); return; }
    if(global.Store) global.Store.set("lab.CAPABILITY", capData());
  }
  function setCap(i, col, v){
    var c = capData()[i];
    if(!c) return;
    if(col==="days") v = parseFloat(v)||0;
    if(col==="staffName"){
      /* 按姓名回写 staff id */
      var st = data("STAFF");
      var hit = st.filter(function(s){ return s.name===v; })[0];
      c.staff = hit ? hit.id : c.staff;
      c.staffName = v;
    } else c[col] = v;
    saveCap();
    render();
  }
  function addCapability(){
    var c = capData();
    c.push({item:"新检测项目", method:"", cat:"营养成分", days:3, price:"0 元/样",
            acc:"参考项", staff:"", staffName:"", eq:[], rg:[]});
    saveCap();
    render();
  }
  function delCap(i){
    var c = capData();
    var r = c[i] || {};
    /* ★ 删除 NC/CAPA → 二次确认（2026-11-03）★ */
    global.Guard.ask("确定删除这条不符合项？<br><b style='color:var(--ink)'>"+
      esc(r.no||"")+" "+(r.t||r.title||"")+"</b>", {
      onOk:function(){
        c.splice(i,1);
        saveCap();
        render();
        global.toast("已删除");
      }
    });
  }

  /* ================================================================
     导出
     ================================================================ */
  function dl(name, rows){
    global.downloadCsv(name, rows);
  }
  function exportCapability(){
    var cap=capData(), eq=data("EQUIPMENT"), st=data("STAFF");
    var eqMap={}, stMap={};
    eq.forEach(function(x){eqMap[x.id]=x;});
    st.forEach(function(x){stMap[x.id]=x;});
    var rows=[["检测项目","检验方法","类别","出报告周期","参考报价","强制性","主检人","依赖设备","依赖试剂"]];
    cap.forEach(function(c){
      var eqs=(c.eq||[]).map(function(id){var e=eqMap[id];return e?e.name+"("+e.id+")":"";}).filter(Boolean).join("；");
      var s=stMap[c.staff];
      rows.push([c.item, c.method, c.cat, c.days+" 天", c.price, c.acc, s?s.name:"", eqs, (c.rg||[]).join("；")]);
    });
    rows.push([]);
    rows.push(["说明","周期与报价为常见区间，仅供报价参考；强制性依据对应国标。"]);
    dl("检测能力矩阵_"+today()+".csv", rows);
    global.toast("已导出检测能力矩阵");
  }
  function exportEquip(){
    var eq=data("EQUIPMENT");
    var rows=[["编号","设备名称","品牌","型号","出厂序列号","类型","校准/检定方式","周期(月)",
               "上次校准","下次校准","剩余天数","溯源证书","状态","安装位置","责任人","用途","是否关键设备"]];
    eq.forEach(function(e){
      var d=daysTo(e.nextCal);
      rows.push([e.id,e.name,e.brand,e.model,e.sn,e.type,e.verify,e.cycle,e.lastCal,e.nextCal,
                 d===null?"":d,e.cert,e.status,e.location,e.inCharge,e.use,e.critical?"是":"否"]);
    });
    dl("计量设备台账_"+today()+".csv", rows);
    global.toast("已导出设备台账");
  }
  function exportReagent(){
    var rg=data("REAGENTS");
    var rows=[["编号","名称","CAS号","级别","规格","库存量","单位","储存位置","危险品分类",
               "生产厂家","批号","配制日","有效期","剩余天数","责任人","状态","标准物质证书"]];
    rg.forEach(function(r){
      var d=daysTo(r.expiry);
      rows.push([r.id,r.name,r.cas,r.grade,r.spec,r.qty,r.unit,r.location,r.hazard,r.maker,
                 r.prodNo,r.mfgDate,r.expiry,d===null?"":d,r.owner,r.status,r.cert||""]);
    });
    dl("试剂与危化品台账_"+today()+".csv", rows);
    global.toast("已导出试剂台账");
  }
  function exportSample(){
    var sm=data("SAMPLES");
    var rows=[["样品编号","样品名称","类别","生产批号","委托单位","生产日期","收样日期",
               "检验状态","检验报告号","结论","留样位置","留样量","留样到期","剩余天数","备注"]];
    sm.forEach(function(s){
      var d=daysTo(s.retainUntil);
      rows.push([s.id,s.name,s.cat,s.batch,s.maker,s.prodDate,s.recvDate,s.status,
                 s.testNo,s.result,s.retainPos,s.retainQty,s.retainUntil,d===null?"":d,s.note||""]);
    });
    dl("样品与留样台账_"+today()+".csv", rows);
    global.toast("已导出样品留样台账");
  }
  function exportQCPlan(){
    var p=data("QC_PLANS");
    var rows=[["编号","检测项目","检验方法","类别","空白试验","平行样","加标回收","标准物质",
               "判定标准","超限条件","责任人","频次"]];
    p.forEach(function(x){
      rows.push([x.id,x.item,x.method,x.itemCat,x.blank,x.dup,x.spike,x.refMat,x.criteria,x.critHigh,x.owner,x.freq]);
    });
    dl("质量控制方案_"+today()+".csv", rows);
    global.toast("已导出 QC 方案");
  }
  function exportQCRec(){
    var r=data("QC_RECORDS");
    var rows=[["记录号","方案编号","日期","检测项目","批次","空白","平行样","加标回收","标准物质","判定","执行人","备注"]];
    r.forEach(function(x){
      rows.push([x.id,x.planId,x.date,x.item,x.batch,x.blank,x.dup,x.spike,x.refMat,x.verdict,x.by,x.note||""]);
    });
    dl("质量控制记录_"+today()+".csv", rows);
    global.toast("已导出 QC 记录");
  }
  function exportPT(){
    var p=data("PT_PLANS");
    var rows=[["编号","年份","名称","组织方","类别","项目","计划日期","收样日期","报告日期","结果","状态","报告编号","备注"]];
    p.forEach(function(x){
      rows.push([x.id,x.year,x.name,x.org,x.cat,x.items,x.planDate,x.recvDate,x.reportDate,x.result,x.status,x.reportNo,x.note||""]);
    });
    dl("能力验证记录_"+today()+".csv", rows);
    global.toast("已导出能力验证记录");
  }
  function exportRecord(){
    if(!REC){ global.toast("先选一个方法","warn"); return; }
    var tpl=(global.LABDATA.RECORD_TEMPLATES||{})[REC.tpl] || {fields:[],calc:""};
    var rows=[["原始记录表 · "+REC.stdNo+" "+REC.title]];
    rows.push(["检验依据",REC.stdNo]);
    rows.push(["计算式",tpl.calc]);
    rows.push([]);
    rows.push(["记录项","记录值","提示"]);
    tpl.fields.forEach(function(f){
      rows.push([f.k, REC.vals[f.k]||"", f.hint||""]);
    });
    rows.push([]);
    rows.push(["检验人",REC.sign["检验人"]||"","签字：____________"]);
    rows.push(["复核人",REC.sign["复核人"]||"","签字：____________"]);
    rows.push(["检验日期",REC.sign["日期"]||"","____年__月__日"]);
    dl("原始记录_"+REC.stdNo+"_"+today()+".csv", rows);
    global.toast("已导出原始记录");
  }
  function printRecord(){
    if(!REC){ global.toast("先选一个方法","warn"); return; }
    var tpl=(global.LABDATA.RECORD_TEMPLATES||{})[REC.tpl] || {fields:[],calc:""};
    var w=window.open("","_blank");
    if(!w){ global.toast("浏览器拦截了新窗口，请允许弹出窗口","warn"); return; }
    var h=[];
    h.push("<html><head><meta charset='utf-8'><title>"+esc(REC.stdNo)+"</title><style>");
    h.push("@page{size:A4 portrait;margin:2cm 1.8cm;}");
    h.push("body{font-family:'Microsoft YaHei',SimSun,sans-serif;font-size:10pt;line-height:1.6;}");
    h.push("h1{font-size:15pt;text-align:center;margin:0 0 4pt;}");
    h.push("h2{font-size:11pt;margin:10pt 0 4pt;}");
    h.push("table{border-collapse:collapse;width:100%;}");
    h.push("td,th{border:0.5pt solid #666;padding:4pt 5pt;font-size:9pt;height:22pt;}");
    h.push("th{background:#f2f2f2;width:32%;text-align:left;}");
    h.push(".calc{font-size:9pt;background:#f7f7f7;padding:5pt 8pt;border:0.5pt solid #999;margin:6pt 0;}");
    h.push(".sign td{height:34pt;}");
    h.push("</style></head><body>");
    h.push("<h1>检验原始记录表</h1>");
    h.push("<div style='text-align:center;font-size:10pt;margin-bottom:8pt'>"+esc(REC.stdNo+" "+REC.title)+"</div>");
    h.push("<div class='calc'><b>计算式：</b>"+esc(tpl.calc)+"</div>");
    h.push("<table><tbody>");
    tpl.fields.forEach(function(f){
      var v=REC.vals[f.k]||"";
      h.push("<tr><th>"+esc(f.k)+(f.hint?"<br><span style='font-weight:normal;font-size:8pt;color:#666'>"+esc(f.hint)+"</span>":"")+"</th><td>"+esc(v)+"</td></tr>");
    });
    h.push("</tbody></table>");
    h.push("<table class='sign' style='margin-top:14pt'><tbody>");
    h.push("<tr><th>检验人签字</th><td>"+esc(REC.sign["检验人"]||"")+"</td><th style='width:18%'>日期</th><td>"+esc(REC.sign["日期"]||"")+"</td></tr>");
    h.push("<tr><th>复核人签字</th><td>"+esc(REC.sign["复核人"]||"")+"</td><th>日期</th><td>"+esc(REC.sign["日期"]||"")+"</td></tr>");
    h.push("</tbody></table>");
    h.push("<p style='font-size:8.5pt;color:#555;margin-top:12pt'>本记录须现场手写，不得事后补记。"
      +"由「食品质量与安全管理系统」生成空白表单框架。</p>");
    h.push("</body></html>");
    w.document.write(h.join("\n"));
    w.document.close();
    setTimeout(function(){ w.focus(); w.print(); }, 400);
  }

  /* ================================================================
     导出 API
     ================================================================ */
  global.LAB = {
    render: render,
    go: go,
    setCap: setCap,
    addCapability: addCapability,
    delCap: delCap,
    pickMethod: pickMethod,
    filterMethods: filterMethods,
    setManualField: setManualField,
    cancelManual: cancelManual,
    addManualMethod: addManualMethod,
    methodOptions: methodOptions,
    setRec: setRec,
    setSign: setSign,
    openMethod: openMethod,
    exportCapability: exportCapability,
    exportEquip: exportEquip,
    exportReagent: exportReagent,
    exportSample: exportSample,
    exportQCPlan: exportQCPlan,
    exportQCRec: exportQCRec,
    exportPT: exportPT,
    exportRecord: exportRecord,
    printRecord: printRecord
  };

})(window);
