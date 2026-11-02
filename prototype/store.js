/* ================================================================
   store.js —— 全站用户状态持久化（2026-11-01）
   ================================================================
   为什么要有这个文件：

   这个系统里用户会做很多「有后果」的动作：
     · 勾选订阅（决定哪些标准要盯）
     · 标记提醒已处理（决定哪些事做完了）
     · 在工具里填配方、调帕累托数据（半小时的活）
     · 勾选今日待办

   之前这些全部只活在内存里 —— 一刷新就丢，等于没做。
   实测（2026-11-01）：勾掉一个订阅 → 刷新 → 勾回来了；
   点「标记已处理」→ 刷新 → 什么都没变。

   ★ 原则：凡是「用户做的决定」都要能落盘、能看见、能撤回 ★

   ---- 设计 ----
   · 命名空间：所有键统一前缀 swd:，方便一键清空/导出
   · 容量保护：localStorage 只有 5~10MB，写满要能优雅降级
     （写失败不抛错，只是退回内存态，页面照常用）
   · 版本号：数据结构变了能主动失效旧缓存
   · 导出/导入：给「换电脑 / 备份」用，一个 JSON 文件

   隐私：只存在本机浏览器里，不上传任何服务器。
   ================================================================ */

(function (global) {
  "use strict";

  var NS = "swd:";
  var VER = "v1";

  /* ---------- 底层读写 ---------- */

  function ls() {
    try { return global.localStorage; }
    catch (e) { return null; }
  }

  /* localStorage 在隐私模式 / 配额满时抛异常 —— 一律降级，不影响页面 */
  function rawGet(k) {
    var s = ls();
    if (!s) return null;
    try { return s.getItem(NS + k); }
    catch (e) { return null; }
  }

  function rawSet(k, v) {
    var s = ls();
    if (!s) return false;
    try { s.setItem(NS + k, v); return true; }
    catch (e) {
      // 配额满：先清掉体积最大的「日志类」键再试一次
      try {
        var victim = null, victimSize = 0;
        for (var i = 0; i < s.length; i++) {
          var kk = s.key(i);
          if (!kk || kk.indexOf(NS) !== 0) continue;
          if (kk.indexOf(NS + "log.") === 0) continue;   // 日志类别删
          var sz = (s.getItem(kk) || "").length;
          if (sz > victimSize) { victimSize = sz; victim = kk; }
        }
        if (victim) { s.removeItem(victim); s.setItem(NS + k, v); return true; }
      } catch (e2) { /* 实在不行就放弃，页面照常用内存态 */ }
      return false;
    }
  }

  function rawDel(k) {
    var s = ls();
    if (!s) return;
    try { s.removeItem(NS + k); } catch (e) {}
  }

  /* ---------- 内存镜像 ----------
     写 localStorage 失败时（隐私模式）内存镜像仍能保证
     「本次会话内不丢」。读的时候内存优先。            */

  var mem = {};

  /* ---------- 对外 API ---------- */

  var Store = {
    /* 读：返回对象（不存在或损坏时返回 def） */
    get: function (key, def) {
      var raw = mem[key] !== undefined ? mem[key] : rawGet(key);
      if (raw === null || raw === undefined) return def;
      try {
        var v = JSON.parse(raw);
        return v === null || v === undefined ? def : v;
      } catch (e) {
        return def;
      }
    },

    /* 写：返回是否真的落盘了（false = 只在内存里） */
    set: function (key, val) {
      var raw;
      try { raw = JSON.stringify(val); }
      catch (e) { return false; }          // 循环引用等
      mem[key] = raw;
      return rawSet(key, raw);
    },

    /* 删 */
    del: function (key) {
      delete mem[key];
      rawDel(key);
    },

    /* 有没有 */
    has: function (key) {
      return mem[key] !== undefined || rawGet(key) !== null;
    },

    /* 整键覆盖式更新：fn(旧值) → 新值 */
    update: function (key, def, fn) {
      var old = Store.get(key, def);
      var nv = fn(old);
      Store.set(key, nv);
      return nv;
    },

    /* ---------- 批量 ---------- */

    /* 列出本站所有键（去掉前缀） */
    keys: function () {
      var out = [];
      var s = ls();
      if (s) {
        try {
          for (var i = 0; i < s.length; i++) {
            var k = s.key(i);
            if (k && k.indexOf(NS) === 0) out.push(k.slice(NS.length));
          }
        } catch (e) {}
      }
      for (var m in mem) if (out.indexOf(m) < 0) out.push(m);
      return out;
    },

    /* 导出全部（换电脑 / 备份用） */
    dump: function () {
      var o = { __app: "std-watch", __ver: VER, __at: new Date().toISOString(), data: {} };
      Store.keys().forEach(function (k) { o.data[k] = Store.get(k, null); });
      return o;
    },

    /* 导入：先合并再逐键写 */
    restore: function (obj) {
      if (!obj || !obj.data) return 0;
      var n = 0;
      for (var k in obj.data) {
        if (Object.prototype.hasOwnProperty.call(obj.data, k)) {
          Store.set(k, obj.data[k]); n++;
        }
      }
      return n;
    },

    /* 清空本站全部状态（管理后台用，有二次确认） */
    wipe: function () {
      Store.keys().forEach(function (k) { Store.del(k); });
      mem = {};
    },

    /* 估算占用（管理后台显示） */
    usage: function () {
      var s = ls();
      if (!s) return { bytes: 0, keys: 0, ok: false };
      var bytes = 0, keys = 0;
      try {
        for (var i = 0; i < s.length; i++) {
          var k = s.key(i);
          if (k && k.indexOf(NS) === 0) { bytes += (s.getItem(k) || "").length; keys++; }
        }
      } catch (e) {}
      return { bytes: bytes, keys: keys, ok: true };
    },

    /* 版本 */
    ver: VER
  };

  /* ---------- 全局暴露 ---------- */
  global.Store = Store;

  /* ================================================================
     下面是把「散落在各处的用户状态」统一到 Store 的适配层
     —— 这样其它模块只认这几个函数，不直接碰 localStorage
     ================================================================ */

  /* ---- 订阅勾选 ---- */
  Store.subs = {
    /* 读：返回 {组名: [0/1,...]} 覆盖表；没存过返回 null */
    get: function () { return Store.get("subs", null); },
    /* 写整份 */
    set: function (map) { return Store.set("subs", map); },
    /* 改一项：idx = "组名|序号" */
    toggle: function (gname, idx, val) {
      var all = Store.get("subs", {}) || {};
      if (!all[gname]) all[gname] = [];
      all[gname][idx] = val ? 1 : 0;
      Store.set("subs", all);
      return all;
    },
    /* 整组开关 */
    toggleGroup: function (gname, idxs, val) {
      var all = Store.get("subs", {}) || {};
      if (!all[gname]) all[gname] = [];
      idxs.forEach(function (i) { all[gname][i] = val ? 1 : 0; });
      Store.set("subs", all);
      return all;
    },
    /* 该项是否被订阅（未存过时用数据里的默认值） */
    isOn: function (gname, idx, dflt) {
      var all = Store.get("subs", null);
      if (!all || !all[gname] || all[gname][idx] === undefined) return !!dflt;
      return !!all[gname][idx];
    },
    /* 已订阅的项数（实算，用于 KPI） */
    count: function () {
      var all = Store.get("subs", null);
      if (!all) return null;    // null = 用户还没动过，用默认值算
      var n = 0;
      for (var g in all) if (all[g]) for (var i = 0; i < all[g].length; i++) if (all[g][i]) n++;
      return n;
    }
  };

  /* ---- 提醒处理状态 ----
     key: "alerts.done" → { "GB 5009.5-2025": {at:"2026-11-01 09:00", by:"QA"} }
     key: "alerts.snooze" → { "GB 5009.5-2025": "2026-12-01" }  忽略到某天 */
  Store.alerts = {
    doneMap: function () { return Store.get("alerts.done", {}); },
    snoozeMap: function () { return Store.get("alerts.snooze", {}); },
    isDone: function (no) { return !!Store.get("alerts.done", {})[no]; },
    markDone: function (no, meta) {
      var m = Store.get("alerts.done", {});
      m[no] = Object.assign({ at: new Date().toISOString().slice(0, 16).replace("T", " ") }, meta || {});
      Store.set("alerts.done", m);
      return m;
    },
    unmark: function (no) {
      var m = Store.get("alerts.done", {});
      delete m[no];
      Store.set("alerts.done", m);
      return m;
    },
    snooze: function (no, until) {
      var m = Store.get("alerts.snooze", {});
      m[no] = until;
      Store.set("alerts.snooze", m);
      return m;
    },
    isSnoozed: function (no) {
      var m = Store.get("alerts.snooze", {});
      if (!m[no]) return false;
      if (m[no] < new Date().toISOString().slice(0, 10)) { delete m[no]; Store.set("alerts.snooze", m); return false; }
      return true;
    },
    /* 未处理数：高/中优且未标记未忽略 */
    pending: function (alerts) {
      var done = Store.get("alerts.done", {}), snz = Store.get("alerts.snooze", {});
      var today = new Date().toISOString().slice(0, 10);
      return (alerts || []).filter(function (a) {
        if (done[a.no]) return false;
        if (snz[a.no] && snz[a.no] >= today) return false;
        return true;
      });
    }
  };

  /* ---- 今日待办勾选 ---- */
  Store.todo = {
    get: function () { return Store.get("todo.done", {}); },
    isDone: function (id) { return !!Store.get("todo.done", {})[id]; },
    toggle: function (id) {
      var m = Store.get("todo.done", {});
      if (m[id]) delete m[id]; else m[id] = new Date().toISOString().slice(0, 16).replace("T", " ");
      Store.set("todo.done", m);
      return m;
    }
  };

  /* ---- 工具草稿（34 个可交互工具共用） ---- */
  Store.draft = {
    get: function (key) { return Store.get("draft." + key, null); },
    set: function (key, val) { return Store.set("draft." + key, val); },
    del: function (key) { Store.del("draft." + key); },
    clearAll: function () {
      Store.keys().forEach(function (k) { if (k.indexOf("draft.") === 0) Store.del(k); });
    }
  };

  /* ---- 工作台状态（QWD 的持久化镜像） ---- */
  Store.qw = {
    get: function (key) { return Store.get("qw." + key, null); },
    set: function (key, val) { return Store.set("qw." + key, val); },
    del: function (key) { Store.del("qw." + key); }
  };

})(window);
