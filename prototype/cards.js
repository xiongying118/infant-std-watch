/* ==========================================================================
   检验方法卡片 · 双视角渲染

   ★ 设计要点：同一份知识，两种读法 ★
     新人视角：为什么用这个方法 / 它在测什么 / 我该怎么做
     老手视角：一行要点，不科普

   为什么要这样：
     同一套知识讲给两种人。老手嫌啰嗦、新人嫌太简，
     做成切换而不是两套内容 —— 保证两边看到的永远是同一份数据，
     不会一个变了另一个没变。
   ========================================================================== */
(function () {
  "use strict";

  const CARDS = window.STDWATCH_CARDS || [];
  if (!CARDS.length) return;

  const TYPES = ["全部", "元素", "维生素", "微生物", "理化", "污染物",
                 "毒素", "脂肪", "糖类", "计量", "其他"];

  /* 实验室经验：与 card-editor.html 共用同一个 localStorage key。
     这一层是**我们工厂自己写的**，标准原文里没有 ——
     所以它是卡片里最值钱的部分。 */
  const KNOW_KEY = "stdwatch-card-knowledge";
  let knowledge = {};
  try {
    knowledge = JSON.parse(localStorage.getItem(KNOW_KEY) || "{}") || {};
  } catch (e) { knowledge = {}; }
  const KNOW_COUNT = Object.keys(knowledge).length;
  // 把录入内容合并进卡片
  CARDS.forEach(c => { c.knowledge = knowledge[c.no] || {}; });

  /* ★ 排查提示：经验读不到时，多半是 origin 不一致 ★
     localStorage 按「协议+域名+端口」隔离。
     本机预览是 http://127.0.0.1:xxxx，
     线上是 https://xiongying118.github.io —— 两者数据各存各的。
     所以在录入页填的内容，如果之后到别的地址去看，是看不到的。
     这个提示会在有数据但当前地址读不到时显示出来。 */

  // 视图记忆：按方法号存，切换后刷新还在
  const VIEW_KEY = "stdwatch-card-view";
  let state = { type: "全部", q: "", view: "new" };
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "old") state.view = "old";   // 全局默认视角
  } catch (e) { /* localStorage 不可用时用默认 */ }

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const statusClass = v => {
    const s = String(v || "");
    if (/废止|作废/.test(s)) return "st-dead";
    if (/被代替|即将实施|未实施/.test(s)) return "st-soon";
    return "st-valid";
  };

  /* 试剂明细渲染。
     data 兼容两种形态：
       新结构 [{name, role, amount}]
       早期自由文本 "硝酸, 硝酸镁"  —— 只显示名字，作用留空
     ★ 作用必须按方法各填各的，不能跨方法复用：
       抗坏血酸在铅测定里是**释放剂**，在抗坏血酸测定里是**被测对象**。
       做成全局表就会得出"抗坏血酸=释放剂"这种误导结论。 */
  function reagentsHTML(k) {
    const r = (k || {}).reagents;
    if (!r) return "";
    if (typeof r === "string") {
      const items = r.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      if (!items.length) return "";
      return `<div class="steps"><div class="stp"><span>
        <b>试剂</b>：${items.map(esc).join("、")}</span></div></div>`;
    }
    if (!Array.isArray(r) || !r.length) return "";
    return `<div class="rxtab">
      <div class="rxh2">试剂与各自作用</div>
      <table><thead><tr><th>试剂</th><th>在本方法中的作用</th><th>用量</th></tr></thead><tbody>
      ${r.map(x => `<tr>
        <td>${esc(x.name || "—")}</td>
        <td>${x.role ? esc(x.role) : '<i class="muted">待填</i>'}</td>
        <td>${esc(x.amount || "—")}</td>
      </tr>`).join("")}
      </tbody></table>
    </div>`;
  }

  /* ================================================================
     新人视角：从"为什么"开始，而不是从"怎么做"开始
     ================================================================
     关键：不能直接给操作步骤（那是SOP 的活，系统里重复一遍没意义），
     要给的是**理解**—— 有了理解，操作步骤自己就能推导。 */
  function newbieBody(c) {
    /* ★ k 必须在这里取一次 ★
       下面第 4 段要用 k.mistakes / k.interference / k.reagents。
       之前这行被删掉忘了补回来 → 渲染时抛
       "Uncaught ReferenceError: k is not defined"
       → render() 中断 → **53 张卡片整片空白**，
         但计数那行在 host.innerHTML 之前就写好了，
         所以页面显示「已录经验 1 条」，看起来像"只有计数没有内容"。
       （2026-10-06 用户截图报出，靠 F12 Console 才定位到）*/
    const k = c.knowledge || {};
    const nut = c.nutrient;
    const cls = c.groups && c.groups.length ? c.groups.join("、") : "";
    const out = [];

    // 1. 为什么用这个方法 —— 来自通则引用关系，这是我们数据独有的价值
    if (cls) {
      out.push(`<div class="why">
        <b>为什么用这条方法</b><br>
        通则（${esc(cls)}）规定了这一项要按本方法检测。
        也就是说，<b>不是你想用才用，是标准要求你用</b> ——
        换方法，报告就不认。
      </div>`);
    }

    // 2. 它在测什么 —— 用检测对象说人话
    //   注意 .stp 是 grid（序号 + 正文两列），正文必须整体放进一个
    //   <span> 里，裸文本 + <b> 会各占一格，字被拆散（2026-10-06 用户截图）。
    const what = [];
    if (nut) what.push(`<b>${esc(nut)}</b>`);
    what.push(`属于<b>${esc(c.type)}</b>类检测`);
    out.push(`<div class="steps">
      <div class="stp"><span>${what.join("，")}。这条方法测的就是这个，不是"整个营养成分"。</span></div>
      <div class="stp"><span>本方法由 <b>${esc(c.no)}</b>（${esc(c.imp || "—")} 起实施）规定。</span></div>
    </div>`);

    // 3. 怎么学 —— 引导去读原文，而不是喂结论
    const learn = [];
    learn.push(`<b>标准原文</b>里重点看三处：试剂配制（知道用什么）、样品前处理（决定结果对不对）、精密度要求。`);
    if (c.siblings && c.siblings.length) {
      learn.push(`同一类还有 <b>${c.siblings.length}</b> 种方法（见下方"同类其他方法"）—— 知道它们差在哪，比只学一种更有用。`);
    }
    if (c.replace) {
      learn.push(`<b style="color:#8a6100">注意：本方法已被 ${esc(c.replace)} 替代</b>，老资料里可能还是旧版。`);
    }
    out.push(`<div class="steps">${
      learn.map(x => `<div class="stp"><span>${x}</span></div>`).join("")}</div>`);

    // 4. 前人踩过的坑 —— 对新人最值钱
    if (k.mistakes) {
      out.push(`<div class="alert"><b>前人踩过的坑</b><br>${esc(k.mistakes)}</div>`);
    }
    if (k.interference) {
      out.push(`<div class="steps"><div class="stp"><span>
        <b>本厂已知干扰</b>：${esc(k.interference)}
      </span></div></div>`);
    }
    const rx = reagentsHTML(k);
    if (rx) out.push(rx);

    return out.join("");
  }

  /* ================================================================
     老手视角：只给会踩的点
     ================================================================ */
  function oldBody(c) {
    const k = c.knowledge || {};
    const rows = [];
    rows.push(["通则", (c.groups || []).join("、") || "—"]);
    rows.push(["现行", c.validity || "—"]);
    if (c.imp) rows.push(["实施", c.imp]);
    if (c.replace) rows.push(["被替代", c.replace]);

    let h = `<div>` + rows.map(r =>
      `<div class="kv"><span class="kk">${esc(r[0])}</span><span class="kvv">${esc(r[1])}</span></div>`
    ).join("") + `</div>`;

    if (c.replace) {
      h += `<div class="alert"><b>换版提醒</b>：本方法已被 ${esc(c.replace)} 替代，
            报告上写错版本直接无效。</div>`;
    }
    // 老手最关心：用什么试剂、各干什么、哪里容易错
    const rx = reagentsHTML(k);
    if (rx) h += rx;
    if (k.instr) {
      h += `<div class="kv"><span class="kk">仪器</span><span class="kvv">${esc(k.instr)}</span></div>`;
    }
    if (k.precautions) {
      h += `<div class="kv"><span class="kk">注意</span><span class="kvv">${esc(k.precautions)}</span></div>`;
    }
    if (k.mistakes) {
      h += `<div class="alert"><b>易错点</b>：${esc(k.mistakes)}</div>`;
    }
    return h;
  }

  /* ---------- 卡片 ---------- */
  function cardHTML(c) {
    const k = c.knowledge || {};
    const hasK = Object.keys(k).filter(x => k[x] && String(k[x]).trim()).length;
    const view = state.view;

    const badges = [];
    if (c.nutrient) badges.push(`<span class="bd bd-nut">${esc(c.nutrient)}</span>`);
    if (hasK) badges.push(`<span class="bd" style="background:var(--okbg);color:var(--ok)">经验 ${hasK}</span>`);
    const metaRows = [
      ["发布", c.pub], ["实施", c.imp], ["废止", c.dead]
    ].filter(r => r[1]);

    const sib = (c.siblings || []).slice(0, 6).map(s =>
      `<li><code>${esc(s.no)}</code> ${esc(s.title)}</li>`).join("");

    return `
    <article class="card" data-no="${esc(c.no)}" data-type="${esc(c.type)}">
      <div class="ch">
        <div class="ct">
          <code>${esc(c.no)}</code>
          ${c.validity ? `<i class="st ${statusClass(c.validity)}">${esc(c.validity)}</i>` : ""}
          ${badges.join("")}
        </div>
        <h3>${esc(c.title)}</h3>
      </div>

      <div class="views">
        <div class="vw${view === "new" ? " on" : ""}" data-v="new">新人视角</div>
        <div class="vw${view === "old" ? " on" : ""}" data-v="old">老手视角</div>
      </div>

      <div class="vb${view === "new" ? "" : " hide"}" data-v="new">${newbieBody(c)}</div>
      <div class="vb${view === "old" ? "" : " hide"}" data-v="old">${oldBody(c)}</div>

      ${metaRows.length ? `<dl class="meta">${metaRows.map(r =>
        `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join("")}</dl>` : ""}

      ${sib ? `<div class="sib"><details><summary>同类其他方法（${c.siblings.length}）</summary>
        <ul>${sib}</ul></details></div>` : ""}

      ${c.url ? `<a class="src" href="${esc(c.url)}" target="_blank" rel="noopener">官方在线查阅 ↗</a>` : ""}
    </article>`;
  }

  /* ---------- 经验层诊断 ----------
     症状：「底部说已录 N 条，但卡片里一条内容都没有」。
     两种完全不同的原因，处理方式也不同：
       A. 这���地址下真没录过 → 去录入页填
       B. 录过，但 localStorage 里的 key 是旧版本留下的，
          和当前卡片的 no 对不上（改过分类/编号格式就会发生）
     光看"计数>0、内容=0"分不出是A 还是 B，所以直接把两边列出来。 */
  function renderDiag() {
    const el = document.getElementById("diag");
    if (!el) return;

    const keys = Object.keys(knowledge);
    if (!keys.length) { el.hidden = true; return; }

    // 这些 key 能在当前卡片里找到对应的 → 说明只是没搜到那张卡
    const cardNos = CARDS.map(c => c.no);
    const hit = keys.filter(k => cardNos.indexOf(k) >= 0);
    if (hit.length) { el.hidden = true; return; }   // 正常，不打扰

    // 一个都匹配不上 → 数据是旧 key 或别处来的
    el.hidden = false;
    el.innerHTML =
      `<b>经验内容显示不出来</b>：本地址下有 <code>${keys.length}</code> 条记录，
       但它们的标准号和当前卡片<b>一个都对不上</b>，所以渲染不出来。<br>
       录入的标准号：${keys.slice(0, 6).map(k => "<code>" + esc(k) + "</code>").join(" ")}
       ${keys.length > 6 ? "…" : ""}<br>
       当前卡片的标准号示例：${cardNos.slice(0, 4).map(k => "<code>" + esc(k) + "</code>").join(" ")}…<br>
       常见原因：之前在本机预览地址（<code>127.0.0.1</code>）录的，
       localStorage 按地址隔离，线上读不到；或卡片编号改过版本。
       <div class="acts">
         <button onclick="location.href='card-editor.html'">去录入页看看</button>
         <button onclick="localStorage.removeItem('stdwatch-card-knowledge');location.reload()">
           清掉这份对不上的记录并重载
         </button>
       </div>`;
  }

  /* 点「已录经验 N 条」→ 直接把localStorage 里的原文摊开。
     不靠猜：用户说"只显示数量看不到内容"时，这一键就能区分
       · 存储里根本没有→ 没录成功
       · 存储里有、但 key 对不上当前卡片 → 旧数据或别的地址
       · 存储里有、key 也对 → 内容被别的渲染问题挡住了
     */
  function showKnowRaw() {
    const el = document.getElementById("diag");
    if (!el) return;
    let raw = "";
    try { raw = localStorage.getItem(KNOW_KEY) || ""; } catch (e) { raw = ""; }
    el.hidden = false;
    el.innerHTML =
      `<b>本浏览器（${esc(location.origin)}）实际存的内容</b><br>` +
      (raw
        ? `<pre style="margin:6px 0 0;max-height:220px;overflow:auto;background:#fff;
             border:1px solid #ecd9a0;border-radius:5px;padding:8px;font-size:11.5px;
             white-space:pre-wrap;word-break:break-all">${esc(raw)}</pre>`
        : `<b style="color:#b00">这里一条都没有</b> —— 说明录入没保存成功，
             或者你在另一个地址（${esc(location.origin)}）录的。
             localStorage 按地址隔离，换地址就换一份数据。`) +
      `<div class="acts">
         <button onclick="location.href='card-editor.html'">去录入页</button>
         <button onclick="localStorage.removeItem('${KNOW_KEY}');location.reload()">
           清空本地址的经验</button>
         <button onclick="location.reload()">收起</button>
       </div>`;
  }

  /* ---------- 构建版本号 ----------
   ★ 为什么需要它 ★
   2026-10-06 修好「newbieBody 少 const k」并部署成功后，
   用户刷新仍整片空白 —— 浏览器缓存了旧 cards.js。
   我只能靠"线上 sha1 == 本地"间接推断他拿到了新版，不够直接。
   有了版本号，他一眼就能看出自己加载的是哪一版。

   规则：改动 cards.js 就把 V 往后加一位。 */
  const V = "2026-10-06b";

  /* ---------- 渲染 ---------- */
  function render() {
    const host = document.getElementById("cards");
    if (!host) return;

    const q = state.q.trim().toLowerCase();
    let list = CARDS.slice();
    if (state.type !== "全部") list = list.filter(c => c.type === state.type);
    if (q) {
      list = list.filter(c =>
        (c.no || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.nutrient || "").toLowerCase().includes(q) ||
        (c.groups || []).join("").toLowerCase().includes(q));
    }

    document.getElementById("cnt").innerHTML =
      `显示 ${list.length} / ${CARDS.length} 条方法 · 当前${
        state.view === "new" ? "新人视角（为什么 / 是什么 / 怎么学）" : "老手视角（只列要点）"
      } · <b style="color:${KNOW_COUNT ? "#0a7c42" : "#8b929a"}"
            title="点一下看本浏览器里实际存了什么">已录经验 ${KNOW_COUNT} 条</b>`
      + ` <span style="color:#b8bdc3;font-size:11px">v${V}</span>`;

    host.innerHTML = list.length ? list.map(cardHTML).join("")
                                : `<p class="empty">没有匹配的方法</p>`;
    renderDiag();
  }

  /* ---------- 挂载 ---------- */
  function mount() {
    if (!document.getElementById("cards")) return;

    // ★ 跨页更新通知 ★
    // 从录入页回来时重新读一次经验并重绘。
    // 之前只在页面加载时读一次 knowledge，用户填完回来看还是空的 ——
    // 数据其实在 localStorage 里，只是没重新读。浏览器 back-forward 缓存
    // 会让"重新加载"也不一定执行脚本，所以用 storage 事件兜底。
    window.addEventListener("storage", e => {
      if (e.key !== KNOW_KEY) return;
      try {
        knowledge = JSON.parse(e.newValue || "{}") || {};
        CARDS.forEach(c => { c.knowledge = knowledge[c.no] || {}; });
        render();
      } catch (err) { /* 忽略解析失败 */ }
    });
    // 从录入页跳回来时（pageshow 包含 bfcache 恢复）强制重读
    window.addEventListener("pageshow", e => {
      try {
        const fresh = JSON.parse(localStorage.getItem(KNOW_KEY) || "{}") || {};
        if (Object.keys(fresh).length !== KNOW_COUNT) {
          Object.assign(knowledge, fresh);
          CARDS.forEach(c => { c.knowledge = knowledge[c.no] || {}; });
          render();
        }
      } catch (err) { /* 忽略 */ }
    });

    const types = document.getElementById("types");
    const counts = {};
    CARDS.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
    types.innerHTML = TYPES.filter(t => t === "全部" || counts[t]).map(t =>
      `<button class="tb${t === state.type ? " on" : ""}" data-t="${esc(t)}">${
        esc(t)}${t === "全部" ? "" : ` <i>${counts[t]}</i>`}</button>`).join("");

    types.onclick = e => {
      const b = e.target.closest(".tb"); if (!b) return;
      state.type = b.dataset.t;
      types.querySelectorAll(".tb").forEach(x => x.classList.toggle("on", x === b));
      render();
    };

    const q = document.getElementById("q");
    let t = null;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; render(); }, 160); };

    // 点「已录经验 N 条」摊开存储原文 —— 一键分清"没录进去"和"key 对不上"
    const cntEl = document.getElementById("cnt");
    cntEl.style.cursor = "pointer";
    cntEl.title = "点一下看本浏览器里实际存了什么";
    cntEl.addEventListener("click", () => {
      const d = document.getElementById("diag");
      if (d && !d.hidden && d.dataset.manual === "1") { d.hidden = true; return; }
      showKnowRaw();
      if (d) d.dataset.manual = "1";
    });

    // 视角切换：点标签即可，只切当前卡，不重渲染全列表（更快、不跳位）
    document.getElementById("cards").addEventListener("click", e => {
      const vw = e.target.closest(".vw");
      if (!vw) return;
      const card = vw.closest(".card");
      const want = vw.dataset.v;
      card.querySelectorAll(".vw").forEach(x => x.classList.toggle("on", x === vw));
      card.querySelectorAll(".vb").forEach(x =>
        x.classList.toggle("hide", x.dataset.v !== want));
      state.view = want;                                  // 记住选择
      try { localStorage.setItem(VIEW_KEY, want); } catch (err) { /* 忽略 */ }
      const n = document.querySelectorAll(".card").length;
      document.getElementById("cnt").innerHTML =
        `显示 ${n} / ${CARDS.length} 条方法 · 当前${
          want === "new" ? "新人视角（为什么 / 是什么 / 怎么学）" : "老手视角（只列要点）"
        } · <b style="color:${KNOW_COUNT ? "#0a7c42" : "#8b929a"}">已录经验 ${KNOW_COUNT} 条</b>`;
    });

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
