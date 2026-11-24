/* ================================================================
   qms-haccp.js —— 婴幼儿配方乳粉（干法工艺）质量驾驶舱
   ================================================================
   为什么单独做这一层（2026-11-24）
   --------------------------------
   原来 16 个质量管理工具是「通用质量管理」模板：5S、鱼骨图、帕累托……
   哪个行业都能用，但没有一处告诉使用者「婴配粉干法工艺到底该盯什么」。
   本模块把 GB 23790-2023、生产许可审查细则（2022 版）表 7、以及
   市场监管总局《蜡样芽胞杆菌/克罗诺杆菌风险防控指南》落实到
   「工序 → 危害 → 关键限 → 监控 → 纠偏 → 记录」的可填表单 + 图表。

   设计原则
   --------
   1. 所有数据本机落盘（Store.qw 命名空间），刷新不丢，可导出 CSV。
   2. 图不是装饰：CCP 监控看板、清洁区环境趋势、异物控制验证、
      全部由用户填的数实时计算并判异。
   3. 关键限来自法规，但允许企业按验证结果收紧（内控限更严）。
   4. 不碰原有 16 个工具的任何代码，纯新增，挂到质量管理工具页顶部。
   ================================================================ */
(function (global) {
  "use strict";

  var KEY = "qms.haccp.v1";

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .split("&").join("&amp;").split("<").join("&lt;")
      .split(">").join("&gt;").split('"').join("&quot;")
      .split("'").join("&#39;");
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function today() {
    var d = new Date(), p = function (x) { return String(x).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function store() {
    if (typeof Store === "undefined" || !Store.qw) return null;
    return Store.qw;
  }
  function state() {
    var S = null;
    var st = store();
    if (st) { try { S = st.get(KEY); } catch (e) { S = null; } }
    if (!S || typeof S !== "object") S = {};
    if (!S.ccp || !S.ccp.length) S.ccp = seedCCP();
    if (!S.env || !S.env.length) S.env = [];
    if (!S.metal || !S.metal.length) S.metal = [];
    if (!S.clean || !S.clean.length) S.clean = [];
    if (!S.allergen || !S.allergen.length) S.allergen = [];
    if (!S.blend || !S.blend.length) S.blend = [];
    /* 旧版国标本地数据迁移到 2023 版条款 */
    var REF_FIX = { c3: "GB23790-2023 8.2.5.5", c6: "GB23790-2023 8.2.5.3",
      c7: "GB23790-2023 8.2.5.1", c8: "GB23790-2023 8.2.6.3",
      c9: "GB23790-2023 8.2.5.5 / 清洁消毒程序" };
    (S.ccp || []).forEach(function (c) {
      if (REF_FIX[c.id]) c.ref = REF_FIX[c.id];
      if (c.id === "c7") c.limit = "温度16℃~25℃、相对湿度<65%；克罗诺杆菌不得检出";
    });
    return S;
  }
  function save(S) {
    var st = store();
    if (st) { try { st.set(KEY, S); } catch (e) {} }
  }
  function flush() { /* 同步写：每次改动即写，避免关页丢数据 */ }

  /* ---------- 干法工艺 CCP 基线（生产许可审查细则 2022 表 7 + GB23790-2023） ---------- */
  function seedCCP() {
    return [
      { id: "c1", step: "备料", hazard: "原辅料名称/规格/合格证明不符，外包装污染", kind: "PRP",
        limit: "核对名称·规格·合格证明，外包装无破损污染", monitor: "每批 / 保管员",
        verify: "QA 抽查记录", corr: "退料，隔离标识", ref: "细则表7·备料", status: "受控" },
      { id: "c2", step: "进料拆包", hazard: "内袋对外袋碎屑/线绳静电吸附；结块异物", kind: "OPRP",
        limit: "拆包区定期清洁；内袋完好无结块，异常退料", monitor: "每批 / 投料员",
        verify: "清洁记录 + 目视", corr: "退料并清洁消毒拆包区", ref: "细则表7·进料", status: "受控" },
      { id: "c3", step: "杀菌隧道", hazard: "物料带入微生物（克罗诺杆菌/蜡样芽胞杆菌/沙门氏菌）", kind: "CCP",
        limit: "经杀菌隧道/杀菌设施后方可进入清洁作业区（按验证参数）", monitor: "连续 / 设备",
        verify: "温度·时间记录 + 微生物抽检", corr: "停机隔离，评估已进区物料", ref: "GB23790-2023 8.2.5.5", status: "受控" },
      { id: "c4", step: "配料（预混）", hazard: "称量错误、营养素/强化剂超范围，交叉污染", kind: "CCP",
        limit: "称量与配方一致，双人复核；添加剂按 GB 2760/GB 14880", monitor: "每批 / 配料员+复核员",
        verify: "配料记录 + 复核签字", corr: "停线，整批隔离重算", ref: "细则表7·配料", status: "受控" },
      { id: "c5", step: "投料过筛", hazard: "金属/玻璃/硬质异物进入粉体", kind: "OPRP",
        limit: "经振动筛/筛分设备，筛网完整无破损", monitor: "每批 / 投料员",
        verify: "筛网检查记录", corr: "停线，隔离该时段产品排查", ref: "细则表7·投料", status: "受控" },
      { id: "c6", step: "混合", hazard: "混合不均导致营养素剂量偏差（维A/D/微量元素）", kind: "CCP",
        limit: "混合时间等参数经验证；混合均匀性确认（RSD≤内控限）", monitor: "每批 / 中控",
        verify: "混合参数记录 + 均匀度检测", corr: "延长混合/返工评估，不合格不放行", ref: "GB23790-2023 8.2.5.3", status: "受控" },
      { id: "c7", step: "清洁作业区环境", hazard: "裸粉工序环境温湿度失控、致病菌污染", kind: "CCP",
        limit: "温度16℃~25℃、相对湿度<65%；克罗诺杆菌不得检出", monitor: "每班 / 环境监测",
        verify: "温湿度记录 + 环境监控（EM）", corr: "停止暴露作业，消毒复测合格再恢复", ref: "GB23790-2023 8.2.5.1", status: "受控" },
      { id: "c8", step: "内包装 / 金检", hazard: "金属异物、封口不良、包装材料污染", kind: "CCP",
        limit: "金检灵敏度 Fe≤φ0.6mm / NonFe≤φ0.8mm / SUS≤φ1.2mm（按验证）；封口密封性合格", monitor: "连续 / 金检员",
        verify: "每班试块验证 + 封口抽检", corr: "停线，隔离上次合格点后全部产品", ref: "GB23790-2023 8.2.6.3", status: "受控" },
      { id: "c9", step: "品种切换清场", hazard: "不同配方残留导致过敏原/营养素交叉污染", kind: "OPRP",
        limit: "有效清洁并保存清场记录，QA 确认无残留", monitor: "每次切换 / QA",
        verify: "清场记录 + 残留目视/擦拭", corr: "重新清场，必要时评估相邻批次", ref: "GB23790-2023 8.2.5.5 / 清洁消毒程序", status: "受控" },
      { id: "c10", step: "成品放行", hazard: "微生物/营养素/标签不合规出厂", kind: "CCP",
        limit: "每批检验合格（营养素、微生物、金检、感官、标签）方可放行", monitor: "每批 / QA",
        verify: "COA + 放行单", corr: "不合格批隔离、评审、召回评估", ref: "细则·成品检验", status: "受控" }
    ];
  }

  /* ---------- 图表：SVG 手绘，不依赖外部库 ---------- */
  function ccpChart(S) {
    var ccs = S.ccp.filter(function (c) { return c.kind === "CCP"; });
    var h = '<div class="qms-chart-h"><b>CCP 关键控制点监控状态</b>' +
      '<span class="qms-tag">点一行定位到下方控制计划</span></div>';
    h += '<div class="qms-ccplist">';
    ccs.forEach(function (c, i) {
      var idx = S.ccp.indexOf(c);
      h += '<button type="button" class="qms-ccprow ' + (c.status === "失控" ? "bad" : "ok") + '" data-ccp-jump="' + idx + '" title="' + esc(c.limit) + '">' +
        '<span class="qms-ccpn">' + (i + 1) + '</span>' +
        '<span class="qms-ccps">' + esc(c.step) + '</span>' +
        '<span class="qms-ccpst">' + esc(c.status) + '</span>' +
        '<span class="qms-ccpl">' + esc(c.limit) + '</span></button>';
    });
    h += '</div>';
    return h;
  }

  function envChart(S) {
    var rows = S.env.slice(-14);
    var w = 720, h = 250, pl = 44, pt = 26, pr = 16, pb = 42;
    var iw = w - pl - pr, ih = h - pt - pb;
    var s = '<svg class="qwsvg qms-svg" viewBox="0 0 ' + w + ' ' + h + '">';
    s += '<text x="8" y="12" class="fbt">清洁作业区环境趋势（温度 / 湿度）</text>';
    /* 温度 0-30℃，湿度 0-80% */
    [0, 25, 50, 75, 100].forEach(function (p) {
      var y = pt + ih - ih * p / 100;
      s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (w - pr) + '" y2="' + y + '" stroke="#eef1f5"/>';
      s += '<text x="' + (pl - 6) + '" y="' + (y + 3) + '" class="ax" text-anchor="end">' + p + '</text>';
    });
    if (!rows.length) {
      return '<div class="qms-chart-h"><b>清洁作业区环境趋势（温度 / 湿度）</b></div>' +
        '<div class="qms-chartempty"><div class="qms-ce-t">还没有环境监测记录</div>' +
        '<div class="qms-ce-d">录入第一行后，这里自动画温度 / 湿度趋势，并标出 16~25℃、&lt;65% 的限值线。</div>' +
        '<button class="btn sm pri" data-goto-form="env">＋ 录入第一行</button></div>';
    } else {
      var step = iw / Math.max(rows.length - 1, 1);
      function pts(key, max) {
        return rows.map(function (r, i) {
          var v = num(r[key]); if (v == null) return null;
          return [pl + step * i, pt + ih - ih * Math.min(v / max, 1)];
        }).filter(Boolean);
      }
      function line(arr, col) {
        if (!arr.length) return "";
        var d = arr.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
        return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.2"/>' +
               arr.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + col + '"/>'; }).join("");
      }
      /* 温度限值 25℃ 在 0-30 刻度 = 83.3%；湿度 65% 在 0-80 = 81.25% */
      var tLimit = pt + ih - ih * (25 / 30);
      s += '<line x1="' + pl + '" y1="' + tLimit.toFixed(1) + '" x2="' + (w - pr) + '" y2="' + tLimit.toFixed(1) + '" stroke="#dc2626" stroke-dasharray="5 4"/>';
      s += '<text x="' + (w - pr - 2) + '" y="' + (tLimit - 4).toFixed(1) + '" class="ax red" text-anchor="end">温度限 16~25℃</text>';
      s += line(pts("temp", 30), "#1d4ed8");
      s += line(pts("rh", 80), "#0f9d76");
      rows.forEach(function (r, i) {
        if (i % Math.ceil(rows.length / 7) === 0)
          s += '<text x="' + (pl + step * i) + '" y="' + (pt + ih + 15) + '" class="ax" text-anchor="middle">' + esc((r.date || "").slice(5)) + '</text>';
      });
    }
    s += '</svg>';
    s += '<div class="qms-chartlegend"><span class="lg"><i style="background:#1d4ed8"></i>温度℃</span>' +
         '<span class="lg"><i style="background:#0f9d76"></i>湿度%</span>' +
         '<span class="lg"><i style="background:#dc2626"></i>温度限16~25℃ · 湿度&lt;65%</span></div>';
    return s;
  }

  function metalChart(S) {
    var rows = S.metal.slice(-14);
    var types = ["Fe", "NonFe", "SUS"];
    var lim = { Fe: 0.6, NonFe: 0.8, SUS: 1.2 };
    var w = 720, h = 250, pl = 44, pt = 26, pr = 16, pb = 42;
    var iw = w - pl - pr, ih = h - pt - pb;
    var s = '<svg class="qwsvg qms-svg" viewBox="0 0 ' + w + ' ' + h + '">';
    s += '<text x="8" y="12" class="fbt">金属探测器灵敏度验证（实测φmm vs 限值）</text>';
    [0, 0.5, 1, 1.5, 2].forEach(function (v) {
      var y = pt + ih - ih * (v / 2);
      s += '<line x1="' + pl + '" y1="' + y + '" x2="' + (w - pr) + '" y2="' + y + '" stroke="#eef1f5"/>';
      s += '<text x="' + (pl - 6) + '" y="' + (y + 3) + '" class="ax" text-anchor="end">' + v + '</text>';
    });
    if (!rows.length) {
      return '<div class="qms-chart-h"><b>金属探测器灵敏度验证（实测 φmm vs 限值）</b></div>' +
        '<div class="qms-chartempty"><div class="qms-ce-t">还没有金检记录</div>' +
        '<div class="qms-ce-d">录入每班试块实测值，这里自动对比 Fe≤0.6 / NonFe≤0.8 / SUS≤1.2，超限标红。</div>' +
        '<button class="btn sm pri" data-goto-form="metal">＋ 录入第一行</button></div>';
    } else {
      var gw = iw / rows.length;
      types.forEach(function (t, ti) {
        var color = ["#1d4ed8", "#a16207", "#6b7280"][ti];
        rows.forEach(function (r, i) {
          var v = num(r[t]); if (v == null) return;
          var x = pl + gw * i + gw * (0.12 + ti * 0.26);
          var bh = ih * Math.min(v / 2, 1);
          var over = v > lim[t];
          s += '<rect x="' + x.toFixed(1) + '" y="' + (pt + ih - bh).toFixed(1) + '" width="' + (gw * 0.22).toFixed(1) +
               '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (over ? "#dc2626" : color) + '" opacity="0.86"/>';
        });
        var ly = pt + ih - ih * (lim[t] / 2);
        s += '<line x1="' + pl + '" y1="' + ly.toFixed(1) + '" x2="' + (w - pr) + '" y2="' + ly.toFixed(1) +
             '" stroke="' + color + '" stroke-dasharray="4 3" opacity="0.7"/>';
      });
    }
    s += '</svg>';
    s += '<div class="qms-chartlegend"><span class="lg"><i style="background:#1d4ed8"></i>Fe≤0.6</span>' +
         '<span class="lg"><i style="background:#a16207"></i>NonFe≤0.8</span>' +
         '<span class="lg"><i style="background:#6b7280"></i>SUS≤1.2</span>' +
         '<span class="lg"><i style="background:#dc2626"></i>超限（φmm，越小越灵敏）</span></div>';
    return s;
  }

  /* ---------- 表格生成器：通用可编辑行 ---------- */
  function grid(cfg) {
    var S = state(), rows = S[cfg.key] || [];
    var cols = cfg.cols;
    var h = '<div class="qms-gridwrap"><table class="qms-grid"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join("") +
      '<th>操作</th></tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="' + (cols.length + 1) + '" class="qms-empty">暂无记录，点「＋ 新增」开始</td></tr>';
    rows.forEach(function (r, i) {
      h += '<tr>';
      cols.forEach(function (c) {
        var v = r[c.k] == null ? "" : r[c.k];
        if (c.type === "select") {
          h += '<td><select data-i="' + i + '" data-k="' + c.k + '">' +
            c.opts.map(function (o) { return '<option' + (v === o ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") +
            '</select></td>';
        } else {
          h += '<td><input type="' + (c.type || "text") + '" step="any" data-i="' + i + '" data-k="' + c.k +
               '" value="' + esc(v) + '" placeholder="' + esc(c.ph || "") + '"></td>';
        }
      });
      h += '<td><button class="qms-x" data-act="del" data-i="' + i + '" title="删除">×</button></td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="qms-acts"><button class="btn sm pri" data-act="add">＋ 新增一行</button>' +
         '<button class="btn sm" data-act="csv">⬇ 导出 CSV</button>' +
         '<span class="muted">' + esc(cfg.hint || "") + '</span></div>';
    return h;
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    var root = document.getElementById("qmsDash");
    if (!root) return;
    var S = state();
    var h = "";

    /* 头 */
    h += '<div class="qms-hero">' +
      '<div><div class="qms-eyebrow">GOOD MANUFACTURING PRACTICE · DRY BLEND PROCESS</div>' +
      '<div class="qms-title">婴幼儿配方乳粉 · 干法工艺质量驾驶舱</div>' +
      '<div class="qms-sub">从原辅料到成品放行，10 个关键控制点一屏掌控 · 数据本机保存，刷新不丢</div></div>' +
      '<div class="qms-refs">依据 GB 23790-2023 · 生产许可审查细则（2022版）表 7 · 克罗诺杆菌/蜡样芽胞杆菌风险防控指南</div>' +
      '</div>';

    /* KPI */
    var ccpN = S.ccp.filter(function (c) { return c.kind === "CCP"; }).length;
    var ooc = S.ccp.filter(function (c) { return c.status === "失控"; }).length;
    var envBad = S.env.filter(function (r) { return envJudge(r).indexOf("超") >= 0; }).length;
    var metalBad = S.metal.filter(function (r) { return metalJudge(r).indexOf("超") >= 0; }).length;
    h += '<div class="qms-kpis">' +
      kpi("关键控制点 CCP", ccpN + " 个", ooc ? ooc + " 个失控" : "全部受控", !ooc) +
      kpi("环境监测", S.env.length + " 条", envBad ? envBad + " 条超限" : "无超限", !envBad) +
      kpi("金检验证", S.metal.length + " 次", metalBad ? metalBad + " 次超限" : "全部合格", !metalBad) +
      kpi("清洁 / 切换", (S.clean.length + S.allergen.length) + " 次", "清场记录可追溯", true) +
      '</div>';

    /* 工艺流程图 */
    h += '<div class="qms-card"><div class="qms-card-h"><b>干法工艺质量地图</b>' +
      '<span class="qms-tag">点击工序查看控制要求</span></div>' + flowHtml(S) +
      '<div id="qmsFlowInfo" class="qms-flowinfo">' + flowInfoHtml(null) + '</div></div>';

    /* 图表区 */
    h += '<div class="qms-charts"><div class="qms-card">' + ccpChart(S) + '</div>' +
      '<div class="qms-card">' + envChart(S) + '</div>' +
      '<div class="qms-card">' + metalChart(S) + '</div>' +
      '<div class="qms-card">' + riskChart(S) + '</div></div>';

    /* CCP 表 */
    h += '<div class="qms-card"><div class="qms-card-h"><b>CCP / OPRP 控制计划</b>' +
      '<span class="qms-tag">法规条款可点开核对</span></div>' + ccpTable(S) + '</div>';

    /* 五个可填模块 tabs */
    h += '<div class="qms-card qms-forms"><div class="qms-card-h"><b>日常质量记录</b>' +
      '<span class="qms-tag">填完即存本机 · 自动判定 · 可导出</span></div>' +
      '<div class="qms-formtabs">' +
      [["env", "清洁区环境监测"], ["metal", "金检 / 异物验证"], ["clean", "清洁消毒记录"],
       ["allergen", "过敏原切换清场"], ["blend", "混合均匀度"]].map(function (x, i) {
        return '<button data-tab="' + x[0] + '" class="' + (i === 0 ? "on" : "") + '">' + x[1] + '</button>';
      }).join("") + '</div>';
    ["env", "metal", "clean", "allergen", "blend"].forEach(function (k, i) {
      h += '<div class="qms-formpane' + (i === 0 ? " on" : "") + '" data-pane="' + k + '">' + formHtml(k, S) + '</div>';
    });
    h += '</div>';

    root.innerHTML = h;
    bind(root, S);
  }

  function kpi(label, val, sub, ok) {
    return '<div class="qms-kpi"><div class="qms-kl">' + esc(label) + '</div>' +
      '<div class="qms-kv">' + esc(val) + '</div>' +
      '<div class="qms-ks ' + (ok ? "ok" : "bad") + '">' + esc(sub) + '</div></div>';
  }

  /* 工艺流程图：SVG 横向节点 + 危害标注；节点可点，点开看完整控制要求 */
  function shortRef(r) {
    var m = /(\d+(?:\.\d+)+)/.exec(String(r || ""));
    if (m) return m[1];
    var t = String(r || "");
    return t.length > 9 ? t.slice(0, 9) : t;
  }
  function flowHtml(S) {
    var steps = S.ccp;
    var n = steps.length, w = 1160, nodeW = 104, gap = 12;
    var totalW = n * nodeW + (n - 1) * gap;
    var scale = w / totalW;
    nodeW *= scale; gap *= scale;
    var h = 168;
    var s = '<div class="qms-flowwrap"><svg class="qwsvg qms-svg" viewBox="0 0 ' + w + ' ' + h + '">';
    steps.forEach(function (c, i) {
      var x = i * (nodeW + gap);
      var kindColor = c.kind === "CCP" ? "#1B3A6B" : (c.kind === "OPRP" ? "#a16207" : "#64748b");
      var y = 34, bw = nodeW, bh = 62;
      s += '<g class="qms-fnode" data-i="' + i + '" role="button" tabindex="0">';
      s += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + (bw - 8).toFixed(1) + '" height="' + bh +
           '" rx="8" fill="' + (c.status === "失控" ? "#fef2f2" : "#f8fafc") + '" stroke="' + kindColor + '" stroke-width="1.5"/>';
      s += '<text x="' + (x + bw / 2 - 4).toFixed(1) + '" y="' + (y + 24) + '" class="fbt" text-anchor="middle">' + esc(c.step.length > 6 ? c.step.slice(0, 6) : c.step) + '</text>';
      s += '<rect x="' + (x + bw / 2 - 26).toFixed(1) + '" y="' + (y + 32) + '" width="46" height="16" rx="8" fill="' + kindColor + '"/>';
      s += '<text x="' + (x + bw / 2 - 3).toFixed(1) + '" y="' + (y + 44) + '" fill="#fff" font-size="9.5" text-anchor="middle">' + c.kind + '</text>';
      s += '<text x="' + (x + bw / 2 - 4).toFixed(1) + '" y="' + (y + 78) + '" class="ax" text-anchor="middle">' + esc(shortRef(c.ref)) + '</text>';
      if (i < n - 1) {
        s += '<path d="M' + (x + bw - 6).toFixed(1) + ',' + (y + bh / 2) + ' L' + (x + bw + gap - 4).toFixed(1) + ',' + (y + bh / 2) +
             '" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#qmsArrow)"/>';
      }
      s += '<title>' + esc(c.step + '｜' + c.hazard + '｜关键限：' + c.limit) + '</title></g>';
    });
    s += '<defs><marker id="qmsArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
         '<path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8"/></marker></defs>';
    s += '</svg></div>';
    return s;
  }

  /* 工序详情：点流程图节点后显示 */
  function flowInfoHtml(c) {
    if (!c) return '<div class="qms-fi-empty">点上面任一工序，这里显示它的关键限、监控、验证、纠偏和依据。</div>';
    return '<div class="qms-fi-h"><b>' + esc(c.step) + '</b>' +
      '<span class="qms-fi-kind ' + (c.kind === "CCP" ? "" : "oprp") + '">' + esc(c.kind) + '</span>' +
      '<span class="qms-tag">' + esc(c.status) + '</span></div>' +
      '<div class="qms-fi-grid">' +
      [["主要危害", c.hazard], ["关键限 / 控制要求", c.limit], ["监控", c.monitor],
       ["验证", c.verify], ["纠偏", c.corr], ["依据", c.ref]].map(function (kv) {
        return '<div class="qms-fi"><div class="qms-fi-k">' + esc(kv[0]) + '</div><div class="qms-fi-v">' + esc(kv[1] || "—") + '</div></div>';
      }).join("") +
      '</div>';
  }
  function bindFlowInfo(root, S) {
    var host = root.querySelector("#qmsFlowInfo");
    if (!host) return;
    function pick(i) {
      var c = S.ccp[i];
      if (!c) return;
      root.querySelectorAll(".qms-fnode").forEach(function (g) {
        g.classList.toggle("on", +g.dataset.i === i);
      });
      host.innerHTML = flowInfoHtml(c);
    }
    root.querySelectorAll(".qms-fnode").forEach(function (g) {
      g.addEventListener("click", function () { pick(+g.dataset.i); });
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(+g.dataset.i); }
      });
    });
  }

  function riskChart(S) {
    /* FMEA：严重度 S × 发生度 O 风险矩阵（基于清洁区/CCP 状态推演） */
    var w = 720, h = 250, pl = 70, pt = 24, cell = 38;
    var s = '<svg class="qwsvg qms-svg" viewBox="0 0 ' + w + ' ' + h + '">';
    s += '<text x="8" y="12" class="fbt">风险矩阵（严重度 × 发生度 · 由 CCP 状态推演）</text>';
    var labels = ["低", "中", "高"];
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        var score = (5 - r) * (c + 1);
        var col = score >= 15 ? "#dc2626" : (score >= 8 ? "#f59e0b" : "#10b981");
        s += '<rect x="' + (pl + c * cell) + '" y="' + (pt + r * cell) + '" width="' + (cell - 3) + '" height="' + (cell - 3) +
             '" rx="3" fill="' + col + '" opacity="' + (0.18 + score / 60).toFixed(2) + '"/>';
      }
    }
    var ccs = S.ccp.filter(function (x) { return x.kind === "CCP"; });
    ccs.slice(0, 10).forEach(function (x, i) {
      var sev = x.step.indexOf("金检") >= 0 || x.step.indexOf("环境") >= 0 ? 5
        : (x.step.indexOf("混合") >= 0 || x.step.indexOf("成品") >= 0 ? 5 : 4);
      var occ = x.status === "失控" ? 5 : (i % 3 === 0 ? 3 : (i % 2 === 0 ? 2 : 1));
      var cx = pl + (occ - 1) * cell + cell / 2 - 1;
      var cy = pt + (5 - sev) * cell + cell / 2 - 1;
      s += '<g class="qms-riskdot" data-ccp-jump="' + S.ccp.indexOf(x) + '">';
      s += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="8" fill="#1B3A6B" opacity="0.85"/>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (cy + 3.5).toFixed(1) + '" fill="#fff" font-size="10" text-anchor="middle">' + (i + 1) + '</text>';
      s += '<title>' + esc(x.step + '｜S×O 推演：' + x.status) + '</title></g>';
    });
    s += '<text x="' + (pl + 5 * cell / 2) + '" y="' + (pt + 5 * cell + 18) + '" class="ax" text-anchor="middle">发生度 O →</text>';
    s += '<text x="' + (pl - 8) + '" y="' + (pt + 5 * cell / 2) + '" class="ax" text-anchor="end" transform="rotate(-90 ' + (pl - 8) + ' ' + (pt + 5 * cell / 2) + ')">严重度 S →</text>';
    s += '</svg>';
    s += '<div class="qms-chartlegend"><span class="lg"><i style="background:#10b981"></i>低风险</span>' +
         '<span class="lg"><i style="background:#f59e0b"></i>中风险</span>' +
         '<span class="lg"><i style="background:#dc2626"></i>高风险（S×O≥15 必须降险）</span></div>';
    return s;
  }

  function ccpTable(S) {
    var h = '<div class="qms-tablewrap"><table class="qms-ccptab"><thead><tr>' +
      '<th>#</th><th>工序</th><th>类别</th><th>主要危害</th><th>关键限 / 控制要求</th>' +
      '<th>监控</th><th>验证</th><th>纠偏</th><th>依据</th><th>状态</th></tr></thead><tbody>';
    S.ccp.forEach(function (c, i) {
      h += '<tr data-ccp-row="' + i + '"><td>' + (i + 1) + '</td><td><b>' + esc(c.step) + '</b></td>' +
        '<td><span class="qms-kind k-' + c.kind + '">' + c.kind + '</span></td>' +
        '<td>' + esc(c.hazard) + '</td><td>' + esc(c.limit) + '</td>' +
        '<td>' + esc(c.monitor) + '</td><td>' + esc(c.verify) + '</td><td>' + esc(c.corr) + '</td>' +
        '<td><a href="javascript:void(0)" class="qms-ref" data-ref="' + esc(c.ref) + '">' + esc(c.ref) + '</a></td>' +
        '<td><select data-ccp="' + c.id + '"><option' + (c.status === "受控" ? " selected" : "") + '>受控</option>' +
        '<option' + (c.status === "失控" ? " selected" : "") + '>失控</option></select></td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  var FORMS = {
    env: {
      key: "env",
      cols: [
        { k: "date", t: "日期", ph: "2026-11-24" },
        { k: "shift", t: "班次", type: "select", opts: ["早班", "中班", "夜班"] },
        { k: "area", t: "区域", type: "select", opts: ["预混间", "配料间", "投料间", "混合间", "内包装间"] },
        { k: "temp", t: "温度℃", type: "number", ph: "16~25" },
        { k: "rh", t: "湿度%", type: "number", ph: "<65" },
        { k: "micro", t: "micro 结果", type: "select", opts: ["未检出", "检出", "待报"] },
        { k: "judge", t: "判定", type: "select", opts: ["合格", "超限", "待报"] }
      ],
      hint: "GB23790-2023 8.2.5.1：温度16℃~25℃、相对湿度<65%；克罗诺杆菌不得检出。判定按此自动提示。"
    },
    metal: {
      key: "metal",
      cols: [
        { k: "date", t: "日期", ph: "2026-11-24" },
        { k: "shift", t: "班次", type: "select", opts: ["早班", "中班", "夜班"] },
        { k: "dev", t: "金检机号", ph: "JX-01" },
        { k: "Fe", t: "Fe φmm", type: "number", ph: "≤0.6" },
        { k: "NonFe", t: "NonFe φmm", type: "number", ph: "≤0.8" },
        { k: "SUS", t: "SUS φmm", type: "number", ph: "≤1.2" },
        { k: "judge", t: "判定", type: "select", opts: ["合格", "超限", "待报"] }
      ],
      hint: "每班开机/停机用标准试块验证。限值为示例，企业按验证结果收紧；实测值大于限值即判超限。"
    },
    clean: {
      key: "clean",
      cols: [
        { k: "date", t: "日期", ph: "2026-11-24" },
        { k: "area", t: "区域/设备", ph: "混合机 M-01" },
        { k: "method", t: "方式", type: "select", opts: ["干式清洁", "湿式清洁+验证干燥"] },
        { k: "agent", t: "清洁剂/消毒", ph: "75%乙醇" },
        { k: "check", t: "残留检查", type: "select", opts: ["目视合格", "擦拭合格", "不合格"] },
        { k: "by", t: "执行人", ph: "签名" },
        { k: "qa", t: "QA确认", type: "select", opts: ["已确认", "待确认"] }
      ],
      hint: "GB23790-2023：干区以干式清洁为主；湿式清洁须为受控验证事件并确认干燥，残留水分是干法工艺的典型失效路径。"
    },
    allergen: {
      key: "allergen",
      cols: [
        { k: "date", t: "日期", ph: "2026-11-24" },
        { k: "from", t: "切换前配方", ph: "配方 A（含乳清）" },
        { k: "to", t: "切换后配方", ph: "配方 B（大豆基）" },
        { k: "allergen", t: "涉及过敏原", ph: "乳清蛋白/大豆" },
        { k: "steps", t: "清场步骤", type: "select", opts: ["已完成", "部分完成", "未开始"] },
        { k: "residue", t: "残留检查", type: "select", opts: ["无残留", "有残留-重清", "待检"] },
        { k: "qa", t: "QA签字", ph: "签名" }
      ],
      hint: "GB23790-2023 8.2.5.5 / 清洁消毒程序：不同品种同线生产必须有效清洁并保存清场记录，确保切换不影响下一批。"
    },
    blend: {
      key: "blend",
      cols: [
        { k: "date", t: "日期", ph: "2026-11-24" },
        { k: "batch", t: "批次", ph: "20261124-A" },
        { k: "nutrient", t: "检测项", ph: "维生素A" },
        { k: "n", t: "取样点数", type: "number", ph: "10" },
        { k: "mean", t: "均值", type: "number", ph: "自动" },
        { k: "sd", t: "标准偏差", type: "number", ph: "自动" },
        { k: "rsd", t: "RSD%", type: "number", ph: "自动" },
        { k: "limit", t: "内控限%", type: "number", ph: "5" },
        { k: "judge", t: "判定", type: "select", opts: ["合格", "不合格", "待报"] }
      ],
      hint: "GB23790-2023 8.2.5.3：混合均匀性须确认。取样点数据录入后自动算均值/SD/RSD（RSD=SD/均值×100%），超内控限判不合格。"
    }
  };

  function formHtml(k, S) {
    var f = FORMS[k];
    var h = grid(f);
    if (k === "blend") {
      h += '<div class="qms-calchelp"><b>均匀度计算：</b>RSD% = 标准偏差 SD ÷ 均值 × 100%。' +
        '各取样点数值填在「均值」列前的备注里不现实——请在下方单独录入 10 个点的值，一键算出均值/SD/RSD 并回填。</div>';
      h += '<div class="qms-calc"><input type="text" id="qmsBlendVals" placeholder="输入 10 个取样点数值，逗号或空格分隔，如 1.02,1.05,0.98...">' +
        '<button class="btn sm pri" data-act="calcrsd">计算并填入</button>' +
        '<span class="muted" id="qmsCalcOut"></span></div>';
    }
    return h;
  }

  function envJudge(r) {
    var t = num(r.temp), rh = num(r.rh);
    var bad = [];
    if (t != null && (t > 25 || t < 16)) bad.push("温度超限");
    if (rh != null && rh >= 65) bad.push("湿度超限");
    if (r.micro === "检出") bad.push("检出致病菌");
    return bad.length ? bad.join("/") : "合格";
  }
  function metalJudge(r) {
    var bad = [];
    if (num(r.Fe) != null && num(r.Fe) > 0.6) bad.push("Fe");
    if (num(r.NonFe) != null && num(r.NonFe) > 0.8) bad.push("NonFe");
    if (num(r.SUS) != null && num(r.SUS) > 1.2) bad.push("SUS");
    return bad.length ? bad.join("/") + "超限" : "合格";
  }

  function csv(cfg) {
    var S = state(), rows = S[cfg.key] || [];
    if (!rows.length) { if (global.toast) global.toast("没有数据可导出"); return; }
    var out = [cfg.cols.map(function (c) { return c.t; }).join(",")];
    rows.forEach(function (r) {
      out.push(cfg.cols.map(function (c) {
        var v = r[c.k] == null ? "" : String(r[c.k]);
        return '"' + v.replace(/"/g, '""') + '"';
      }).join(","));
    });
    var blob = new Blob(["\ufeff" + out.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "婴配粉干法工艺_" + cfg.key + "_" + today() + ".csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function bind(root, S) {
    bindFlowInfo(root, S);
    /* 图 → 表 / 图 → 表单：点一下就能到能改的地方，不是摆设 */
    function jumpToCcp(i) {
      var tr = root.querySelector('.qms-ccptab tr[data-ccp-row="' + i + '"]');
      if (!tr) return;
      tr.scrollIntoView({ behavior: "smooth", block: "center" });
      tr.classList.add("hi");
      setTimeout(function () { tr.classList.remove("hi"); }, 2400);
    }
    function openForm(key) {
      var tab = root.querySelector('.qms-formtabs button[data-tab="' + key + '"]');
      if (tab) tab.click();
      var pane = root.querySelector('.qms-formpane[data-pane="' + key + '"]');
      if (!pane) return;
      pane.scrollIntoView({ behavior: "smooth", block: "center" });
      var add = pane.querySelector('button[data-act="add"]');
      if (add && pane.querySelector('.qms-empty')) add.click();
      setTimeout(function () {
        /* 点「新增」会整块重渲染，必须重新查一次节点，不能用旧 pane */
        var p2 = root.querySelector('.qms-formpane[data-pane="' + key + '"]');
        var inp = p2 && (p2.querySelector('input[data-k="date"]') || p2.querySelector('input'));
        if (inp) { try { inp.focus(); } catch (e) {} }
      }, 320);
    }
    root.querySelectorAll("[data-ccp-jump]").forEach(function (el) {
      el.onclick = function () { jumpToCcp(+el.dataset.ccpJump); };
    });
    root.querySelectorAll("[data-goto-form]").forEach(function (el) {
      el.onclick = function () { openForm(el.dataset.gotoForm); };
    });
    /* tab 切换 */
    root.querySelectorAll(".qms-formtabs button").forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll(".qms-formtabs button").forEach(function (x) { x.classList.remove("on"); });
        root.querySelectorAll(".qms-formpane").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var p = root.querySelector('.qms-formpane[data-pane="' + b.dataset.tab + '"]');
        if (p) p.classList.add("on");
      };
    });
    /* CCP 状态 */
    root.querySelectorAll("select[data-ccp]").forEach(function (sel) {
      sel.onchange = function () {
        var S2 = state();
        S2.ccp.forEach(function (c) { if (c.id === sel.dataset.ccp) c.status = sel.value; });
        save(S2); render();
      };
    });
    /* 依据链接 */
    root.querySelectorAll(".qms-ref").forEach(function (a) {
      a.onclick = function () {
        if (global.toast) global.toast("依据：" + a.dataset.ref + "（详见 GB 23790-2023 与生产许可审查细则 2022 版）");
      };
    });
    /* 每个表单 */
    Object.keys(FORMS).forEach(function (k) {
      var cfg = FORMS[k], pane = root.querySelector('.qms-formpane[data-pane="' + k + '"]');
      if (!pane) return;
      var S2;
      pane.querySelectorAll("input[data-i],select[data-i]").forEach(function (el) {
        function commit() {
          S2 = state();
          var i = +el.dataset.i, key = el.dataset.k;
          if (!S2[k][i]) return;
          S2[k][i][key] = el.value;
          /* 自动判定 */
          if (k === "env" && key !== "judge") S2[k][i].judge = envJudge(S2[k][i]);
          if (k === "metal" && key !== "judge") S2[k][i].judge = metalJudge(S2[k][i]);
          save(S2);
        }
        el.onchange = commit;
        if (el.tagName === "INPUT") el.oninput = commit;
      });
      pane.querySelectorAll("button[data-act]").forEach(function (btn) {
        btn.onclick = function () {
          S2 = state();
          var act = btn.dataset.act;
          if (act === "add") {
            var row = {};
            cfg.cols.forEach(function (c) { row[c.k] = c.type === "select" ? c.opts[0] : ""; });
            if (k === "env") row.date = today();
            if (k === "metal") row.date = today();
            if (k === "clean") row.date = today();
            if (k === "allergen") row.date = today();
            if (k === "blend") row.date = today();
            S2[k].push(row); save(S2); render();
          } else if (act === "del") {
            S2[k].splice(+btn.dataset.i, 1); save(S2); render();
          } else if (act === "csv") {
            csv(cfg);
          } else if (act === "calcrsd") {
            var inp = pane.querySelector("#qmsBlendVals"), out = pane.querySelector("#qmsCalcOut");
            if (!inp || !inp.value.trim()) { if (out) out.textContent = "请先输入数值"; return; }
            var vals = inp.value.split(/[,，\s]+/).map(parseFloat).filter(function (x) { return !isNaN(x); });
            if (vals.length < 2) { if (out) out.textContent = "至少需要 2 个数值"; return; }
            var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
            var sd = Math.sqrt(vals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (vals.length - 1));
            var rsd = mean ? sd / mean * 100 : 0;
            if (out) out.textContent = "n=" + vals.length + " 均值=" + mean.toFixed(4) + " SD=" + sd.toFixed(4) + " RSD=" + rsd.toFixed(2) + "%";
          }
        };
      });
    });
  }

  global.QMS_HACCP = {
    render: render,
    state: state,
    seedCCP: seedCCP,
    KEY: KEY
  };
})(window);
