/* ================================================================
   labauth.js —— 原始记录「按操作人锁项目」（2026-11-19）
   ================================================================
   用户口径：共用同一台电脑/浏览器，每个人负责的检测项目不同，
   要「锁死」避免被其他同事误改；切换操作人要口令。

   设计（2026-11-19 二次改：用户要求「每人一个口令，输口令才能改」）：
   · 一套 localStorage 数据（样品清单/标准溶液等本来就是共用的），
     身份层只负责「当前是谁、这人能看/改哪些项目」。
   · 11 个预设操作人，每人一个独立口令（只存散列，不存明文）。
     初始口令 = 各自姓名大写（GJ/MYZ/...），各人可在「改口令」里自己改。
   · 切换操作人：点姓名 → 输这个人的口令 → 验证通过才切过去。
     切过去后才能看/改他负责的项目；别人的项目从 chips / 分类 / 溶液维护里隐藏，
     也不能勾选、不能打印；打印/勾选在 labbench.js 里二次拦截。
   · 管理人员名单/项目分配 → 仍用现有管理员口令（guard.js / PERM）。
   · 未选操作人 = 不锁（谁都能用），避免第一次打开就没法用。
   ================================================================ */
(function (global) {
  "use strict";

  var K_OPS = "lab.record.ops.v1";     // [{name, hash, projects:[key]}]  hash=各自口令散列
  var K_CUR = "lab.record.op.v1";      // 当前操作人姓名

  /* ★ 用户 2026-11-19 给定的人员分工（共 11 人 / 54 项，正好全覆盖）：
     色谱 6 个子组各一人；理化 12 项拆 HYF5 / PQQ3 / ZSY4；原子 7 项拆 ZY2 / DLJ5。
     只在用户第一次改名单前作默认值，改过就以 localStorage 为准。 */
  var SEED_OPS = [
    {name:"GJ",  projects:["golactose","reducingsugar","chlorate","don","wheyprotein","melamine","vanillin","aflatoxin","tetrasaccharide","lutein","carnitine"]},
    {name:"MYZ", projects:["nucleotide","cpp","lactoferrin","vb6","taurine"]},
    {name:"FLM", projects:["vb1","vb2","biotin","vd"]},
    {name:"WFX", projects:["iodine","inositol","vk1","vk2"]},
    {name:"PGY", projects:["opo","transfat","fattyacid","totalfat","pantothenic","niacin"]},
    {name:"SHS", projects:["va_fluo","va_uv","folic","fos","gos3"]},
    {name:"HYF", projects:["protein","moisture","acidvalue","peroxide","fivesugars"]},
    {name:"PQQ", projects:["fat","phosphorus","choline"]},
    {name:"ZSY", projects:["impurity","chloride","nitrite","vc"]},
    {name:"ZY",  projects:["ash","mineral"]},
    {name:"DLJ", projects:["chromium","lead","arsenic","selenium","tin"]}
  ];

  /* ★ 口令散列：与 PERM.hash 同算法 FNV-1a，加固定 salt。只存散列不存明文。
     初始口令 = 操作人姓名（大写）；各人可在「改口令」里改成自己的。 */
  function phash(name, pwd){
    var h=2166136261, s="labauth|"+String(name)+"|"+String(pwd||"");
    for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
    return (h>>>0).toString(16);
  }
  function pwdOKFor(op, pwd){ return !!op && op.hash===phash(op.name, pwd); }
  /* ★ 溶液名 → 负责人：遍历项目，找含这溶液的项目，取其子组(sub=负责人代号)。
     同批配制的矿物质 8 种归 DLJ（mineral 项目），其余按所在项目子组。 */
  var SOL_OWNER_CACHE=null;
  function solOwner(name){
    if(!SOL_OWNER_CACHE){
      SOL_OWNER_CACHE={};
      var ps=(global.LABREC&&global.LABREC.projects)||[];
      ps.forEach(function(p){
        var own=p.sub||"";
        (p.solutions||[]).forEach(function(s){
          if(!SOL_OWNER_CACHE[s.name]) SOL_OWNER_CACHE[s.name]=own;
        });
      });
    }
    return SOL_OWNER_CACHE[name]||"";
  }
  function esc(s){
    return String(s==null?"":s).replace(/[&<>"]/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];
    });
  }
  function lsGet(k, d){
    try{ var v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }
    catch(e){ return d; }
  }
  function lsSet(k, v){
    try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ return false; }
  }
  function ops(){
    var raw=null;
    try{ raw=localStorage.getItem(K_OPS); }catch(e){}
    if(raw==null) return SEED_OPS.map(function(o){
      return {name:o.name, projects:o.projects.slice(), hash:phash(o.name,o.name)};
    });
    var a; try{ a=JSON.parse(raw); }catch(e){ a=[]; }
    return Array.isArray(a)?a:[];
  }
  function saveOps(a){ return lsSet(K_OPS, a); }
  function current(){
    var n=lsGet(K_CUR, "");
    return typeof n==="string"?n:"";
  }
  function opOf(n){
    var a=ops();
    for(var i=0;i<a.length;i++) if(a[i].name===n) return a[i];
    return null;
  }
  function locked(){ return ops().length>0 && !!current(); }
  function can(key){
    if(!locked()) return true;                 // 没设置 = 不锁
    var op=opOf(current());
    if(!op) return true;                       // 当前人已被删 → 退回不锁
    var ps=op.projects||[];
    return ps.indexOf(key)>=0;
  }
  function visible(list){
    if(!locked()) return list||[];
    var op=opOf(current()); if(!op) return list||[];
    var ps=op.projects||[];
    return (list||[]).filter(function(p){ return ps.indexOf(p.key)>=0; });
  }
  function pwdOK(v){
    if(global.Guard && global.Guard.checkPwd) return global.Guard.checkPwd(v);
    /* 兜底：与 index.html PERM.hash 同算法，口令 stdwatch|qc2026 */
    var h=2166136261, s="stdwatch|"+String(v||"");
    for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
    var want=(function(){ var t=2166136261,u="stdwatch|qc2026";
      for(var j=0;j<u.length;j++){ t^=u.charCodeAt(j); t=Math.imul(t,16777619); }
      return (t>>>0).toString(16);
    })();
    return (h>>>0).toString(16)===want;
  }
  function afterChange(){
    if(global.LAB && global.LAB.lrAuthChanged) global.LAB.lrAuthChanged();
    else if(global.LAB && global.LAB.render) global.LAB.render();
  }

  /* ---------------- 弹窗（自建，样式跟 guard.js 的口令框一致） ---------------- */
  function modal(title, inner, onMount){
    var old=document.getElementById("__labAuth");
    if(old) old.remove();
    var w=document.createElement("div");
    w.id="__labAuth";
    w.style.cssText="position:fixed;inset:0;z-index:10000;display:flex;align-items:center;"+
      "justify-content:center;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);padding:20px";
    w.innerHTML='<div style="background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);'+
      'max-width:640px;width:100%;max-height:86vh;overflow:auto;padding:20px 22px 18px;font-family:inherit">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'+
        '<b style="font-size:16px;color:#0f172a">'+esc(title)+'</b>'+
        '<span style="flex:1"></span>'+
        '<button type="button" id="__laClose" class="btn sm">关闭</button></div>'+
      '<div id="__laBody">'+inner+'</div></div>';
    document.body.appendChild(w);
    function close(){ if(w.parentNode) w.parentNode.removeChild(w); }
    w.querySelector("#__laClose").onclick=close;
    w.onclick=function(e){ if(e.target===w) close(); };
    if(onMount) onMount(w.querySelector("#__laBody"), close);
    return close;
  }
  /* 管理员口令闸：过了才执行 fn */
  function gate(reason, fn){
    modal("需要管理员口令",
      '<div class="la-tip">'+esc(reason)+'<br>请输入管理员口令（与系统管理员口令一致）</div>'+
      '<input id="__laPwd" type="password" placeholder="管理员口令" autocomplete="off" '+
        'style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;'+
        'padding:10px 12px;font-size:14px;letter-spacing:2px">'+
      '<div id="__laErr" style="color:#b91c1c;font-size:12px;margin-top:8px;min-height:16px"></div>'+
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">'+
        '<button type="button" class="btn pri" id="__laGo">确认</button></div>',
      function(body, close){
        var inp=body.querySelector("#__laPwd"), err=body.querySelector("#__laErr");
        function go(){
          if(!pwdOK(inp.value)){ err.textContent="口令不对"; inp.value=""; inp.focus(); return; }
          close(); fn();
        }
        body.querySelector("#__laGo").onclick=go;
        inp.onkeydown=function(e){ if(e.key==="Enter") go(); };
        setTimeout(function(){ try{ inp.focus(); }catch(e){} },30);
      });
  }

  /* ================================================================
     ★★ 标准溶液编辑闸门：改哪项就输「这项负责人」的口令。
     通过才执行真正的写入回调 onOk()；取消/口令错，输入框由调用方恢复原值。
     ================================================================ */
  var BYPASS=false;   // 回归测试用：程序化调用跳过口令（真实 UI 交互永不开）
  function setBypass(v){ BYPASS=!!v; }
  function editGuard(name, onOk, onCancel){
    if(BYPASS){ if(onOk) onOk(); return; }
    var owner=solOwner(name);
    if(!owner){ if(onOk) onOk(); return; }   // 没有负责人映射（老数据）→ 不拦
    var op=opOf(owner);
    modal("标准溶液修改 · "+name,
      '<div class="la-tip">这个标准溶液由 <b>'+esc(owner)+'</b> 负责。'+
      '请输入 '+esc(owner)+' 的口令后才能修改（初始口令就是 '+esc(owner)+'）。</div>'+
      '<input id="__laGuardPwd" type="password" placeholder="'+esc(owner)+' 的口令" autocomplete="off" '+
        'style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;'+
        'padding:10px 12px;font-size:14px;letter-spacing:2px">'+
      '<div id="__laGuardErr" style="color:#b91c1c;font-size:12px;margin-top:8px;min-height:16px"></div>'+
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">'+
        '<button type="button" class="btn" id="__laGuardCancel">取消</button>'+
        '<button type="button" class="btn pri" id="__laGuardGo">确认修改</button></div>',
      function(body, close){
        var inp=body.querySelector("#__laGuardPwd"), err=body.querySelector("#__laGuardErr");
        function go(){
          if(!op || !pwdOKFor(op, inp.value)){
            err.textContent="口令不对，请输 "+owner+" 的口令（初始口令是 "+owner+"）";
            inp.value=""; inp.focus(); return;
          }
          close(); if(onOk) onOk();
        }
        function cancel(){ close(); if(onCancel) onCancel(); }
        body.querySelector("#__laGuardGo").onclick=go;
        body.querySelector("#__laGuardCancel").onclick=cancel;
        inp.onkeydown=function(e){ if(e.key==="Enter") go(); };
        setTimeout(function(){ try{ inp.focus(); }catch(e){} },30);
      });
  }

  /* ---------------- 顶部状态条（最终口径：只锁标准溶液填写） ---------------- */
  function barHtml(){
    var a=ops();
    return '<div class="la-bar"><span class="la-dot on"></span>'+
      '<b>标准溶液维护：改哪项要输该负责人的口令</b>'+
      '<span class="la-ver" title="看到此版本即口令功能已加载">v20261119i</span>'+
      '<span class="la-desc">勾选、预览、打印、样品清单大家都可用；只有改标准溶液的配制日期/编码/有效期要口令。'+
      '口令初始=各自姓名，可自己改。若看不到版本号请 Ctrl+F5 刷新。</span>'+
      '<span class="la-sp"></span>'+
      '<button type="button" class="btn sm pri" onclick="LABAUTH.showOwners()">看谁负责什么</button>'+
      '<button type="button" class="btn sm" onclick="LABAUTH.changePwd()">改我的口令</button>'+
      '<button type="button" class="btn sm" onclick="LABAUTH.manage()">管理</button></div>';
  }
  /* 只查看分工表（不需口令） */
  function showOwners(){
    var a=ops();
    var rows=a.map(function(o){
      var names=(o.projects||[]).map(function(k){
        var p=(global.LABREC&&global.LABREC.projects||[]).filter(function(x){return x.key===k;})[0];
        return p?p.name:k;
      });
      return '<div class="la-ownrow"><b>'+esc(o.name)+'</b><span>'+names.join('、')+'</span></div>';
    }).join("");
    modal("标准溶液负责人分工",
      '<div class="la-tip">改某个检测项目的标准溶液（配制日期/编码/有效期），要输这个项目负责人的口令。'+
      '其他操作（勾选样品、打印、填样品信息）不需要口令。</div><div class="la-owners">'+rows+'</div>',
      function(){});
  }

  /* ---------------- 切换操作人：必须输「这个人的口令」 ---------------- */
  function switchTo(){
    var a=ops();
    if(!a.length){ manage(); return; }
    modal("切换操作人",
      '<div class="la-tip">点自己的姓名，再输<b>本人的口令</b>。验证通过才切过去，之后只能改你负责的项目；'+
      '样品清单和标准溶液数据仍共用不变。<br>初始口令 = 你的姓名（如 GJ 的初始口令是 GJ），可点「改口令」自行修改。</div>'+
      '<div class="la-oplist">'+a.map(function(o){
        return '<button type="button" class="la-opcard'+((o.name===current())?" on":"")+'" '+
          'data-op="'+esc(o.name)+'"><b>'+esc(o.name)+'</b>'+
          '<span>负责 '+((o.projects||[]).length)+' 项</span></button>';
      }).join("")+'</div>',
      function(body, close){
        [].forEach.call(body.querySelectorAll(".la-opcard"), function(btn){
          btn.onclick=function(){ askOpPwd(btn.getAttribute("data-op"), close); };
        });
      });
  }
  function askOpPwd(name, closeParent){
    var op=opOf(name); if(!op) return;
    modal("口令验证 · "+name,
      '<div class="la-tip">请输入 <b>'+esc(name)+'</b> 的口令（初始口令就是 '+esc(name)+'）</div>'+
      '<input id="__laOpPwd" type="password" placeholder="'+esc(name)+' 的口令" autocomplete="off" '+
        'style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;'+
        'padding:10px 12px;font-size:14px;letter-spacing:2px">'+
      '<div id="__laOpErr" style="color:#b91c1c;font-size:12px;margin-top:8px;min-height:16px"></div>'+
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">'+
        '<button type="button" class="btn" id="__laOpBack">返回</button>'+
        '<button type="button" class="btn pri" id="__laOpGo">确认切换</button></div>',
      function(body, close){
        var inp=body.querySelector("#__laOpPwd"), err=body.querySelector("#__laOpErr");
        function go(){
          if(!pwdOKFor(op, inp.value)){
            err.textContent="口令不对，请重试（初始口令是 "+name+"）"; inp.value=""; inp.focus(); return;
          }
          lsSet(K_CUR, name);
          close(); if(closeParent) closeParent();
          afterChange();
        }
        body.querySelector("#__laOpGo").onclick=go;
        body.querySelector("#__laOpBack").onclick=function(){ close(); if(closeParent) closeParent(); switchTo(); };
        inp.onkeydown=function(e){ if(e.key==="Enter") go(); };
        setTimeout(function(){ try{ inp.focus(); }catch(e){} },30);
      });
  }
  /* ---------------- 退出（清除当前操作人 → 回到不锁状态） ---------------- */
  function logout(){
    try{ localStorage.removeItem(K_CUR); }catch(e){}
    afterChange();
  }
  /* ---------------- 改本人的口令（输旧口令验证） ---------------- */
  function changePwd(){
    var name=current(), op=opOf(name);
    if(!op){ alertX("请先切换到你自己的操作人。"); return; }
    modal("改口令 · "+name,
      '<div class="la-tip">改完后以后切到 '+esc(name)+' 就要用新口令，请记牢。</div>'+
      '<label style="display:block;font-size:12px;color:var(--ink2);margin:8px 0 3px">当前口令</label>'+
      '<input id="__laOld" type="password" placeholder="当前口令" autocomplete="off" '+
        'style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;font-size:13px">'+
      '<label style="display:block;font-size:12px;color:var(--ink2);margin:10px 0 3px">新口令</label>'+
      '<input id="__laNew" type="password" placeholder="至少 3 位" autocomplete="off" '+
        'style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;font-size:13px">'+
      '<div id="__laPwdErr" style="color:#b91c1c;font-size:12px;margin-top:8px;min-height:16px"></div>',
      function(body, close){
        function go(){
          var oldV=body.querySelector("#__laOld").value, nv=body.querySelector("#__laNew").value;
          if(!pwdOKFor(op, oldV)){ body.querySelector("#__laPwdErr").textContent="当前口令不对"; return; }
          if(String(nv).length<3){ body.querySelector("#__laPwdErr").textContent="新口令至少 3 位"; return; }
          var A=ops();
          for(var i=0;i<A.length;i++) if(A[i].name===name){ A[i].hash=phash(name,nv); }
          saveOps(A); close(); alertX("口令已修改，下次切到 "+name+" 请用新口令。");
        }
        var row=document.createElement("div");
        row.style.cssText="display:flex;gap:10px;justify-content:flex-end;margin-top:10px";
        var c=document.createElement("button");
        c.type="button"; c.className="btn sm"; c.textContent="取消"; c.onclick=function(){ close(); };
        var b=document.createElement("button");
        b.type="button"; b.className="btn pri sm"; b.textContent="保存新口令"; b.onclick=go;
        row.appendChild(c); row.appendChild(b); body.appendChild(row);
      });
  }

  /* ---------------- 管理操作人 / 分配项目（需口令） ---------------- */
  function manage(){
    gate("管理人员名单和各自负责的项目。", function(){ manageUI(); });
  }
  function allProjects(){
    return (global.LABREC && global.LABREC.projects)||[];
  }
  function manageUI(selName){
    var a=ops(), sel=selName||current()||(a[0]&&a[0].name)||"";
    var op=opOf(sel);
    var groups=(global.LABREC&&global.LABREC.groups)||[{key:"phys",name:"理化组"},{key:"chrom",name:"色谱组"},{key:"atom",name:"原子组"}];
    var inner=
      '<div class="la-tip">先添加操作人，再给每个人勾选负责的检测项目。没勾的项目对该操作人隐藏，不能勾选也不能打印。</div>'+
      '<div class="la-addbar">姓名 <input id="__laName" placeholder="如 张工" '+
        'style="width:110px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px">'+
        '<button type="button" class="btn sm pri" id="__laAdd">添加操作人</button></div>'+
      '<div class="la-oplist" id="__laOps">'+a.map(function(o){
        return '<button type="button" class="la-opcard'+((o.name===sel)?" on":"")+'" data-op="'+esc(o.name)+'">'+
          '<b>'+esc(o.name)+'</b><span>负责 '+((o.projects||[]).length)+' 项</span></button>';
      }).join("")+'</div>'+
      (a.length?
        '<div class="la-projhead"><b>给「'+esc(sel)+'」分配项目</b>'+
          '<span><button type="button" class="btn sm" id="__laAll">全选</button> '+
          '<button type="button" class="btn sm" id="__laNone">清空</button></span></div>'+
        '<div class="la-projwrap">'+groups.map(function(g){
          var ps=g.key==="all"?allProjects():allProjects().filter(function(p){ return (p.group||"phys")===g.key; });
          if(!ps.length) return "";
          return '<div class="la-group"><div class="la-gname">'+esc(g.name)+'</div><div class="la-chips">'+
            ps.map(function(p){
              var on=op&&(op.projects||[]).indexOf(p.key)>=0;
              return '<label class="la-chip'+(on?" on":"")+'"><input type="checkbox" data-proj="'+esc(p.key)+'"'+
                (on?" checked":"")+'><span>'+esc(p.name)+'</span></label>';
            }).join("")+'</div></div>';
        }).join("")+'</div>'+
        '<div class="la-foot"><button type="button" class="btn sm" id="__laReset">重置「'+esc(sel)+'」口令为姓名</button>'+
          '<button type="button" class="btn sm" id="__laDel">删除操作人「'+esc(sel)+'」</button>'+
          '<button type="button" class="btn pri sm" id="__laDone">完成</button></div>'
        :'<div class="la-tip">添加一个操作人后，就能给他分配项目了。</div>');

    modal("操作人与负责项目", inner, function(body, close){
      function bindOps(){
        [].forEach.call(body.querySelectorAll(".la-opcard"), function(btn){
          btn.onclick=function(){ manageUI(btn.getAttribute("data-op")); };
        });
      }
      bindOps();
      var add=body.querySelector("#__laAdd");
      if(add) add.onclick=function(){
        var nm=(body.querySelector("#__laName").value||"").trim();
        if(!nm){ alertX("请填姓名"); return; }
        var A=ops();
        if(A.some(function(o){ return o.name===nm; })){ alertX("这个操作人已存在"); return; }
        A.push({name:nm, projects:[], hash:phash(nm,nm)}); saveOps(A);
        if(!current()) lsSet(K_CUR, nm);
        manageUI(nm); afterChange();
      };
      function collect(){
        var A=ops(), t=opOf(sel); if(!t) return;
        var keys=[];
        [].forEach.call(body.querySelectorAll("input[data-proj]"), function(i){ if(i.checked) keys.push(i.getAttribute("data-proj")); });
        t.projects=keys;
        for(var i=0;i<A.length;i++) if(A[i].name===sel) A[i]=t;
        saveOps(A);
      }
      function bindProj(){
        [].forEach.call(body.querySelectorAll("input[data-proj]"), function(i){
          i.onchange=function(){ collect(); afterChange(); };
        });
      }
      bindProj();
      var all=body.querySelector("#__laAll");
      if(all) all.onclick=function(){
        [].forEach.call(body.querySelectorAll("input[data-proj]"), function(i){ i.checked=true; });
        var lab=body.querySelector(".la-projwrap");
        [].forEach.call(lab.querySelectorAll(".la-chip"),function(c){ c.classList.add("on"); });
        collect(); afterChange();
      };
      var none=body.querySelector("#__laNone");
      if(none) none.onclick=function(){
        [].forEach.call(body.querySelectorAll("input[data-proj]"), function(i){ i.checked=false; });
        var lab=body.querySelector(".la-projwrap");
        [].forEach.call(lab.querySelectorAll(".la-chip"),function(c){ c.classList.remove("on"); });
        collect(); afterChange();
      };
      var reset=body.querySelector("#__laReset");
      if(reset) reset.onclick=function(){
        var A=ops();
        for(var i=0;i<A.length;i++) if(A[i].name===sel){ A[i].hash=phash(sel,sel); }
        saveOps(A); alertX("已把「"+sel+"」的口令重置为 "+sel+"。");
      };
      var del=body.querySelector("#__laDel");
      if(del) del.onclick=function(){
        var A=ops().filter(function(o){ return o.name!==sel; }); saveOps(A);
        if(current()===sel) lsSet(K_CUR, A.length?A[0].name:"");
        close(); manageUI(); afterChange();
      };
      var done=body.querySelector("#__laDone");
      if(done) done.onclick=function(){ collect(); close(); afterChange(); };
    });
  }
  function alertX(msg){
    try{
      if(global.toast){ global.toast(msg,"warn"); return; }
    }catch(e){}
    if(global.Guard && global.Guard.askPwd){ /* 无 toast 时用原生提示 */ }
    window.alert(msg);
  }

  global.LABAUTH = {
    barHtml: barHtml,
    switchTo: switchTo,
    changePwd: changePwd,
    logout: logout,
    manage: manage,
    showOwners: showOwners,
    editGuard: editGuard,
    solOwner: solOwner,
    setBypass: setBypass,
    locked: locked,
    current: current,
    can: can,
    visible: visible,
    ops: ops
  };
})(window);
