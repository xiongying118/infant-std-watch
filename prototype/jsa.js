/* ================================================================
   jsa.js —— 工作安全分析（JSA）工作台（2026-11-01 重写）
   ================================================================
   用户原话：「JSA的内容是可编辑，可联动，可交付的才行」
                「JSA的内容还是太少，完善它」

   ---- 三个要求怎么落的 ----

   ① 可编辑
      · 基础信息（项目编号、作业名称、区域…）全部可改
      · 每个作业步骤的 5 个字段可改：步骤 / 危害 / 事件 / 控制措施
      · L、S 可改 → R 实时重算 → 风险等级颜色实时变
      · 可加步骤、删步骤、复制分区
      · 建议补充措施、责任人、期限可填
      · 改完自动落盘（复用 store.js 的 Store）

   ② 可联动
      · L 或 S 一改 → R、风险等级、统计图、矩阵高亮 全部跟着变
      · 分区汇总 → 顶部 KPI 跟着变（高/中/一般/低 各多少条）
      · 「高风险步骤」列表 → 点一下直接跳到那条并高亮
      · 建议措施填了「已落实」→ 残余风险行自动算出来
      · 基础信息改了 → 导出的文档抬头跟着变
      · 与实验室台账联动：JSA 里出现的设备编号 → 跳到设备台账

   ③ 可交付
      · 导出 CSV（Excel 可直接打开）—— 完整的工作危害分析表
      · 导出 Word（.doc）—— 打印后可直接签字的正式表单
      · 导出 HTML 打印视图 —— A4 分页，含签署栏
      · 导出前会校验：高风险项是否有措施、必填项是否填全
   ================================================================ */

(function (global) {
  "use strict";

  /* ---------- 状态 ---------- */
  var ST = null;              // 当前 JSA 数据（可编辑副本）
  var CUR_ZONE = 0;           // 当前分区索引
  var CUR_STEP = null;        // 高亮的步骤（分区索引 + 步骤索引）
  var TAB = "work";           // work | matrix | redlines | ppe | drill | signoff | guide

  /* ★ 风险四档配色（2026-11-03 用户反馈：「这个颜色要不一样」）★
     原来四档用的是「同一个色相 + 不同透明度」：
       低 #15803d / 一般 #b45309 / 中等 #c2410c / 高 #b91c1c
     → 一般(黄棕) 和 中等(橙) 色相几乎一样，中等(橙) 和 高(红) 更是贴脸，
       浅底上（alpha 22）四档看着几乎同一片肉粉，肉眼分不出等级。
     改法：每档给**固定的浅底色 bg**（色相拉开：黄 → 橙 → 红），
       文字仍用深色 color 保证对比。
       bg  = 该格有步骤时的底色（有内容 = 该风险真的存在）
       bgE = 该格无步骤时的底色（很淡，只示意"这格没人"）
     */
  var GRADES = [
    {k:"低",     min:1,  max:4,  cls:"g-low",  color:"#15803d", bg:"#dcf0e4", bgE:"#f2faf5"},
    {k:"一般",   min:5,  max:9,  cls:"g-mid",  color:"#a16207", bg:"#fbeec2", bgE:"#fdfaef"},
    {k:"中等",   min:10, max:14, cls:"g-hi",   color:"#c2410c", bg:"#fcd9b8", bgE:"#fef5ee"},
    {k:"高",     min:15, max:25, cls:"g-crit", color:"#b91c1c", bg:"#f8c9c9", bgE:"#fdf1f1"}
  ];

  function esc(s){
    return String(s==null?"":s).replace(/[&<>"]/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];
    });
  }
  function gradeOf(r){
    if(r==null || isNaN(r)) return {k:"—",cls:"g-none",color:"#94a3b8"};
    for(var i=0;i<GRADES.length;i++) if(r>=GRADES[i].min && r<=GRADES[i].max) return GRADES[i];
    return {k:"—",cls:"g-none",color:"#94a3b8"};
  }

  /* ================================================================
     载入 / 保存
     ================================================================ */
  /* ★ 版本合并（2026-11-02）★
     用户本地已存了「7 区 48 步」的旧副本（Store["jsa.work"]）。
     预填数据扩到「18 区 108 步」后，若直接用 saved 覆盖，新分区永远出不来。
     做法：按分区标题 + 步骤 sid 做**增量合并** ——
       · 预填里有、本地没有的分区 → 追加到本地
       · 预填里有、本地同分区没有的步骤 → 追加进该分区
       · 双方都有的 → 保留本地版本（用户的编辑不能被覆盖）
     这样用户改过的内容一个不丢，同时能拿到新增的分区与步骤。

     ★ 为什么按 sid 而不是标题 ★
       用户把「样品接收与登记」改成「【用户改过的步骤名】」后，
       按标题就匹配不上 → 同一条会被当成新步骤再追加一次（页面出现重复行）。
       sid 是构建期算出的稳定指纹（md5(分区标题|步骤标题)），
       用户改名只改 step 字段、不动 sid → 合并时仍然对得上。 */
  function mergePreset(saved, raw){
    if(!saved || !raw) return saved;
    var sv = saved.__v || 0, rv = raw.__v || 0;
    if(rv <= sv) return saved;              // 已是最新，不动

    saved.zones = saved.zones || [];
    var byTitle = {};
    saved.zones.forEach(function(z){ byTitle[z.title] = z; });

    (raw.zones||[]).forEach(function(rz){
      var sz = byTitle[rz.title];
      if(!sz){
        saved.zones.push(JSON.parse(JSON.stringify(rz)));
        return;
      }
      sz.steps = sz.steps || [];
      var haveSid = {}, haveTitle = {};
      sz.steps.forEach(function(s){
        if(s.sid) haveSid[s.sid] = true;
        if(s.step) haveTitle[s.step] = true;
      });
      (rz.steps||[]).forEach(function(rs){
        /* 已有同 sid → 用户改过，跳过（保住用户版本） */
        if(rs.sid && haveSid[rs.sid]) return;
        /* 已有同标题 → 也跳过（兼容没有 sid 的老数据） */
        if(rs.step && haveTitle[rs.step]) return;
        sz.steps.push(JSON.parse(JSON.stringify(rs)));
      });
    });

    /* guide 里新增的三张表（作业前确认卡 / 责任矩阵 / 培训与演练）也合并 */
    var sg = saved.guide = saved.guide||{}, rg = raw.guide||{};
    ["preJobCheck","zoneOwners"].forEach(function(k){
      if(rg[k] && !sg[k]) sg[k] = JSON.parse(JSON.stringify(rg[k]));
    });
    if(rg.trainMatrix && sg.trainMatrix){
      var hc = {};
      sg.trainMatrix.forEach(function(t){ hc[t.course]=true; });
      rg.trainMatrix.forEach(function(t){ if(!hc[t.course]) sg.trainMatrix.push(t); });
    }
    if(rg.drills && sg.drills){
      var hd = {};
      sg.drills.forEach(function(d){ hd[d.type+"|"+d.date]=true; });
      rg.drills.forEach(function(d){ if(!hd[d.type+"|"+d.date]) sg.drills.push(d); });
    }
    saved.__v = rv;
    return saved;
  }

  function load(){
    var src = (global.STDWATCH_DATA && global.STDWATCH_DATA.JSA) || null;
    var raw = src && src[0] ? src[0] : src;
    if(!raw) return null;
    var saved = global.Store ? global.Store.get("jsa.work", null) : null;
    ST = saved ? mergePreset(saved, raw) : JSON.parse(JSON.stringify(raw));
    // 兜底：旧结构补字段
    ST.zones = (ST.zones||[]).map(function(z){
      z.steps = (z.steps||[]).map(function(s){
        if(s.L===undefined) s.L = 2;
        if(s.S===undefined) s.S = 2;
        if(s.rL===undefined) s.rL = s.L;
        if(s.rS===undefined) s.rS = s.S;
        if(s.add===undefined) s.add = "";
        if(s.owner===undefined) s.owner = "";
        if(s.due===undefined) s.due = "";
        if(s.done===undefined) s.done = false;
        return s;
      });
      return z;
    });
    if(!ST.basic) ST.basic = {fields:[],sample:{}};
    if(!ST.signoff) ST.signoff = {roles:[],revisions:[]};
    if(!ST.guide) ST.guide = {};
    if(ST.__v === undefined && raw && raw.__v !== undefined) ST.__v = raw.__v;

    /* ★ 给本地步骤补 sid ★
       合并时追加进来的步骤带 sid；用户自己新建的步骤没有 →
       这里按 raw 的同标题步骤回填 sid（没有同名就不给）。
       目的：用户改过的步骤名，下次合并仍能靠 sid 对上，不会被当成新步骤重复追加。 */
    try{
      var rawSteps = {};
      ((raw && raw.zones) || []).forEach(function(rz){
        (rz.steps||[]).forEach(function(rs){ if(rs.step) rawSteps[rs.step] = rs.sid; });
      });
      (ST.zones||[]).forEach(function(z){
        (z.steps||[]).forEach(function(s){
          if(!s.sid && s.step && rawSteps[s.step]) s.sid = rawSteps[s.step];
        });
      });
    }catch(e){}

    return ST;
  }

  function save(){
    if(!global.Store) return;
    global.Store.set("jsa.work", ST);
  }

  /* ================================================================
     统计（联动的核心）
     ================================================================ */
  function stats(){
    var s = {total:0, low:0, mid:0, hi:0, crit:0, maxR:0, maxStep:null, noControl:[], noAdd:[]};
    (ST.zones||[]).forEach(function(z, zi){
      (z.steps||[]).forEach(function(st, si){
        s.total++;
        var r = (+st.L||1) * (+st.S||1);
        var g = gradeOf(r);
        if(g.k==="低") s.low++;
        else if(g.k==="一般") s.mid++;
        else if(g.k==="中等") s.hi++;
        else if(g.k==="高") s.crit++;
        if(r > s.maxR){
          s.maxR = r; s.maxStep = {zi:zi, si:si, z:z, st:st, r:r};
        }
        if(!st.control || !String(st.control).trim()) s.noControl.push({zi:zi,si:si,z:z,st:st});
        if(g.k==="中等" || g.k==="高"){
          if(!st.add || !String(st.add).trim()) s.noAdd.push({zi:zi,si:si,z:z,st:st});
        }
      });
    });
    return s;
  }

  /* 某个措施是否已落实（用于残余风险是否生效） */
  function stepDone(st){
    return !!st.done;
  }
  function residualR(st){
    if(!stepDone(st)) return null;
    return (+st.rL||1) * (+st.rS||1);
  }

  /* ================================================================
     编辑动作
     ================================================================ */
  function setBasic(k, v){
    ST.basic.sample = ST.basic.sample || {};
    ST.basic.sample[k] = v;
    save(); render();
  }
  function setStep(zi, si, field, v){
    var st = ST.zones[zi].steps[si];
    st[field] = v;
    if(field==="L" || field==="S"){
      st.L = Math.max(1, Math.min(5, parseInt(v)||1));
      st.S = Math.max(1, Math.min(5, parseInt(v)||1));
      if(!stepDone(st)){ st.rL = st.L; st.rS = st.S; }
    }
    save(); render();
  }
  function toggleDone(zi, si){
    var st = ST.zones[zi].steps[si];
    st.done = !st.done;
    if(st.done){ st.rL = st.L; st.rS = st.S; }
    save(); render();
  }
  function addStep(zi){
    ST.zones[zi].steps.push({
      step:"新作业步骤", hazard:"", event:"", control:"",
      L:2, S:2, rL:2, rS:2, add:"", owner:"", due:"", done:false
    });
    save(); render();
  }
  /* ★ 删除一律走 Guard（2026-11-03）★
     单行删除 → 只要二次确认；
     删分区这种牵连一整块内容的 → 二次确认 + 密码。 */
  function delStep(zi, si){
    var st = (ST.zones[zi].steps||[])[si];
    var nm = st ? st.step : "";
    global.Guard.ask("确定删除这一步？<br><b style='color:var(--ink)'>"+esc(nm)+"</b>", {
      onOk:function(){
        ST.zones[zi].steps.splice(si, 1);
        save(); render();
        global.toast("已删除这一步");
      }
    });
  }
  function addZone(){
    ST.zones.push({
      title:"新分区", icon:"⚙️",
      steps:[{step:"新作业步骤",hazard:"",event:"",control:"",
              L:2,S:2,rL:2,rS:2,add:"",owner:"",due:"",done:false}]
    });
    CUR_ZONE = ST.zones.length-1;
    save(); render();
  }
  function delZone(zi){
    if(ST.zones.length<=1) return;
    var z = ST.zones[zi];
    var n = (z.steps||[]).length;
    /* ★ 删分区会连带删掉里面全部步骤 → 二次确认 + 密码 ★ */
    global.Guard.ask(
      "删除整个分区？<br><b style='color:var(--ink)'>"+esc(z.title)+"</b> 及其 "+
      n+" 个作业步骤<b style='color:var(--high)'>（不可撤销）</b>", {
      pwd:true,
      onOk:function(){
        ST.zones.splice(zi,1);
        if(CUR_ZONE>=ST.zones.length) CUR_ZONE = ST.zones.length-1;
        save(); render();
        global.toast("已删除分区");
      }
    });
  }
  function dupZone(zi){
    var c = JSON.parse(JSON.stringify(ST.zones[zi]));
    c.title = c.title + "（副本）";
    ST.zones.splice(zi+1, 0, c);
    CUR_ZONE = zi+1;
    save(); render();
  }
  function setZoneTitle(zi, v){ ST.zones[zi].title = v; save(); render(); }

  /* ---------- 作业前确认卡（2026-11-02 新增） ---------- */
  function setPreCheck(i, field, v){
    var g = ST.guide = ST.guide || {};
    var list = g.preJobCheck = g.preJobCheck || [];
    if(!list[i]) return;
    list[i][field] = v;
    save(); render();
  }
  function resetPreCheck(){
    var list = (ST.guide && ST.guide.preJobCheck) || [];
    list.forEach(function(c){ c.ok = false; c.sign = ""; c.time = ""; c.job = ""; });
    save(); render();
    global.toast("已清空确认卡");
  }

  /* ================================================================
     校验（导出前必过）
     ================================================================ */
  function validate(){
    var errs = [], warns = [];
    var b = (ST.basic && ST.basic.sample) || {};
    /* ★ 分级：签字栏不算「错」★
       编制人/日期/审核人/批准人本来就是打印后手签的，
       当成错误会挡住导出 —— 用户第一次打开就看到一片红，没人愿意用。
       真正必须补的是：作业名称、区域（表头没有就没法当正式文件用）、
       以及每个作业步骤的控制措施（安全分析的核心）。
       签字栏缺失 → 警告。 */
    [["项目编号","作业名称","作业区域"]].forEach(function(arr){
      arr.forEach(function(k){
        if(!b[k] || !String(b[k]).trim()) errs.push("基础信息缺「" + k + "」");
      });
    });
    ["编制人","编制日期","审核人","批准人"].forEach(function(k){
      if(!b[k] || !String(b[k]).trim()) warns.push("基础信息「" + k + "」还没填（打印后手签也行）");
    });
    var st = stats();
    st.noControl.forEach(function(x){
      errs.push("「" + x.z.title + " · " + x.st.step + "」没填现有控制措施");
    });
    st.noAdd.forEach(function(x){
      warns.push("「" + x.z.title + " · " + x.st.step + "」风险 " + (x.st.L*x.st.S)
                 + "（" + gradeOf(x.st.L*x.st.S).k + "），未填建议补充措施");
    });
    // 未落实的措施
    var pending = [];
    ST.zones.forEach(function(z,zi){
      z.steps.forEach(function(s,si){
        if(s.add && String(s.add).trim() && !s.done){
          pending.push({zi:zi,si:si,z:z,st:s});
        }
      });
    });
    pending.forEach(function(x){
      warns.push("「" + x.z.title + " · " + x.st.step + "」已填建议措施但尚未标记落实");
    });
    return {errs:errs, warns:warns, stats:st, pending:pending};
  }

  /* ================================================================
     渲染
     ================================================================ */
  function render(){
    var host = document.getElementById("jsaBody");
    if(!host) return;
    var badge = document.getElementById("jsaBadge");
    if(badge && ST) badge.textContent = ST.zones.length;

    var TABS = [
      ["work",    "作业危害分析表"],
      ["matrix",  "风险矩阵与评级"],
      ["redlines","实验室红线"],
      ["ppe",     "个体防护装备"],
      ["drill",   "应急物资与演练"],
      ["precheck","作业前确认卡"],
      ["owners",  "分区责任矩阵"],
      ["signoff", "审批与修订"],
      ["guide",   "培训与填表指引"],
    ];
    document.getElementById("jsaTabs").innerHTML = TABS.map(function(t){
      return `<button class="tab ${TAB===t[0]?"on":""}" data-jsa="${t[0]}">${t[1]}</button>`;
    }).join("");
    [].forEach.call(document.querySelectorAll("#jsaTabs button"), function(b){
      b.onclick = function(){ TAB = b.dataset.jsa; render(); };
    });

    if(TAB==="work")     host.innerHTML = viewWork();
    else if(TAB==="matrix")  host.innerHTML = viewMatrix();
    else if(TAB==="redlines")host.innerHTML = viewRedlines();
    else if(TAB==="ppe")     host.innerHTML = viewPPE();
    else if(TAB==="drill")   host.innerHTML = viewDrill();
    else if(TAB==="precheck")host.innerHTML = viewPreCheck();
    else if(TAB==="owners")  host.innerHTML = viewOwners();
    else if(TAB==="signoff") host.innerHTML = viewSignoff();
    else host.innerHTML = viewGuide();

    /* textarea 渲染完按内容增高，保证一个字都不裁 */
    if(typeof autoGrowAll === "function") autoGrowAll();
  }

  /* ---------- 顶部：基础信息 + KPI ---------- */
  function viewWork(){
    var s = stats();
    var b = (ST.basic && ST.basic.sample) || {};
    var fields = (ST.basic && ST.basic.fields) || [];
    var html = "";

    /* KPI */
    html += `<div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="k">作业步骤总数</div><div class="v">${s.total}</div><div class="d">${ST.zones.length} 个分区</div></div>
      <div class="kpi"><div class="k">一般及以下</div><div class="v">${s.low + s.mid}</div><div class="d">低 ${s.low} · 一般 ${s.mid}</div></div>
      <div class="kpi ${s.hi+s.crit?"hi":""}"><div class="k">中等及以上</div><div class="v">${s.hi + s.crit}</div><div class="d">中等 ${s.hi} · 高 ${s.crit}</div></div>
      <div class="kpi"><div class="k">最高风险值</div><div class="v">${s.maxR}</div><div class="d">${s.maxStep?esc(s.maxStep.z.title)+" · "+esc(s.maxStep.st.step):"—"}</div></div>
    </div>`;

    /* 校验提示 */
    var v = validate();
    if(v.errs.length || v.warns.length){
      html += `<div class="notice ${v.errs.length?"warn":""}" style="margin-bottom:12px">
        <span>${v.errs.length?"⛔":"⚠️"}</span>
        <div>
          ${v.errs.length?`<b>${v.errs.length} 项必须补齐才能导出：</b><ul style="margin:4px 0 0 16px">${v.errs.slice(0,5).map(e=>`<li>${esc(e)}</li>`).join("")}${v.errs.length>5?`<li>…还有 ${v.errs.length-5} 项</li>`:""}</ul>`:""}
          ${v.warns.length?`<b style="margin-top:6px;display:block">${v.warns.length} 项建议处理：</b><ul style="margin:4px 0 0 16px">${v.warns.slice(0,4).map(e=>`<li>${esc(e)}</li>`).join("")}${v.warns.length>4?`<li>…还有 ${v.warns.length-4} 项</li>`:""}</ul>`:""}
        </div></div>`;
    }

    /* 基础信息 */
    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>基础信息</h3><span class="muted">直接点字段改，改完自动保存</span></div>
      <div class="grid g2" style="gap:10px 18px">
      ${fields.map(function(k){
        return `<div style="display:flex;align-items:center;gap:8px">
          <span class="muted" style="width:96px;flex-shrink:0;font-size:12.5px">${esc(k)}</span>
          <input type="text" value="${esc(b[k]||"")}" placeholder="—"
            style="flex:1;padding:6px 9px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:13px"
            oninput="JSAW.setBasic('${esc(k)}', this.value)">
        </div>`;
      }).join("")}
      </div>
    </div>`;

    /* 分区导航 */
    html += `<div class="flex jsa-zones" style="margin-bottom:12px;flex-wrap:wrap;gap:7px">
      ${ST.zones.map(function(z,zi){
        var zr = 0, zc = 0;
        (z.steps||[]).forEach(function(st){
          var r=(+st.L||1)*(+st.S||1);
          if(r>=10) zc++; zr+=r;
        });
        return `<button class="chip ${CUR_ZONE===zi?"on":""}" onclick="JSAW.gotoZone(${zi})">
          ${z.icon} ${esc(z.title)} <span class="cnt">${(z.steps||[]).length}</span>
          ${zc?`<span class="tag t-high" style="margin-left:4px">${zc}</span>`:""}
        </button>`;
      }).join("")}
      <button class="btn sm" onclick="JSAW.addZone()">+ 加分区</button>
    </div>`;

    /* 当前分区 */
    var z = ST.zones[CUR_ZONE];
    if(!z){ return html + `<div class="card empty">没有分区，请点「加分区」</div>`; }
    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-h">
        <span style="font-size:19px">${z.icon}</span>
        <input type="text" value="${esc(z.title)}" style="flex:1;max-width:420px;font-size:15px;font-weight:600;
          border:1px solid var(--line);border-radius:6px;padding:5px 9px;font-family:inherit;background:var(--panel)"
          oninput="JSAW.setZoneTitle(${CUR_ZONE}, this.value)">
        <span class="pill">${(z.steps||[]).length} 步</span>
        <div class="sp"></div>
        <button class="btn sm" onclick="JSAW.dupZone(${CUR_ZONE})">复制分区</button>
        <button class="btn sm" style="color:var(--high)" onclick="JSAW.delZone(${CUR_ZONE})">删除分区</button>
      </div>
    </div>`;

    /* 步骤卡 —— 一个作业步骤一张卡（12 列表格在窄屏没法看） */
    html += `<div class="card" style="padding:0;overflow:hidden">
      <div class="jcards">
      ${(z.steps||[]).map(function(s,si){
        var r = (+s.L||1)*(+s.S||1);
        var g = gradeOf(r);
        var rr = residualR(s);
        var rg = rr!=null ? gradeOf(rr) : null;
        var hl = (CUR_STEP && CUR_STEP.zi===CUR_ZONE && CUR_STEP.si===si) ? "hl" : "";
        return `<div class="jcard ${hl} ${g.cls}" id="jstep-${CUR_ZONE}-${si}">
          <div class="jcard-h">
            <span class="jcard-no">${si+1}</span>
            <input type="text" class="jcard-step" value="${esc(s.step)}"
              placeholder="这一步做什么"
              oninput="JSAW.setStep(${CUR_ZONE},${si},'step',this.value)">
            <span class="tag ${g.cls==="g-crit"?"t-high":g.cls==="g-hi"?"t-soon":g.cls==="g-mid"?"t-mid":"t-low"}"
                  style="background:${g.color}1a;color:${g.color};flex-shrink:0">${g.k}</span>
          </div>
          <div class="jcard-body">
            <div class="jfield">
              <label>潜在危害</label>
              <textarea rows="2" oninput="JSAW.setStep(${CUR_ZONE},${si},'hazard',this.value);JSAW.autoGrow(this)">${esc(s.hazard)}</textarea>
            </div>
            <div class="jfield">
              <label>可能的事件</label>
              <textarea rows="2" oninput="JSAW.setStep(${CUR_ZONE},${si},'event',this.value);JSAW.autoGrow(this)">${esc(s.event)}</textarea>
            </div>
            <div class="jfield">
              <label>现有控制</label>
              <textarea rows="2" oninput="JSAW.setStep(${CUR_ZONE},${si},'control',this.value);JSAW.autoGrow(this)">${esc(s.control)}</textarea>
            </div>
            <div class="jfield">
              <label>补充措施${r>=10?"<span class=\"req\">必填</span>":""}</label>
              <textarea rows="2" placeholder="${r>=10?"风险偏高，补充措施必填":"没有就留空"}"
                oninput="JSAW.setStep(${CUR_ZONE},${si},'add',this.value);JSAW.autoGrow(this)">${esc(s.add)}</textarea>
            </div>
            <div class="jrisk">
              <label>L</label>
              <input type="number" min="1" max="5" value="${s.L}" class="lvl-in"
                oninput="JSAW.setStep(${CUR_ZONE},${si},'L',this.value)">
            </div>
            <div class="jrisk">
              <label>S</label>
              <input type="number" min="1" max="5" value="${s.S}" class="lvl-in"
                oninput="JSAW.setStep(${CUR_ZONE},${si},'S',this.value)">
            </div>
            <div class="jrisk jrisk-r">
              <label>R = L×S</label>
              <div class="rv" style="color:${g.color}">${r}</div>
            </div>
            <div class="jfield jf-owner">
              <label>责任人</label>
              <input type="text" value="${esc(s.owner)}"
                oninput="JSAW.setStep(${CUR_ZONE},${si},'owner',this.value)">
            </div>
            <div class="jfield jf-due">
              <label>期限</label>
              <input type="date" value="${esc(s.due)}"
                oninput="JSAW.setStep(${CUR_ZONE},${si},'due',this.value)">
            </div>
            <div class="jcard-act">
              ${s.add && String(s.add).trim()
                ? `<button class="btn xs ${s.done?"ok":""}" title="${s.done?"已落实，点击撤销":"标记措施已落实"}"
                     onclick="JSAW.toggleDone(${CUR_ZONE},${si})">${s.done?"✓":"○"}</button>`
                : ""}
              <button class="x" onclick="JSAW.delStep(${CUR_ZONE},${si})" title="删除这一步">×</button>
            </div>
          </div>
          ${s.done ? `<div class="jcard-res">
            <span class="pill" style="background:#eaf4ee;color:#15803d">措施已落实</span>
            <span>残余风险：L=${s.rL} × S=${s.rS} =
              <b style="color:${rg.color}">${rr}</b>
              <span class="tag ${rg.cls==="g-crit"?"t-high":rg.cls==="g-hi"?"t-soon":rg.cls==="g-mid"?"t-mid":"t-low"}"
                    style="background:${rg.color}1a;color:${rg.color}">${rg.k}</span>
            </span>
            ${rr<r?`<span class="muted">↓ 降 ${r-rr} 级</span>`:`<span style="color:var(--high)">↑ 未降低风险，需升级硬件控制或暂停作业</span>`}
            <button class="btn xs" onclick="JSAW.setStep(${CUR_ZONE},${si},'rL',${s.L})">残余L=当前L</button>
            <button class="btn xs" onclick="JSAW.setStep(${CUR_ZONE},${si},'rS',${s.S})">残余S=当前S</button>
          </div>` : ""}
        </div>`;
      }).join("")}
      </div>
      <div style="padding:11px 14px;border-top:1px solid var(--line)">
        <button class="btn sm" onclick="JSAW.addStep(${CUR_ZONE})">+ 加一个作业步骤</button>
        <span class="muted" style="margin-left:10px">改 L 或 S → R、等级、顶部统计、矩阵高亮会立即跟着变</span>
      </div>
    </div>`;

    /* 交付按钮 */
    html += `<div class="card" style="margin-top:14px">
      <div class="card-h"><h3>导出交付物</h3><span class="muted">导出的内容与上面看到的完全一致</span></div>
      <div class="flex" style="flex-wrap:wrap;gap:8px">
        <button class="btn pri" onclick="JSAW.exportCsv()">⬇ 导出 CSV（Excel 可直接开）</button>
        <button class="btn" onclick="JSAW.exportWord()">⬇ 导出 Word（打印可签字）</button>
        <button class="btn" onclick="JSAW.printView()">🖨 打印视图（A4 分页）</button>
        <button class="btn" onclick="JSAW.exportJson()">⬇ 导出 JSON（备份/移交）</button>
        <div class="sp" style="flex:1"></div>
        <button class="btn sm" onclick="JSAW.resetAll()">恢复预填内容</button>
      </div>
      <div class="muted" style="margin-top:9px;font-size:11.5px">
        CSV/Word 只含本表内容与签署栏，不含任何标准正文。
      </div>
    </div>`;

    return html;
  }

  /* ---------- 矩阵 ---------- */
  function viewMatrix(){
    var s = stats();
    var counts = {};
    ST.zones.forEach(function(z,zi){
      (z.steps||[]).forEach(function(st,si){
        var r=(+st.L||1)*(+st.S||1);
        if(!counts[r]) counts[r]=[];
        counts[r].push({zi:zi,si:si,z:z,st:st});
      });
    });
    var html = `<div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>5×5 风险矩阵</h3><span class="muted">格子里是可点击的步骤，点了直接跳到那一条</span></div>
      <div class="jsa-matrix-wrap">
      <table class="jsa-matrix">
        <thead><tr><th style="width:70px">L \\ S</th>${[1,2,3,4,5].map(function(s){return `<th style="width:86px">S=${s}</th>`;}).join("")}</tr></thead>
        <tbody>
        ${[5,4,3,2,1].map(function(L){
          return `<tr><th>L=${L}</th>` + [1,2,3,4,5].map(function(S){
            var r=L*S, g=gradeOf(r);
            var list=counts[r]||[];
            /* ★ 底色改用每档固定色（bg / bgE），不再用 color+alpha ★
               原来四档都是「同一个色相 + 不同透明度」，
               浅底上（alpha 22）低/一般/中等/高 全是同一片肉粉，肉眼分不出等级。
               现在色相拉开：绿 → 黄 → 橙 → 红，四档一眼能分。
               有步骤的格子再套一圈该档深色边框（inset shadow），突出"这格真的有风险"。 */
            var has=list.length;
            return `<td style="background:${has?g.bg:g.bgE};${has?"box-shadow:inset 0 0 0 1px "+g.color+"66;":""}cursor:${has?"pointer":"default"}"
              ${has?`onclick="JSAW.jumpRisk(${L},${S})"`:""}>
              <div style="font-weight:700;color:${g.color}">${r} ${g.k}</div>
              ${has?`<div style="font-size:10.5px;line-height:1.4;color:var(--ink2)">${list.slice(0,3).map(x=>esc(x.st.step)).join("<br>")}${list.length>3?`<br>+${list.length-3} 项`:""}</div>`:""}
            </td>`;
          }).join("") + `</tr>`;
        }).join("")}
        </tbody>
      </table>
      </div>
      <div class="flex" style="margin-top:12px;flex-wrap:wrap;gap:12px">
        ${GRADES.map(function(g){
          /* 图例色块用该档的固定底色 + 深色描边，跟矩阵格子一模一样 */
          return `<span class="lg"><i style="background:${g.bg};box-shadow:inset 0 0 0 1px ${g.color}66"></i><b style="color:${g.color}">${g.k}</b> R=${g.min}~${g.max}</span>`;
        }).join("")}
      </div>
    </div>`;

    /* 高风险清单 */
    var hi = [];
    ST.zones.forEach(function(z,zi){
      (z.steps||[]).forEach(function(st,si){
        var r=(+st.L||1)*(+st.S||1);
        if(r>=10) hi.push({zi:zi,si:si,z:z,st:st,r:r,g:gradeOf(r)});
      });
    });
    hi.sort(function(a,b){return b.r-a.r;});
    html += `<div class="card">
      <div class="card-h"><h3>中等及以上风险清单（${hi.length} 条）</h3>
        <span class="muted">这几条必须填建议措施并落实，否则不能导出</span></div>
      ${hi.length?`<div class="twrap"><table><thead><tr>
        <th style="width:56px">R</th><th style="width:62px">等级</th><th style="width:180px">分区</th>
        <th>作业步骤</th><th style="width:220px">建议补充措施</th><th style="width:80px">落实</th></tr></thead>
        <tbody>${hi.map(function(x){
          return `<tr class="${x.g.cls}">
            <td class="num"><b style="color:${x.g.color}">${x.r}</b></td>
            <td><span class="tag" style="background:${x.g.color}1a;color:${x.g.color}">${x.g.k}</span></td>
            <td class="muted">${esc(x.z.title)}</td>
            <td><a href="#" onclick="JSAW.jump(${x.zi},${x.si});return false"><b>${esc(x.st.step)}</b></a>
              <div class="muted" style="font-size:11px">${esc(x.st.event||"")}</div></td>
            <td>${x.st.add?esc(x.st.add):`<span class="muted">未填</span>`}
              ${x.st.owner?`<div class="muted" style="font-size:11px">${esc(x.st.owner)}${x.st.due?" · "+esc(x.st.due):""}</div>`:""}</td>
            <td>${x.st.done?`<span class="tag t-low">已落实</span>`:`<span class="tag t-soon">未落实</span>`}</td>
          </tr>`;
        }).join("")}</tbody></table></div>`
        : `<div class="empty">当前没有中等及以上风险的作业步骤。</div>`}
    </div>`;
    return html;
  }

  /* ---------- 红线 ---------- */
  function viewRedlines(){
    var rl = (ST.guide && ST.guide.redlines) || [];
    return `<div class="card">
      <div class="card-h"><h3>实验室红线（${rl.length} 条）</h3>
        <span class="muted">这些不是建议，是底线 —— 违反即停作业</span></div>
      <div class="notice warn" style="margin-bottom:12px">
        <span>⚠</span><div>红线来自真实事故与监管要求：生物安全柜外做致病菌操作、
          废液未灭活直排、剧毒标液单人管理 —— 这三类一旦发生，停产整改 + 追责。
          <b>红线不参与风险评分，它就是红线。</b></div>
      </div>
      <ol style="margin:0;padding-left:20px">
      ${rl.map(function(r,i){
        return `<li style="margin-bottom:12px;line-height:1.75">
          <b>${esc(r.no.replace(/^红线/,""))}</b> ${esc(r.text)}
          <div style="margin-top:4px">
            <input type="checkbox" ${r.ok?"checked":""} style="accent-color:var(--brand)"
              onchange="JSAW.setRedline(${i},this.checked)">
            <span class="muted" style="margin-left:6px">已确认本岗位符合</span>
          </div></li>`;
      }).join("")}
      </ol>
    </div>`;
  }

  /* ---------- PPE ---------- */
  function viewPPE(){
    var ppe = (ST.guide && ST.guide.ppe) || [];
    return `<div class="card">
      <div class="card-h"><h3>个体防护装备（PPE）配置表</h3>
        <span class="muted">${ppe.length} 类 · 按区域配，不是按人配</span></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:150px">装备</th><th style="width:150px">适用区域</th>
          <th>技术要求</th><th style="width:170px">更换要求</th><th style="width:52px"></th></tr></thead>
        <tbody>
        ${ppe.map(function(p,i){
          return `<tr>
            <td><b>${esc(p.item)}</b></td>
            <td class="muted">${esc(p.where)}</td>
            <td class="muted">${esc(p.spec)}</td>
            <td class="muted">${esc(p.replace)}</td>
            <td style="text-align:center">
              <input type="checkbox" ${p.ok?"checked":""} style="accent-color:var(--brand)"
                onchange="JSAW.setPpe(${i},this.checked)" title="确认已配备">
            </td></tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        勾选表示已配备并在使用。PPE 不是一次性采购 —— 破损、过期、污染都要立即更换。
      </div>
    </div>`;
  }

  /* ---------- 应急物资与演练 ---------- */
  function viewDrill(){
    var em = (ST.guide && ST.guide.emergency) || [];
    var dr = (ST.guide && ST.guide.drills) || [];
    return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>应急物资清单</h3><span class="muted">${em.length} 项 · 定期检查，不是买了就算</span></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:170px">物资</th><th style="width:200px">位置</th>
          <th style="width:200px">检查频次</th><th style="width:150px">有效期</th><th style="width:52px"></th></tr></thead>
        <tbody>
        ${em.map(function(e,i){
          var over = e.expire && e.expire!=="—" && /\d/.test(e.expire);
          return `<tr>
            <td><b>${esc(e.name)}</b></td>
            <td class="muted">${esc(e.loc)}</td>
            <td class="muted">${esc(e.check)}</td>
            <td class="muted">${over?esc(e.expire):"—"}</td>
            <td style="text-align:center">
              <input type="checkbox" ${e.ok?"checked":""} style="accent-color:var(--brand)"
                onchange="JSAW.setEmergency(${i},this.checked)" title="已检查合格">
            </td></tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        洗眼器每周放水 5 分钟并记录 —— 这是唯一能救命的每周动作。
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>应急演练记录</h3><span class="muted">${dr.length} 次 · 半年至少一次</span></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:100px">日期</th><th style="width:180px">演练类型</th>
          <th style="width:150px">范围</th><th style="width:90px">用时</th><th style="width:70px">结果</th>
          <th>暴露的问题与整改</th></tr></thead>
        <tbody>
        ${dr.map(function(d){
          return `<tr>
            <td class="mono">${esc(d.date)}</td>
            <td><b>${esc(d.type)}</b></td>
            <td class="muted">${esc(d.scope)}</td>
            <td class="muted">${esc(d.duration)}</td>
            <td><span class="tag ${d.result==="合格"?"t-low":"t-high"}">${esc(d.result)}</span></td>
            <td class="muted">${esc(d.issue==="无"?"—":d.issue)}
              ${d.issue && d.issue!=="无"?`<div style="color:var(--low)">整改：${esc(d.fix)}</div>`:""}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- 作业前确认卡（2026-11-02 新增） ----------
     JSA 做完不是结束 —— 开工前要照着这张卡逐条确认，
     确认完签字，这张卡才是「事前控制」而不是「事后补记」。 */
  function viewPreCheck(){
    var list = (ST.guide && ST.guide.preJobCheck) || [];
    var done = 0;
    list.forEach(function(c){ if(c.ok) done++; });
    var pct = list.length ? Math.round(done*100/list.length) : 0;
    return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>作业前风险确认卡</h3>
        <span class="muted">${done} / ${list.length} 项已确认 · 开工前逐条打勾，签字后才允许动手</span>
        <div class="sp"></div>
        <span class="pill">${pct}%</span>
        <button class="btn sm" onclick="JSAW.resetPreCheck()">清空勾选</button>
      </div>
      <div class="twrap"><table>
        <thead><tr><th style="width:44px">序</th><th>确认事项</th>
          <th style="width:120px">确认人</th><th style="width:100px">签字</th>
          <th style="width:150px">时间</th><th style="width:52px">已确认</th></tr></thead>
        <tbody>
        ${list.map(function(c,i){
          return `<tr>
            <td class="mono">${esc(c.no)}</td>
            <td><b>${esc(c.item)}</b><div class="muted">责任岗位：${esc(c.who||"—")}</div></td>
            <td><input type="text" value="${esc(c.sign||"")}" placeholder="签字"
              style="width:100%;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-family:inherit;font-size:12.5px"
              oninput="JSAW.setPreCheck(${i},'sign',this.value)"></td>
            <td><input type="text" value="${esc(c.time||"")}" placeholder="—"
              style="width:100%;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-family:inherit;font-size:12.5px"
              oninput="JSAW.setPreCheck(${i},'time',this.value)"></td>
            <td><input type="text" value="${esc(c.job||"")}" placeholder="—"
              style="width:100%;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-family:inherit;font-size:12.5px"
              oninput="JSAW.setPreCheck(${i},'job',this.value)"></td>
            <td style="text-align:center">
              <input type="checkbox" ${c.ok?"checked":""} style="accent-color:var(--brand)"
                onchange="JSAW.setPreCheck(${i},'ok',this.checked)">
            </td></tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        中等及以上风险的步骤，补充措施未落实前不得开工 —— 这一条是 JSA 与实际生产的接口。
      </div>
    </div>`;
  }

  /* ---------- 分区责任矩阵（2026-11-02 新增） ----------
     把「谁负责」落成矩阵：每个分区的主管、备份、复核人。
     与「作业步骤」页里的责任人字段互相印证。 */
  function viewOwners(){
    var ow = (ST.guide && ST.guide.zoneOwners) || [];
    var s = stats();
    /* 逐区统计：步数 / 最高风险 / 中高风险条数 */
    var per = {};
    (ST.zones||[]).forEach(function(z,zi){
      var mx = 0, mh = 0, mid = 0;
      (z.steps||[]).forEach(function(st){
        var r = (+st.L||1)*(+st.S||1);
        if(r>mx) mx = r;
        if(r>=15) mh++;
        else if(r>=10) mid++;
      });
      per[z.title] = {n:(z.steps||[]).length, mx:mx, mh:mh, mid:mid};
    });
    return `
    <div class="card">
      <div class="card-h"><h3>分区责任矩阵</h3>
        <span class="muted">${ow.length} 个分区 · 主管 / 备份 / 复核人，缺岗时按备份顶</span></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:250px">分区</th><th style="width:62px">步数</th>
          <th style="width:70px">最高 R</th><th style="width:96px">中高风险</th>
          <th style="width:110px">主管</th><th style="width:130px">备份</th>
          <th style="width:110px">复核</th></tr></thead>
        <tbody>
        ${ow.map(function(o){
          var p = per[o.zone] || {n:0,mx:0,mh:0,mid:0};
          var g = gradeOf(p.mx);
          return `<tr>
            <td><b>${esc(o.zone)}</b></td>
            <td class="mono">${p.n}</td>
            <td><span style="color:${g.color};font-weight:700">${p.mx}</span>
              <span class="tag ${g.cls==="g-crit"?"t-high":g.cls==="g-hi"?"t-soon":g.cls==="g-mid"?"t-mid":"t-low"}"
                style="background:${g.color}1a;color:${g.color}">${g.k}</span></td>
            <td>${(p.mh+p.mid)?`<span style="color:var(--high);font-weight:600">${p.mh+p.mid} 条</span>
              <span class="muted">（高 ${p.mh} · 中 ${p.mid}）</span>`:`<span class="muted">无</span>`}</td>
            <td><b>${esc(o.head)}</b></td>
            <td class="muted">${esc(o.backup)}</td>
            <td class="muted">${esc(o.review)}</td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        合计 ${s.total} 个作业步骤。高风险步骤必须指定到人，不能只写部门。
      </div>
    </div>`;
  }

  /* ---------- 签署 ---------- */
  function viewSignoff(){
    var so = ST.signoff || {roles:[],revisions:[]};
    return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>审批签署</h3><span class="muted">导出时随表附上</span></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:200px">环节</th><th style="width:260px">签字栏</th><th>确认内容</th></tr></thead>
        <tbody>
        ${(so.roles||[]).map(function(r){
          return `<tr>
            <td><b>${esc(r.role)}</b></td>
            <td class="mono">${esc(r.line)}</td>
            <td class="muted">${esc(r.note)}</td></tr>`;
        }).join("")}
        </tbody>
      </table></div>
      ${(so.roles||[]).some(function(r){return /最高管理者|厂长/.test(r.role);})
        ? `<div class="notice warn" style="margin-top:12px"><span>⚠</span>
           <div>存在高风险项（R≥15）时，必须由最高管理者批准后作业才能开展。</div></div>` : ""}
    </div>
    <div class="card">
      <div class="card-h"><h3>修订记录</h3><div class="sp"></div>
        <button class="btn sm" onclick="JSAW.addRevision()">+ 加一条</button></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:90px">版本</th><th>修订内容</th><th style="width:120px">修订人</th><th style="width:52px"></th></tr></thead>
        <tbody>
        ${(so.revisions||[]).map(function(r,i){
          return `<tr>
            <td><input type="text" value="${esc(r.ver)}" oninput="JSAW.setRev(${i},'ver',this.value)"></td>
            <td><input type="text" value="${esc(r.what)}" placeholder="改了什么"
              oninput="JSAW.setRev(${i},'what',this.value)"></td>
            <td><input type="text" value="${esc(r.who)}" placeholder="姓名"
              oninput="JSAW.setRev(${i},'who',this.value)"></td>
            <td style="text-align:center"><button class="x" onclick="JSAW.delRev(${i})">×</button></td>
          </tr>`;
        }).join("")}
        </tbody>
      </table></div>
    </div>`;
  }

  /* ---------- 指引 ---------- */
  function viewGuide(){
    var g = ST.guide || {};
    var tm = g.trainMatrix || [];
    var usage = (g.usage||[]);
    return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>填表指引</h3></div>
      <div class="twrap"><table><tbody>
      ${usage.map(function(u){
        return `<tr><td style="width:120px"><b>${esc(u.k)}</b></td><td>${esc(u.v)}</td></tr>`;
      }).join("")}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="card-h"><h3>培训矩阵</h3><span class="muted">${tm.length} 门课 · 与 JSA 配套的安全教育计划</span></div>
      <div class="twrap"><table>
        <thead><tr><th style="width:220px">课程</th><th style="width:150px">对象</th>
          <th style="width:70px">学时</th><th style="width:130px">频次</th><th>考核形式</th></tr></thead>
        <tbody>
        ${tm.map(function(t){
          return `<tr>
            <td><b>${esc(t.course)}</b></td>
            <td class="muted">${esc(t.who)}</td>
            <td class="num">${esc(t.hours)} h</td>
            <td class="muted">${esc(t.freq)}</td>
            <td class="muted">${esc(t.form)}</td></tr>`;
        }).join("")}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:10px">
        培训记录本身是内审必查项 —— 有课程、有考核、有签到才算数。
      </div>
    </div>`;
  }

  /* ================================================================
     导出
     ================================================================ */
  function rowsForExport(){
    var rows = [];
    ST.zones.forEach(function(z,zi){
      (z.steps||[]).forEach(function(s,si){
        var r=(+s.L||1)*(+s.S||1), g=gradeOf(r);
        var rr = residualR(s);
        rows.push({
          zone:z.title, zi:zi, si:si,
          no:(zi+1)+"."+(si+1),
          step:s.step, hazard:s.hazard, event:s.event, control:s.control,
          L:s.L, S:s.S, R:r, grade:g.k,
          add:s.add, owner:s.owner, due:s.due,
          done:s.done, rr:rr, rg:rr!=null?gradeOf(rr).k:"—",
          rL:s.done?s.rL:"", rS:s.done?s.rS:""
        });
      });
    });
    return rows;
  }

  /* 导出前校验：有问题就把清单摆出来，而不是只弹一句「不能导出」 */
  function gateExport(){
    var v = validate();
    if(!v.errs.length) return true;
    global.dlg({
      kind:"warn",
      title:"还有 " + v.errs.length + " 项必须补齐才能导出",
      body:"<ul style='margin:0 0 8px 18px;line-height:1.9'>"
           + v.errs.slice(0,8).map(function(e){return "<li>"+esc(e)+"</li>";}).join("")
           + (v.errs.length>8?"<li>…还有 "+(v.errs.length-8)+" 项</li>":"")
           + "</ul><div class='muted'>补齐后再点导出。如果这些内容确实要留空，"
           + "先在表格里把控制措施补上 —— 那是 JSA 的核心内容，不能空着导出。</div>",
      buttons:[{t:"知道了",cls:"pri"}]
    });
    return false;
  }

  function exportCsv(){
    if(!gateExport()) return;
    var b = ST.basic.sample || {};
    var rows = [];
    rows.push(["工作安全分析（JSA）作业危害分析表"]);
    rows.push([]);
    rows.push(["项目编号", b["项目编号"]||"", "作业名称", b["作业名称"]||""]);
    rows.push(["作业区域", b["作业区域"]||"", "作业类别", b["作业类别"]||""]);
    rows.push(["编制人", b["编制人"]||"", "编制日期", b["编制日期"]||""]);
    rows.push(["审核人", b["审核人"]||"", "批准人", b["批准人"]||""]);
    rows.push(["版本号", b["版本号"]||"", "适用标准/依据", b["适用标准/依据"]||""]);
    rows.push([]);
    rows.push(["分区","序号","作业步骤","潜在危害","可能导致的事件","现有控制措施",
               "可能性L","严重度S","风险值R","风险等级","建议补充措施","责任人","完成期限",
               "措施落实","残余L","残余S","残余风险R","残余等级"]);
    rowsForExport().forEach(function(r){
      rows.push([r.zone, r.no, r.step, r.hazard, r.event, r.control,
                 r.L, r.S, r.R, r.grade, r.add, r.owner, r.due,
                 r.done?"已落实":"未落实", r.rL, r.rS, r.rr==null?"":r.rr, r.rg]);
    });
    rows.push([]);
    rows.push(["审批签署"]);
    (ST.signoff.roles||[]).forEach(function(role){
      rows.push([role.role, role.line, role.note]);
    });
    rows.push([]);
    rows.push(["修订记录"]);
    rows.push(["版本","修订内容","修订人"]);
    (ST.signoff.revisions||[]).forEach(function(r){
      rows.push([r.ver, r.what, r.who]);
    });
    rows.push([]);
    rows.push(["分区责任矩阵"]);
    rows.push(["分区","主管","备份","复核"]);
    ((ST.guide && ST.guide.zoneOwners) || []).forEach(function(o){
      rows.push([o.zone, o.head, o.backup, o.review]);
    });
    rows.push([]);
    rows.push(["作业前风险确认卡"]);
    rows.push(["序","确认事项","责任岗位","确认人签字","时间","作业/工单号","已确认"]);
    ((ST.guide && ST.guide.preJobCheck) || []).forEach(function(c){
      rows.push([c.no, c.item, c.who||"", c.sign||"", c.time||"", c.job||"", c.ok?"是":"否"]);
    });
    rows.push([]);
    rows.push(["说明","风险值 R = 可能性 L × 严重度 S；低风险 R=1~4 / 一般风险 R=5~9 / 中等风险 R=10~14 / 高风险 R=15~25。"]);
    rows.push(["", "残余风险在「建议补充措施落实」后评定；残余风险未降低的，须升级硬件控制或暂停作业。"]);
    rows.push(["", "本表由「食品质量与安全管理系统」导出，不含标准正文。"]);

    downloadCsvFile("JSA_"+(b["项目编号"]||"工作安全分析")+"_"+today()+".csv", rows);
    global.toast("已导出工作危害分析表");
  }

  function exportWord(){
    if(!gateExport()) return;
    var b = ST.basic.sample || {};
    var html = wordHtml(b);
    var blob = new Blob(["﻿", html], {type:"application/msword;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "JSA_"+(b["项目编号"]||"工作安全分析")+"_"+today()+".doc";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    global.toast("已导出 Word，可直接打印签字");
  }

  function wordHtml(b){
    var rows = rowsForExport();
    var h = [];
    h.push('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">');
    h.push("<head><meta charset='utf-8'><title>JSA</title>");
    h.push("<style>");
    h.push("@page{size:A4 landscape;margin:1.2cm 1cm;}");
    h.push("body{font-family:'Microsoft YaHei',SimSun,sans-serif;font-size:9.5pt;line-height:1.5;}");
    h.push("h1{font-size:16pt;text-align:center;margin:0 0 4pt;}");
    h.push("h2{font-size:11pt;margin:10pt 0 4pt;border-left:3px solid #333;padding-left:6pt;}");
    h.push("table{border-collapse:collapse;width:100%;}");
    h.push("td,th{border:0.5pt solid #666;padding:3pt 4pt;vertical-align:top;font-size:8.5pt;}");
    h.push("th{background:#f0f0f0;font-weight:bold;}");
    h.push(".meta td{border:0;padding:1.5pt 8pt 1.5pt 0;}");
    h.push(".sig td{height:34pt;}");
    h.push(".note{font-size:8pt;color:#555;margin-top:6pt;}");
    h.push("</style></head><body>");
    h.push("<h1>工作安全分析（JSA）作业危害分析表</h1>");
    h.push("<table class='meta'>");
    [["项目编号",b["项目编号"]],["作业名称",b["作业名称"]],["作业区域",b["作业区域"]],
     ["作业类别",b["作业类别"]],["编制人",b["编制人"]],["编制日期",b["编制日期"]],
     ["审核人",b["审核人"]],["批准人",b["批准人"]],["版本号",b["版本号"]],
     ["适用标准/依据",b["适用标准/依据"]],["评审周期",b["评审周期"]],["下次评审日期",b["下次评审日期"]]
    ].forEach(function(p){
      h.push("<tr><td style='width:70pt'><b>"+esc(p[0])+"：</b></td><td style='width:130pt'>"+esc(p[1]||"")+"</td></tr>");
    });
    h.push("</table>");

    ST.zones.forEach(function(z){
      h.push("<h2>"+esc(z.title)+"</h2>");
      h.push("<table><thead><tr>");
      ["序号","作业步骤","潜在危害","可能导致的事件","现有控制措施","L","S","R","等级",
       "建议补充措施","责任人","期限","残余R","残余等级"].forEach(function(hd){
        h.push("<th>"+hd+"</th>");
      });
      h.push("</tr></thead><tbody>");
      (z.steps||[]).forEach(function(s,si){
        var r=(+s.L||1)*(+s.S||1), g=gradeOf(r);
        var rr=residualR(s), rg=rr!=null?gradeOf(rr).k:"—";
        h.push("<tr>");
        h.push("<td align='center'>"+(si+1)+"</td>");
        h.push("<td><b>"+esc(s.step)+"</b></td>");
        h.push("<td>"+esc(s.hazard)+"</td>");
        h.push("<td>"+esc(s.event)+"</td>");
        h.push("<td>"+esc(s.control)+"</td>");
        h.push("<td align='center'>"+s.L+"</td>");
        h.push("<td align='center'>"+s.S+"</td>");
        h.push("<td align='center'><b>"+r+"</b></td>");
        h.push("<td align='center'>"+g.k+"</td>");
        h.push("<td>"+esc(s.add)+"</td>");
        h.push("<td>"+esc(s.owner)+"</td>");
        h.push("<td>"+esc(s.due)+"</td>");
        h.push("<td align='center'>"+(rr==null?"":rr)+"</td>");
        h.push("<td align='center'>"+rg+"</td>");
        h.push("</tr>");
      });
      h.push("</tbody></table>");
    });

    h.push("<h2>审批签署</h2>");
    h.push("<table class='sig'>");
    (ST.signoff.roles||[]).forEach(function(r){
      h.push("<tr><td style='width:170pt'><b>"+esc(r.role)+"</b></td><td style='width:230pt'>"+esc(r.line)+"</td><td>"+esc(r.note)+"</td></tr>");
    });
    h.push("</table>");

    /* ★ 作业前风险确认卡（2026-11-02 新增）——
       JSA 做完不算完，开工前要逐条确认并签字，这才是「事前控制」。 */
    var pc = (ST.guide && ST.guide.preJobCheck) || [];
    if(pc.length){
      h.push("<h2>作业前风险确认卡</h2>");
      h.push("<table><thead><tr><th style='width:34pt'>序</th><th>确认事项</th>"
        + "<th style='width:70pt'>责任岗位</th><th style='width:80pt'>确认人签字</th>"
        + "<th style='width:90pt'>时间</th><th style='width:80pt'>作业/工单号</th>"
        + "<th style='width:50pt'>已确认</th></tr></thead><tbody>");
      pc.forEach(function(c){
        h.push("<tr><td align='center'>"+esc(c.no)+"</td><td>"+esc(c.item)+"</td>"
          + "<td>"+esc(c.who||"")+"</td><td>"+esc(c.sign||"")+"</td>"
          + "<td>"+esc(c.time||"")+"</td><td>"+esc(c.job||"")+"</td>"
          + "<td align='center'>"+(c.ok?"是":"否")+"</td></tr>");
      });
      h.push("</tbody></table>");
    }

    /* ★ 分区责任矩阵（2026-11-02 新增） */
    var zw = (ST.guide && ST.guide.zoneOwners) || [];
    if(zw.length){
      h.push("<h2>分区责任矩阵</h2>");
      h.push("<table><thead><tr><th>分区</th><th style='width:60pt'>主管</th>"
        + "<th style='width:80pt'>备份</th><th style='width:80pt'>复核</th></tr></thead><tbody>");
      zw.forEach(function(o){
        h.push("<tr><td>"+esc(o.zone)+"</td><td>"+esc(o.head)+"</td>"
          + "<td>"+esc(o.backup)+"</td><td>"+esc(o.review)+"</td></tr>");
      });
      h.push("</tbody></table>");
    }

    h.push("<h2>修订记录</h2>");
    h.push("<table><thead><tr><th style='width:80pt'>版本</th><th>修订内容</th><th style='width:110pt'>修订人</th></tr></thead><tbody>");
    (ST.signoff.revisions||[]).forEach(function(r){
      h.push("<tr><td>"+esc(r.ver)+"</td><td>"+esc(r.what)+"</td><td>"+esc(r.who)+"</td></tr>");
    });
    h.push("</tbody></table>");
    h.push("<p class='note'>风险值 R = 可能性 L × 严重度 S；低风险 R=1~4 / 一般风险 R=5~9 / 中等风险 R=10~14 / 高风险 R=15~25。"
      + "残余风险在补充措施落实后评定；残余风险未降低的须升级硬件控制或暂停作业。"
      + "本表由「食品质量与安全管理系统」导出，不含标准正文。</p>");
    h.push("</body></html>");
    return h.join("\n");
  }

  function printView(){
    if(!gateExport()) return;
    var b = ST.basic.sample || {};
    var w = window.open("", "_blank");
    if(!w){ global.toast("浏览器拦截了新窗口，请允许弹出窗口后重试", "warn"); return; }
    w.document.write(wordHtml(b));
    w.document.close();
    setTimeout(function(){ w.focus(); w.print(); }, 400);
  }

  function exportJson(){
    var blob = new Blob([JSON.stringify(ST, null, 1)], {type:"application/json"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "JSA_"+((ST.basic.sample||{})["项目编号"]||"工作安全分析")+"_"+today()+".json";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    global.toast("已导出 JSON");
  }

  function resetAll(){
    /* ★ 文案里的分区数与步骤数必须实时取，不能写死 ★
       （原来写死「7 个分区 48 个步骤」，扩充到 18 区 108 步后这行就在骗人） */
    var zn = (ST && ST.zones) ? ST.zones.length : 0;
    var sn = 0;
    ((ST && ST.zones) || []).forEach(function(z){ sn += (z.steps||[]).length; });
    /* ★ 恢复预填 = 丢掉本机全部修改 → 二次确认 + 密码（2026-11-03）★ */
    global.Guard.ask(
      "你在本机做的全部修改（改写的文字、评级、增删的步骤）都会丢失，<br>"+
      "恢复成系统预填的 <b style='color:var(--ink)'>"+zn+" 个分区 "+sn+" 个步骤</b>。", {
      pwd:true,
      onOk:function(){
        if(global.Store) global.Store.del("jsa.work");
        load(); CUR_ZONE=0; CUR_STEP=null; render();
        global.toast("已恢复预填内容");
      }
    });
  }

  /* ---------- 辅助 ---------- */
  function today(){
    var d=new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  function downloadCsvFile(name, rows){
    var esc2=function(v){
      var s=(v==null?"":String(v));
      var o=s.replace(/"/g,'""');
      if(/^[=+\-@\t\r]/.test(o)) o="'"+o;
      return '"'+o+'"';
    };
    var csv="﻿"+rows.map(function(r){return r.map(esc2).join(",");}).join("\r\n");
    var blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){document.body.removeChild(a); URL.revokeObjectURL(url);},200);
  }

  /* ---------- 其它编辑动作 ---------- */
  function setRedline(i, v){
    var rl=(ST.guide.redlines||[])[i]; if(!rl) return;
    rl.ok=v; save(); render();
  }
  function setPpe(i, v){
    var p=(ST.guide.ppe||[])[i]; if(!p) return;
    p.ok=v; save(); render();
  }
  function setEmergency(i, v){
    var e=(ST.guide.emergency||[])[i]; if(!e) return;
    e.ok=v; save(); render();
  }
  function setRev(i, col, v){
    var r=(ST.signoff.revisions||[])[i]; if(!r) return;
    r[col]=v; save(); render();
  }
  function addRevision(){
    ST.signoff.revisions = ST.signoff.revisions || [];
    ST.signoff.revisions.push({ver:"V1."+ST.signoff.revisions.length, what:"", who:""});
    save(); render();
  }
  function delRev(i){
    var r = (ST.signoff.revisions||[])[i];
    global.Guard.ask("删除这条修订记录？<br><b style='color:var(--ink)'>"+
      esc(r?(r.ver||"")+" "+(r.what||""):"")+"</b>", {
      onOk:function(){
        ST.signoff.revisions.splice(i,1); save(); render();
        global.toast("已删除修订记录");
      }
    });
  }
  function gotoZone(zi){ CUR_ZONE=zi; CUR_STEP=null; render(); }
  /* textarea 自动增高：内容多少就显示多少，绝不裁字 */
  function autoGrow(el){
    if(!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(44, el.scrollHeight + 2) + "px";
  }
  function autoGrowAll(){
    var root = document.getElementById("jsaBody");
    if(!root) return;
    var list = root.querySelectorAll("textarea");
    for(var i=0;i<list.length;i++) autoGrow(list[i]);
  }
  function jump(zi, si){ CUR_ZONE=zi; CUR_STEP={zi:zi,si:si}; render(); setTimeout(function(){
    var el=document.querySelector(".jcard.hl");
    if(el) el.scrollIntoView({behavior:"smooth",block:"center"});
  },60); }
  function jumpRisk(L,S){
    for(var zi=0;zi<ST.zones.length;zi++){
      var zs=ST.zones[zi].steps;
      for(var si=0;si<zs.length;si++){
        if((+zs[si].L||1)===L && (+zs[si].S||1)===S){ jump(zi,si); return; }
      }
    }
    global.toast("该风险等级下没有步骤", "warn");
  }

  /* ---------- 导出 API ---------- */
  global.JSAW = {
    load: load,
    render: render,
    setBasic: setBasic,
    setStep: setStep,
    setZoneTitle: setZoneTitle,
    toggleDone: toggleDone,
    addStep: addStep,
    delStep: delStep,
    addZone: addZone,
    delZone: delZone,
    dupZone: dupZone,
    gotoZone: gotoZone,
    jump: jump,
    jumpRisk: jumpRisk,
    setRedline: setRedline,
    setPpe: setPpe,
    setEmergency: setEmergency,
    setPreCheck: setPreCheck,
    resetPreCheck: resetPreCheck,
    setRev: setRev,
    addRevision: addRevision,
    delRev: delRev,
    exportCsv: exportCsv,
    exportWord: exportWord,
    exportJson: exportJson,
    printView: printView,
    resetAll: resetAll,
    stats: stats,
    validate: validate,
    autoGrow: autoGrow,
    autoGrowAll: autoGrowAll,
    _state: function(){ return ST; }
  };

})(window);
