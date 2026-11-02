/* ================================================================
   focus.js —— 全站输入防抖（2026-11-02）

   ================================================================
   问题
   ------------------------------------------------------------
   全站每个可编辑控件的 oninput 都会触发一次整块重绘
   （innerHTML 被整体替换）。后果三个：

     ① 正在编辑的输入框被销毁 → 焦点丢失
        → 连续输入只记下第一个字，后面的字全丢
     ② 光标回到开头 → 后面输入的字插到错误位置
     ③ 内容高度变化 → 页面滚动位置跳一下（用户说的"跳动"）

   做法
   ------------------------------------------------------------
   不改各组件代码，全局兜底：

     ① focusin 时记住当前控件的「路径签名」
        （由各级兄弟索引组成的序列，重绘后结构不变则签名不变）
     ② 每次 input 后更新光标位置
     ③ MutationObserver 发现 DOM 被重写后：
          - 原控件还在 → 不用管
          - 原控件没了 → 按签名找回同一个控件，还原焦点 + 光标 + 视口位置

   ★ 视口位置用「控件相对视口的偏移」而不是绝对 scrollY：
     上方内容高度变了（比如工具卡片变高）时，scrollY 会被浏览器
     夹到新的上限，绝对定位根本回不去；
     而"这个框还在屏幕同一个位置"才是用户真正要的。

   ★ 为什么用「路径签名」而不是给每个控件加 id：
     全站有几百个可编辑控件，逐个加标识要改十几个文件；
     路径签名零侵入，一处生效。
     结构真的变了（加行/删行/排序/筛选）时签名会变，找不回 → 焦点丢失，
     这是合理的 —— 那时确实需要重新渲染。
   ================================================================ */
(function () {
  if (window.__focusFix) return;

  var sig = null;          /* 当前编辑控件的路径签名 */
  var cur = null;          /* 当前编辑控件的 DOM 引用 */
  var pos = 0;             /* 光标位置 */
  var anchorTop = 0;       /* 控件相对视口的上边距 */
  var anchorLeft = 0;      /* 控件相对视口的左边距 */
  var scrollY = 0, scrollX = 0;
  var pending = false;
  /* ★ 还原过程中的 focusin 不能覆盖 pos ★
     restore() 里的 el.focus() 会同步触发 focusin → grab()，
     而刚 focus 的输入框 selectionStart = 0，
     于是光标位置被清零 → 下一个字插到最前面。
     实测：想打「王海涛」，结果变成「涛海硫酸（优级纯王）」。 */
  var restoring = false;

  /* 由各级兄弟索引组成路径：DIV[0]>TABLE[1]>TBODY[0]>TR[3]>TD[2]>INPUT[0] */
  function pathOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var idx = 0, p = el.previousElementSibling;
      while (p) { idx++; p = p.previousElementSibling; }
      parts.unshift(el.tagName + "[" + idx + "]");
      el = el.parentElement;
    }
    return parts.join(">");
  }

  function findByPath(path) {
    if (!path) return null;
    var node = document.body;
    var segs = path.split(">");
    for (var i = 0; i < segs.length; i++) {
      var m = /^([A-Z]+)\[(\d+)\]$/.exec(segs[i]);
      if (!m || !node.children) return null;
      node = node.children[+m[2]];
      if (!node) return null;
    }
    return node;
  }

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
  }

  /* 记住当前控件 */
  function grab() {
    if (restoring) return;          /* 还原过程中的 focusin 不算数 */
    var a = document.activeElement;
    if (!isEditable(a)) { sig = null; cur = null; return; }
    sig = pathOf(a);
    cur = a;
    try { pos = (a.selectionStart != null) ? a.selectionStart : 0; } catch (e) { pos = 0; }
    try {
      var r = a.getBoundingClientRect();
      anchorTop = r.top; anchorLeft = r.left;
    } catch (e) { }
    scrollY = window.scrollY || 0;
    scrollX = window.scrollX || 0;
  }

  /* 每次输入后更新光标位置 —— 否则恢复时总是回到 0 */
  function trackCaret() {
    var a = document.activeElement;
    if (!isEditable(a)) return;
    if (a !== cur) { grab(); return; }
    try { if (a.selectionStart != null) pos = a.selectionStart; } catch (e) { }
  }

  function restore() {
    if (!sig) return;
    /* 原控件还在 DOM 里 → 焦点没丢，不用管 */
    if (cur && cur.isConnected) { sig = null; return; }
    var el = findByPath(sig);
    if (!el || !isEditable(el)) { sig = null; cur = null; return; }
    var p0 = pos, y0 = scrollY, x0 = scrollX, t0 = anchorTop, l0 = anchorLeft;
    restoring = true;
    try {
      try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { } }
      try {
        if (el.setSelectionRange && el.selectionStart != null) el.setSelectionRange(p0, p0);
      } catch (e) { }
    } finally {
      restoring = false;
    }
    cur = el;
    /* 视口位置：先按控件的偏移差滚动（稳），再兜底还原绝对位置 */
    var dy = 0, dx = 0;
    try {
      var r2 = el.getBoundingClientRect();
      dy = r2.top - t0;
      dx = r2.left - l0;
    } catch (e) { }
    if (Math.abs(dy) > 1 || Math.abs(dx) > 1) {
      try { window.scrollBy(dx, dy); } catch (e) { }
    }
    if (Math.abs((window.scrollY || 0) - y0) > 1 && Math.abs(dy) <= 1) {
      try { window.scrollTo(x0 || 0, y0); } catch (e) { }
    }
  }

  document.addEventListener("focusin", grab, true);
  document.addEventListener("input", trackCaret, true);
  document.addEventListener("focusout", function () {
    /* 失焦后延迟清空：等重绘结束再清，否则会误判 */
    setTimeout(function () {
      var a = document.activeElement;
      if (!isEditable(a)) { sig = null; cur = null; }
    }, 0);
  }, true);

  var mo = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    /* 微任务里做 —— 重绘是同步的，恢复发生在浏览器绘制之前，看不到闪烁 */
    Promise.resolve().then(function () {
      pending = false;
      restore();
    });
  });

  function start() {
    if (!document.body) return;
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.__focusFix = { grab: grab, restore: restore, pathOf: pathOf };
})();
