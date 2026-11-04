/* ================================================================
   qwio.js —— 工具工作台的通用 IO 能力（2026-11-04）
   ================================================================
   用户原话：「鱼骨图这个是死的，SPC等图改数据也是死的，检查所有，
              我要的是可编辑，可联动，可交付的才行，
              各处需要数据图的要可导入数据及导出数据及图可复制」

   ---- 之前的问题（别再犯）----
   ① 「改数据」按钮点了没反应 —— 因为 QW_spcEdit 只设了 st.edit=true，
      而 QW_spc() 渲染时从头到尾**根本没读 st.edit**。
      按钮是死的，编辑态从来没实现过。
   ② 鱼骨图输入框改完，图上文字不动 —— QW_fbSet / QW_fbSetItem / QW_fbPick
      三个函数都只写数据、**不重绘**，所以图是静态的。
   ③ 感官评价的「+ 加样品」直接抛异常 —— 它调 QW_addRow，
      而 QW_addRow 读的是 st.rows，感官的数据在 st.samples。
   ④ 5Why 改链条不重绘 → 「死胡同」提示永远停在初始状态。
   ⑤ 全站没有任何「导入数据」「导出数据」「复制图」的能力。

   ---- 本文件提供 ----
     QWIO.copyText(t)              复制文本（带降级）
     QWIO.downloadCsv(name, rows)  导出 CSV（带 BOM，Excel 直开）
     QWIO.copySvg(svg, name)       SVG → PNG → 剪贴板（可粘进 Word/PPT）
     QWIO.downloadSvg(svg, name)   SVG → PNG → 下载
     QWIO.pickFile(cb)             选本地 csv/txt 文件
     QWIO.pasteMatrix(onDone)      弹窗粘贴 Excel 区域 → 二维数组
     QWIO.parseMatrix(text)        文本 → 二维数组（自动识别 TSV/CSV）
     QWIO.flattenNumbers(m)        二维数组 → 一维数字序列
     QWIO.grid(key, opt)           通用可编辑数据表（增删改 + 导入导出）
     QWIO.toastMsg(msg)            统一提示

   ---- 关于「图可复制」的实现要点（踩过坑才知道）----
     把 <svg> 存成 PNG 需要两步：
       ① 序列化 SVG 时，**必须把 CSS 里的样式内联化**。
          本站的 .ax / .fbt / .fbi 这些 class 定义在 index.html 的 <style> 里，
          单独存出去的 SVG 不带 <style> → 文字会全部变成默认黑色、大小不对。
          所以这里遍历所有节点，用 getComputedStyle 把 fill / font-size 等
          关键属性写成内联属性。
       ② SVG → Canvas → PNG。注意要加白色背景，否则透明底在
          Word 里是黑底，字全看不见。
   ================================================================ */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------
     基础工具
     --------------------------------------------------------- */
  function toastMsg(msg, kind) {
    if (global.toast) { try { global.toast(msg, kind); return; } catch (e) {} }
    if (global.WorkBuddy && global.WorkBuddy.toast) { global.WorkBuddy.toast(msg); return; }
    console.log("[QWIO] " + msg);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }

  /* CSV 单元格转义：前导 =+-@ 会被 Excel 当公式 → 加单引号防注入 */
  function csvCell(v) {
    var s = (v == null ? "" : String(v));
    var out = s.replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(out)) out = "'" + out;
    return '"' + out + '"';
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) { toastMsg("没有可导出的数据", "warn"); return false; }
    var csv = "﻿" + rows.map(function (r) {
      return r.map(csvCell).join(",");
    }).join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
    toastMsg("已导出 " + filename);
    return true;
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt)
        .then(function () { toastMsg("已复制到剪贴板"); })
        .catch(function () { fallbackCopy(txt); });
    }
    fallbackCopy(txt);
    return Promise.resolve();
  }

  function fallbackCopy(txt) {
    var ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toastMsg(ok ? "已复制到剪贴板" : "复制失败，请手动选中");
  }

  /* ---------------------------------------------------------
     SVG → PNG
     --------------------------------------------------------- */
  /* 需要内联的样式属性：文字类 + 线条类，少一个复制出来就不对 */
  var INLINE_PROPS = [
    "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
    "font-size", "font-weight", "font-family", "font-style",
    "text-anchor", "dominant-baseline", "opacity", "fill-opacity", "stroke-opacity"
  ];

  /* 把外部 CSS 的效果"烘焙"进 SVG 的每个节点 */
  function inlineStyles(srcSvg, dstSvg) {
    var srcNodes = srcSvg.querySelectorAll("*");
    var dstNodes = dstSvg.querySelectorAll("*");
    var n = Math.min(srcNodes.length, dstNodes.length);
    for (var i = 0; i < n; i++) {
      var cs;
      try { cs = global.getComputedStyle(srcNodes[i]); } catch (e) { continue; }
      if (!cs) continue;
      for (var j = 0; j < INLINE_PROPS.length; j++) {
        var p = INLINE_PROPS[j];
        var v = cs.getPropertyValue(p);
        if (!v) continue;
        /* stroke:none 的默认值不用写，省得把 fill 也带成 none */
        if (p === "stroke" && v === "none" && !srcNodes[i].hasAttribute("stroke")) continue;
        try { dstNodes[i].setAttribute(p, v); } catch (e) {}
      }
    }
  }

  function svgToPngBlob(svgEl, scale) {
    scale = scale || 2;
    if (!svgEl) return Promise.reject(new Error("没有找到图形"));
    var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    var w = (vb && vb.width) || svgEl.clientWidth || 640;
    var h = (vb && vb.height) || svgEl.clientHeight || 240;
    if (!w || !h) return Promise.reject(new Error("图形尺寸为 0"));

    var clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    /* 烘焙样式 */
    inlineStyles(svgEl, clone);
    /* 白底 —— 不加的话贴到 Word 里是黑底白字看不见 */
    var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", 0);
    bg.setAttribute("width", w); bg.setAttribute("height", h);
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);

    var xml = new XMLSerializer().serializeToString(clone);
    var blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);

    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement("canvas");
          cv.width = Math.round(w * scale);
          cv.height = Math.round(h * scale);
          var ctx = cv.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          cv.toBlob(function (b) {
            if (b) resolve(b); else reject(new Error("PNG 生成失败"));
          }, "image/png");
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("SVG 解析失败")); };
      img.src = url;
    });
  }

  function svgFileName(name) {
    return (name || "图表") + "_" + today() + ".png";
  }

  /* 复制图到剪贴板 —— 失败自动降级为下载，绝不给用户一个死按钮 */
  function copySvg(svgEl, name) {
    return svgToPngBlob(svgEl, 2).then(function (png) {
      if (global.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        return navigator.clipboard.write([new global.ClipboardItem({ "image/png": png })])
          .then(function () { toastMsg("图已复制，可直接粘贴到 Word / PPT"); })
          .catch(function () { return downloadBlob(png, svgFileName(name), "浏览器不允许直接复制，已改为下载 PNG"); });
      }
      return downloadBlob(png, svgFileName(name), "当前浏览器不支持复制图片，已改为下载 PNG");
    }).catch(function (e) {
      toastMsg("复制图失败：" + (e && e.message ? e.message : e), "warn");
    });
  }

  function downloadSvg(svgEl, name) {
    return svgToPngBlob(svgEl, 2).then(function (png) {
      return downloadBlob(png, svgFileName(name), "已下载 PNG");
    }).catch(function (e) {
      toastMsg("导出图片失败：" + (e && e.message ? e.message : e), "warn");
    });
  }

  function downloadBlob(blob, filename, msg) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
    if (msg) toastMsg(msg);
    return true;
  }

  /* ---------------------------------------------------------
     文本解析：Excel 粘贴区 / CSV 文件
     --------------------------------------------------------- */
  /* 自动识别分隔符：Tab 优先（Excel 复制出来就是 Tab），否则逗号 */
  function detectDelim(text) {
    var firstLine = String(text).split(/\r?\n/)[0] || "";
    var tabs = (firstLine.match(/\t/g) || []).length;
    var commas = (firstLine.match(/,/g) || []).length;
    if (tabs > 0) return "\t";
    if (commas > 0) return ",";
    return /\s{2,}/.test(firstLine) ? /(\s{2,})/ : /\s+/;
  }

  function parseMatrix(text) {
    if (!text) return [];
    var raw = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var lines = raw.split("\n");
    while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
    if (!lines.length) return [];
    var delim = detectDelim(raw);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!String(line).trim()) continue;
      var cells;
      if (delim instanceof RegExp) cells = line.split(delim);
      else cells = line.split(delim);
      out.push(cells.map(function (c) { return String(c).trim(); }));
    }
    return out;
  }

  /* 二维数组 → 一维数字序列（把所有能解析为数值的单元格收进来） */
  function flattenNumbers(m) {
    var out = [];
    (m || []).forEach(function (row) {
      row.forEach(function (c) {
        var v = parseFloat(String(c).replace(/[^\d.\-+eE]/g, ""));
        if (!isNaN(v)) out.push(v);
      });
    });
    return out;
  }

  /* 选本地文件 */
  function pickFile(cb) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".csv,.txt,.tsv,text/csv,text/plain";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { cb(String(rd.result || ""), f.name); };
      rd.onerror = function () { toastMsg("读取文件失败", "warn"); };
      rd.readAsText(f, "utf-8");
    });
    inp.click();
  }

  /* ---------------------------------------------------------
     粘贴导入弹窗
     --------------------------------------------------------- */
  function pasteMatrix(title, hint, onDone, sampleText) {
    var wrap = document.createElement("div");
    wrap.className = "qwio-mask";
    wrap.innerHTML =
      '<div class="qwio-modal">' +
        '<div class="qwio-mh"><b>' + esc(title || "导入数据") + '</b>' +
          '<button class="x" title="关闭">×</button></div>' +
        '<div class="qwio-mb">' +
          '<div class="muted qwio-hint">' + (hint || "从 Excel 里选中区域直接复制（Ctrl+C），粘贴到下面框里") + '</div>' +
          '<textarea class="qwio-ta" rows="9" spellcheck="false" placeholder="' +
            esc(sampleText || "类别\t次数\n灌装异常\t42\n喷淋堵塞\t18") +
          '"></textarea>' +
          '<div class="qwio-row">' +
            '<button class="btn sm" data-act="file">选择 CSV 文件…</button>' +
            '<span class="muted qwio-preview"></span>' +
          '</div>' +
        '</div>' +
        '<div class="qwio-mf">' +
          '<button class="btn" data-act="cancel">取消</button>' +
          '<button class="btn pri" data-act="ok">导入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var ta = wrap.querySelector(".qwio-ta");
    var pv = wrap.querySelector(".qwio-preview");
    var matrix = [];

    function refresh() {
      matrix = parseMatrix(ta.value);
      if (!matrix.length) { pv.textContent = ""; return; }
      var cols = matrix[0].length;
      var head = matrix[0].join(" | ");
      pv.innerHTML = "预览：<b>" + matrix.length + "</b> 行 × <b>" + cols + "</b> 列　首行：<code>" +
        esc(String(head).slice(0, 60)) + "</code>";
    }
    ta.addEventListener("input", refresh);

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }

    wrap.addEventListener("click", function (e) {
      var t = e.target;
      if (t === wrap) { close(); return; }
      var act = t.getAttribute && t.getAttribute("data-act");
      if (act === "cancel" || (t.className === "x")) { close(); return; }
      if (act === "file") {
        pickFile(function (txt) { ta.value = txt; refresh(); });
        return;
      }
      if (act === "ok") {
        refresh();
        if (!matrix.length) { toastMsg("没有可导入的数据", "warn"); return; }
        close();
        onDone(matrix);
      }
    });

    setTimeout(function () { ta.focus(); }, 50);
    return wrap;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------------------------------------------------
     通用可编辑数据表
     ---------------------------------------------------------
     opt = {
       key, title, cols:[{k,label,type,width,ph}],
       get():  返回二维数组 [[v,v],[v,v]]
       set(i,k,v): 写回
       add(), del(i),
       canAdd, canDel,
       importText: 可选的导入说明（不给就没有导入按钮）
       onChange(): 数据变化后调用（用于联动重绘图表）
       exportName
     }
     --------------------------------------------------------- */
  function grid(key, opt) {
    var cols = opt.cols || [];
    var rows = opt.get ? opt.get() : [];
    var gk = "qwGrid_" + key;
    function colWidth(c) { return c.width ? ' style="width:' + c.width + '"' : ""; }
    function cell(c, i) {
      var v = rows[i][c.i];
      if (c.type === "num") {
        return '<input type="number" step="' + (c.step || "any") + '" ' +
          (c.min != null ? 'min="' + c.min + '" ' : "") +
          (c.max != null ? 'max="' + c.max + '" ' : "") +
          'value="' + esc(v == null ? "" : v) + '" placeholder="' + esc(c.ph || "") + '" ' +
          'oninput="QWIO.gridSet(\'' + key + '\',' + i + ',' + c.i + ',this.value)">';
      }
      if (c.type === "textarea") {
        return '<textarea rows="1" class="qwio-ta1" oninput="QWIO.gridSet(\'' + key + '\',' +
          i + ',' + c.i + ',this.value)">' + esc(v == null ? "" : v) + '</textarea>';
      }
      if (c.type === "select") {
        return '<select onchange="QWIO.gridSet(\'' + key + '\',' + i + ',' + c.i + ',this.value)">' +
          (c.opts || []).map(function (o) {
            var ov = (typeof o === "object") ? o.v : o;
            var ol = (typeof o === "object") ? o.l : o;
            return '<option value="' + esc(ov) + '"' + (String(v) === String(ov) ? " selected" : "") + ">" + esc(ol) + "</option>";
          }).join("") + "</select>";
      }
      return '<input type="text" value="' + esc(v == null ? "" : v) + '" placeholder="' +
        esc(c.ph || "") + '" oninput="QWIO.gridSet(\'' + key + '\',' + i + ',' + c.i + ',this.value)">';
    }
    var body = rows.map(function (r, i) {
      return "<tr>" + cols.map(function (c, ci) {
        c.i = ci;
        return '<td' + colWidth(c) + ">" + cell(c, i) + "</td>";
      }).join("") +
        (opt.canDel === false ? "" :
          '<td class="qwio-del"><button class="x" title="删除这一行" onclick="QWIO.gridDel(\'' + key + '\',' + i + ')">×</button></td>') +
      "</tr>";
    }).join("");

    return '' +
      '<div class="qwio-grid" id="' + gk + '">' +
        '<div class="qwio-gh"><b>' + esc(opt.title || "数据") + '</b>' +
          '<span class="muted">' + rows.length + ' 行</span>' +
          '<div class="sp"></div>' +
          (opt.canAdd === false ? "" : '<button class="btn sm" onclick="QWIO.gridAdd(\'' + key + '\')">+ 加一行</button>') +
          (opt.importText === false ? "" :
            '<button class="btn sm" onclick="QWIO.gridImport(\'' + key + '\')">⬆ 导入数据</button>') +
          '<button class="btn sm" onclick="QWIO.gridExport(\'' + key + '\')">⬇ 导出数据</button>' +
        '</div>' +
        '<div class="qwio-gw"><table class="qwt-tbl">' +
          "<thead><tr>" + cols.map(function (c) {
            return "<th" + colWidth(c) + ">" + esc(c.label) + "</th>";
          }).join("") + (opt.canDel === false ? "" : "<th style='width:34px'></th>") + "</tr></thead>" +
          "<tbody>" + body + "</tbody>" +
        "</table></div>" +
      "</div>";
  }

  /* grid 的操作都走 QWIO.gridXxx —— 但真正的写回要落到具体工具，
     所以这里用 QW_GRID_OPS[key] 注册回调 */
  var OPS = {};
  function registerOps(key, ops) { OPS[key] = ops; }

  function gridSet(key, i, ci, v) {
    var o = OPS[key]; if (!o) return;
    o.set(i, ci, v);
    if (o.repaint) o.repaint();
  }
  function gridAdd(key) {
    var o = OPS[key]; if (!o) return;
    o.add();
    if (o.repaint) o.repaint();
  }
  function gridDel(key, i) {
    var o = OPS[key]; if (!o) return;
    /* 删除走二次确认（不可逆） */
    if (global.Guard && global.Guard.ask) {
      global.Guard.ask("确定删除这一行？删除后不可撤销。", {
        onOk: function () { o.del(i); if (o.repaint) o.repaint(); }
      });
    } else {
      o.del(i);
      if (o.repaint) o.repaint();
    }
  }
  function gridImport(key) {
    var o = OPS[key]; if (!o) return;
    pasteMatrix(
      "导入数据",
      o.importText || "从 Excel 里选中区域直接复制（Ctrl+C），粘贴到下面框里；也可以选择 CSV 文件。",
      function (m) {
        var r = o.import_(m);
        if (r === false) { toastMsg("导入失败：数据格式对不上", "warn"); return; }
        toastMsg("已导入 " + (r && r.n ? r.n : m.length) + " 行");
        if (o.repaint) o.repaint();
      },
      o.importSample
    );
  }
  function gridExport(key) {
    var o = OPS[key]; if (!o) return;
    o.export_();
  }

  /* ---------------------------------------------------------
     统一导入入口（workbench.js 的 onclick 只能传短参数）
     ---------------------------------------------------------
     ★ 为什么不在 onclick 里直接写 pasteMatrix(...) ★
       HTML 属性里不能有裸换行 —— onclick="QWIO.pasteMatrix('标题',
         '提示文字', ...)" 一旦跨行，浏览器会把换行当成 JS 语句结束，
         直接报 "Invalid or unexpected token"，按钮点了毫无反应。
       所以 onclick 只传 key 和 kind，文案和回调全放在这张表里。
     --------------------------------------------------------- */
  var IMPORT_CFG = {
    num: {
      title: "导入数值数据",
      hint: "从 Excel 里选中一列（或一格一行的数字）复制后粘贴到下面框里；也可以选择 CSV 文件。",
      sample: "3.21\n3.44\n3.09",
      fn: "QW_numImport"
    },
    pareto: {
      title: "导入帕累托数据",
      hint: "两列：<b>类别</b> 和 <b>次数</b>。从 Excel 里选中这两列复制后粘贴过来；也可以选择 CSV 文件。",
      sample: "类别\t次数\n灌装异常\t42\n喷淋堵塞\t18",
      fn: "QW_pImport"
    },
    strata: {
      title: "导入分层数据",
      hint: "四列：<b>维度 / 分组 / 样本数 / 合格数</b>。从 Excel 里选中这四列复制后粘贴过来；也可以选择 CSV 文件。",
      sample: "维度\t分组\t样本数\t合格数\n班次\t白班\t120\t118\n班次\t夜班\t110\t96",
      fn: "QW_stImport"
    },
    fishbone: {
      title: "导入鱼骨图内容",
      hint: "两列：<b>分类</b>（人 / 机 / 料 / 法 / 环 / 测）和 <b>原因条目</b>。从 Excel 里选中这两列复制后粘贴过来；也可以选择 CSV 文件。",
      sample: "人\t操作未培训\n人\t夜班人手不足\n机\t除湿机未装\n料\t乳清粉批次异常",
      fn: "QW_fbImport"
    },
    shelf: {
      title: "导入试验数据",
      hint: "四列：<b>温度℃ / 周数 / 过氧化值 / 感官</b>。从 Excel 里选中这四列复制后粘贴过来；也可以选择 CSV 文件。",
      sample: "温度\t周数\t过氧化值\t感官\n25\t0\t0.08\t正常\n37\t4\t0.21\t正常",
      fn: "QW_shImport"
    },
    sensory: {
      title: "导入感官数据",
      hint: "第一列是样品名，后面每列对应一个评价维度。在 Excel 里选中整块区域复制后粘贴过来；也可以选择 CSV 文件。",
      sample: "样品\t色泽\t滋味\t香气\n样品A\t3.5\t4.0\t3.8",
      fn: "QW_snImport"
    },
    table: {
      title: "导入表格数据",
      hint: "按表头顺序排列各列（第一行可以是表头，会自动跳过）。从 Excel 里选中整块区域复制后粘贴过来；也可以选择 CSV 文件。",
      sample: "（粘贴你的表格）",
      fn: "QW_tImport"
    }
  };

  function importDlg(key, kind) {
    var cfg = IMPORT_CFG[kind];
    if (!cfg) { toastMsg("未知的导入类型：" + kind, "warn"); return; }
    var fn = global[cfg.fn];
    if (typeof fn !== "function") { toastMsg("导入功能不可用", "warn"); return; }
    pasteMatrix(cfg.title, cfg.hint, function (m) {
      fn(key, m);
    }, cfg.sample);
  }

  /* ---------------------------------------------------------
     导出
     --------------------------------------------------------- */
  global.QWIO = {
    toastMsg: toastMsg,
    today: today,
    copyText: copyText,
    downloadCsv: downloadCsv,
    csvCell: csvCell,
    svgToPngBlob: svgToPngBlob,
    copySvg: copySvg,
    downloadSvg: downloadSvg,
    downloadBlob: downloadBlob,
    pickFile: pickFile,
    parseMatrix: parseMatrix,
    flattenNumbers: flattenNumbers,
    pasteMatrix: pasteMatrix,
    importDlg: importDlg,
    grid: grid,
    registerOps: registerOps,
    gridSet: gridSet,
    gridAdd: gridAdd,
    gridDel: gridDel,
    gridImport: gridImport,
    gridExport: gridExport,
    esc: esc
  };

  /* ★ 全局出口 ★
     workbench.js 里的按钮写的是 onclick="QW_importDlg('key','kind')"，
     这个字符串必须能在全局作用域找到 → 这里挂到 window 上。 */
  global.QW_importDlg = importDlg;

})(window);
