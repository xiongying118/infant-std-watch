/* ================================================================
   labbench.js —— 实验室管理工具台（2026-11-01 新增）
   ================================================================
   实验室版块原来只有两个只读页（JSA + 方法原理），
   日常真正要管的东西一样都没有：
     · 设备校准到期了没人知道
     · 试剂过期还在用
     · 留样找不到 / 过期没处置
     · QC 超限没闭环
     · 生产/品控/研发问「能测什么」要翻半天才找到
     · 原始记录每次现编，格式各不相同

   这里补齐 7 个工具，都是台账型（能查、能算、能导出）：
     ① 检测能力矩阵   自检什么 · 什么方法 · 多久 · 谁授权 · 自检或分包
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

  var TAB = "equip";     // equip | reagent | sample | qc | pt | record
  var ST = {};                // 本机覆盖层
  var REC = null;             // 当前原始记录草稿

  /* ===== 按检测项目的真实模板（2026-11-15 重做）=====
     prototype/labrecord.js 由 9 份 Word 原表的原生 OOXML 1:1 生成：
     段落 / 表格 / 合并单元格 / 公式图片 / 页眉页脚一字不改。
     这里只做「填空」：
       · 样品名称、生产商、批号或生产日期 —— 填一次，全部项目自动带出
       · 标准溶液编码、有效期至 —— 保留 Word 原值；只有过期重配时
         在「标准溶液维护」里改一次，本机记住，打印时无需填写 */
  var LRMODE  = "project";    // project | method
  var LRINFO  = null;         // 兼容旧数据：单条样品信息（lab.record.info.v2）
  var LRROWS  = null;         // ★ 样品清单（可 Excel 导入多行）[{sample,maker,batch,date}]
  var LRPREVIEW = 0;          // 当前预览的是清单里第几行（0 起）
  var LRSEL   = null;         // 选中的项目 {key:1}
  var LRSOL   = null;         // 标准溶液覆盖表 {名称:{code,expiry}}
  var LRSOLVIEW = null;       // 标准溶液维护查看范围：null=跟随项目 / "all" / 项目 key
  var LRSOLVIEW_READ = false; // 本机范围只读一次，null 本身也是有效状态
  var LR_MAT_KEYS = {matbatch:"批号",matdry:"干物质重量",matgos:"GOS干含量"};
  var LR_MAT_DEF = {matbatch:"GOA5282001",matdry:"75",matgos:"57"};
  /* ★ 同批配制的标准溶液联动组：组内共用一套「配制日期+有效期」，
     维护界面只显示主项一行，改一处按各自前缀生成全部成员的编码/有效期。
      minerals（钠钾铜镁铁锌锰钙 042~049）是同时配制的混合元素标液。 */
  var SOL_LINK_GROUPS = [
    {master:"钠", label:"钠标准溶液",
     names:["钠","钾","铜","镁","铁","锌","锰","钙"]}
  ];
  function solLinkOf(name){
    for(var i=0;i<SOL_LINK_GROUPS.length;i++){
      var g=SOL_LINK_GROUPS[i];
      if(g.names.indexOf(name)>=0) return g;
    }
    return null;
  }
  var LRGROUP = null;         // ★ 分类：phys 理化组 / chrom 色谱组 / all 全部
  var LRGROUP_READ = false;
  var LRSUBMAP = {};          // ★ 三组二级子组选择 {chrom,phys,atom}，每组各一个
  var LRSUBREAD = false;
  var LRNOTES = true;         // 兼容旧调用（方法说明已在原表内）

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
      ["equip",     "计量设备台账"],
      ["reagent",   "试剂与危化品"],
      ["prep",      "试剂配制记录"],
      ["sample",    "样品与留样"],
      ["flows",     "样品流转"],
      ["orders",    "检验任务单"],
      ["qcplan",    "QC 方案"],
      ["qcrec",     "QC 记录"],
      ["pt",        "能力验证"],
      ["capa",      "不符合与 CAPA"],
      ["audit",     "内审与合规"],
      ["workload",  "工作量统计"],
      ["env",       "环境监控"],
      ["cost",      "成本核算"],
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
                       "capa","audit","env","qcplan","qcrec","pt"];
    if(TAB==="board"){ host.innerHTML = boardView(); return; }
    if(LEDGER_TABS.indexOf(TAB) >= 0){
      global.Ledger.render(TAB);
      return;
    }
    if(TAB==="workload"){ host.innerHTML = viewWorkload(); return; }
    if(TAB==="cost"){ host.innerHTML = viewCost(); return; }
    host.innerHTML = viewRecord();
  }



  /* ================================================================
     成本核算（2026-11-26 用户要求）
     ================================================================
     项目 → 试剂/耗材 → 单次用量 × 检测次数 → 汇总 → 单价 → 总成本
     用量/次数/单价都能改，改完即时重算并落本机。
     ================================================================ */
  function costData(){
    var base = global.LABCOST || { MATS:{}, ITEMS:[] };
    var ov = (global.Store && global.Store.get("lab.cost.v1", null));
    /* 版本变了（新增项目/物料）就换新种子，旧的本机覆盖作废 */
    if(ov && ov.items && ov.mats && ov.ver===base.ver) return ov;
    return JSON.parse(JSON.stringify({ items: base.ITEMS||[], mats: base.MATS||{}, ver: base.ver }));
  }
  function costSave(d){
    d.ver = (global.LABCOST||{}).ver;
    if(global.Store) global.Store.set("lab.cost.v1", d);
  }
  function viewCost(){
    var D = costData(), items = D.items||[], mats = D.mats||{};
    /* 检测次数直接取「工作量统计」里该项目的检测项次，两边同一口径 */
    var NOWC = new Date(2026,10,25);
    function inCP(d){
      if(COST_PERIOD==="all") return true;
      if(d.getFullYear()!==NOWC.getFullYear()) return false;
      if(COST_PERIOD==="month") return d.getMonth()===NOWC.getMonth();
      if(COST_PERIOD==="quarter") return Math.floor(d.getMonth()/3)===Math.floor(NOWC.getMonth()/3);
      return true;
    }
    function autoTimes(keys){
      var os=(global.Ledger&&global.Ledger.rows("orders"))||[], n=0;
      os.forEach(function(o){
        if(!o.tester||!o.recv) return;
        var d=new Date(String(o.recv)+"T00:00:00"); if(isNaN(d)||!inCP(d)) return;
        String(o.items||"").split(/[、,，;；]/).forEach(function(it){
          if(keys.indexOf(it.trim())>=0) n++;
        });
      });
      return n;
    }
    function tOf(it){
      if(it.keys && it.keys.length){
        var n = autoTimes(it.keys);
        if(n > 0) return n;
      }
      return (+it.times||0);
    }

    var sum={}, total=0, projCost=[], groupCost={};
    items.forEach(function(it){
      var t=tOf(it), pc=0;
      (it.rows||[]).forEach(function(r){
        var m=r[0], per=+r[1]||0;
        if(!sum[m]) sum[m]={qty:0, price:+((mats[m]||{}).price)||0, unit:(mats[m]||{}).unit||""};
        sum[m].qty += per*t;
        pc += per*t*sum[m].price;
      });
      projCost.push({name:it.item, cost:pc});
      groupCost[it.bench||"未分组"] = (groupCost[it.bench||"未分组"]||0) + pc;
      total += pc;
    });
    var ml = Object.keys(sum).map(function(k){ return {name:k, qty:sum[k].qty, price:sum[k].price, unit:sum[k].unit, cost:sum[k].qty*sum[k].price}; })
      .sort(function(a,b){ return b.cost-a.cost; });
    projCost.sort(function(a,b){ return b.cost-a.cost; });
    var gl = Object.keys(groupCost).map(function(k){ return {name:k, cost:groupCost[k]}; }).sort(function(a,b){ return b.cost-a.cost; });
    var maxM = Math.max.apply(null, ml.map(function(x){return x.cost;}).concat([1]));
    var maxP = Math.max.apply(null, projCost.map(function(x){return x.cost;}).concat([1]));
    var COL = ["#3B82F6","#22C55E","#F59E0B","#A855F7","#EF4444","#06B6D4","#EC4899","#14B8A6","#6366F1","#F97316"];

    var h = '<div class="wl-filter"><div class="wl-seg">'
      + [["month","本月"],["quarter","本季"],["year","本年"],["all","全部"]].map(function(x){
          return '<button class="'+(COST_PERIOD===x[0]?"on":"")+'" onclick="LAB.costPeriod(\''+x[0]+'\')">'+x[1]+'</button>';
        }).join("")
      + '</div><span class="muted">检测次数取自「工作量统计」的检测项次，改任务单这里跟着变</span></div>';

    h += '<div class="grid g4" style="margin-bottom:14px">'
      + '<div class="kpi"><div class="k">检测项目</div><div class="v">'+items.length+'</div><div class="d">参与核算的项目数</div></div>'
      + '<div class="kpi"><div class="k">试剂耗材</div><div class="v">'+ml.length+'</div><div class="d">去重后的物料种类</div></div>'
      + '<div class="kpi"><div class="k">检测次数</div><div class="v">'+items.reduce(function(a,x){return a+tOf(x);},0)+'</div><div class="d">与工作量统计同口径</div></div>'
      + '<div class="kpi hi"><div class="k">总成本</div><div class="v">'+total.toFixed(0)+'<span style="font-size:14px"> 元</span></div><div class="d">∑ 用量×次数×单价</div></div>'
      + '</div>';

    /* 图表区：4 个 */
    var acc=0, C=2*Math.PI*58, ring="";
    ml.slice(0,6).forEach(function(x,i){
      var len=x.cost/(total||1)*C;
      ring += '<circle cx="76" cy="76" r="58" fill="none" stroke="'+COL[i%COL.length]+'" stroke-width="24" '
        + 'stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" stroke-dashoffset="'+(-acc).toFixed(2)+'" '
        + 'transform="rotate(-90 76 76)" style="cursor:pointer" onclick="LAB.costPick(\''+esc(x.name)+'\')"></circle>';
      acc += len;
    });
    var restCost = total - ml.slice(0,6).reduce(function(a,x){ return a+x.cost; },0);
    if(restCost > 0.01){
      var rlen = restCost/(total||1)*C;
      ring += '<circle cx="76" cy="76" r="58" fill="none" stroke="#84CC16" stroke-width="24" '
        + 'stroke-dasharray="'+rlen.toFixed(2)+' '+(C-rlen).toFixed(2)+'" stroke-dashoffset="'+(-acc).toFixed(2)+'" '
        + 'transform="rotate(-90 76 76)"><title>其余 '+(ml.length-6)+' 种物料 '+restCost.toFixed(0)+' 元</title></circle>';
      acc += rlen;
    }
    var maxG = Math.max.apply(null, gl.map(function(x){return x.cost;}).concat([1]));
    h += '<div class="wl-grid">';
    h += '<div class="card"><div class="card-h"><h3>物料成本 Top 10</h3><span class="muted">元</span></div><div class="wl-bars">';
    ml.slice(0,10).forEach(function(x,i){
      var w=Math.max(2, x.cost/maxM*100);
      h += '<div class="wl-row"><span class="nm" style="flex-basis:118px">'+esc(x.name)+'</span>'
         + '<div class="wl-track"><i style="width:'+w.toFixed(1)+'%;background:'+COL[i%COL.length]+'"></i></div>'
         + '<b>'+x.cost.toFixed(0)+'</b></div>';
    });
    h += '</div></div>';
    h += '<div class="card"><div class="card-h"><h3>物料成本占比</h3><span class="muted">前 6 项 · 合计 '+total.toFixed(0)+' 元</span></div>'
       + '<svg class="wl-donut2" viewBox="0 0 152 152">'+ring
       + '<text x="76" y="75" text-anchor="middle" style="font-size:20px;font-weight:700;fill:#0f2747">'+total.toFixed(0)+'</text>'
       + '<text x="76" y="92" text-anchor="middle" style="font-size:10px;fill:#64748b">元</text></svg>'
       + '<div class="wl-legend2" style="justify-content:center">';
    ml.slice(0,6).forEach(function(x,i){
      h += '<span><i style="background:'+COL[i%COL.length]+'"></i>'+esc(x.name)+' '+(total?(x.cost/total*100).toFixed(0):0)+'%</span>';
    });
    if(restCost > 0.01){
      h += '<span><i style="background:#84CC16"></i>其余 '+(ml.length-6)+' 种 '+(restCost/(total||1)*100).toFixed(0)+'%</span>';
    }
    h += '</div></div></div>';

    h += '<div class="wl-grid" style="margin-top:14px">';
    h += '<div class="card"><div class="card-h"><h3>各检测项目成本</h3><span class="muted">元</span></div><div class="wl-bars">';
    projCost.forEach(function(x,i){
      var w=Math.max(2, x.cost/maxP*100);
      h += '<div class="wl-row"><span class="nm" style="flex-basis:118px">'+esc(x.name)+'</span>'
         + '<div class="wl-track"><i style="width:'+w.toFixed(1)+'%;background:'+COL[i%COL.length]+'"></i></div>'
         + '<b>'+x.cost.toFixed(0)+'</b></div>';
    });
    h += '</div></div>';
    h += '<div class="card"><div class="card-h"><h3>按组成本</h3><span class="muted">理化 / 色谱 / 原子 / 微生物</span></div><div class="wl-bars">';
    gl.forEach(function(x,i){
      var w=Math.max(2, x.cost/maxG*100);
      h += '<div class="wl-row"><span class="nm" style="flex-basis:96px">'+esc(x.name)+'</span>'
         + '<div class="wl-track"><i style="width:'+w.toFixed(1)+'%;background:'+COL[(i+2)%COL.length]+'"></i></div>'
         + '<b>'+x.cost.toFixed(0)+'</b></div>';
    });
    h += '</div></div></div>';

    /* 明细 */
    h += '<div class="card" style="margin-top:14px;padding:0;overflow:hidden"><div class="card-h" style="padding:12px 14px 6px">'
       + '<h3>项目 × 试剂耗材明细</h3><span class="muted">改用量或单价 → 汇总与图表即时变；次数按工作量自动</span></div>'
       + '<div class="twrap"><table class="ledger-tbl cost-tbl"><thead><tr>'
       + '<th style="width:180px">检测项目</th><th style="width:160px">试剂 / 耗材</th><th style="width:96px">单次用量</th>'
       + '<th style="width:60px">单位</th><th style="width:104px">单价(元)</th><th style="width:96px">次数</th><th style="width:104px">小计(元)</th>'
       + '</tr></thead><tbody>';
    items.forEach(function(it, i){
      var t=tOf(it), pc=0;
      (it.rows||[]).forEach(function(r){
        var m=r[0], per=+r[1]||0, price=+((mats[m]||{}).price)||0;
        pc += per*t*price;
      });
      h += '<tr class="cost-grp"><td colspan="6"><b>'+esc(it.item)+'</b> <span class="muted">'+esc(it.bench||"")+'</span>'
         + ' <span class="muted">· 检测 '+t+' 次'+(it.keys&&it.keys.length?'（按工作量）':'')+'</span></td>'
         + '<td class="num"><b>'+pc.toFixed(0)+'</b></td></tr>';
      (it.rows||[]).forEach(function(r, j){
        var m=r[0], per=+r[1]||0, price=+((mats[m]||{}).price)||0;
        var sub=per*t*price;
        h += '<tr><td></td><td>'+esc(m)+'</td>'
           + '<td class="num"><input type="number" step="any" value="'+per+'" onchange="LAB.costSet('+i+','+j+',this.value)"></td>'
           + '<td style="text-align:center">'+esc((mats[m]||{}).unit||"")+'</td>'
           + '<td class="num"><input type="number" step="any" value="'+price+'" onchange="LAB.costPrice(\''+esc(m)+'\',this.value)"></td>'
           + '<td class="num">'+(it.keys&&it.keys.length
               ? '<b>'+t+'</b>'
               : '<input type="number" value="'+(+it.times||0)+'" onchange="LAB.costTimes('+i+',this.value)">')+'</td>'
           + '<td class="num">'+sub.toFixed(2)+'</td></tr>';
      });
    });
    h += '</tbody></table></div></div>';

    /* 汇总 */
    h += '<div class="card" style="margin-top:14px;padding:0;overflow:hidden"><div class="card-h" style="padding:12px 14px 6px">'
       + '<h3>相同试剂 / 耗材汇总</h3><span class="muted">总用量 = ∑ 单次用量 × 检测次数</span></div>'
       + '<div class="twrap"><table class="ledger-tbl cost-tbl"><thead><tr>'
       + '<th style="width:180px">试剂 / 耗材</th><th style="width:110px">总用量</th><th style="width:70px">单位</th>'
       + '<th style="width:110px">单价(元)</th><th style="width:120px">总成本(元)</th><th style="width:90px">占比</th>'
       + '</tr></thead><tbody>';
    ml.forEach(function(x){
      h += '<tr><td><b>'+esc(x.name)+'</b></td><td class="num">'+(+x.qty.toFixed(3))+'</td>'
         + '<td style="text-align:center">'+esc(x.unit)+'</td><td class="num">'+x.price+'</td>'
         + '<td class="num"><b>'+x.cost.toFixed(2)+'</b></td>'
         + '<td class="num">'+(total?(x.cost/total*100).toFixed(1):"0")+'%</td></tr>';
    });
    h += '<tr class="cost-total"><td><b>合计</b></td><td colspan="3"></td><td class="num"><b>'+total.toFixed(2)+'</b></td><td class="num">100%</td></tr>';
    h += '</tbody></table></div></div>';
    h += '<div class="muted" style="font-size:12px;margin-top:8px">单价按采购合同价改，用量按实际移取/称量改；次数来自工作量统计（'+({month:"本月",quarter:"本季",year:"本年",all:"全部"}[COST_PERIOD]||"本年")+'）。数据只存本机。</div>';
    return h;
  }

  /* ================================================================
     工作量统计（2026-11-25 用户要求）
     ================================================================
     双休、朝八晚五，不排班 —— 只看「样品流转到每个人手上的量」。
     统计口径：
       · 接收 / 分样：取「样品流转」里的 receiver / handler
       · 检测任务 / 项次：取「检验任务单」的 tester 与 items（按项目拆分）
     每个人的项目不同，所以项次比样品数更能反映真实负荷。
     ================================================================ */
  var WL_PERIOD = "month";
  var WL_PICK = null;
  var COST_PERIOD = "year";
  var LR_PREVIEW_KEY = null;
  function viewWorkload(){
    var L = global.Ledger;
    var orders = L.rows("orders") || [];
    var staff  = (global.LABDATA && global.LABDATA.STAFF) || [];
    var dept = {};
    staff.forEach(function(x){ dept[x.name] = x.dept || "—"; });
    var NOW = new Date(2026, 10, 25);
    function inRange(d){
      if(WL_PERIOD==="all") return true;
      if(d.getFullYear()!==NOW.getFullYear()) return false;
      if(WL_PERIOD==="month") return d.getMonth()===NOW.getMonth();
      if(WL_PERIOD==="quarter") return Math.floor(d.getMonth()/3)===Math.floor(NOW.getMonth()/3);
      return true;
    }
    function catOf(o){
      var c=o.client||"", sm=o.sample||"";
      if(/留样|稳定性/.test(c+sm)) return "稳定性";
      if(/研发|小样/.test(c+sm)) return "小样";
      if(/原料库/.test(c)) return "原料";
      if(/生产一部|过程样|半成品/.test(c+sm)) return "半成品";
      if(/成品库|婴配成品/.test(c+sm)) return "成品";
      return "其他";
    }
    var M={}, itemTot={}, catTot={}, monthTot={}, GM={}, ordersN=0;
    orders.forEach(function(o){
      if(!o.tester || !o.recv) return;
      var d = new Date(String(o.recv)+"T00:00:00");
      if(isNaN(d) || !inRange(d)) return;
      var cat = catOf(o);
      var its = String(o.items||"").split(/[、,，;；]/).map(function(v){ return v.trim(); }).filter(Boolean);
      if(!its.length) its = ["(未填项目)"];
      var p = M[o.tester] || (M[o.tester] = {name:o.tester, dept:dept[o.tester]||"—", cat:{}, item:{}, samples:0, items:0});
      p.samples++; p.cat[cat]=(p.cat[cat]||0)+1; catTot[cat]=(catTot[cat]||0)+1; ordersN++;
      var mk = String(o.recv).slice(0,7); monthTot[mk]=(monthTot[mk]||0)+its.length;
      var dpt = dept[o.tester] || "—";
      GM[dpt] = GM[dpt] || {};
      GM[dpt][mk] = (GM[dpt][mk]||0) + its.length;
      its.forEach(function(it){ p.item[it]=(p.item[it]||0)+1; p.items++; itemTot[it]=(itemTot[it]||0)+1; });
    });
    var list = Object.keys(M).map(function(k){ return M[k]; }).sort(function(a,b){ return b.items-a.items; });
    var items = Object.keys(itemTot).sort(function(a,b){ return itemTot[b]-itemTot[a]; });
    var CATS = ["原料","半成品","成品","稳定性","小样","其他"];
    var totItems = list.reduce(function(a,x){ return a+x.items; },0);
    var maxItems = Math.max.apply(null, list.map(function(x){ return x.items; }).concat([1]));
    var COL = ["#1d4ed8","#0f9d76","#a16207","#7c3aed","#c2410c","#64748b"];
    var CATCOL = {"原料":"#3B82F6","半成品":"#22C55E","成品":"#F59E0B","稳定性":"#A855F7","小样":"#EF4444","其他":"#06B6D4"};
    var MONTHS = [];
    for(var mi=1; mi<=12; mi++) MONTHS.push("2026-"+(mi<10?"0":"")+mi);
    var GCOL = {"理化组":"#1d4ed8","色谱组":"#0f9d76","原子组":"#a16207","微生物组":"#7c3aed","样品室":"#64748b","质量部":"#94a3b8"};

    var h = '<div class="wl-filter"><div class="wl-seg">'
      + [["month","本月"],["quarter","本季"],["year","本年"],["all","全部"]].map(function(x){
          return '<button class="'+(WL_PERIOD===x[0]?"on":"")+'" onclick="LAB.setWlPeriod(\''+x[0]+'\')">'+x[1]+'</button>';
        }).join("")
      + '</div><span class="muted">统计范围：'+(WL_PERIOD==="month"?"2026 年 11 月":(WL_PERIOD==="quarter"?"2026 年 Q4":(WL_PERIOD==="year"?"2026 全年":"全部记录")))+'</span>'
      + '<span class="sp" style="flex:1"></span><span class="muted">按样品流转与检验任务单的检验人统计</span></div>';

    h += '<div class="grid g4" style="margin-bottom:14px">'
      + '<div class="kpi"><div class="k">样品批次</div><div class="v">'+ordersN+'</div><div class="d">有检验人的任务单</div></div>'
      + '<div class="kpi"><div class="k">检测项次</div><div class="v">'+totItems+'</div><div class="d">按每单项目拆分</div></div>'
      + '<div class="kpi"><div class="k">参与人员</div><div class="v">'+list.length+'</div><div class="d">承担检测的人</div></div>'
      + '<div class="kpi"><div class="k">人均项次</div><div class="v">'+(list.length?(totItems/list.length).toFixed(1):"0")+'</div><div class="d">项次 ÷ 人数</div></div>'
      + '</div>';

    if(!list.length){
      return h + '<div class="card empty">这个范围内没有带检验人的任务单 —— 换「本年/全部」看看，或先在检验任务单里填检验人。</div>';
    }

    /* ⓪ 按组统计 */
    var G={};
    list.forEach(function(p){
      var g = G[p.dept] || (G[p.dept] = {name:p.dept, cat:{}, item:{}, samples:0, items:0});
      g.samples += p.samples; g.items += p.items;
      Object.keys(p.cat).forEach(function(c){ g.cat[c]=(g.cat[c]||0)+p.cat[c]; });
      Object.keys(p.item).forEach(function(it){ g.item[it]=(g.item[it]||0)+p.item[it]; });
    });
    var glist = Object.keys(G).map(function(k){ return G[k]; }).sort(function(a,b){ return b.items-a.items; });
    h += '<div class="card" style="padding:0;overflow:hidden"><div class="card-h" style="padding:12px 14px 6px">'
       + '<h3>按组统计</h3><span class="muted">理化组 · 色谱组 · 原子组 · 微生物组</span></div>'
       + '<div class="twrap"><table class="ledger-tbl wl-matrix wl-wide"><thead><tr><th>组别</th><th>样品数</th><th>项次</th>';
    items.forEach(function(it){ h += '<th>'+esc(it)+'</th>'; });
    h += '</tr></thead><tbody>';
    glist.forEach(function(g){
      h += '<tr><td><b><i class="wl-dot" style="background:'+(GCOL[g.name]||"#94a3b8")+'"></i>'+esc(g.name)+'</b></td>'
         + '<td class="num">'+g.samples+'</td><td class="num"><b>'+g.items+'</b></td>';
      items.forEach(function(it){
        var v=g.item[it]||0;
        h += '<td class="num'+(v?"":" zero")+'">'+(v||"·")+'</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="twrap" style="border-top:1px solid #eef2f7"><table class="ledger-tbl wl-matrix"><thead><tr><th>组别</th>';
    CATS.forEach(function(c){ h += '<th>'+c+'</th>'; });
    h += '<th>样品合计</th></tr></thead><tbody>';
    glist.forEach(function(g){
      h += '<tr><td><b>'+esc(g.name)+'</b></td>';
      CATS.forEach(function(c){ var v=g.cat[c]||0; h += '<td class="num'+(v?"":" zero")+'">'+(v||"·")+'</td>'; });
      h += '<td class="num"><b>'+g.samples+'</b></td></tr>';
    });
    h += '</tbody></table></div></div>';

    var gmax = Math.max.apply(null, glist.map(function(g){ return g.items; }).concat([1]));
    var gall = glist.reduce(function(a,g){ return a+g.items; },0)||1;
    h += '<div class="card" style="margin-top:14px"><div class="card-h"><h3>各组检测项次</h3><span class="muted">条长按项次，数字为占比</span></div><div class="wl-bars">';
    glist.forEach(function(g){
      var w=Math.max(2, g.items/gmax*100);
      h += '<div class="wl-row"><span class="nm">'+esc(g.name)+'</span>'
         + '<div class="wl-track"><i style="width:'+w.toFixed(1)+'%;background:'+(GCOL[g.name]||"#94a3b8")+'"></i></div>'
         + '<b>'+(g.items/gall*100).toFixed(0)+'%</b></div>';
    });
    h += '</div></div>';

    var g2 = glist.filter(function(g){ return g.items>0; });
    var catKeys = CATS.filter(function(c){ return catTot[c]; });
    var cTotal = catKeys.reduce(function(a,c){ return a+catTot[c]; },0)||1;
    var RD=62, CXX=80, CYY=80, SW=26, CIRC=2*Math.PI*RD, acc2=0, slices="";
    catKeys.forEach(function(c){
      var len = catTot[c]/cTotal*CIRC;
      var on = (WL_PICK===c);
      if(on){
        slices += '<circle cx="'+CXX+'" cy="'+CYY+'" r="'+RD+'" fill="none" stroke="'+CATCOL[c]+'" stroke-width="'+(SW+10)+'" '
          + 'stroke-dasharray="'+len.toFixed(2)+' '+(CIRC-len).toFixed(2)+'" stroke-dashoffset="'+(-acc2).toFixed(2)+'" '
          + 'transform="rotate(-90 '+CXX+' '+CYY+')" opacity="0.18"/>';
      }
      slices += '<circle cx="'+CXX+'" cy="'+CYY+'" r="'+RD+'" fill="none" stroke="'+CATCOL[c]+'" stroke-width="'+(on?SW+4:SW)+'" '
        + 'stroke-dasharray="'+len.toFixed(2)+' '+(CIRC-len).toFixed(2)+'" stroke-dashoffset="'+(-acc2).toFixed(2)+'" '
        + 'transform="rotate(-90 '+CXX+' '+CYY+')" style="cursor:pointer" '
        + 'onclick="LAB.wlPick(\''+(WL_PICK===c?"":c)+'\')"><title>'+c+' '+catTot[c]+' 份</title></circle>';
      acc2 += len;
    });
    h += '<div class="card"><div class="card-h"><h3>样品类别占比</h3><span class="muted">点扇区或图例看该类别</span></div>'
       + '<svg class="wl-donut2" viewBox="0 0 160 160">'+slices
       + '<text x="80" y="79" text-anchor="middle" style="font-size:22px;font-weight:700;fill:#0f2747">'+(WL_PICK?catTot[WL_PICK]:ordersN)+'</text>'
       + '<text x="80" y="96" text-anchor="middle" style="font-size:10px;fill:#64748b">'+(WL_PICK?esc(WL_PICK):'份')+'</text>'
       + '</svg><div class="wl-legend2" style="justify-content:center">';
    catKeys.forEach(function(c){
      h += '<span class="'+(WL_PICK===c?'on':'')+'" style="cursor:pointer" onclick="LAB.wlPick(\''+(WL_PICK===c?"":c)+'\')">'
         + '<i style="background:'+CATCOL[c]+'"></i>'+c+' '+catTot[c]+'</span>';
    });
    h += '</div>'+(WL_PICK?'<div class="wl-pick">已筛选「'+esc(WL_PICK)+'」'+catTot[WL_PICK]+' 份 · 再点一次取消</div>':'')+'</div>';
    var topItems = items.slice(0,10);
    var tmax = Math.max.apply(null, topItems.map(function(it){ return itemTot[it]; }).concat([1]));
    h += '<div class="card"><div class="card-h"><h3>检测项目 Top 10</h3><span class="muted">按项次</span></div><div class="wl-bars">';
    topItems.forEach(function(it){
      var w=Math.max(2, itemTot[it]/tmax*100);
      h += '<div class="wl-row"><span class="nm" style="flex-basis:104px">'+esc(it)+'</span>'
         + '<div class="wl-track"><i style="width:'+w.toFixed(1)+'%;background:#0f9d76"></i></div><b>'+itemTot[it]+'</b></div>';
    });
    h += '</div></div></div>';

    var gmVals=[];
    g2.forEach(function(g){ MONTHS.forEach(function(mk){ gmVals.push((GM[g.name]&&GM[g.name][mk])||0); }); });
    var gmax2 = Math.max.apply(null, gmVals.concat([1]));
    h += '<div class="card" style="margin-top:14px;padding:0;overflow:hidden"><div class="card-h" style="padding:12px 14px 6px">'
       + '<h3>组 × 月度项次热力</h3><span class="muted">颜色越深项次越多，可看出忙季</span></div>'
       + '<div class="twrap"><table class="ledger-tbl wl-heat"><thead><tr><th>组别</th>';
    MONTHS.forEach(function(mk){ h += '<th>'+mk.slice(5)+'月</th>'; });
    h += '</tr></thead><tbody>';
    g2.forEach(function(g){
      h += '<tr><td><b>'+esc(g.name)+'</b></td>';
      MONTHS.forEach(function(mk){
        var v=(GM[g.name]&&GM[g.name][mk])||0;
        var al = v ? (0.12 + v/gmax2*0.75) : 0;
        var fg = (v/gmax2 > 0.55) ? "#fff" : "#1f2d3d";
        h += '<td class="num" style="background:rgba(29,78,216,'+al.toFixed(2)+');color:'+fg+'">'+(v||"·")+'</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    /* ① 人员 × 项目矩阵 */
    h += '<div class="card" style="padding:0;overflow:hidden"><div class="card-h" style="padding:12px 14px 6px">'
       + '<h3>人员 × 检测项目（样品数）</h3><span class="muted">只统计此人实际承担的项目</span></div>'
       + '<div class="twrap"><table class="ledger-tbl wl-matrix wl-wide"><thead><tr><th>人员</th><th>组</th>';
    items.forEach(function(it){ h += '<th>'+esc(it)+'</th>'; });
    h += '<th>项次合计</th></tr></thead><tbody>';
    list.forEach(function(p){
      h += '<tr><td><b>'+esc(p.name)+'</b></td><td>'+esc(p.dept)+'</td>';
      items.forEach(function(it){
        var v = p.item[it]||0;
        h += '<td class="num'+(v?"":" zero")+'">'+(v||"·")+'</td>';
      });
      h += '<td class="num"><b>'+p.items+'</b></td></tr>';
    });
    h += '</tbody></table></div></div>';

    /* ② 人员 × 样品类别 */
    h += '<div class="card" style="margin-top:14px;padding:0;overflow:hidden"><div class="card-h" style="padding:12px 14px 6px">'
       + '<h3>人员 × 样品类别（样品数）</h3><span class="muted">原料 / 半成品 / 成品 / 稳定性 / 小样</span></div>'
       + '<div class="twrap"><table class="ledger-tbl wl-matrix"><thead><tr><th>人员</th>';
    CATS.forEach(function(c){ h += '<th>'+c+'</th>'; });
    h += '<th>样品合计</th></tr></thead><tbody>';
    list.forEach(function(p){
      h += '<tr><td><b>'+esc(p.name)+'</b></td>';
      CATS.forEach(function(c){
        var v=p.cat[c]||0;
        h += '<td class="num'+(v?"":" zero")+'">'+(v||"·")+'</td>';
      });
      h += '<td class="num"><b>'+p.samples+'</b></td></tr>';
    });
    h += '</tbody></table></div></div>';

    /* ③ 图：每人项次 + 类别构成 */
    h += '<div class="wl-grid" style="margin-top:14px">';
    h += '<div class="card"><div class="card-h"><h3>每人检测项次</h3><span class="muted">项目不同，项次比样品数更能反映负荷</span></div><div class="wl-bars">';
    list.forEach(function(p){
      var w=Math.max(2,p.items/maxItems*100);
      var k=Object.keys(CATCOL).indexOf(p.dept); 
      h += '<div class="wl-row"><span class="nm">'+esc(p.name)+'</span>'
         + '<div class="wl-track"><i style="width:'+w.toFixed(1)+'%;background:#1d4ed8"></i></div>'
         + '<b>'+p.items+'</b></div>';
    });
    h += '</div></div>';
    h += '<div class="card"><div class="card-h"><h3>各人样品类别构成</h3><span class="muted">每人样品合计 100%</span></div><div class="wl-stack">';
    list.forEach(function(p){
      var tot=p.samples||1;
      h += '<div class="wl-st"><span class="nm">'+esc(p.name)+'</span><div class="bar">';
      CATS.forEach(function(c){
        var v=p.cat[c]||0; if(!v) return;
        h += '<i style="width:'+(v/tot*100).toFixed(1)+'%;background:'+CATCOL[c]+'"></i>';
      });
      h += '</div><span class="wl-num">'+p.samples+' 份</span></div>';
    });
    h += '</div><div class="wl-legend2" style="margin-top:10px">';
    CATS.forEach(function(c){ h += '<span><i style="background:'+CATCOL[c]+'"></i>'+c+'</span>'; });
    h += '</div></div></div>';

    /* ④ 月度趋势（本年/全部时显示） */
    if(WL_PERIOD==="year" || WL_PERIOD==="all"){
      var mks=MONTHS.slice();
      var mx=Math.max.apply(null,mks.map(function(k){return monthTot[k]||0;}).concat([1]));
      h += '<div class="card" style="margin-top:14px"><div class="card-h"><h3>月度检测项次趋势</h3><span class="muted">按收样月份</span></div><div class="wl-trend">';
      mks.forEach(function(k){
        var v=monthTot[k]||0, hh=v?Math.max(3, v/mx*100):1.5;
        h += '<div class="b"><i style="height:'+hh.toFixed(1)+'%;'+(v?'':'background:#e2e8f0')+'"></i>'
           + '<span>'+k.slice(5)+'月</span><b style="font-size:11px;color:'+(v?'#0f2747':'#94a3b8')+'">'+(v||0)+'</b></div>';
      });
      h += '</div></div>';
    }

    h += '<div class="muted" style="font-size:12px;margin-top:8px">统计口径：一批样品按任务单的「检验项目」逐项计入承担人；'
       + '类别按报检来源判定（原料库→原料、生产一部→半成品、成品库→成品、留样室→稳定性、研发部→小样）。</div>';
    return h;
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
      <div class="kpi"><div class="k">低</div><div class="v">${lo}</div><div class="d">留样到期、任务单积压</div></div>
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
       任务单   → 待复核的有几单、压着几天了
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

    /* ⑥ 任务单待复核 / 加急 */
    try{
      var od = L.rows("orders");
      var wait = od.filter(function(o){ return o.status==="待复核"; });
      var urg = od.filter(function(o){ return o.urgent && o.status!=="已出报告"; });
      if(wait.length){
        out.push({
          lvl:"中", tab:"任务单",
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
        <span class="muted">生产、品控、研发问「能测什么、什么方法、多久、谁授权」，这张表就是答案</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.addCapability()">+ 加一个项目</button>
        <button class="btn sm" onclick="LAB.exportCapability()">⬇ 导出能力表</button></div>
      <div class="flex" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="search" style="width:280px"><span class="muted">🔍</span>
          <input id="capQ" placeholder="搜项目、方法、标准号" oninput="LAB.render()"></div>
        <span class="muted" id="capCnt"></span>
        <div class="sp" style="flex:1"></div>
        <span class="muted">点「方法」看原理与试剂 →</span>
      </div>
      <div class="twrap-tip">← 左右拖动查看全部列 →</div>
      <div class="twrap"><table class="ledger-tbl cap-tbl">
        <thead><tr><th style="width:130px">检测项目</th><th style="width:260px">检验方法</th>
          <th style="width:76px">类别</th><th style="width:80px">周期(天)</th><th style="width:96px">检测方式</th>
          <th style="width:150px">强制性</th><th style="width:90px">主检人</th><th>依赖资源</th><th style="width:40px"></th></tr></thead>
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
            <td><textarea rows="1" oninput="LAB.setCap(${ci},'item',this.value)">${esc(c.item)}</textarea></td>
            <td><textarea rows="1" oninput="LAB.setCap(${ci},'method',this.value)">${esc(c.method)}</textarea></td>
            <td><textarea rows="1" oninput="LAB.setCap(${ci},'cat',this.value)">${esc(c.cat)}</textarea></td>
            <td style="text-align:center"><input type="number" value="${c.days}" style="width:46px;text-align:center"
              oninput="LAB.setCap(${ci},'days',this.value)"></td>
            <td style="text-align:center"><input type="text" value="${esc(c.price)}" style="text-align:center"
              oninput="LAB.setCap(${ci},'price',this.value)"></td>
            <td><textarea rows="1" oninput="LAB.setCap(${ci},'acc',this.value)">${esc(c.acc)}</textarea></td>
            <td style="text-align:center"><input type="text" value="${s?s.name:""}" style="text-align:center"
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
          <th style="width:130px">来源 / 生产线</th><th style="width:96px">生产日期</th>
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
        可疑值不是失败，但<b>必须做原因分析并留档</b> —— 二方审核与监管检查会查。</div></div>`;
    }

    html += `<div class="card">
      <div class="card-h"><h3>能力验证与实验室间比对</h3>
        <span class="muted">CNAS 要求参加能力验证；这是二方审核与监管检查必查项</span>
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

  /* ================================================================
     ⑦-a 原始记录「按检测项目」模式（2026-11-15 重做）
     ★ Word 原表 1:1：labrecord.js 里已是 Word 原生 OOXML 还原的完整记录纸，
       这里只把 3 个动态位填上，绝不增删任何原文内容。
     ★ 标准溶液编码 / 有效期至默认就是 Word 原表里的值，打印不用填；
       过期重配才在「标准溶液维护」改一次，改完全站按溶液名称记住。
     ================================================================ */
  function lrProjects(){ return (global.LABREC && global.LABREC.projects) || []; }
  /* ★ 2026-11-19 最终口径：操作人只管「标准溶液维护的填写密码」，不锁项目。
     所有项目、勾选、打印对所有人开放；只有改标准溶液要输该项目负责人的口令。
     下面三个函数保留给内部调用，恒放行——这样原来的展示/勾选/打印逻辑一行都不用改。 */
  function lrAuthOn(){ return false; }
  function lrCan(k){ return true; }
  function lrVisiblePs(){ return lrProjects(); }
  function authChanged(){ render(); }
  function lrProject(k){
    var ps=lrProjects();
    for(var i=0;i<ps.length;i++) if(ps[i].key===k) return ps[i];
    return null;
  }
  /* ★ 分类（2026-11-16）：原有 9 项 = 理化组，新增 25 项 = 色谱组。
     默认停在理化组，老用户打开还是原来那 9 项；点「色谱组」才换一批。 */
  function lrGroups(){
    var G=(global.LABREC&&global.LABREC.groups);
    return (G&&G.length)?G:[
      {key:"phys",name:"理化组"},{key:"chrom",name:"色谱组"}];
  }
  function lrGroup(){
    if(!LRGROUP_READ){
      LRGROUP_READ=true;
      var v=global.Store?global.Store.get("lab.record.group.v1",null):null;
      var valid=lrGroups().some(function(x){ return x.key===v; });
      LRGROUP=valid?v:"phys";
    }
    return LRGROUP||"phys";
  }
  /* ★ 二级子组（2026-11-19，11-19 晚泛化到三组）：
     色谱 GJ/MYZ/FLM/WFX/PGY/SHS、理化 HYF/PQQ/ZSY、原子 ZY/DLJ。
     定义读 LABREC.groups[组].subs，每组各记一个子组选择，互不串。 */
  function lrSubs(g){
    g=g||lrGroup();
    var G=(global.LABREC&&global.LABREC.groups)||[];
    for(var i=0;i<G.length;i++) if(G[i].key===g&&G[i].subs) return G[i].subs;
    return [];
  }
  function lrSubMap(){
    if(!LRSUBREAD){
      LRSUBREAD=true;
      var v=global.Store?global.Store.get("lab.record.subgroup.v1",null):null;
      LRSUBMAP={};
      /* 兼容老版：单字符串（色谱子组）→ 归到 chrom */
      if(typeof v==="string"){ LRSUBMAP.chrom=v; }
      else if(v&&typeof v==="object"){
        Object.keys(v).forEach(function(k){ LRSUBMAP[k]=v[k]; });
      }
    }
    return LRSUBMAP;
  }
  function lrSub(g){
    g=g||lrGroup();
    var m=lrSubMap(), v=m[g], S=lrSubs(g);
    var valid=v==="all"||S.some(function(x){ return x.key===v; });
    return valid?v:"all";
  }
  function lrSetSub(s){
    var g=lrGroup(), S=lrSubs(g);
    var ok=(s==="all")||S.some(function(x){ return x.key===s; });
    lrSubMap()[g]=ok?s:"all";
    /* 切子组只影响「看哪些项目」，不擅自改已勾项目；全选/清空按当前子组来 */
    lrSave(); render();
  }
  function lrGroupProjects(){
    var g=lrGroup(), base=lrVisiblePs();
    var ps=g==="all"?base:base.filter(function(p){
      return (p.group||"phys")===g; });
    /* 三组都再按二级子组过滤；all=显示整组 */
    if(g!=="all"&&lrSub(g)!=="all"){
      var sub=lrSub(g);
      ps=ps.filter(function(p){ return p.sub===sub; });
    }
    return ps;
  }
  function lrSetGroup(g){
    var ok=false; lrGroups().forEach(function(x){ if(x.key===g) ok=true; });
    LRGROUP=ok?g:"phys";
    /* 离开色谱组时不重置子组：再切回来还停在用户上次选的子组 */
    /* 切组只影响「看哪些项目」，不擅自改已勾项目；全选/清空按当前组来 */
    lrSave(); render();
  }
  function lrGroupTabsHtml(){
    var g=lrGroup();
    var vis=lrVisiblePs();
    var h='<div class="lr-sub">项目分类</div><div class="lr-grouptabs" id="lrGroupTabs">'+lrGroups().map(function(x){
      var n=x.key==="all"?vis.length:
        vis.filter(function(p){ return (p.group||"phys")===x.key; }).length;
      return '<button type="button" class="lr-grouptab '+(g===x.key?"on":"")+'"'+(n?"":" disabled")+' '+
        'onclick="LAB.lrSetGroup(\''+esc(x.key)+'\')">'+esc(x.name)+' <i>'+n+'</i></button>';
    }).join("")+'</div>';
    /* ★ 三组（chrom/phys/atom）各有子组时都显示二级子组 tab */
    if(g!=="all" && lrSubs(g).length){
      var sub=lrSub(g);
      var allG=vis.filter(function(p){ return (p.group||"phys")===g; });
      h+='<div class="lr-subgroups" id="lrSubGroups">'+
        '<button type="button" class="lr-subgroup '+(sub==="all"?"on":"")+'" '+
          'onclick="LAB.lrSetSub(\'all\')">全部 <i>'+allG.length+'</i></button>'+
        lrSubs(g).map(function(x){
          var n=allG.filter(function(p){ return p.sub===x.key; }).length;
          return '<button type="button" class="lr-subgroup '+(sub===x.key?"on":"")+'"'+(n?"":" disabled")+' '+
            'onclick="LAB.lrSetSub(\''+esc(x.key)+'\')">'+esc(x.name)+' <i>'+n+'</i></button>';
        }).join("")+'</div>';
    }
    return h;
  }
  var LR_KEYS=["sample","batch","maker","date"];
  /* ★ 备注写「已出」= 这行不导入/不打印；点清单左侧方框才勾选参与 */
  function lrDoneNote(v){ return /已出|已完成|已出具|已出报告/.test(String(v||"")); }
  function lrBlank(){ return {sample:"",maker:"",batch:"",date:"",note:"",pick:true}; }
  /* ★ 样品清单：可以从 Excel / CSV / 粘贴区域一次导入多行，逐行往下排带序号。
     老版本只存一条 lab.record.info.v2，首次打开自动升级成 1 行清单。 */
  function lrRows(){
    if(!LRROWS){
      var s=global.Store?global.Store.get("lab.record.rows.v1",null):null;
      if(s&&s.length&&typeof s==="object"){
        LRROWS=s.map(function(r){
          var o=lrBlank();
          LR_KEYS.forEach(function(k){ if(r&&r[k]!=null) o[k]=String(r[k]); });
          if(r&&r.note!=null) o.note=String(r.note);
          o.pick=(r&&r.pick!=null)?!!r.pick:!lrDoneNote(o.note);
          return o;
        });
      } else {
        var old=global.Store?global.Store.get("lab.record.info.v2",null):null;
        var o=lrBlank();
        if(old&&typeof old==="object"){
          LR_KEYS.forEach(function(k){ if(old[k]!=null) o[k]=String(old[k]); });
          if(old.note!=null) o.note=String(old.note);
        }
        o.pick=!lrDoneNote(o.note);
        LRROWS=[o];
      }
      if(!LRROWS.length) LRROWS=[lrBlank()];
      var pv=global.Store?global.Store.get("lab.record.preview.v1",0):0;
      LRPREVIEW=Math.min(Math.max(0,parseInt(pv,10)||0),LRROWS.length-1);
    }
    return LRROWS;
  }
  /* 兼容旧调用：返回「当前预览的那一行」 */
  function lrInfo(){
    var R=lrRows();
    return R[Math.min(LRPREVIEW,R.length-1)]||lrBlank();
  }
  /* ★ 打印/出表只用「点方框勾上」且备注不是「已出」的行。
     一条都没填过 → 仍保留 1 张空白表；有数据但一行没勾 → 0 份（提示先勾）。 */
  function lrPickCount(){
    var all=lrRows().filter(function(r){
      return LR_KEYS.some(function(k){ return String(r[k]||"").trim(); });
    });
    return {all:all.length,
      on:all.filter(function(r){ return r.pick!==false&&!lrDoneNote(r.note); }).length,
      done:all.filter(function(r){ return lrDoneNote(r.note); }).length};
  }
  function lrActiveRows(){
    var all=lrRows().filter(function(r){
      return LR_KEYS.some(function(k){ return String(r[k]||"").trim(); });
    });
    if(!all.length) return [lrBlank()];
    return all.filter(function(r){ return r.pick!==false&&!lrDoneNote(r.note); });
  }
  /* 只保存用户改过的标准溶液；没改过的一律用 Word 原值 */
  /* 低聚半乳糖原表正文里三处下划线示例值：默认 Word 原值，改一次本机记住 */
  function lrMat(){
    var O=global.Store?global.Store.get("lab.record.mat.v1",null):null;
    var out={};
    Object.keys(LR_MAT_DEF).forEach(function(k){
      out[k]=(O&&O[k]!=null&&O[k]!=="")?String(O[k]):LR_MAT_DEF[k];
    });
    return out;
  }
  function lrSetMat(k,v){
    if(!LR_MAT_KEYS[k]) return;
    var O=lrMat(); O[k]=String(v==null?"":v);
    if(global.Store) global.Store.set("lab.record.mat.v1",O);
    [].forEach.call(document.querySelectorAll('.lr-dyn[data-lr="'+k+'"]'),
      function(el){ lrUpdateText(el,O[k]); });
    var st=document.getElementById("lrStat");
    if(st) st.textContent="低聚半乳糖「"+LR_MAT_KEYS[k]+"」已改成本机值，打印时会带上";
  }
  /* ===== 标准溶液编码 / 有效期自动生成（2026-11-19）=====
     编码 = 固定前缀(唯一代码) - 配制日期 - 固定顺序号，前后缀锁定只换中间日期。
       · 后缀纯数字 = 需配制（自动生成），如 139-20260304-01 / 123-20261029-01-01
       · 后缀纯字母 = 外购标准品（手动输入），如 109-20241031-A，中间为入库日期
     有效期至 = 配制日期 + N(天/月) − 1 天（配制当天算第 1 天，已用 8 条原表数据验证）。
     防输错：配制日期只收今天起往前 30 天内的真实日期，未来/更早弹窗并恢复；
             外购编码前缀必须与唯一代码一致，填错弹窗并恢复。 */
  var SOL_PREFIX_FIX = {"酪蛋白磷酸肽":"131"}; // 原表该格为空，用户补充的唯一代码前缀
  function solOrig(name){
    var ps=(global.LABREC&&global.LABREC.projects)||[];
    for(var i=0;i<ps.length;i++){
      var ss=ps[i].solutions||[];
      for(var j=0;j<ss.length;j++) if(ss[j].name===name) return ss[j];
    }
    return null;
  }
  function origCodeOf(name){ var s=solOrig(name); return s?(s.code||""):""; }
  function solParts(name, code){
    var m=/^(\d{3})-(\d{8})-(.+)$/.exec(String(code||""));
    if(m) return {prefix:m[1],date:m[2],suffix:m[3],bought:/^[A-Za-z]+$/.test(m[3])};
    var fix=SOL_PREFIX_FIX[name];
    if(fix) return {prefix:fix,date:"",suffix:"01",bought:false,empty:true};
    return null;
  }
  function isValidDate8(s){
    if(!/^\d{8}$/.test(String(s))) return false;
    var y=+s.slice(0,4),mo=+s.slice(4,6),d=+s.slice(6,8);
    var dt=new Date(y,mo-1,d);
    return dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d;
  }
  function fmt8(dt){
    return ""+dt.getFullYear()+String(dt.getMonth()+1).padStart(2,"0")+
      String(dt.getDate()).padStart(2,"0");
  }
  /* 起算日 + N(天/月) − 1 天 = 有效期至；月末按目标月最后一天钳制 */
  function date8Add(s,n,unit){
    if(!isValidDate8(s)||!(n>0)) return "";
    var y=+s.slice(0,4),mo=+s.slice(4,6)-1,d=+s.slice(6,8);
    var dt;
    if(unit==="m"){
      var t=new Date(y,mo+n,1);
      var last=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();
      dt=new Date(t.getFullYear(),t.getMonth(),Math.min(d,last));
    }else{
      dt=new Date(y,mo,d); dt.setDate(dt.getDate()+n);
    }
    dt.setDate(dt.getDate()-1);
    return fmt8(dt);
  }
  /* 从原表「配制日期 + 有效期至」反推一个默认的数值/单位，方便直接改 */
  function guessDur(s,expiry){
    var e=String(expiry||"").replace(/\D/g,"");
    if(!isValidDate8(s)||!/^\d{8}$/.test(e)) return {n:"",u:"m"};
    for(var k=1;k<=60;k++) if(date8Add(s,k,"m")===e) return {n:""+k,u:"m"};
    var a=new Date(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));
    var b=new Date(+e.slice(0,4),+e.slice(4,6)-1,+e.slice(6,8));
    var days=Math.round((b-a)/86400000)+1;
    return days>0?{n:""+days,u:"d"}:{n:"",u:"m"};
  }
  function date8Limit(){
    var lim=new Date(); lim.setHours(0,0,0,0); lim.setDate(lim.getDate()-30);
    return fmt8(lim);
  }
  /* ★ 有效期逻辑校验：有效期至必须晚于配制日期，且不能早于今天。
     返回错误文案或 null；只在用户主动改动时调用，避免打开页面就弹窗 */
  function checkExpiryLogic(name,pdate,expiry){
    if(!expiry) return null;
    if(!isValidDate8(expiry)) return "【"+name+"】有效期至不是有效日期（应为 8 位，如 20270218）";
    if(isValidDate8(pdate)&&expiry<=pdate)
      return "【"+name+"】有效期至 "+fmtDash(expiry)+" 早于配制日期 "+fmtDash(pdate)+
        "，不符合逻辑，请检查有效期天数和配制日期";
    var t=today().replace(/-/g,"");
    if(expiry<t)
      return "【"+name+"】有效期至 "+fmtDash(expiry)+" 早于今天（今天 "+today()+
        "），该溶液已过期，不能用于检测";
    return null;
  }
  function fmtDash(s){ return /^\d{8}$/.test(s)?s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8):s; }
  /* ★★★ 统一警示弹窗（2026-11-22）：深墨蓝标题栏 + 金线 + ⚠ + 居中卡片，替掉原生 alert */
  function lrAlert(msg){
    var text=String(msg==null?"":msg);
    var lines=text.split(/\n+/).filter(function(s){ return s.trim(); });
    var m=text.match(/^【([^】]+)】/);
    var name=m?m[1]:"";
    var first=(lines[0]||text).replace(/^【[^】]+】/,"").trim();
    var restored=/已恢复原值/.test(text);
    var body=first.replace(/[，,]?\s*已恢复原值。?\s*$/,"").replace(/。$/,"");
    var items=lines.slice(1).filter(function(s){ return !/^已恢复原值/.test(s); });
    [].forEach.call(document.querySelectorAll(".lr-mask.lr-alertmask"),function(e){
      if(e.parentNode) e.parentNode.removeChild(e);
    });
    var mask=document.createElement("div"); mask.className="lr-mask lr-alertmask";
    var itemHtml=items.map(function(s){ return "<li>"+esc(s)+"</li>"; }).join("");
    mask.innerHTML='<div class="lr-dlg" role="alertdialog" aria-modal="true">'+
      '<div class="lr-dlg-h"><div class="lr-dlg-ic">⚠</div><div>'+
        '<h3>'+esc(name?(name+" · 填写提示"):"填写提示")+'</h3>'+
        '<div class="lr-dlg-sub">分析检测中心 · 原始记录系统</div>'+
      '</div></div>'+
      '<div class="lr-dlg-b">'+
        (body?'<p class="lr-dlg-lead" style="font-size:15px">'+esc(body)+'</p>':'')+
        (itemHtml?'<div class="lr-dlg-list"><ul>'+itemHtml+'</ul></div>':'')+
        (restored?'<p class="lr-dlg-note">已恢复原来的值，改好后重试即可。</p>':'')+
      '</div>'+
      '<div class="lr-dlg-f"><button type="button" class="lr-dlg-btn ok lr-alert-ok">知道了</button></div>'+
    '</div>';
    function done(){
      if(mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener("keydown",onKey);
    }
    function onKey(e){ if(e.key==="Escape"||e.key==="Enter") done(); }
    mask.querySelector(".lr-alert-ok").onclick=done;
    mask.addEventListener("click",function(e){ if(e.target===mask) done(); });
    document.addEventListener("keydown",onKey);
    document.body.appendChild(mask);
    try{ mask.querySelector(".lr-alert-ok").focus(); }catch(e){}
  }
  function lrDateErr(s){
    if(!isValidDate8(s)) return "日期要填 8 位真实数字（如 20261119）";
    var t=today().replace(/-/g,"");
    if(s>t) return "配制日期不能晚于今天（今天是 "+today()+"）";
    if(s<date8Limit()) return "配制日期不能早于 30 天前（最早 "+date8Limit().replace(/(\d{4})(\d{2})(\d{2})/,"$1-$2-$3")+"）";
    return null;
  }
  function lrSyncDyn(name,d){
    [].forEach.call(document.querySelectorAll('.lr-dyn[data-lr^="std"]'),function(el){
      if(el.getAttribute("data-std")!==name) return;
      var key=el.getAttribute("data-lr");
      if(key==="stdcode"&&d.code!=null) lrUpdateText(el,d.code);
      if(key==="stdexp"&&d.expiry!=null) lrUpdateText(el,d.expiry);
      if(key==="stdbatch"&&d.batch!=null) lrUpdateText(el,d.batch);
    });
  }
  function lrSyncSolRow(name){
    var o=lrSol()[name]||{};
    [].forEach.call(document.querySelectorAll('.lr-solrow input[data-out]'),function(el){
      if(el.dataset.name!==name) return;
      /* ★ 只读跟随卡：配制日期/编码/有效期至三处都跟着主项刷新 */
      if(el.dataset.out==="pdate"&&o.pdate!=null) el.value=o.pdate;
      if(el.dataset.out==="code"&&o.code!=null) el.value=o.code;
      if(el.dataset.out==="expiry"&&o.expiry!=null) el.value=o.expiry;
    });
  }
  /* ★★ 标准溶液编辑闸门（2026-11-19 最终口径）：
     所有项目/勾选/打印都开放；只有改标准溶液要输该项负责人的口令。
     el = 触发编辑的输入框（用于失败时恢复原值），core = 真正执行写入的逻辑。 */
  /* ★ 口令文件兜底加载：旧缓存的 index.html 没引用 labauth.js 时，
     这里主动补上（带版本号破缓存），保证「改标准溶液必输口令」不会因缓存失效。 */
  function ensureLabAuth(run){
    if(global.LABAUTH && global.LABAUTH.editGuard){ run(true); return; }
    if(typeof document==="undefined"){ run(false); return; }
    if(window.__labauthLoading){
      window.__labauthLoading.push(run); return;
    }
    window.__labauthLoading=[run];
    var s=document.createElement("script");
    s.src="labauth.js?v=20261119i";
    s.onload=function(){
      var q=window.__labauthLoading||[]; window.__labauthLoading=null;
      q.forEach(function(f){ f(!!(global.LABAUTH && global.LABAUTH.editGuard)); });
    };
    s.onerror=function(){
      var q=window.__labauthLoading||[]; window.__labauthLoading=null;
      q.forEach(function(f){ f(false); });
    };
    (document.head||document.body).appendChild(s);
  }
  /* ★ 参数：el=触发元素 core=写入逻辑 nameOverride=显式溶液名 onCancel=额外取消回调
     坑（2026-11-19 21:05）：lrCalPick 曾把「取消回调」当第 3 个参数传进来，
     结果 nameOverride 变成函数对象 → 溶液名取不到 → 没有负责人 → 直接放行（日历能改的真因）。 */
  function solEdit(el, core, nameOverride, onCancel){
    var name=(typeof nameOverride==="string" ? nameOverride : "")
             || (el && el.dataset ? el.dataset.name : "");
    if(!name) name="";
    var old=el?el.value:null;
    /* 取消/输错口令时恢复：优先读本机已存的值（onchange 时 el 已是新值，
       old 不可靠），没存过就留空或原表值。字段按 input 类型映射。 */
    var restore=function(){
      if(!el) return;
      var O=(global.LAB.lrSol&&global.LAB.lrSol())||{};
      var d=O[name]||{}, key=null;
      if(el.classList && el.classList.contains("lr-pdate")) key="pdate";
      else if(el.dataset && el.dataset.out==="code") key="code";
      else if(el.dataset && el.dataset.out==="expiry") key="expiry";
      else if(el.type==="number") key="dur";
      if(key && d[key]!=null){ el.value=d[key]; return; }
      if(nameOverride==="gos3" && el.dataset && el.dataset.mat){
        var M=global.LAB.lrMat?global.LAB.lrMat():{}; el.value=M[el.dataset.mat]!=null?M[el.dataset.mat]:old;
        return;
      }
      el.value=old;
    };
    var cancel=function(){
      restore();
      if(typeof onCancel==="function") onCancel();
    };
    ensureLabAuth(function(ok){
      /* 缺口令文件（且补加载也失败）时绝不放行，避免缓存导致口令失效 */
      if(ok){
        /* ★ 没有溶液名 → 无法判定负责人 → 绝不放行（早期 bug 就是这里静默写了库） */
        if(!name){ cancel(); lrAlert("无法识别该标准溶液，修改已取消。请刷新页面后重试。"); return; }
        global.LABAUTH.editGuard(name, core, cancel);
      }
      else { cancel(); lrAlert("口令校验未能加载，修改已取消。请按 Ctrl+F5 强制刷新后重试。"); }
    });
  }
  /* batch 只改批号，但也是标准溶液维护的一部分，同样要口令 */
  function lrSetSolBatch(el){
    var name=el.dataset.name, v=el.value;
    solEdit(el, function(){ lrSetSol(name,"batch",v); });
  }
  /* 低聚半乳糖对照品三项（gos3 项目，归 SHS）也是标准溶液，改它要口令 */
  function lrSetMatGuard(el){
    var k=el.dataset.mat, v=el.value;
    solEdit(el, function(){ lrSetMat(k,v); }, "gos3");
  }
  function lrSetPrepDate(el){ solEdit(el, function(){ _lrSetPrepDate(el); }); }
  function _lrSetPrepDate(el){
    var name=el.dataset.name, v=String(el.value||"").replace(/\D/g,"");
    var err=lrDateErr(v);
    if(err){
      /* 恢复优先级：已存的 pdate → Word 原表日期 → 空。绝不把框清空。 */
      var d0=lrSol()[name]||{}, op0=solParts(name,origCodeOf(name))||{};
      el.value=d0.pdate||op0.date||"";
      lrAlert("【"+name+"】"+err+"，已恢复原值。"); return;
    }
    el.value=v;
    var op=solParts(name,origCodeOf(name))||{prefix:"",suffix:"01"};
    var O=lrSol(); if(!O[name]) O[name]={};
    O[name].pdate=v;
    O[name].code=op.prefix+"-"+v+"-"+op.suffix;
    /* ★ 有效期数值/单位以界面当前框为准：初次打开时"7 天"只是 guessDur 显示值、
       并未存进 localStorage，若只看存储就会漏算有效期至（用户截图的问题） */
    var row=el.closest(".lr-solrow");
    if(row){
      var dEl=row.querySelector("input[type=number][data-name]");
      var uEl=row.querySelector("select[data-name]");
      if(dEl&&dEl.value) O[name].dur=""+parseInt(dEl.value,10);
      if(uEl&&uEl.value) O[name].unit=uEl.value;
    }
    var soNow=solOrig(name), nowUse=!!(soNow&&/现配|即用/.test(soNow.expiry||""));
    if(!nowUse&&O[name].dur&&O[name].unit) O[name].expiry=date8Add(v,+O[name].dur,O[name].unit);
    var link=solLinkOf(name);
    if(link&&O[name].dur&&O[name].unit){
      var synced=lrApplyLink(link,v,O[name].dur,O[name].unit);
      lrStatMsg("【"+link.label+"】已按配制日期 "+fmtDash(v)+" 同步生成全部 "+synced+" 种标液的编码和有效期");
      var lw=checkExpiryLogic(name,v,O[name].expiry); if(lw) lrAlert(lw);
      return;
    }
    lrSave(); lrSyncDyn(name,O[name]); lrSyncSolRow(name);
    if(!nowUse&&O[name].expiry){
      var warn=checkExpiryLogic(name,v,O[name].expiry);
      if(warn) lrAlert(warn);
    }
    lrStatMsg("【"+name+"】已生成编码 "+O[name].code+
      (nowUse?"（现配现用，有效期至按 Word 原表）":
       (O[name].expiry?"，有效期至 "+O[name].expiry:"；填右边有效期可自动算有效期至")));
  }
  function lrSetDur(el){ solEdit(el, function(){ _lrSetDur(el); }); }
  function _lrSetDur(el){
    var name=el.dataset.name, n=parseInt(el.value,10);
    if(!(n>0&&n<=999)){ lrAlert("【"+name+"】有效期要填 1~999 的整数，已恢复原值。");
      el.value=(lrSol()[name]||{}).dur||""; return; }
    var O=lrSol(); if(!O[name]) O[name]={};
    O[name].dur=""+n;
    var pd=O[name].pdate||(solParts(name,origCodeOf(name))||{}).date;
    if(isValidDate8(pd)) O[name].expiry=date8Add(pd,n,O[name].unit||"m");
    var link=solLinkOf(name);
    if(link&&isValidDate8(pd)){
      var synced=lrApplyLink(link,pd,""+n,O[name].unit||"m");
      lrStatMsg("【"+link.label+"】有效期改为 "+n+(O[name].unit==="d"?" 天":" 月")+
        "，已同步全部 "+synced+" 种标液，有效期至 "+O[name].expiry);
      var lw=checkExpiryLogic(name,pd,O[name].expiry); if(lw) lrAlert(lw);
      return;
    }
    lrSave(); lrSyncDyn(name,O[name]); lrSyncSolRow(name);
    if(O[name].expiry){ var w=checkExpiryLogic(name,pd,O[name].expiry); if(w) lrAlert(w); }
  }
  function lrSetUnit(el){ solEdit(el, function(){ _lrSetUnit(el); }); }
  function _lrSetUnit(el){
    var name=el.dataset.name, O=lrSol(); if(!O[name]) O[name]={};
    O[name].unit=el.value;
    var pd=O[name].pdate||(solParts(name,origCodeOf(name))||{}).date;
    if(O[name].dur&&isValidDate8(pd)) O[name].expiry=date8Add(pd,+O[name].dur,el.value);
    var link=solLinkOf(name);
    if(link&&O[name].dur&&isValidDate8(pd)){
      var synced=lrApplyLink(link,pd,O[name].dur,el.value);
      lrStatMsg("【"+link.label+"】单位改为 "+(el.value==="d"?"天":"月")+
        "，已同步全部 "+synced+" 种标液，有效期至 "+O[name].expiry);
      var lw=checkExpiryLogic(name,pd,O[name].expiry); if(lw) lrAlert(lw);
      return;
    }
    lrSave(); lrSyncDyn(name,O[name]); lrSyncSolRow(name);
    if(O[name].expiry){ var w=checkExpiryLogic(name,pd,O[name].expiry); if(w) lrAlert(w); }
  }
  /* ★ 同批配制联动：以 pdate/dur/unit 为准，按组内每个成员自己的前缀生成编码、
     算有效期至，写入全部成员；同步打印动态字段和维护界面只读框。 */
  function lrApplyLink(g, pdate, dur, unit){
    var O=lrSol(), n=0;
    g.names.forEach(function(nm){
      var op=solParts(nm,origCodeOf(nm))||{prefix:"",suffix:"01"};
      if(!O[nm]) O[nm]={};
      O[nm].pdate=pdate;
      O[nm].dur=dur; O[nm].unit=unit;
      O[nm].code=op.prefix+"-"+pdate+"-"+op.suffix;
      O[nm].expiry=(!/(现配|即用)/.test((solOrig(nm)||{}).expiry||""))
        ? date8Add(pdate,+dur,unit) : O[nm].expiry;
      lrSyncDyn(nm,O[nm]); lrSyncSolRow(nm);
      n++;
    });
    lrSave();
    return n;
  }
  /* 外购标准品有效期至：厂商标注日期，可带 - . / 分隔；校验格式 + 不早于入库日期 */
  function lrSolExpiryInput(el){ solEdit(el, function(){ _lrSolExpiryInput(el); }); }
  function _lrSolExpiryInput(el){
    var name=el.dataset.name, v=String(el.value||"").trim();
    var digits=v.replace(/\D/g,"");
    if(digits && !isValidDate8(digits)){
      lrAlert("【"+name+"】有效期至日期格式不对（应如 2027-02-18 或 20270218），已恢复原值。");
      var o=lrSol()[name]||{}; el.value=o.expiry!=null?o.expiry:""; return;
    }
    /* 入库日期取编码里的日期段（如 109-20241031-A） */
    var op=solParts(name,origCodeOf(name)), inDate=op&&op.date;
    if(isValidDate8(digits)&&isValidDate8(inDate)&&digits<inDate){
      lrAlert("【"+name+"】有效期至 "+fmtDash(digits)+" 早于入库日期 "+fmtDash(inDate)+"，不符合逻辑，已恢复原值。");
      var o2=lrSol()[name]||{}; el.value=o2.expiry!=null?o2.expiry:""; return;
    }
    lrSetSol(name,"expiry",v);
  }
  /* 外购标准品：编码手填，但前缀/日期必须合法，否则弹窗并恢复 */
  function lrSolCodeInput(el){ solEdit(el, function(){ _lrSolCodeInput(el); }); }
  function _lrSolCodeInput(el){
    var name=el.dataset.name, v=String(el.value||"");
    var op=solParts(name,origCodeOf(name)), seg=v.split("-");
    if(op&&seg[0]!==op.prefix){
      lrAlert("【"+name+"】标准溶液代码前缀应为 "+op.prefix+
        "，不能填 "+(seg[0]||"空")+"，已恢复原值。");
      var o0=lrSol()[name]||{}; el.value=o0.code!=null?o0.code:origCodeOf(name); return;
    }
    if(seg[1]&&!isValidDate8(seg[1])){
      lrAlert("【"+name+"】编码里的日期不是有效日期（应为 8 位，如 20241031），已恢复原值。");
      var o1=lrSol()[name]||{}; el.value=o1.code!=null?o1.code:origCodeOf(name); return;
    }
    lrSetSol(name,"code",v);
  }
  function lrOpenCal(btn){
    var wrap=btn.parentNode, cal=wrap.querySelector(".lr-calhidden");
    if(!cal) return;
    var txt=wrap.querySelector("input.lr-pdate"), v=txt?(txt.value||"").replace(/\D/g,""):"";
    if(isValidDate8(v)) cal.value=v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6,8);
    /* ★★ 不调用 cal.focus()！focus 会让浏览器把控件滚动进视口，
       控件相对视口的 y 突变 → 原生日历锚点跟着跳（这就是"一会左一会右"真因）。
       控件几何 CSS 恒定（固定铺满 opacity:0.02），直接 showPicker 锚点唯一。 */
    var opened=false;
    try{ if(typeof cal.showPicker==="function"){ cal.showPicker(); opened=true; } }catch(e){}
    if(!opened){ try{ cal.click(); }catch(e){} }
  }
  function lrCalClose(cal){ /* 几何恒定，无需收起；保留供调用兼容 */ }
  function lrCalPick(cal){
    var wrap=cal.parentNode, txt=wrap.querySelector("input.lr-pdate");
    if(!txt) return;
    var old=txt.value, picked=(cal.value||"").replace(/-/g,"");
    if(!picked) return;
    /* 日历只把值交给 txt（此时尚未落库），真正写入在口令通过后的 core 里。
       取消时把日历控件也退回原日期，避免下次打开显示错日期。 */
    solEdit(txt, function(){
      txt.value=picked; _lrSetPrepDate(txt); lrCalClose(cal);
    }, null, function(){
      cal.value=isValidDate8(old)?(old.slice(0,4)+"-"+old.slice(4,6)+"-"+old.slice(6,8)):"";
    });
  }
  function lrSol(){
    if(!LRSOL){
      LRSOL=global.Store?global.Store.get("lab.record.sol.v1",null):null;
      if(!LRSOL||typeof LRSOL!=="object") LRSOL={};
    }
    return LRSOL;
  }
  function lrAllSolutions(){
    var seen={},out=[],O=lrSol();
    lrVisiblePs().forEach(function(p){
      (p.solutions||[]).forEach(function(s){
        if(seen[s.name]) return;
        seen[s.name]=1;
        var o=O[s.name]||{};
        out.push({name:s.name,
                  code:o.code!=null?o.code:s.code,
                  expiry:o.expiry!=null?o.expiry:s.expiry,
                  batch:o.batch!=null?o.batch:s.batch,
                  origCode:s.code,origExpiry:s.expiry});
      });
    });
    return out;
  }
  /* ★ 标准溶液维护按检测项目过滤（2026-11-15）：
     默认只看当前项目自己的溶液，只有点「全部」才把 9 个项目的都列出来。
     9 份 Word 原表里只有 4 个项目含标准溶液表，其余项目不显示空卡片。 */
  function lrSolProjects(){
    return lrVisiblePs().filter(function(p){ return (p.solutions||[]).length; });
  }
  function lrSolView(){
    if(!LRSOLVIEW_READ){
      LRSOLVIEW_READ=true;
      var v=global.Store?global.Store.get("lab.record.solview.v1",null):null;
      LRSOLVIEW=(v==="all"||(lrProject(v)&&lrCan(v)))?v:null;
    }
    if(LRSOLVIEW) return LRSOLVIEW;
    var sel=lrSelected();
    if(sel.length===1){
      var p=lrProject(sel[0].key);
      if(p&&(p.solutions||[]).length) return sel[0].key;
    }
    /* 当前项目没有标准溶液表（或多选/未选）时，默认展示「当前分类」里第一个有溶液的 */
    var g=lrGroup(), ps=lrSolProjects().filter(function(p){
      return g==="all"||(p.group||"phys")===g; });
    if(!ps.length) ps=lrSolProjects();
    return ps.length?ps[0].key:"all";
  }
  function lrSolRows(v){
    var O=lrSol(), seen={}, out=[], src=[];
    if(v==="all"){
      lrVisiblePs().forEach(function(p){ src=src.concat(p.solutions||[]); });
    } else {
      var p=lrProject(v);
      /* ★ 越权拦截：查看范围不是本人项目时退回可见的第一个，绝不显示别人的溶液 */
      if(p && !lrCan(v)) p=null;
      src=(p&&p.solutions)||[];
    }
    /* ★ 同批配制联动（2026-11-19 按用户要求改）：8 种全部列出来，各自显示自己的
       编码/有效期至；只在主项（钠）保留一处可填的配制日期+有效期入口。
       改主项时 lrApplyLink 把 8 种各自前缀的编码/有效期都写好，
       其余 7 行靠 lrSyncSolRow 按各自 data-name 跟着刷新。 */
    src.forEach(function(s){
      if(seen[s.name]) return;
      seen[s.name]=1;
      var link=solLinkOf(s.name);
      var o=O[s.name]||{};
      out.push({name:s.name, link:link, isMaster:link?(s.name===link.master):true,
                members:link?link.names:[s.name],
                pdate:o.pdate||"",
                code:o.code!=null?o.code:s.code,
                expiry:o.expiry!=null?o.expiry:s.expiry,
                batch:o.batch!=null?o.batch:s.batch});
    });
    return out;
  }
  function lrSolTabsHtml(v){
    var t='<div class="lr-soltabs" id="lrSolTabs">'+
      '<button type="button" class="lr-soltab '+(v==="all"?"on":"")+'" '+
        'onclick="LAB.lrSetSolView(\'all\')">全部</button>';
    /* 只列当前分类的项目，点哪个高亮哪个；没有标准溶液表的给明确提示 */
    lrGroupProjects().forEach(function(p){
      t+='<button type="button" class="lr-soltab '+(v===p.key?"on":"")+'" '+
         'onclick="LAB.lrSetSolView(\''+esc(p.key)+'\')">'+esc(p.name)+'</button>';
    });
    return t+'</div>';
  }
  function lrSolBodyHtml(v){
    var rows=lrSolRows(v);
    if(!rows.length){
      var p=lrProject(v);
      return '<div class="lr-solempty">'+esc(p?p.name:"当前范围")+
        '的 Word 原表里没有标准溶液，不用维护。点上面的项目或「全部」查看其他项目。</div>';
    }
    var O=lrSol();
    var sols=rows.map(function(x){
      var o=O[x.name]||{}, op=solParts(x.name,origCodeOf(x.name));
      var bought=!!(op&&op.bought);
      var batch = (x.batch!=null && x.batch!=="")
        ? '<label>批号<input type="text" data-name="'+esc(x.name)+'" value="'+esc(x.batch)+'" '+
            'oninput="LAB.lrSetSolBatch(this)"></label>' : '';
      /* ★ 同批配制的 8 种：每种都单独一张卡列出来（各自的编码/有效期至），
         但只有主项（钠）给可填的配制日期+有效期；其余 7 种这里是只读展示，
         改主项时由 lrApplyLink+lrSyncSolRow 各自刷新，绝不出现第二个可填入口。 */
      if(x.link && !x.isMaster){
        var mo=o, mop=solParts(x.name,origCodeOf(x.name));
        var mpdate=mo.pdate||(mop&&mop.date)||"";
        return '<div class="lr-solrow lr-solfollow"><div class="lr-soltitle"><b>'+
          esc(x.name)+' 标准溶液</b>'+
          '<span class="lr-solkind link">跟随主项</span></div>'+
          '<label>配制日期<input type="text" data-name="'+esc(x.name)+'" data-out="pdate" '+
            'value="'+esc(mpdate)+'" readonly></label>'+
          '<label>编码（自动）<input type="text" data-name="'+esc(x.name)+'" data-out="code" '+
            'value="'+esc(x.code)+'" readonly></label>'+
          '<label>有效期至（自动）<input type="text" data-name="'+esc(x.name)+'" data-out="expiry" '+
            'value="'+esc(x.expiry)+'" readonly></label>'+
          '<div class="lr-followtip">与主项一起配制，改上面那一处，这里自动跟着更新。</div></div>';
      }
      var linkNote = x.link
        ? '<span class="lr-solkind link">'+x.members.length+' 种同批</span>' : '';
      var head='<div class="lr-solrow'+(x.link?' lr-solmaster':'')+'"><div class="lr-soltitle"><b>'+
        esc(x.link?x.link.label:x.name)+'</b>'+
        '<span class="lr-solkind '+(bought?"ext":"prep")+'">'+(bought?"外购·手填":"需配制·自动")+'</span>'+
        linkNote+'</div>'+
        (x.link?'<div class="lr-linktip">'+esc(x.members.join('·'))+
          ' 同时配制，只填这一处，改配制日期或有效期时全部一起更新（各自编码前缀自动保留）。</div>':'');
      if(bought){
        /* 外购标准品：编码/有效期至手填（生产商标注），前缀校验、日期校验 */
        return head+
          '<label>编码（前缀固定 '+esc(op.prefix)+'）<input type="text" data-name="'+esc(x.name)+'" '+
            'value="'+esc(x.code)+'" placeholder="'+esc(op.prefix)+'-YYYYMMDD-字母" '+
            'onchange="LAB.lrSolCodeInput(this)"></label>'+
          '<label>有效期至（厂商标注）<input type="text" data-name="'+esc(x.name)+'" value="'+esc(x.expiry)+'" '+
            'onchange="LAB.lrSolExpiryInput(this)"></label>'+batch+'</div>';
      }
      /* 需配制：配制日期（手输/日历）→ 编码；有效期数值+单位 → 有效期至。
         ★ 现配现用的（VC/混合中间液/CMP/酪蛋白磷酸肽）：只生成编码，
           有效期至固定为原表的「现配现用」，不出现有效期数值框、不算日期。 */
      var pdate=o.pdate||(op&&op.date)||"", gd=guessDur(pdate,x.expiry);
      var dur=(o.dur!=null?o.dur:gd.n), unit=o.unit||gd.u;
      var so=solOrig(x.name), nowUse=!!(so&&/现配|即用/.test(so.expiry||""));
      /* ★ 顺序（2026-11-19 晚）：配制日期 → 有效期(数值+单位) → 编码(自动) → 有效期至(自动)。
         原来「编码」夹在配制日期和有效期中间，用户看着像被分隔开，故把有效期提前。 */
      var durHtml = nowUse ? '' :
          '<label>有效期<span class="lr-durow">'+
            '<input type="number" min="1" max="999" value="'+esc(dur)+'" data-name="'+esc(x.name)+'" '+
              'placeholder="N" onchange="LAB.lrSetDur(this)">'+
            '<select data-name="'+esc(x.name)+'" onchange="LAB.lrSetUnit(this)">'+
              '<option value="d"'+(unit==="d"?" selected":"")+'>天</option>'+
              '<option value="m"'+(unit==="m"?" selected":"")+'>月</option></select></span></label>';
      var expiryHtml = nowUse
        ? '<label>有效期至<input type="text" value="现配现用（Word 原表固定）" readonly></label>'
        : '<label>有效期至（自动）<input type="text" data-name="'+esc(x.name)+'" data-out="expiry" '+
            'value="'+esc(x.expiry)+'" readonly></label>';
      return head+
        '<label>配制日期<span class="lr-datein">'+
          '<input class="lr-pdate" type="text" inputmode="numeric" maxlength="8" '+
            'data-name="'+esc(x.name)+'" value="'+esc(pdate)+'" placeholder="如 20261119" '+
            'onchange="LAB.lrSetPrepDate(this)">'+
          '<button type="button" class="lr-calbtn" title="日历选择" onclick="LAB.lrOpenCal(this)">📅</button>'+
          '<input class="lr-calhidden" type="date" data-name="'+esc(x.name)+'" '+
            'onchange="LAB.lrCalPick(this)">'+
          '</span></label>'+
        durHtml+
        '<label>编码（自动）<input type="text" data-name="'+esc(x.name)+'" data-out="code" '+
          'value="'+esc(x.code)+'" readonly></label>'+
        expiryHtml+batch+'</div>';
    });
    /* ★ 低聚半乳糖对照品的三项（原表正文下划线）本来就是标准品，
       直接作为标准溶液维护里和其他溶液并列的一行，不另起面板。
       查看范围是低聚半乳糖本身或「全部」时才出现。 */
    if((v==="gos3"||v==="all") && (global.LABPAGES||{}).gos3){
      var M=lrMat(), mat='';
      Object.keys(LR_MAT_KEYS).forEach(function(k){
        mat+='<label>'+LR_MAT_KEYS[k]+'<input type="text" data-mat="'+k+'" '+
          'value="'+esc(M[k])+'" '+
          'oninput="LAB.lrSetMatGuard(this)"></label>';
      });
      sols.push('<div class="lr-solrow"><b>低聚半乳糖对照品</b>'+
        '<div class="lr-matgrid">'+mat+'</div></div>');
    }
    return '<div class="lr-solgrid">'+sols.join("")+'</div>';
  }
  /* ★★ 标准溶液 → 试剂有效期管理系统（2026-11-19）
     两个系统在不同域名，浏览器不允许直接写对方的 localStorage，
     所以做成「一键生成对方导入格式的表」：自动下载 + 复制到剪贴板 + 打开试剂系统。
     对方导入按表头中文名匹配：试剂名称/类型/浓度/配制日期/有效期至/配制人/存放位置/备注。 */
  function lrD8Slash(v){
    var s=String(v||"").replace(/\D/g,"");
    if(s.length!==8) return "";
    return s.slice(0,4)+"/"+(+s.slice(4,6))+"/"+(+s.slice(6,8));
  }
  function lrReagentRows(){
    var O=lrSol(), seen={}, out=[];
    lrAllSolutions().forEach(function(x){
      if(seen[x.name]) return;
      seen[x.name]=1;
      var o=O[x.name]||{};
      var pd=o.pdate||"", ex=o.expiry||x.expiry||"";
      /* 没手填过配制日期的，从编码里反推：编码形如 042-20261119-01，中间 8 位就是配制日期。
         对方导入按「名称+类型+浓度+配制日期+有效期至」判重，配制日期空会被当成新记录重复插入，
         所以推不出来就不要导出这一行。 */
      if(!pd){
        var m=String(o.code||x.code||"").match(/(20\d{6})/);
        if(m) pd=m[1];
      }
      if(!pd || !ex) return;
      out.push({
        "试剂名称":x.name,
        "类型":"标准溶液",
        "浓度":"",
        "配制日期":lrD8Slash(pd),
        "有效期至":lrD8Slash(ex),
        "配制人":(global.LABAUTH&&global.LABAUTH.solOwner)?(global.LABAUTH.solOwner(x.name)||""):"",
        "存放位置":"",
        "备注":(o.code||x.code||"")
      });
    });
    return out;
  }
  /* ★★ 从「试剂有效期管理系统」把配制日期/有效期拉进来（2026-11-19 晚，用户要的方向）
     流程：试剂系统「导出 CSV」→ 这里选中文件 → 按溶液名自动匹配 → 写入 pdate/expiry。
     导入后仍然可以手动改（改还是要口令）。 */
  function lrTo8(v){
    if(v==null) return "";
    if(v instanceof Date){
      var y=v.getFullYear(), m=("0"+(v.getMonth()+1)).slice(-2), d=("0"+v.getDate()).slice(-2);
      return ""+y+m+d;
    }
    var s=String(v).trim();
    if(/^\d{8}$/.test(s)) return s;
    var m2=s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if(m2) return m2[1]+("0"+m2[2]).slice(-2)+("0"+m2[3]).slice(-2);
    if(/^\d{5}$/.test(s)){ // Excel 日期序列
      var d0=new Date(Date.UTC(1899,11,30)+parseInt(s,10)*86400000);
      return d0.getUTCFullYear()+("0"+(d0.getUTCMonth()+1)).slice(-2)+("0"+d0.getUTCDate()).slice(-2);
    }
    return "";
  }
  /* ★ 别名表：试剂台账里的叫法 → 原始记录里的标准溶液名。
     试剂系统从老台账导进来，名字跟 Word 原表不一致（VB1 vs 维生素B1），
     靠别名 + 归一 + 包含三层匹配，尽量都能对上。 */
  var LR_REAGENT_ALIAS={
    "vb1":"维生素B1","b1":"维生素B1","维生素b1":"维生素B1",
    "vb2":"维生素B2","b2":"维生素B2","维生素b2":"维生素B2",
    "vb6":"盐酸吡哆醇","b6":"盐酸吡哆醇","维生素b6":"盐酸吡哆醇",
    "vd2":"维生素D2","d2":"维生素D2","维生素d2":"维生素D2",
    "vd3":"维生素D3","d3":"维生素D3","维生素d3":"维生素D3",
    "vk1":"维生素K1","k1":"维生素K1","维生素k1":"维生素K1",
    "vk2":"维生素K2（MK-7）","k2":"维生素K2（MK-7）","维生素k2":"维生素K2（MK-7）",
    "vc":"L-抗坏血酸标准溶液","维生素c":"L-抗坏血酸标准溶液",
    "生物素d4":"生物素-d4","biotind4":"生物素-d4",
    "乳铁蛋白":"乳铁蛋白","牛磺酸":"牛磺酸","磷酸二氢钾":"磷酸二氢钾",
    "β-胡萝卜素":"叶黄素","左旋肉碱":"左旋肉碱","l-肉碱":"左旋肉碱",
    "氯化胆碱":"胆碱","胆碱氯化物":"胆碱"
  };
  function lrNormName(s){
    var x=String(s||"").replace(/\s/g,"")
      .replace(/(标准储备液|标准溶液|储备液|标准品|标准物质|工作液|滴定溶液|溶液)$/,"");
    var a=LR_REAGENT_ALIAS[x.toLowerCase()];
    return a||x;
  }
  /* ★ 代码索引：每个标准溶液的编码前缀(062-… 的前3位) → 溶液名。
     用户在试剂台账的名称前写这个代码（如「062磷酸二氢钾」），
     这里优先按代码精确匹配，不再靠名称猜测。 */
  function lrCodeIndex(){
    var m={};
    lrAllSolutions().forEach(function(x){
      var code=x.origCode||x.code||"";
      var pre=String(code).match(/^(\d{3})-/);
      if(pre && !m[pre[1]]) m[pre[1]]=x.name;   // 前缀唯一；重复取第一个
    });
    return m;
  }
  function lrMatchName(nm, names, idx, cidx){
    var n=String(nm||"").replace(/\s/g,"");
    if(!n) return null;
    /* ★★ 第一优先：名称开头的3位数字 = 唯一代码，直接精确匹配 */
    var pre=n.match(/^(\d{3})/);
    if(pre){
      cidx=cidx||lrCodeIndex();
      if(cidx[pre[1]]) return cidx[pre[1]];
    }
    if(names.indexOf(n)>=0) return n;
    var nn=lrNormName(n);
    if(nn){
      if(names.indexOf(nn)>=0) return nn;
      if(idx[nn]) return idx[nn];
    }
    /* 别名直查：试剂名归一化前后都试（含 VB1/生物素d4 这类） */
    var alias=LR_REAGENT_ALIAS[n.toLowerCase()];
    if(alias && names.indexOf(alias)>=0) return alias;
    var best=null, bl=0;
    names.forEach(function(k){
      var kk=lrNormName(k);
      if(!kk) return;
      if(nn && (nn.indexOf(kk)>=0 || kk.indexOf(nn)>=0) && kk.length>bl){ best=k; bl=kk.length; }
    });
    return best;
  }
  function lrApplyReagentRows(rows){
    var O=lrSol(), names=lrAllSolutions().map(function(x){ return x.name; });
    var idx={}; names.forEach(function(n){ var k=lrNormName(n); if(k&&!idx[k]) idx[k]=n; });
    var cidx=lrCodeIndex();
    var hit=0, miss=0, fields=0, list=[];
    rows.forEach(function(r){
      var nm=r["试剂名称"]||r["名称"]||"";
      var pd=r["配制日期"]||r["配置日期"]||"";
      var ex=r["有效期至"]||r["有效期"]||r["到期日期"]||"";
      var tp=r["类型"]||"";
      if(!nm) return;
      if(tp && !/标准溶液|标准品|标准物质/.test(tp)) return;   // 只要标准溶液类
      var key=lrMatchName(nm, names, idx, cidx);
      if(!key){ miss++; if(list.length<5) list.push(nm); return; }
      hit++;
      var p8=lrTo8(pd), e8=lrTo8(ex);
      if(!O[key]) O[key]={};
      if(p8 && O[key].pdate!==p8){ O[key].pdate=p8; fields++; }
      if(e8 && O[key].expiry!==e8){ O[key].expiry=e8; fields++; }
      if(p8){
        var op=solParts(key,origCodeOf(key))||{};
        if(op.prefix && !O[key].code) O[key].code=op.prefix+"-"+p8+"-"+(op.suffix||"01");
      }
    });
    lrSave();
    if(typeof render==="function") render();
    lrAlert("从试剂系统导入完成：\n\n匹配到 "+hit+" 条，写入 "+fields+" 个字段"+
      (miss?("；有 "+miss+" 条在这里找不到对应溶液"+(list.length?("（如 "+list.join("、")+"）"):"")):"")+
      "。\n\n导入后仍可手动改（改还是要口令）。");
  }
  function lrReagentFile(el){
    var f=el.files&&el.files[0];
    if(!f){ return; }
    lrLoadXLSX(function(ok){
      if(!ok){ lrAlert("表格解析库没加载出来，请刷新页面重试。"); return; }
      var fr=new FileReader();
      fr.onload=function(ev){
        try{
          var wb=global.XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
          var ws=wb.Sheets[wb.SheetNames[0]];
          var rows=global.XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});
          if(!rows.length){ lrAlert("这个文件里没读到数据，确认是试剂系统「导出 CSV」得到的表。"); return; }
          lrApplyReagentRows(rows);
        }catch(e){
          lrAlert("读不了这个文件："+(e&&e.message?e.message:e));
        }
        el.value="";
      };
      fr.readAsArrayBuffer(f);
    });
  }
  /* ★★★ 与同站点的「试剂有效期管理系统」（/reagent/）自动同步（2026-11-19 用户最终口径）
     两页同域，共用 reagentManager.data.v1：
       · 那边改了配制日期/有效期 → 这边切回页面（或 storage 事件）自动更新，不用手填；
       · 这边手改仍然可以（要口令），但只要试剂系统那条没变，下次同步不会把手改的值冲掉
         （靠 _rsync 记住上次从试剂系统取到的值来判断"是对方改了"还是"我本方改的"）。 */
  function lrReagentRead(){
    try{
      var raw=localStorage.getItem("reagentManager.data.v1");
      if(!raw) return null;
      var a=JSON.parse(raw);
      return Array.isArray(a)?a:null;
    }catch(e){ return null; }
  }
  /* 取一条试剂记录里的名字/类型/配制日/有效期，兼容两套字段名：
     同站点副本存量数据用 prep/exp/conc；Excel 新导入用 preparedDate/expireDate/concentration。 */
  function lrReagentFields(r){
    return {
      name: r.name||r["试剂名称"]||r["品名"]||r["名称"]||"",
      type: r.type||r["类型"]||r["类别"]||"",
      p:   r.preparedDate||r.prep||r["配制日期"]||r["配置日期"]||r["配置时间"]||"",
      e:   r.expireDate||r.exp||r["有效期至"]||r["有效期"]||r["到期日期"]||""
    };
  }
  var LR_SYNC_RESULT=null;   // 最近一次同步的诊断结果，供面板显示
  function lrReagentSync(){
    var arr=lrReagentRead();
    if(!arr||!arr.length){ LR_SYNC_RESULT={total:0,hit:0,miss:0,fields:0,list:[]}; return false; }
    var O=lrSol(), names=lrAllSolutions().map(function(x){ return x.name; });
    var idx={}; names.forEach(function(n){ var k=lrNormName(n); if(k&&!idx[k]) idx[k]=n; });
    var cidx=lrCodeIndex();
    var dirty=false, cnt=0, hit=0, miss=0, mlist=[];
    arr.forEach(function(r){
      var f=lrReagentFields(r);
      if(!f.name) return;
      /* 类型：只要不是明确排除的「配制试剂/开封试剂/流动相」就参与；
         老台账有的没类型，或写成「标准储备液」，都放行，靠名称匹配兜底。 */
      if(f.type && /配制试剂|开封试剂|流动相/.test(f.type)) return;
      var key=lrMatchName(f.name,names,idx,cidx);
      if(!key){ miss++; if(mlist.length<6) mlist.push(f.name); return; }
      hit++;
      var p8=lrTo8(f.p), e8=lrTo8(f.e);
      if(!p8 && !e8) return;
      if(!O[key]) O[key]={};
      var prev=O[key]._rsync||{};
      if(p8 && prev.pdate!==p8){
        O[key].pdate=p8; dirty=true; cnt++;
        var op=solParts(key,origCodeOf(key))||{};
        if(op.prefix) O[key].code=op.prefix+"-"+p8+"-"+(op.suffix||"01");
        else lrSyncDyn(key,O[key]);
      }
      if(e8 && prev.expiry!==e8){ O[key].expiry=e8; dirty=true; cnt++; lrSyncDyn(key,O[key]); }
      O[key]._rsync={pdate:p8||prev.pdate||"", expiry:e8||prev.expiry||""};
    });
    LR_SYNC_RESULT={total:arr.length,hit:hit,miss:miss,fields:cnt,list:mlist};
    if(dirty){
      lrSave();
      var ae=document.activeElement;
      var typing=ae && ae.closest && ae.closest("#lrSolBody");
      if(!typing && typeof render==="function") render();
      try{ lrStatMsg("已从试剂系统自动同步 "+cnt+" 个配制日期/有效期"); }catch(e){}
    }
    return dirty;
  }
  function lrReagentHook(){
    if(global.__lrReagentHooked) return;
    global.__lrReagentHooked=1;
    window.addEventListener("storage", function(e){
      if(e && e.key==="reagentManager.data.v1") lrReagentSync();
    });
    document.addEventListener("visibilitychange", function(){
      if(!document.hidden) lrReagentSync();
    });
  }
  function lrExportToReagent(){
    var rows=lrReagentRows();
    if(!rows.length){
      lrAlert("还没有填过配制日期或有效期的标准溶液，没有可导出的内容。先在上面填好再导出。");
      return;
    }
    var HEADS=["试剂名称","类型","浓度","配制日期","有效期至","配制人","存放位置","备注"];
    var tsv=HEADS.join("\t")+"\n"+rows.map(function(r){
      return HEADS.map(function(h){ return r[h]||""; }).join("\t");
    }).join("\n");
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(tsv);
    }catch(e){}
    var base="标准溶液_"+today().replace(/-/g,"");
    /* 必须先同步打开（用户手势内），否则会被弹窗拦截 */
    try{
      var w=window.open("https://reagent-expiry-95771.app.workbuddy.host/?sharecode=L5HTJSEPAI","_blank");
      if(w) try{ w.opener=null; }catch(e){}
    }catch(e){}
    lrLoadXLSX(function(ok){
      if(ok&&global.XLSX){
        var ws=global.XLSX.utils.json_to_sheet(rows,{header:HEADS});
        var wb=global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(wb,ws,"标准溶液");
        global.XLSX.writeFile(wb,base+".xlsx");
      }else{
        var blob=new Blob(["\ufeff"+tsv],{type:"text/csv;charset=utf-8"});
        var a=document.createElement("a");
        a.href=URL.createObjectURL(blob);
        a.download=base+".csv";
        a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); },1500);
      }
      lrStatMsg("已导出 "+rows.length+" 条标准溶液：表格已下载、内容已复制。到试剂系统点「Excel 导入」选这个文件即可。");
    });
    lrAlert("已生成 "+rows.length+" 条标准溶液。\n\n"+
      "1. 表格已下载（"+base+"）\n"+
      "2. 试剂系统的「Excel 导入」里选中它，确认即可\n\n"+
      "（两个系统不在同一个域，浏览器不允许直接写对方数据，只能这样一次导入。）");
  }
  /* 同步诊断条：让用户直接看到试剂系统读到几条、匹配上几条 */
  function lrReagentDiagHtml(){
    var r=LR_SYNC_RESULT;
    if(!r) return "";
    var msg, color;
    if(!r.total){ msg="试剂系统里读到 0 条数据 —— 请先在「试剂效期管理」导入台账"; color="#a16207"; }
    else if(!r.hit){ msg="试剂系统读到 "+r.total+" 条，但没有一条能对上原始记录的溶液名"+
      (r.list.length?("（如 "+r.list.join("、")+"）"):""); color="#b91c1c"; }
    else { msg="试剂系统读到 "+r.total+" 条，已匹配 "+r.hit+" 条、写入 "+r.fields+
      " 个日期"+(r.miss?("；"+r.miss+" 条名称对不上"+(r.list.length?("（如 "+r.list.join("、")+"）"):"")):""); color="#15803d"; }
    return '<div style="flex-basis:100%;font-size:11.5px;line-height:1.6;color:'+color+
      ';background:#fff;border:1px solid '+color+';border-radius:6px;padding:6px 10px;margin:4px 0">'+
      '<b>同步状态：</b>'+esc(msg)+'</div>';
  }
  function lrReagentSyncNow(){
    lrReagentSync();
    lrSolRender();
    var r=LR_SYNC_RESULT||{};
    lrAlert("试剂系统同步结果：\n\n读到 "+(r.total||0)+" 条，匹配 "+(r.hit||0)+
      " 条，更新 "+(r.fields||0)+" 个日期"+(r.miss?("；"+r.miss+" 条名称对不上"):"")+"。"+
      (!r.total?"\n\n请先在「打开试剂效期管理」里导入台账，再回来点同步。":
       (!r.hit?"\n\n名称对不上——请在试剂系统里把溶液名改成和这里一致（如 VB1→维生素B1）。":"")));
  }
  function lrSolPanelHtml(){
    var v=lrSolView();
    var nm=(v==="all")?"全部":((lrProject(v)||{name:v}).name);
    return '<details class="lr-solbar" id="lrSolBar" style="margin-bottom:12px">'+
      '<summary id="lrSolSummary">标准溶液维护（当前：'+esc(nm)+'）· 只列这个项目的，点「全部」才出全部</summary>'+
      '<div class="muted" style="font-size:11.5px;line-height:1.6;margin:8px 0 2px">'+
      '编码、批号和有效期至<b>打印时不用填</b>，默认就是 Word 原表里的值。'+
      lrVisiblePs().length+' 份原表里只有 '+lrSolProjects().length+
      ' 个项目有标准溶液，这里默认只列其中一个项目；'+
      '点上面的项目名切换，点「全部」才一次看全。'+
      '哪种溶液过期重新配制了，改一次本机记住，不用每次打印都改。'+
      '<br><b>需配制</b>的：填「配制日期」（可手写或点 📅 选，只收今天起 30 天内）自动生成编码，'+
      '填「有效期」数字选天/月自动生成有效期至（如 20261119 + 3月 → 20270218）。'+
      '<b>外购</b>的：编码和有效期至手填，前缀填错会弹窗拦下。</div>'+
      '<div class="lr-solacts">'+
        '<a class="btn sm pri" href="reagent/" target="_blank" rel="noopener" '+
          'style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">🔗 打开试剂效期管理</a>'+
        '<button type="button" class="btn sm" onclick="LAB.lrReagentSyncNow()">🔄 立即从试剂系统同步</button>'+
        '<label class="btn sm" style="cursor:pointer;margin:0;display:inline-flex;align-items:center">'+
          '↙ 从旧系统导入一次'+
          '<input type="file" accept=".csv,.xlsx,.xls" style="display:none" '+
            'onchange="LAB.lrReagentFile(this)"></label>'+
        lrReagentDiagHtml()+
        '<span class="muted"><b>配制日期、有效期自动取自同站点的试剂效期管理系统</b>：那边一改，这里自动更新，不用手填；'+
          '本页手改仍可（要口令），只要试剂系统那条没变，下次同步不会冲掉手改的值。'+
          '第一次用请先在旧系统「导出 CSV」，点左边按钮导一次。</span>'+
      '</div>'+
      lrSolTabsHtml(v)+'<div id="lrSolBody">'+lrSolBodyHtml(v)+'</div></details>';
  }
  function lrSolRender(){
    var bar=document.getElementById("lrSolBar");
    if(!bar) return;
    var v=lrSolView();
    var nm=(v==="all")?"全部":((lrProject(v)||{name:v}).name);
    var sm=document.getElementById("lrSolSummary");
    if(sm) sm.textContent="标准溶液维护（当前："+nm+"）· 只列这个项目的，点「全部」才出全部";
    var tabs=document.getElementById("lrSolTabs");
    if(tabs) tabs.outerHTML=lrSolTabsHtml(v);
    var body=document.getElementById("lrSolBody");
    if(body) body.innerHTML=lrSolBodyHtml(v);
  }
  function lrSetSolView(v){
    LRSOLVIEW=(v==="all"||(lrProject(v)&&lrCan(v)))?v:null;
    lrSave(); lrSolRender();
  }
  function lrSel(){
    if(!LRSEL){
      LRSEL={};
      var s=global.Store?global.Store.get("lab.record.sel.v1",null):null;
      if(s&&s.length){ s.forEach(function(k){ LRSEL[k]=1; }); }
      else { var ps=lrProjects(); if(ps.length) LRSEL[ps[0].key]=1; }
    }
    return LRSEL;
  }
  function lrSelected(){
    var s=lrSel();
    /* ★ 只返回当前操作人负责、且已勾选的项目，打印/统计绝不越权 */
    return lrVisiblePs().filter(function(p){ return s[p.key] && lrCan(p.key); });
  }
  function lrSave(){
    if(!global.Store) return;
    var s=lrSel(), R=lrRows();
    global.Store.set("lab.record.rows.v1", R);
    global.Store.set("lab.record.preview.v1", LRPREVIEW);
    global.Store.set("lab.record.info.v2", R[Math.min(LRPREVIEW,R.length-1)]||lrBlank());
    global.Store.set("lab.record.sol.v1", lrSol());
    /* 先把已保存的查看范围读回来，避免首次保存冲掉上次的「全部」 */
    lrSolView();
    global.Store.set("lab.record.solview.v1", LRSOLVIEW);
    global.Store.set("lab.record.group.v1", lrGroup());
    global.Store.set("lab.record.subgroup.v1", lrSubMap());
    global.Store.set("lab.record.sel.v1",
      lrProjects().filter(function(p){ return s[p.key]; }).map(function(p){ return p.key; }));
  }
  /* 把 Word 原表里的动态占位填上；其余 HTML 原样返回 */
  function lrFill(html,I){
    I=I||lrInfo(); var O=lrSol(), M=lrMat();
    return (html||"").replace(/<span class="lr-dyn"([^>]*)>([\s\S]*?)<\/span>/g,
      function(all,attrs,inner){
        var k=(attrs.match(/data-lr="([^"]+)"/)||[])[1];
        var nm=(attrs.match(/data-std="([^"]+)"/)||[])[1];
        var v=inner;
        if(k==="sample"||k==="maker"||k==="batch"||k==="date") v=I[k]||"";
        else if(LR_MAT_KEYS[k]) v=M[k]!=null?M[k]:inner;
        else if((k==="stdcode"||k==="stdexp"||k==="stdbatch")&&nm&&O[nm]){
          if(k==="stdcode") v=O[nm].code!=null?O[nm].code:inner;
          else if(k==="stdexp") v=O[nm].expiry!=null?O[nm].expiry:inner;
          else v=O[nm].batch!=null?O[nm].batch:inner;
        }
        return '<span class="lr-dyn"'+attrs+'>'+esc(v)+'</span>';
      });
  }
  /* ★★ 100% 复刻（2026-11-15 第四版）：底图是 Word 自己导出的 PDF 逐页渲染，
     标题居中 / 页眉 / 框线 / 公式图 / 页码 / 什么东西在哪一页，全是 Word 原样。
     浏览器重排 HTML 做不到这一点，所以页面上除动态位外不再重画任何文字。 */
  function lrAbs(u){
    try{ return new URL(u, location.href).href; }catch(e){ return u; }
  }
  function lrFieldVal(f,I){
    I=I||lrInfo(); var O=lrSol(), M=lrMat();
    if(f.k==="sample"||f.k==="maker"||f.k==="batch"||f.k==="date") return I[f.k]||"";
    if(LR_MAT_KEYS[f.k]) return M[f.k]!=null?M[f.k]:(f.v||"");
    if(f.std && O[f.std]){
      if(f.k==="stdcode") return O[f.std].code!=null?O[f.std].code:(f.v||"");
      if(f.k==="stdexp") return O[f.std].expiry!=null?O[f.std].expiry:(f.v||"");
      if(f.k==="stdbatch") return O[f.std].batch!=null?O[f.std].batch:(f.v||"");
    }
    return f.v||"";
  }
  function lrTextUnits(v){
    var n=0;
    for(var i=0;i<v.length;i++) n += v.charCodeAt(i)<256?0.55:1;
    return n;
  }
  /* 录值后不重绘（保焦点），只改这一个 <text> 的文字与压缩宽度 */
  function lrUpdateText(el,v){
    v=String(v==null?"":v);
    el.textContent=v;
    var w=parseFloat(el.getAttribute("data-w"))||0;
    var fs=parseFloat(el.getAttribute("data-fs"))||10.5;
    var maxw=Math.max(20,w-8);
    if(v && lrTextUnits(v)*fs>maxw){
      el.setAttribute("textLength",maxw);
      el.setAttribute("lengthAdjust","spacingAndGlyphs");
    } else {
      el.removeAttribute("textLength");
      el.removeAttribute("lengthAdjust");
    }
  }
  function lrFieldSvg(f,I){
    var v=lrFieldVal(f,I), maxw=Math.max(20,f.w-8);
    /* 原示例值已在生成底图时只涂掉文字本身，这里绝不再盖白块，
       否则会把 Word 的表格竖框线一起遮断。 */
    var a='class="lr-dyn" data-lr="'+esc(f.k)+'"'+
      (f.std?' data-std="'+esc(f.std)+'"':'')+
      ' data-w="'+f.w+'" data-fs="'+f.fs+'"'+
      ' x="'+f.tx+'" y="'+f.by+'" text-anchor="'+f.anchor+'" font-size="'+f.fs+'"';
    if(v && lrTextUnits(v)*f.fs>maxw) a+=' textLength="'+maxw+'" lengthAdjust="spacingAndGlyphs"';
    return '<text '+a+'>'+esc(v)+'</text>';
  }
  function lrPageInner(g,pno,src,forPrint,I){
    var fs=g.fields.filter(function(f){ return f.pg===pno+1; });
    /* 预览按需加载（9 个项目共 13 页不会一上来全拉）；打印一律 eager，
       且 lrPrint 会等齐所有位图才调用 print()，绝不出空白页。 */
    var ld=forPrint?' loading="eager"':' loading="lazy" decoding="async"';
    /* ★ 底图没到位前不画动态值：否则慢网下只剩几个值浮在白纸上，像空白记录。
       预览：文字层先隐藏 + 显示「加载原表…」，img load 后再揭开（lrBindPageLoad）。
       打印：forPrint 时文字层恒显示，lrPrint 已等齐所有位图才 print。 */
    var cls=forPrint?'lr-ov':'lr-ov lr-pending';
    /* ★ 揭开逻辑写在 img 的 onload 上（HTML 级最可靠，不依赖后续 JS 绑定时序）；
       load 可能在 innerHTML 写入瞬间就完成，故 onerror/onload 之外还加一个即时 complete 判断。 */
    var onload=forPrint?'':' onload="this.parentNode.querySelector(\'svg.lr-ov\').classList.remove(\'lr-pending\');var l=this.parentNode.querySelector(\'.lr-loading\');if(l)l.remove();"';
    return '<img class="lr-pageimg"'+ld+onload+' src="'+esc(lrAbs(src))+'" alt="">'+
      (forPrint?'':'<div class="lr-loading">正在加载 Word 原表…</div>')+
      '<svg class="'+cls+'" viewBox="0 0 '+g.w+' '+g.h+'" preserveAspectRatio="none" '+
      'xmlns="http://www.w3.org/2000/svg">'+
      fs.map(function(f){ return lrFieldSvg(f,I); }).join("")+'</svg>';
  }
  function lrSheetHtml(p,I){
    var g=(global.LABPAGES||{})[p.key];
    if(!g||!g.pages||!g.pages.length)
      return '<div class="lr-paper" data-lr-sheet="'+esc(p.key)+'">'+lrFill(p.html,I)+'</div>';
    return '<div class="lr-paper" data-lr-sheet="'+esc(p.key)+'">'+
      g.pages.map(function(src,i){
        return '<div class="lr-pagewrap" data-lr-page="'+(i+1)+'">'+
               lrPageInner(g,i,src,false,I)+'</div>';
      }).join("")+'</div>';
  }
  function lrRowSelHtml(){
    var R=lrRows(), n=R.length;
    if(n<=1) return '';
    var opts='';
    for(var i=0;i<n;i++){
      var r=R[i];
      opts+='<option value="'+i+'"'+(i===LRPREVIEW?' selected':'')+'>'+
        (i+1)+' · '+esc(r.sample||r.batch||'（未填）')+'</option>';
    }
    return '<div class="lr-rowsel">预览第 <select onchange="LAB.lrPreviewRow(+this.value)">'+
      opts+'</select> / '+n+' 个样品'+
      '<span class="muted"> · 打印时按清单逐份生成全部记录，不用一行一行打</span></div>';
  }
  function lrPreviewHtml(){
    var picked=lrSelected();
    if(!picked.length) return '<div class="card empty">上面勾一个检测项目，对应的 Word 原始记录就出来。</div>';
    /* ★ 系统性解决卡死：页面默认一张都不渲染（每页几百 KB 矢量底图），
       只列项目按钮，点哪个画哪个；打印仍按全部选中项目生成。 */
    var cur = null;
    for(var i=0;i<picked.length;i++){ if(picked[i].key===LR_PREVIEW_KEY){ cur=picked[i]; break; } }
    var bar = '<div class="card lr-prevbar"><div class="card-h"><h3>页面预览</h3>'+
      '<span class="muted">已选 '+picked.length+' 个项目 · 默认不渲染，点项目名看单页（打印不受影响）</span></div>'+
      '<div class="lr-chips">'+picked.map(function(p){
        return '<button class="btn sm '+(p.key===LR_PREVIEW_KEY?"pri":"")+'" onclick="LAB.lrPrevOne(\''+esc(p.key)+'\')">'+
          esc(p.name)+'</button>';
      }).join("")+'</div></div>';
    if(!cur) return bar;
    var pages = ((global.LABPAGES||{})[cur.key]||{pages:[]}).pages.length;
    return bar + '<div class="card lr-card" style="margin-bottom:12px"><div class="card-h">'+
      '<h3>'+esc(cur.name)+(cur.unit?'（'+esc(cur.unit)+'）':'')+'</h3>'+
      '<span class="muted">'+esc(cur.file)+' · Word 原页 100% 复刻（共 '+pages+' 页）</span><div class="sp"></div>'+
      '<button class="btn sm" onclick="LAB.lrPrevOne(\'\')">收起预览</button>'+
      '<button class="btn sm" onclick="LAB.lrPrintOne(\''+esc(cur.key)+'\')">🖨 只打此项目（全部样品）</button></div>'+
      '<div class="lr-scroll">'+lrSheetHtml(cur)+'</div></div>';
  }

  /* ★ 样品清单：Excel / CSV / 粘贴区域一次导入多行，逐行往下排带序号 */
  /* 网页清单不显示备注列；备注只存在数据里供 Excel 模板导出和导入过滤用 */
  var LR_HEADS=[["sample","样品名称"],["batch","批号/生产日期"],
                ["maker","生产商"],["date","检测日期"]];
  function lrRowsHtml(){
    var R=lrRows(), st=lrPickCount();
    var t='<div class="lr-rowswrap"><table class="lr-rows"><thead><tr>'+
      '<th class="c-pick" title="点这里全选 / 取消全选（备注「已出」自动跳过）">'+
        '<input type="checkbox" id="lrPickAll"'+(st.all&&st.on===st.all?' checked':'')+
        ' onchange="LAB.lrPickAll(this.checked)"></th>'+
      '<th class="c-no">序号</th>'+LR_HEADS.map(function(f){
        return '<th>'+f[1]+'</th>'; }).join("")+'<th class="c-op"></th></tr></thead><tbody>';
    R.forEach(function(r,i){
      var on=r.pick!==false;
      t+='<tr'+(i===LRPREVIEW?' class="on"':'')+'>'+
        '<td class="c-pick"><input type="checkbox" class="lr-pick" data-row="'+i+'"'+
          (on?' checked':'')+' title="点这里勾选这个样品"'+
          ' onchange="LAB.lrPickRow('+i+',this.checked)"></td>'+
        '<td class="lr-no" title="点这里预览这个样品" onclick="LAB.lrPreviewRow('+i+')">'+
          (i+1)+'<span class="lr-rowfocus">'+(i===LRPREVIEW?'预览中':'')+'</span></td>'+
        LR_HEADS.map(function(f){
          return '<td><input type="text" data-row="'+i+'" data-k="'+f[0]+'" '+
            'value="'+esc(r[f[0]])+'" placeholder="'+f[1]+'" '+
            'oninput="LAB.lrSetRow(+this.dataset.row,this.dataset.k,this.value)"></td>';
        }).join("")+
        '<td class="c-op"><button type="button" title="删除这一行" '+
          'onclick="LAB.lrDelRow('+i+')">×</button></td></tr>';
    });
    return t+'</tbody></table></div>';
  }
  function lrImportBarHtml(){
    var st=lrPickCount();
    return '<div class="lr-importbar">'+
      '<button class="btn sm" onclick="LAB.lrAddRow()">＋ 添加一行</button>'+
      '<label class="btn sm lr-filebtn" for="lrFile">📥 导入 Excel / CSV</label>'+
      '<input type="file" id="lrFile" accept=".xlsx,.xls,.csv,.txt" style="display:none" '+
        'onchange="LAB.lrImportFile(this)">'+
      '<button class="btn sm" onclick="LAB.lrTogglePaste()">📋 粘贴 Excel 区域</button>'+
      '<button class="btn sm" onclick="LAB.lrTemplate()">⬇ 下载 Excel 模板</button>'+
      '<span class="lr-pickbar">'+
        '<button class="btn sm pri" onclick="LAB.lrPickAll(true)">☑ 全选</button>'+
        '<button class="btn sm" onclick="LAB.lrPickAll(false)">☐ 清空勾选</button>'+
        '<button class="btn sm" onclick="LAB.lrPickInvert()">⇄ 反选</button>'+
        '<b class="lr-count" id="lrPickCount">已选 '+st.on+' / '+st.all+' 个样品</b></span>'+
      '<button class="btn sm" onclick="LAB.lrClearRows()">清空清单</button>'+
      '<span class="muted">点每行最左边的方框就能单选 / 多选，上面有全选、清空、反选</span></div>'+
      '<div id="lrPasteBox" class="lr-pastebox" style="display:none">'+
      '<textarea id="lrPaste" placeholder="在 Excel 里框选多行，Ctrl+C 后粘贴到这里；'+
      '每行一个样品，列之间用 Tab 或逗号分隔"></textarea>'+
      '<div><button class="btn sm pri" onclick="LAB.lrImportPaste()">导入这些行</button> '+
      '<button class="btn sm" onclick="LAB.lrTogglePaste()">收起</button></div></div>';
  }
  function lrPrintCount(){
    return lrActiveRows().length*lrSelected().length;
  }
  function viewRecordByProject(){
    /* 每次进记录页先挂同步钩子并拉一次试剂系统数据（同域才读得到，读不到就什么都不做） */
    try{ lrReagentHook(); lrReagentSync(); }catch(e){}
    var ps=lrVisiblePs(), s=lrSel(), n=lrSelected().length, gp=lrGroupProjects();
    var rows=lrActiveRows().length, total=lrPrintCount();
    var h=(global.LABAUTH&&global.LABAUTH.barHtml)?global.LABAUTH.barHtml():'';
    h+='<div class="card" style="margin-bottom:12px"><div class="card-h">'+
      '<h3>原始记录 · 按检测项目出模板</h3>'+
      '<span class="muted">共 '+ps.length+' 个检测项目'+(lrAuthOn()?'（本人负责）':'')+' · 当前分类 '+
        (lrGroup()==="all"?"全部":((lrGroups().filter(function(x){
          return x.key===lrGroup(); })[0]||{}).name||"理化组"))+
        ' '+gp.length+' 个</span><div class="sp"></div>'+
      '<button class="btn sm pri" onclick="LAB.lrMode(\'project\')">按检测项目</button>'+
      '<button class="btn sm" onclick="LAB.lrMode(\'method\')">按方法标准</button>'+
      '<a class="btn sm" href="https://xiongying118.github.io/infant-record-app/" target="_blank" rel="noopener noreferrer">↗ 独立工作系统</a></div>'+
      '<div class="notice" style="margin:10px 0"><span>📋</span><div>'+
      '<b>Word 原页 100% 复刻</b>：每页直接用 Word 导出的原页，标题位置、字体字号、列宽行高、'+
      '框线、公式图、页码、哪一页放什么内容全部原样，打印不带浏览器页眉页脚。'+
      '只有<b>样品名称、生产商、批号/生产日期、检测日期</b>是动态位'+
      '（低聚半乳糖原表另有批号、干物质重量、GOS干含量三项可填）；'+
      '下面清单可以从 Excel 导入多行，<b>点每行左边方框选样品</b>（单选/多选/全选/反选都行），'+
      '再勾检测项目，<b>一次打印选中的样品 × 项目</b>。'+
      '检测日期留空即可打印后手写。</div></div>'+
      '<h4 class="lr-sub" id="lrSampleHead">样品清单（共 '+lrPickCount().all+' 个 · 已选 '+
      lrPickCount().on+' 个 · 点左边方框勾选）</h4>'+
      lrImportBarHtml()+lrRowsHtml()+
      '<div class="lr-stat" id="lrStat">已选 '+rows+' 个样品 × '+n+' 个项目 = '+
        total+' 份记录 · 本机已保存，刷新不丢</div></div>';
    /* 标准溶液：默认 Word 原值，只在过期重配时改一次；
       ★ 按检测项目过滤，默认只出当前项目的，点「全部」才出全部 */
    h+=lrSolPanelHtml();
    h+='<div class="card" style="margin-bottom:12px"><div class="card-h">'+
      '<h3>选择检测项目</h3><span class="muted">当前 '+gp.length+' 个 · 选 1 个 / 几个 / 全部都行</span><div class="sp"></div>'+
      '<button class="btn sm" title="只选当前分类里的项目" onclick="LAB.lrAll()">全选本组</button>'+
      '<button class="btn sm" onclick="LAB.lrNone()">清空</button>'+
      '<button class="btn pri sm" id="lrPrintBtn" onclick="LAB.lrPrint()">🖨 打印全部（'+total+' 份）</button></div>'+
      lrGroupTabsHtml()+
      '<div class="lr-chips">'+gp.map(function(p){
        return '<label class="lr-chip '+(s[p.key]?"on":"")+'">'+
          '<input type="checkbox" '+(s[p.key]?"checked":"")+
          ' onchange="LAB.lrToggle(\''+esc(p.key)+'\')">'+
          '<b>'+esc(p.name)+'</b>'+(p.unit?'<span class="muted">'+esc(p.unit)+'</span>':'')+
          '</label>';
      }).join("")+'</div></div>';
    h+='<div id="lrPreview">'+lrPreviewHtml()+'</div>';
    return h;
  }
  /* ---- 交互：输入只改占位符文本，不重绘，保住焦点 ---- */
  function lrStatMsg(s){
    var st=document.getElementById("lrStat");
    if(st) st.textContent=s;
  }
  var LR_ZH={sample:"样品名称",maker:"生产商",batch:"批号/生产日期",date:"检测日期"};
  function lrSetRow(i,k,v){
    var R=lrRows(); if(!R[i]) return;
    R[i][k]=v; lrSave();
    if(i===LRPREVIEW){
      var n=0;
      [].forEach.call(document.querySelectorAll('.lr-paper .lr-dyn[data-lr="'+k+'"]'),
        function(el){ lrUpdateText(el,v); n++; });
      lrStatMsg("已把第 "+(i+1)+" 行「"+(LR_ZH[k]||k)+"」填进 "+n+" 处 · 本机已保存");
    }
    var sel=document.querySelector(".lr-rowsel select");
    if(sel&&sel.options[i])
      sel.options[i].textContent=(i+1)+" · "+(R[i].sample||R[i].batch||"（未填）");
  }
  function lrSet(k,v){ lrSetRow(LRPREVIEW,k,v); }  /* 兼容旧调用：改当前预览行 */
  /* ★ 点方框勾选样品：单选 / 多选 / 全选 / 清空 / 反选，一键完成，完全在本页 */
  function lrPickRefresh(){
    var st=lrPickCount(), R=lrRows(), n=lrSelected().length;
    var all=document.getElementById("lrPickAll");
    if(all) all.checked=!!(st.all&&st.on===st.all);
    [].forEach.call(document.querySelectorAll(".lr-rows tbody tr"),function(tr,i){
      var r=R[i]; if(!r) return;
      tr.className=(i===LRPREVIEW?"on":"");
      var cb=tr.querySelector("input.lr-pick");
      if(cb){ cb.checked=r.pick!==false; cb.disabled=false;
        cb.title="点这里勾选这个样品"; }
      var f=tr.querySelector(".lr-rowfocus");
      if(f) f.textContent=i===LRPREVIEW?"预览中":"";
    });
    var cnt=document.getElementById("lrPickCount");
    if(cnt) cnt.textContent="已选 "+st.on+" / "+st.all+" 个样品";
    var btn=document.getElementById("lrPrintBtn");
    if(btn) btn.textContent="🖨 打印全部（"+lrPrintCount()+" 份）";
    var head=document.getElementById("lrSampleHead");
    if(head) head.textContent="样品清单（共 "+st.all+" 个 · 已选 "+st.on+" 个 · 点左边方框勾选）";
    lrStatMsg("已选 "+st.on+" 个样品 × "+n+" 个项目 = "+lrPrintCount()+
      " 份记录 · 本机已保存，刷新不丢");
  }
  function lrPickRow(i,v){
    var R=lrRows(), r=R[i]; if(!r) return;
    r.pick=!!v; lrSave(); lrPickRefresh();
  }
  function lrPickAll(v){
    lrRows().forEach(function(r){ r.pick=!!v; });
    lrSave(); lrPickRefresh();
  }
  function lrPickInvert(){
    lrRows().forEach(function(r){ r.pick=!(r.pick!==false); });
    lrSave(); lrPickRefresh();
  }
  function lrPreviewRow(i){
    LRPREVIEW=Math.min(Math.max(0,parseInt(i,10)||0),lrRows().length-1);
    lrSave(); lrRedraw();
  }
  function lrAddRow(){
    var R=lrRows(); R.push(lrBlank()); LRPREVIEW=R.length-1;
    lrSave(); render();
    setTimeout(function(){ lrStatMsg("已添加第 "+R.length+" 行，填好后点「打印全部」"); },0);
  }
  function lrDelRow(i){
    var R=lrRows();
    if(R.length<=1){ LRROWS=[lrBlank()]; LRPREVIEW=0; }
    else { R.splice(i,1); if(LRPREVIEW>=R.length) LRPREVIEW=R.length-1; }
    lrSave(); render();
  }
  function lrClearRows(){
    LRROWS=[lrBlank()]; LRPREVIEW=0; lrSave(); render();
  }
  /* ---- Excel / CSV / 粘贴区域导入：解析成多行样品清单 ---- */
  function lrSplit(line,sep){
    var out=[],cur="",q=false;
    for(var i=0;i<line.length;i++){
      var c=line.charAt(i);
      if(c==='"'){
        if(q&&line.charAt(i+1)==='"'){ cur+='"'; i++; } else q=!q;
      } else if(!q&&(c===sep||(sep===","&&(c==="\t"||c==="，")))){
        out.push(cur); cur="";
      } else cur+=c;
    }
    out.push(cur);
    return out.map(function(x){ return x.replace(/^\ufeff/,"").trim(); });
  }
  /* 兼容老模板的「导入勾选」列（新模板已改成备注列）；新逻辑以网页上点方框为准 */
  function lrPickYes(v){
    var s=String(v==null?"":v).trim().toUpperCase();
    return s==="√"||s==="✓"||s==="✔"||s==="是"||s==="Y"||s==="YES"||
           s==="1"||s==="TRUE"||s==="T"||s==="X"||s==="勾";
  }
  function lrHeadMap(cells){
    var RE=[["_oldpick",/^导入勾选$|^是否导入$|^勾选$|^选择$|^需要导入$|^导入$|^√$|^pick$|^select$|^check/i],
            ["note",/备注|说明|note|remark/i],
            ["sample",/样品名称|样品名|品名|样品|sample/i],
            ["maker",/生产商|生产厂家|生产单位|厂家|maker/i],
            ["batch",/批号|生产日期|批次|batch/i],
            ["date",/检测日期|检验日期|检测时间|date/i],
            ["_no",/序号|编号|no\.?|#/i]], map=[], hits=0;
    cells.forEach(function(c){
      var k="";
      for(var i=0;i<RE.length;i++) if(RE[i][1].test(c)){ k=RE[i][0]; break; }
      if(k&&k!=="_no") hits++;
      map.push(k);
    });
    return hits>=2?map:null;
  }
  function lrImportText(txt,forceSep){
    var lines=String(txt||"").replace(/\r/g,"").split("\n")
      .filter(function(l){ return l.trim(); });
    if(!lines.length){ lrStatMsg("没有读到数据行"); return 0; }
    var sep=forceSep||(lines[0].indexOf("\t")>=0?"\t":",");
    var first=lrSplit(lines[0],sep), map=lrHeadMap(first), start=0;
    if(map) start=1;
    else {
      var drop=(first.length>4&&/^\d+$/.test(first[0]))?1:0;
      map=[];
      for(var j=0;j<first.length;j++) map.push(j<drop?"_no":(LR_KEYS[j-drop]||"_no"));
    }
    var out=[], doneCnt=0;
    for(var i=start;i<lines.length;i++){
      var c=lrSplit(lines[i],sep), r=lrBlank(), any=false, oldPick=true;
      map.forEach(function(k,j){
        if(k==="_oldpick"){ oldPick=lrPickYes(c[j]); return; }
        if(k&&k!=="_no"&&(LR_KEYS.indexOf(k)>=0||k==="note")){
          r[k]=c[j]!=null?c[j]:""; if(k!=="note"&&r[k]) any=true;
        }
      });
      if(!any) continue;
      /* ★ Excel 备注写「已出」→ 这一行直接不导入；其余进清单，勾选在网页点方框 */
      if(lrDoneNote(r.note)){ doneCnt++; continue; }
      r.pick=oldPick;
      out.push(r);
    }
    if(!out.length){ lrStatMsg("没识别到有效行，请检查列顺序"); return 0; }
    LRROWS=out; LRPREVIEW=0; lrSave(); render();
    var on=out.filter(function(r){ return r.pick!==false; }).length;
    setTimeout(function(){
      lrStatMsg("已导入 "+out.length+" 个样品（已勾选 "+on+" 个"+
        (doneCnt?" · 已过滤 "+doneCnt+" 行":"")+"）· 点方框选样品，"+
        "全选/反选一键完成"); },0);
    return out.length;
  }
  /* Excel 解析库 881KB，只在真的导入 .xlsx 时才按需加载，不拖首页 */
  function lrLoadXLSX(cb){
    if(global.XLSX){ cb(true); return; }
    var s=document.createElement("script");
    s.src=lrAbs("vendor/xlsx.full.min.js");
    s.onload=function(){ cb(!!global.XLSX); };
    s.onerror=function(){ cb(false); };
    document.head.appendChild(s);
  }
  function lrImportFile(inp){
    var f=inp&&inp.files&&inp.files[0]; if(!f) return;
    var nm=(f.name||"").toLowerCase(), xl=/\.(xlsx|xls)$/.test(nm);
    var fr=new FileReader();
    fr.onload=function(e){
      var buf=e.target.result;
      var done=function(){ inp.value=""; };
      try{
        if(xl){
          lrLoadXLSX(function(ok){
            if(!ok){ lrStatMsg("Excel 解析库加载失败，请另存为 CSV 或用「粘贴 Excel 区域」"); done(); return; }
            try{
              var wb=global.XLSX.read(new Uint8Array(buf),{type:"array"});
              var sh=wb.Sheets[wb.SheetNames[0]];
              lrImportText(global.XLSX.utils.sheet_to_csv(sh,{blankrows:false}),",");
            }catch(err2){ lrStatMsg("Excel 读取失败："+err2.message); }
            done();
          });
        } else {
          var s=new TextDecoder("utf-8").decode(new Uint8Array(buf));
          if(s.indexOf("\ufffd")>=0){         // Excel 另存的 CSV 常是 GBK
            try{ s=new TextDecoder("gbk").decode(new Uint8Array(buf)); }catch(e2){}
          }
          lrImportText(s,""); done();
        }
      }catch(err){ lrStatMsg("导入失败："+err.message); done(); }
    };
    fr.readAsArrayBuffer(f);
  }
  function lrTogglePaste(){
    var b=document.getElementById("lrPasteBox"); if(!b) return;
    var show=b.style.display==="none";
    b.style.display=show?"":"none";
    if(show){ var t=document.getElementById("lrPaste"); if(t) t.focus(); }
  }
  function lrImportPaste(){
    var t=document.getElementById("lrPaste"); if(t) lrImportText(t.value,"");
  }
  function lrTemplate(){
    var q=function(v){
      v=String(v==null?"":v);
      return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
    };
    /* ★ 模板带「备注」列；备注写「已出」的行导入后自动不勾选，其余在网页上点方框选 */
    var csv="\ufeff序号,样品名称,批号/生产日期,生产商,检测日期,备注\n"+
      lrRows().map(function(r,i){
        return [i+1,r.sample,r.batch,r.maker,r.date,r.note||""].map(q).join(",");
      }).join("\n")+"\n";
    var a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download="原始记录样品清单.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
    lrStatMsg("已下载清单（含备注列）· 备注写「已出」的行不导入；勾选/全选/反选在网页清单里点一下就行");
  }
  /* 按溶液名称定位（过滤后索引会变，绝不能用位置下标）；兼容旧的数字下标 */
  function lrSetSol(name,k,v){
    var all=lrAllSolutions(), x=null;
    if(typeof name==="number") x=all[name];
    else for(var i=0;i<all.length;i++) if(all[i].name===name){ x=all[i]; break; }
    if(!x) return;
    var O=lrSol(); if(!O[x.name]) O[x.name]={};
    O[x.name][k]=v; lrSave();
    [].forEach.call(document.querySelectorAll('.lr-dyn[data-lr^="std"]'),function(el){
      if(el.getAttribute("data-std")!==x.name) return;
      var d=O[x.name]||{}, key=el.getAttribute("data-lr");
      if(key==="stdcode"&&d.code!=null) lrUpdateText(el,d.code);
      if(key==="stdexp"&&d.expiry!=null) lrUpdateText(el,d.expiry);
      if(key==="stdbatch"&&d.batch!=null) lrUpdateText(el,d.batch);
    });
  }
  /* ★ 底图加载完成后再显示动态文字层，避免慢网下出现「只有值、没有原表」的白页。
     主揭开逻辑在 img 的 inline onload 上；这里只兜底「缓存命中、onload 已错过」的情形。 */
  function lrBindPageLoad(){
    [].forEach.call(document.querySelectorAll(".lr-pagewrap"),function(w){
      var im=w.querySelector("img.lr-pageimg"), ov=w.querySelector("svg.lr-ov");
      if(!im||!ov||!ov.classList.contains("lr-pending")) return;
      if(im.complete && im.naturalWidth>0){
        ov.classList.remove("lr-pending");
        var ld=w.querySelector(".lr-loading"); if(ld) ld.remove();
      }
    });
  }
  function lrRedraw(){
    var host=document.getElementById("lrPreview");
    if(host) host.innerHTML=lrPreviewHtml();
    lrBindPageLoad();
    var n=lrSelected().length, rows=lrActiveRows().length, btn=document.getElementById("lrPrintBtn");
    if(btn) btn.textContent="🖨 打印全部（"+lrPrintCount()+" 份）";
    var s=lrSel(), ps=lrGroupProjects();
    [].forEach.call(document.querySelectorAll(".lr-chip"),function(el,i){
      var p=ps[i]; if(!p) return;
      el.className="lr-chip "+(s[p.key]?"on":"");
      var cb=el.querySelector("input"); if(cb) cb.checked=!!s[p.key];
    });
    lrPickRefresh();
    lrSolRender();
  }
  function lrToggle(k){
    if(!lrCan(k)){ lrAlert("【"+((lrProject(k)||{}).name||k)+"】不是当前操作人负责的项目，已锁定不能改。切到对应的操作人才能用。"); return; }
    var s=lrSel();
    if(s[k]){
      delete s[k];
      if(LRSOLVIEW===k) LRSOLVIEW=null;      // 取消该项目后回到跟随当前项目
    } else {
      s[k]=1;
      if(lrSelected().length===1) LRSOLVIEW=k; // ★ 只点一个项目 → 只列它的标准溶液
    }
    lrSave(); lrRedraw();
  }
  function lrAll(){
    var s=lrSel(); lrGroupProjects().forEach(function(p){ s[p.key]=1; });
    LRSOLVIEW="all";                          // ★ 只有点「全部/全选」才显示全部
    lrSave(); lrRedraw();
  }
  function lrNone(){
    /* ★ 清空只清本人负责的项目，别把同事已勾的从公共数据里删掉 */
    if(lrAuthOn()){
      var s=lrSel();
      lrVisiblePs().forEach(function(p){ delete s[p.key]; });
    } else LRSEL={};
    LRSOLVIEW=null; lrSave(); lrRedraw();
  }
  function lrNotes(){ return false; }   /* 兼容旧调用，方法说明已在原表内 */
  function lrMode(m){ LRMODE=m; render(); }

  /* ★★ 打印 = Word 原页一页一张图，@page margin:0 让浏览器自带的
     日期/标题/about:blank/1/1 页眉页脚没有落点，自动消失。 */
  var LR_PRINT_CSS = [
    '@page{size:A4 portrait;margin:0}',
    'html,body{margin:0;padding:0;background:#fff;',
      '-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.pg{position:relative;display:block;margin:0;padding:0;overflow:hidden;',
      'page-break-after:always;break-after:page}',
    '.pg:last-child{page-break-after:auto;break-after:auto}',
    '.lr-pageimg,.lr-ov{position:absolute;left:0;top:0;width:100%;height:100%;',
      'display:block;margin:0;padding:0;border:0}',
    '.lr-dyn{font-family:SimSun,"宋体",serif;fill:#000;font-weight:400}'
  ].join("");

  function lrPrint(only){
    var p0=only?lrProject(only):null;
    if(only && p0 && !lrCan(only)){
      var st0=document.getElementById("lrStat");
      if(st0) st0.textContent="【"+p0.name+"】不是当前操作人负责的项目，已锁定不能打印。";
      return;
    }
    var picked=only?[p0].filter(Boolean):lrSelected();
    var st=document.getElementById("lrStat");
    if(!picked.length){ if(st) st.textContent="先勾一个检测项目再打印。"; return; }
    /* ★ 批量：样品清单每一行 × 勾选的每个项目，一次全部送打印 */
    var rows=lrActiveRows(), body="", pages=0;
    if(!rows.length){
      if(st) st.textContent="样品清单里一行都没勾（备注「已出」的不算）· 点行首方框或「全选」再打印。";
      return;
    }
    rows.forEach(function(I){
      picked.forEach(function(p){
        var g=(global.LABPAGES||{})[p.key];
        if(!g||!g.pages||!g.pages.length){
          body+='<div class="pg">'+lrFill(p.html,I)+'</div>'; pages++; return;
        }
        g.pages.forEach(function(src,i){
          body+='<div class="pg" style="width:'+g.w+'pt;height:'+g.h+'pt">'+
                lrPageInner(g,i,src,true,I)+'</div>';
          pages++;
        });
      });
    });
    var w=window.open("","_blank");
    if(!w){ if(st) st.textContent="浏览器拦了新窗口，请允许弹出窗口后重试。"; return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8">'+
      '<title></title><style>'+LR_PRINT_CSS+'</style></head><body>'+
      body+'</body></html>');
    w.document.close();
    /* 位图全部解码完再送打印，避免出空白页 */
    setTimeout(function(){
      var d=w.document, imgs=d.querySelectorAll?[].slice.call(d.querySelectorAll("img.lr-pageimg")):[];
      var tries=0;
      (function wait(){
        var ready=imgs.every(function(im){ return im.complete && im.naturalWidth>0; });
        if(!imgs.length || ready || tries++>480){   // 批量页数多，慢网最多等 120 秒
          w.focus(); w.print();
        } else setTimeout(wait,250);
      })();
    },80);
    if(st) st.textContent="已送打印："+rows.length+" 个样品 × "+picked.length+
      " 个项目 = "+(rows.length*picked.length)+" 份记录 / "+pages+" 页";
  }
  function lrPrintOne(k){ lrPrint(k); }

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
    /* 默认「按检测项目」：9 份真实 Word 原表 + 样品信息一次填充 */
    if(LRMODE==="project" && lrProjects().length) return viewRecordByProject();
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
        <span class="muted">选方法 → 出记录表框架 → 填数据 → 导出打印签字</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="LAB.lrMode('project')">← 按检测项目（真实模板）</button>
        <button class="btn sm pri" onclick="LAB.lrMode('method')">按方法标准</button></div>
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
    var rows=[["检测项目","检验方法","类别","出报告周期","检测方式","强制性","主检人","依赖设备","依赖试剂"]];
    cap.forEach(function(c){
      var eqs=(c.eq||[]).map(function(id){var e=eqMap[id];return e?e.name+"("+e.id+")":"";}).filter(Boolean).join("；");
      var s=stMap[c.staff];
      rows.push([c.item, c.method, c.cat, c.days+" 天", c.price, c.acc, s?s.name:"", eqs, (c.rg||[]).join("；")]);
    });
    rows.push([]);
    rows.push(["说明","检测方式标注自检/分包；周期含前处理与复核，强制性依据对应国标。"]);
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
    var rows=[["样品编号","样品名称","类别","生产批号","来源/生产线","生产日期","收样日期",
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
    setWlPeriod: function(p){ WL_PERIOD = p; render(); },
    wlPick: function(c){ WL_PICK = c; render(); },
    lrPrevOne: function(k){ LR_PREVIEW_KEY = k||null; render(); },
    costSet: function(i,j,v){
      var d=costData(); if(!d.items[i]||!d.items[i].rows[j]) return;
      d.items[i].rows[j][1]=parseFloat(v)||0; costSave(d); render();
    },
    costTimes: function(i,v){
      var d=costData(); if(!d.items[i]) return;
      d.items[i].times=parseInt(v,10)||0; costSave(d); render();
    },
    costPeriod: function(p){ COST_PERIOD = p; render(); },
    costPick: function(m){ if(global.toast) global.toast("已选：" + m, "ok"); },
    costPrice: function(m,v){
      var d=costData(); if(!d.mats[m]) d.mats[m]={unit:"",price:0};
      d.mats[m].price=parseFloat(v)||0; costSave(d); render();
    },
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
    printRecord: printRecord,
    /* 按检测项目（真实 Word 模板） */
    lrMode: lrMode,
    lrSet: lrSet,
    lrRows: lrRows,
    lrActiveRows: lrActiveRows,
    lrSetRow: lrSetRow,
    lrAddRow: lrAddRow,
    lrDelRow: lrDelRow,
    lrClearRows: lrClearRows,
    lrPreviewRow: lrPreviewRow,
    lrMat: lrMat,
    lrSetMat: lrSetMat,
    lrPickCount: lrPickCount,
    lrPickRow: lrPickRow,
    lrPickAll: lrPickAll,
    lrPickInvert: lrPickInvert,
    lrDoneNote: lrDoneNote,
    lrImportText: lrImportText,
    lrImportFile: lrImportFile,
    lrImportPaste: lrImportPaste,
    lrTogglePaste: lrTogglePaste,
    lrTemplate: lrTemplate,
    lrPrintCount: lrPrintCount,
    lrToggle: lrToggle,
    lrAll: lrAll,
    lrNone: lrNone,
    lrNotes: lrNotes,
    lrPrint: lrPrint,
    lrPrintOne: lrPrintOne,
    lrSheetHtml: lrSheetHtml,
    lrProjects: lrProjects,
    lrGroups: lrGroups,
    lrGroup: lrGroup,
    lrGroupProjects: lrGroupProjects,
    lrSetGroup: lrSetGroup,
    lrSubs: lrSubs,
    lrSub: lrSub,
    lrSetSub: lrSetSub,
    lrInfo: lrInfo,
    lrSelected: lrSelected,
    lrSol: lrSol,
    lrAllSolutions: lrAllSolutions,
    lrSetSol: lrSetSol,
    lrSetSolBatch: lrSetSolBatch,
    lrSetMatGuard: lrSetMatGuard,
    lrExportToReagent: lrExportToReagent,
    lrReagentFile: lrReagentFile,
    lrReagentSync: lrReagentSync,
    lrReagentSyncNow: lrReagentSyncNow,
    lrReagentDiag: function(){ return LR_SYNC_RESULT; },
    lrSolView: lrSolView,
    lrSolRows: lrSolRows,
    lrSetSolView: lrSetSolView,
    /* 标准溶液编码/有效期自动生成 */
    solParts: solParts,
    solOrig: solOrig,
    isValidDate8: isValidDate8,
    date8Add: date8Add,
    guessDur: guessDur,
    lrDateErr: lrDateErr,
    lrSetPrepDate: lrSetPrepDate,
    lrSetDur: lrSetDur,
    lrSetUnit: lrSetUnit,
    lrSolCodeInput: lrSolCodeInput,
    lrSolExpiryInput: lrSolExpiryInput,
    checkExpiryLogic: checkExpiryLogic,
    solLinkOf: solLinkOf,
    SOL_LINK_GROUPS: SOL_LINK_GROUPS,
    lrApplyLink: lrApplyLink,
    lrOpenCal: lrOpenCal,
    lrCalPick: lrCalPick,
    lrCalClose: lrCalClose,
    /* 按操作人锁项目（共用电脑） */
    lrAuthChanged: authChanged,
    lrAuthOn: lrAuthOn,
    lrCan: lrCan,
    lrVisiblePs: lrVisiblePs
  };

})(window);
