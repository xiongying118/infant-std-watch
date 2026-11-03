/* ================================================================
   guard.js —— 删除权限与二次确认（2026-11-03）
   ================================================================
   用户原话：「还有各项删除需要权限才行（设置密码统一为qc2026）
                要不然容易删了 删除要二次确认」

   ---- 要解决的两件事 ----
   ① 误删：一行点一下 × 就没了，改完半年才发现数据没了 → 二次确认
   ② 越权：清空/批量删这类动作不该随手就能点 → 密码

   ---- 规则 ----
   · 单行删除（删一个步骤、删一行台账）→ **只二次确认**
     （太频繁输密码会把人逼疯，反而让大家绕过确认）
   · 危险/批量/不可逆删除（删分区、清空记录、删整个台账、恢复预填、清空本机）
     → **二次确认 + 密码**

   ---- 密码校验复用已有的管理员口令 ★★
     index.html 里已有 PERM.pass = "qc2026"（散列后存 localStorage，
     8 小时有效）。这里不另立一套明文密码 ——
     ① 用户已经有一个口令，再来个第二个必然记混；
     ② 明文密码写在 JS 里，源码一开源就等于没有。
     所以统一走 PERM.hash() 比对，与管理后台同一个口令。
     ================================================================ */
(function (global) {
  "use strict";

  /* ---------------- 密码工具 ---------------- */
  /* 与 index.html 的 PERM.hash 同一套 FNV-1a 算法 */
  function hash(s){
    var h = 2166136261; s = String(s);
    for(var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
    return (h>>>0).toString(16);
  }
  /* 期望的口令散列。PERM 由 index.html 定义（全局），这里做兜底。 */
  function wantHash(){
    if(global.PERM && global.PERM.want) return global.PERM.want();
    return hash("stdwatch|qc2026");
  }
  function checkPwd(v){
    return hash("stdwatch|" + String(v||"")) === wantHash();
  }

  /* ---------------- 密码输入框 ---------------- */
  function askPwd(reason, onOk){
    var old = document.getElementById("__guardPwd");
    if(old) old.remove();

    var wrap = document.createElement("div");
    wrap.id = "__guardPwd";
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;"+
      "background:rgba(15,23,42,.45);backdrop-filter:blur(3px);padding:20px";
    wrap.innerHTML =
      '<div style="background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);'+
      'max-width:420px;width:100%;padding:22px 24px 18px;font-family:inherit">'+
        '<div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px">需要删除权限</div>'+
        '<div style="font-size:12.5px;color:#64748b;line-height:1.6;margin-bottom:14px">'+
          (reason?esc(reason)+'<br>':'')+
          '请输入删除密码（与管理员口令一致）</div>'+
        '<input id="__guardPwdIn" type="password" placeholder="删除密码" autocomplete="off"'+
        ' style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;'+
        'padding:10px 12px;font-size:14px;font-family:inherit;letter-spacing:2px">'+
        '<div id="__guardErr" style="color:#b91c1c;font-size:12px;margin-top:8px;min-height:16px"></div>'+
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">'+
          '<button id="__guardCancel" class="btn">取消</button>'+
          '<button id="__guardOk" class="btn pri">确认删除</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(wrap);

    var inp = wrap.querySelector("#__guardPwdIn");
    var err = wrap.querySelector("#__guardErr");
    function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    function submit(){
      if(!checkPwd(inp.value)){
        err.textContent = "密码不对";
        inp.value = "";
        inp.focus();
        return;
      }
      close();
      if(onOk) onOk();
    }
    wrap.querySelector("#__guardOk").onclick = submit;
    wrap.querySelector("#__guardCancel").onclick = close;
    inp.onkeydown = function(e){ if(e.key==="Enter") submit(); };
    /* 点遮罩空白处 = 取消（防止误触） */
    wrap.onclick = function(e){ if(e.target===wrap) close(); };
    setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 30);
  }

  function esc(s){
    return String(s==null?"":s).replace(/[&<>"]/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];
    });
  }

  /* ---------------- 二次确认 ---------------- */
  /* 用系统已有的 dlg 弹窗（样式统一）；没有 dlg 就退回原生 confirm */
  function confirmBox(msg, onOk, danger){
    if(global.dlg){
      global.dlg({
        kind: danger===false ? "" : "danger",
        title:"确认删除？",
        body: msg,
        buttons:[{t:"取消", val:"cancel"}, {t:"确认删除", cls:"pri"}],
        onClose:function(v){ if(v && v!=="cancel") onOk(); }
      });
    }else{
      if(window.confirm(msg)) onOk();
    }
  }

  /* ---------------- 统一入口 ---------------- */
  /* Guard.ask(msg)              → 二次确认
     Guard.ask(msg,{pwd:true})   → 二次确认 + 密码
     Guard.ask(msg,{pwd:true, title:"..."}) */
  function ask(msg, opt){
    opt = opt || {};
    confirmBox(msg, function(){
      if(opt.pwd) askPwd(opt.reason || msg, function(){ if(opt.onOk) opt.onOk(); });
      else if(opt.onOk) opt.onOk();
    }, opt.danger);
  }

  global.Guard = {
    ask: ask,
    askPwd: askPwd,
    confirm: confirmBox,
    /* 供外部校验（不弹框） */
    checkPwd: checkPwd,
    /* 各模块自己的 esc 不一定存在（如 workbench.js 就没有），
       统一从这里取一个，避免各写一份 */
    esc: esc
  };
})(window);
