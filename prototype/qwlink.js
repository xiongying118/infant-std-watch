/* ================================================================
   qwlink.js —— 质量管理工具的「关联工具」（2026-11-04 晚）
   ================================================================
   用户原话：「在质量管理工具最后加多一个功能列，解释各个工具之间的关联性」

   ---- 设计 ----
   每个工具定义三类关联：
     before  前置 —— 做这个之前先做什么
     after   后续 —— 做完这个接着做什么
     with    配套 —— 常一起用的（不分先后）
   做成**可点击**：点工具名直接跳过去并打开那个工具。

   ---- 为什么必须有 ----
   16 个工具原本是「一堆并列的工具」，小白会问：
     「我出了质量问题，先开哪个？做完这个接着做什么？」
     「SPC 说失控了，然后呢？」
   → 必须把工具串成一条**可执行的链路**，而不是并列清单。

   ---- 婴配粉现场最常用的一条主线 ----
     发现问题 → 圈定范围 → 找关键少数 → 铺开原因 → 追到根因 → 改进闭环 → 固化标准
      投诉异常 → 批次追溯 → 帕累托   → 鱼骨图    → 5Why     → PDCA    → 更新 SOP
      过程漂移 → 直方图/SPC → 层别分析 → 鱼骨图 → 5Why → PDCA

   ---- 数据放在 qwlink.json ----
   关联表内容多（每个工具都有前后左右），放 JSON 便于维护；
   JS 这里只负责渲染和跳转。

   ★ 全部按婴幼儿配方乳粉 / 乳粉 / 调制乳粉企业的实际流程写 ★
   ================================================================ */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .split("&").join("&" + "amp;")
      .split("<").join("&" + "lt;")
      .split(">").join("&" + "gt;")
      .split('"').join("&" + "quot;")
      .split("'").join("&" + "#39;");
  }

  var LINK = null;   /* 从 qwlink.json 载入 */

  /* ★ 关联表是异步载入的 ★
     工具可能先渲染、JSON 后到 → 用 pending 队列兜住，
     载入完成后回头补插。 */
  var pending = [];

  function load(cb) {
    if (LINK) { if (cb) cb(LINK); return; }
    /* ★ 优先用内联数据（qwlink.data.js）★
       原来的 XMLHttpRequest 方式在 file:// 下会被 CORS 拦掉，
       而且要等异步 → 工具渲染时关联表还没到。
       内联数据是同步的，渲染时就能拿到。 */
    if (global.QWLINK_DATA) {
      LINK = global.QWLINK_DATA;
      if (cb) cb(LINK);
      var list0 = pending.splice(0);
      list0.forEach(function (it) { insert(it.key, it.host); });
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "qwlink.json", true);
    xhr.onload = function () {
      try {
        LINK = JSON.parse(xhr.responseText);
        if (cb) cb(LINK);
        /* 补插所有等待中的 */
        var list = pending.splice(0);
        list.forEach(function (it) { insert(it.key, it.host); });
      } catch (e) {
        console.warn("qwlink.json 解析失败", e);
      }
    };
    xhr.onerror = function () { console.warn("qwlink.json 加载失败"); };
    xhr.send();
  }

  /* 把关联区块插到工具卡片的最后 */
  function insert(key, host) {
    if (!host || !LINK) return;
    if (host.querySelector(".qwl-box")) return;      /* 已插过 */
    var l = LINK[key];
    if (!l) return;
    var html = box(key);
    if (!html) return;
    var w = host.querySelector(".qwt");
    if (w) w.insertAdjacentHTML("beforeend", html);
    else host.insertAdjacentHTML("beforeend", html);
  }

  /* 工具渲染后调这个 */
  function attach(key, host) {
    if (!host) return;
    if (LINK) { insert(key, host); return; }
    pending.push({ key: key, host: host });
    load();
  }

  /* ----------------------------------------------------------------
     一行关联：标题 + 可点击的工具名
     ---------------------------------------------------------------- */
  function relRow(label, items, cls) {
    if (!items || !items.length) return "";
    var h = '<div class="qwl-row ' + (cls || "") + '">';
    h += '<div class="qwl-label">' + esc(label) + "</div>";
    h += '<div class="qwl-items">';
    items.forEach(function (it) {
      h += '<a class="qwl-link" href="javascript:void(0)" ' +
        'onclick="QWLink.jump(\'' + it.k + '\')" ' +
        'title="' + esc(it.why || "") + '">' + esc(it.t) + "</a>";
    });
    h += "</div></div>";
    return h;
  }

  /* ----------------------------------------------------------------
     生成「工具关联」区块
     key = 当前工具的 toolKey
     ---------------------------------------------------------------- */
  function box(key) {
    if (!LINK) return "";
    var l = LINK[key];
    if (!l) return "";

    var h = '<div class="qwl-box">';
    h += '<div class="qwl-head"><span class="qwl-ico">🔗</span>' +
      "<b>这个工具和别的工具怎么串起来用</b></div>";

    if (l.before && l.before.length) h += relRow("做这个之前", l.before, "qwl-before");
    if (l.after && l.after.length) h += relRow("做完接着做", l.after, "qwl-after");
    if (l.with && l.with.length) h += relRow("常配套使用", l.with, "qwl-with");

    /* 每条关联的具体说明 */
    var all = [].concat(l.before || [], l.after || [], l.with || []);
    if (all.length) {
      h += '<div class="qwl-why">';
      all.forEach(function (it) {
        h += '<div class="qwl-w"><b>' + esc(it.t) + "：</b>" + esc(it.why) + "</div>";
      });
      h += "</div>";
    }

    if (l.note) h += '<div class="qwl-note">' + l.note + "</div>";
    h += "</div>";
    return h;
  }

  /* ----------------------------------------------------------------
     跳到另一个工具并打开它
     ---------------------------------------------------------------- */
  function jump(toolKey) {
    if (!toolKey) return;

    /* ★ 2026-11-24：跨视图跳转修复 ★
       关联链接里既有质量管理工具（QM）也有研发管理工具（RD），但两个视图
       各自只渲染自己那批卡片。以前只按当前 DOM 找卡片，从 RD 点 five_s
       （属于 QM）就找不到 → 报「没有找到」。改为：先在数据集里确认目标
       属于哪个视图，切到那个视图（改 hash 触发 route 重渲染）后再展开。 */
    function inKeys(obj, key) {
      if (!obj) return false;
      var list = obj.tools && obj.tools.length ? obj.tools : (obj.modules || []);
      return list.some(function (t) {
        return t.toolKey === key || t.moduleKey === key;
      });
    }
    /* 注意：index.html 里 QM/RD 是顶层 const，不是 window 属性，
       在 IIFE 里要用标识符直接取，不能用 global.QM。 */
    var qmData = (typeof QM !== "undefined") ? QM : null;
    var rdData = (typeof RD !== "undefined") ? RD : null;
    var inQm = inKeys(qmData, toolKey), inRd = inKeys(rdData, toolKey);
    var wantRd = inRd && !inQm;
    var wantView = wantRd ? "rdtools" : "qmtools";
    var curView = (location.hash || "").replace("#", "");
    var needSwitch = curView !== wantView;

    if (needSwitch) {
      /* 点侧栏导航 = 改 hash + 触发 route() 重渲染，比直接改 hash 可靠 */
      var nav = document.querySelector('.nav a[data-v="' + wantView + '"]');
      if (nav && typeof nav.click === "function") nav.click();
      else location.hash = "#" + wantView;
    }

    var retried = false;
    function openTarget() {
      var head = wantRd
        ? document.querySelector('.rdcard-h[data-key="' + toolKey + '"]')
        : document.querySelector('.qmcard-h[data-key="' + toolKey + '"]');
      if (!head) {
        /* 兜底：两个视图都找一遍，兼容老链接 */
        head = document.querySelector('.qmcard-h[data-key="' + toolKey + '"], .rdcard-h[data-key="' + toolKey + '"]');
      }
      if (!head && !retried) {
        /* 目标工具可能被当前分组标签过滤掉了：切到「全部」重渲染再找一次 */
        retried = true;
        try {
          if (wantRd) { curRdGroup = "全部"; if (typeof renderRdTools === "function") renderRdTools(); }
          else { curQmCat = "全部"; if (typeof renderQmTools === "function") renderQmTools(); }
        } catch (e) {}
        head = wantRd
          ? document.querySelector('.rdcard-h[data-key="' + toolKey + '"]')
          : document.querySelector('.qmcard-h[data-key="' + toolKey + '"]');
        if (!head) head = document.querySelector('.qmcard-h[data-key="' + toolKey + '"], .rdcard-h[data-key="' + toolKey + '"]');
      }
      if (!head) {
        if (global.toast) global.toast("没有找到「" + toolKey + "」这个工具", "warn");
        return;
      }
      var card = head.parentElement;
      var collapsed = card && /展开/.test(card.innerText);
      if (wantRd || head.classList.contains("rdcard-h")) {
        if (typeof global.toggleRd === "function" &&
            (collapsed || global.curRdKey !== toolKey)) global.toggleRd(toolKey);
      } else {
        if (collapsed) head.click();
      }
      setTimeout(function () {
        if (!wantRd && typeof global.QW_open === "function") {
          try { global.QW_open(toolKey); } catch (e) {}
        }
        var h2 = document.querySelector('.qmcard-h[data-key="' + toolKey + '"], .rdcard-h[data-key="' + toolKey + '"]');
        if (h2 && h2.scrollIntoView) h2.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 280);
    }

    if (needSwitch) setTimeout(openTarget, 60);
    else openTarget();
  }

  global.QWLink = {
    box: box,
    jump: jump,
    load: load,
    attach: attach,
    insert: insert,
    get: function (k) { return LINK ? LINK[k] : null; }
  };

  /* 页面加载完自动载入关联表 */
  if (global.addEventListener) {
    global.addEventListener("DOMContentLoaded", function () { load(); });
  } else {
    load();
  }

})(window);
