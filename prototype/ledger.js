/* ================================================================
   ledger.js —— 通用台账工作台框架（2026-11-01）
   ================================================================
   为什么要有这个文件：

     实验室版块要做的工具越来越多（设备、试剂、留样、QC、PT、委托单、
     CAPA、排班、配制、出入库、报告、内审、环境监控…），
     每个都要「可编辑 · 可联动 · 可交付」。
     如果每个工具各写一遍编辑/落盘/导出/联动逻辑，代码量爆炸且必然漏。

     所以抽一个框架：注册一个「台账定义」，框架负责
       ① 渲染成可编辑表格（单元格内直接改）
       ② 改完自动落盘（localStorage，刷新不丢）
       ③ 增行 / 删行 / 复制行
       ④ 筛选 / 搜索 / 排序
       ⑤ 统计卡（随数据实时变）
       ⑥ 导出 CSV（Excel 可开）/ Word（可打印签字）
       ⑦ 联动钩子：数据一变，就通知关心它的其它模块

   用法：
     Ledger.register({
       key: "equip",
       title: "计量设备台账",
       columns: [{k:"id",label:"编号",w:70,type:"text",ro:true}, ...],
       seed: [...],                    // 种子数据
       summary: rows => ({...}),        // 统计卡
       onChange: (key, rows) => {...},  // 联动钩子
       exportName: "计量设备台账"
     });
     Ledger.render("equip");
   ================================================================ */

(function (global) {
  "use strict";

  var DEFS = {};        // key → 台账定义
  var CACHE = {};       // key → 当前行数据
  var FLT = {};         // key → {q:"", sort:"", dir:1}
  var ACTIVE = null;    // 当前台账 key
  var HOST = null;      // 渲染容器

  function esc(s){
    return String(s==null?"":s).replace(/[&<>"]/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];
    });
  }

  /* ================================================================
     注册 / 取数
     ================================================================ */
  function register(def){
    if(!def || !def.key) return;
    DEFS[def.key] = def;
  }

  /* 行数据：优先本机覆盖，其次种子 */
  function rows(key){
    if(CACHE[key]) return CACHE[key];
    var d = DEFS[key];
    if(!d) return [];
    var ov = global.Store ? global.Store.get("ledger."+key, null) : null;
    CACHE[key] = ov ? ov : (d.seed||[]).map(function(r){
      var c = {}; for(var k in r) c[k]=r[k]; return c;
    });
    return CACHE[key];
  }

  function save(key){
    if(global.Store) global.Store.set("ledger."+key, CACHE[key]);
    var d = DEFS[key];
    if(d && d.onChange) d.onChange(key, CACHE[key]);
  }

  /* ================================================================
     编辑动作
     ================================================================ */
  function setCell(key, idx, col, val){
    var rs = rows(key);
    if(!rs[idx]) return;
    var c = DEFS[key].columns.filter(function(x){ return x.k===col; })[0];
    if(c && c.type==="number") val = (val===""?"":parseFloat(val));
    rs[idx][col] = val;
    // 依赖列联动：例如改「下次校准」自动更新「剩余天数」
    var d = DEFS[key];
    if(d && d.derive) d.derive(rs[idx], rs, key);
    save(key);
    render();
  }

  function addRow(key){
    var d = DEFS[key];
    if(!d) return;
    var r = {};
    (d.columns||[]).forEach(function(c){
      r[c.k] = c.def!==undefined ? c.def : (c.type==="number"?0:"");
    });
    if(d.newRow) d.newRow(r, rows(key).length);
    rows(key).push(r);
    save(key);
    render();
    // 滚到新行
    setTimeout(function(){
      var el = document.querySelector('[data-ledger="'+key+'"] tbody tr:last-child');
      if(el) el.scrollIntoView({behavior:"smooth",block:"center"});
    }, 60);
  }

  /* ★ 删除台账行 → 二次确认（2026-11-03）★
     台账里的行是设备、试剂、样品、委托单……删错了要重录半天，
     所以必须有确认。 */
  function delRow(key, idx){
    var rs = rows(key);
    var r = rs[idx] || {};
    var label = r.name || r.item || r.title || r.id || ("第 "+(idx+1)+" 行");
    var def = DEFS[key] || {};
    global.Guard.ask("确定删除这一行？<br><b style='color:var(--ink)'>"+esc(label)+"</b>"
      + "<br><span class='muted'>"+esc(def.title||"台账")+"</span>", {
      onOk:function(){
        rs.splice(idx,1);
        save(key);
        render();
        global.toast("已删除");
      }
    });
  }

  function dupRow(key, idx){
    var rs = rows(key);
    var c = {};
    for(var k in rs[idx]) c[k]=rs[idx][k];
    if(c.id) c.id = c.id + "-副本";
    rs.splice(idx+1, 0, c);
    save(key);
    render();
  }

  function setFilter(key, q){
    FLT[key] = FLT[key]||{};
    FLT[key].q = q;
    render();
  }
  function setSort(key, col){
    FLT[key] = FLT[key]||{};
    if(FLT[key].sort===col) FLT[key].dir = -FLT[key].dir;
    else { FLT[key].sort = col; FLT[key].dir = 1; }
    render();
  }

  /* 过滤 + 排序后的行（连同原始索引） */
  function view(key){
    var d = DEFS[key];
    var rs = rows(key);
    var f = FLT[key]||{};
    var out = [];
    rs.forEach(function(r,i){
      if(f.q){
        var hay = d.columns.map(function(c){ return String(r[c.k]==null?"":r[c.k]); }).join(" ");
        if(hay.toLowerCase().indexOf(f.q.toLowerCase())<0) return;
      }
      out.push({r:r, i:i});
    });
    if(f.sort){
      var col = f.sort, dir = f.dir;
      out.sort(function(a,b){
        var av = a.r[col], bv = b.r[col];
        if(av==null) av = "";
        if(bv==null) bv = "";
        if(typeof av==="number" && typeof bv==="number") return (av-bv)*dir;
        return String(av).localeCompare(String(bv),"zh-CN")*dir;
      });
    }
    return out;
  }

  /* ================================================================
     渲染
     ================================================================ */
  function render(key){
    key = key || ACTIVE;
    var d = DEFS[key];
    if(!d) return;
    ACTIVE = key;
    HOST = document.getElementById("labBody");
    if(!HOST) return;

    var rs = rows(key);
    var vw = view(key);
    var f = FLT[key]||{};

    var h = [];

    /* 统计卡 */
    if(d.summary){
      var s = d.summary(rs);
      if(s && s.length){
        h.push('<div class="grid g4" style="margin-bottom:14px">');
        s.forEach(function(x){
          h.push('<div class="kpi'+(x.cls?" "+x.cls:"")+'">'
            +'<div class="k">'+esc(x.k)+'</div>'
            +'<div class="v">'+(x.v==null?"—":esc(x.v))+(x.unit?'<span style="font-size:14px"> '+esc(x.unit)+'</span>':'')+'</div>'
            +'<div class="d">'+esc(x.d||"")+'</div></div>');
        });
        h.push('</div>');
      }
    }

    /* 顶部工具条 */
    h.push('<div class="card" style="margin-bottom:14px">');
    h.push('<div class="card-h"><h3>'+esc(d.title)+'</h3>');
    h.push('<span class="muted">'+(d.subtitle||"")+'</span>');
    h.push('<div class="sp"></div>');
    if(d.extra) h.push(d.extra);
    h.push('<button class="btn sm" onclick="Ledger.addRow(\''+key+'\')">+ 加一行</button>');
    h.push('<button class="btn sm" onclick="Ledger.exportCsv(\''+key+'\')">⬇ CSV</button>');
    if(d.word!==false) h.push('<button class="btn sm" onclick="Ledger.exportWord(\''+key+'\')">⬇ Word</button>');
    if(d.importable!==false){
      h.push('<span class="sp" style="flex:1"></span>');
      h.push('<button class="btn sm pri" onclick="Ledger.importFile(\''+key+'\')">⬆ 一键导入</button>');
      h.push('<button class="btn sm" onclick="Ledger.exportTemplate(\''+key+'\')">⬇ 空白模板</button>');
    }
    h.push('</div>');
    h.push('<div class="flex" style="flex-wrap:wrap;gap:8px;align-items:center">');
    h.push('<div class="search" style="width:260px"><span class="muted">🔍</span>'
      +'<input placeholder="搜索…" value="'+esc(f.q||"")+'" oninput="Ledger.setFilter(\''+key+'\',this.value)"></div>');
    h.push('<span class="muted">'+vw.length+' / '+rs.length+' 行</span>');
    if(d.hint) h.push('<div class="sp" style="flex:1"></div><span class="muted">'+esc(d.hint)+'</span>');
    h.push('</div>');

    if(d.notice) h.push('<div class="notice '+(d.noticeKind||"")+'" style="margin:12px 0 0"><span>ℹ</span><div>'+d.notice+'</div></div>');
    h.push('</div>');

    /* 表格 */
    if(!vw.length){
      h.push('<div class="card empty">没有匹配的行。点「加一行」开始记录。</div>');
      HOST.innerHTML = h.join("");
      return;
    }
    /* ★ 卡片式渲染（列多时用，避免每列都被压扁）★ */
    if(d.cardMode && !d.cardHead && !d.cardFields){
      /* ---- 自动卡片化：按字段名把列分主/次 ---- */
      var MAIN_MAX = 4;
      var WIDE = d.cardWide || ["use","reason","cause","action","criteria","critHigh",
                               "note","remark","finding","evidence","obj","items",
                               "calc","base","std","orderNote"];
      var cols2 = (d.columns||[]);
      var main2 = [], rest2 = [];
      cols2.forEach(function(c, idx){
        /* 主字段：前 MAIN_MAX 个非宽字段 */
        if(idx < MAIN_MAX && WIDE.indexOf(c.k) < 0) main2.push(c);
        else rest2.push(c);
      });
      /* 宽字段（长文本）单独放最后一行 */
      var wide2 = [], mid2 = [];
      rest2.forEach(function(c){
        if(WIDE.indexOf(c.k) >= 0) wide2.push(c); else mid2.push(c);
      });

      h.push('<div class="card" style="padding:0;overflow:hidden" data-ledger="'+key+'">');
      h.push('<div class="ledger-cards">');
      vw.forEach(function(o){
        var r = o.r, i = o.i;
        var cls = (d.rowClass ? d.rowClass(r, i) : "") || "";
        h.push('<div class="lcard '+cls+'">');

        /* 主区 */
        h.push('<div class="lcard-main">');
        main2.forEach(function(c){
          h.push(fieldHtml(c, r, i, key));
        });
        h.push('</div>');

        /* 次区（横排字段） */
        h.push('<div class="lcard-f">');
        mid2.forEach(function(c){
          h.push(fieldHtml(c, r, i, key));
        });
        h.push('</div>');

        /* 宽字段区 */
        if(wide2.length){
          h.push('<div class="lcard-wide">');
          wide2.forEach(function(c){
            h.push(fieldHtml(c, r, i, key, true));
          });
          h.push('</div>');
        }

        h.push('<div class="lcard-act">'
          +'<button class="x" title="复制" onclick="Ledger.dupRow(\''+key+'\','+i+')">⧉</button>'
          +'<button class="x" title="删除" onclick="Ledger.delRow(\''+key+'\','+i+')">×</button>'
          +'</div></div>');
      });
      h.push('</div></div>');
      HOST.innerHTML = h.join("");
      return;
    }

    if(d.cardMode){
      h.push('<div class="card" style="padding:0;overflow:hidden" data-ledger="'+key+'">');
      h.push('<div class="ledger-cards">');
      vw.forEach(function(o){
        var r = o.r, i = o.i;
        var cls = (d.rowClass ? d.rowClass(r, i) : "") || "";
        h.push('<div class="lcard '+cls+'">');
        if(d.cardHead) h.push(d.cardHead(r, i));
        if(d.cardFields) h.push(d.cardFields(r, i));
        h.push('<div class="lcard-act">'
          +'<button class="x" title="复制" onclick="Ledger.dupRow(\''+key+'\','+i+')">⧉</button>'
          +'<button class="x" title="删除" onclick="Ledger.delRow(\''+key+'\','+i+')">×</button>'
          +'</div></div>');
      });
      h.push('</div></div>');
      HOST.innerHTML = h.join("");
      return;
    }

    h.push('<div class="card" style="padding:0;overflow:hidden"><div class="twrap">');
    h.push('<table class="ledger-tbl" data-ledger="'+key+'"><thead><tr>');
    (d.columns||[]).forEach(function(c){
      var sk = (f.sort===c.k);
      h.push('<th style="width:'+(c.w||"auto")+'"'
        +(c.sort===false?"":" class=\""+(sk?"sorted":"")+"\" onclick=\"Ledger.setSort('"+key+"','"+c.k+"')\"")
        +' title="'+(c.sort===false?"":'点击排序')+'">'
        +esc(c.label)+(sk?(f.dir>0?" ▲":" ▼"):"")+'</th>');
    });
    h.push('<th style="width:64px"></th></tr></thead><tbody>');

    vw.forEach(function(o){
      var r = o.r, i = o.i;
      var cls = (d.rowClass ? d.rowClass(r, i) : "") || "";
      h.push('<tr class="'+cls+'">');
      (d.columns||[]).forEach(function(c){
        var v = r[c.k];
        if(c.render){
          h.push('<td'+(c.w?' style="width:'+c.w+'"':'')+'>'+c.render(r, i, c)+'</td>');
        } else if(c.type==="check"){
          h.push('<td style="text-align:center"><input type="checkbox"'
            +((v?" checked":"")+(c.ro?" disabled":""))
            +' onchange="Ledger.setCell(\''+key+'\','+i+',\''+c.k+'\',this.checked)"></td>');
        } else if(c.type==="select"){
          h.push('<td><select'+(c.ro?" disabled":"")+' onchange="Ledger.setCell(\''+key+'\','+i+',\''+c.k+'\',this.value)">'
            +(c.opts||[]).map(function(o2){ return '<option'+(String(v)===String(o2)?" selected":"")+'>'+esc(o2)+'</option>'; }).join("")
            +'</select></td>');
        } else if(c.type==="textarea"){
          h.push('<td><textarea rows="2"'+(c.ro?" readonly":"")+' oninput="Ledger.setCell(\''+key+'\','+i+',\''+c.k+'\',this.value)">'+esc(v)+'</textarea></td>');
        } else {
          h.push('<td><input type="'+(c.type||"text")+'" value="'+esc(v)+'"'
            +(c.type==="number"?' step="any"':'')
            +(c.ro?" readonly":"")
            +(c.ph?' placeholder="'+esc(c.ph)+'"':'')
            +' oninput="Ledger.setCell(\''+key+'\','+i+',\''+c.k+'\',this.value)"></td>');
        }
      });
      h.push('<td style="text-align:center;white-space:nowrap">'
        +'<button class="x" title="复制" onclick="Ledger.dupRow(\''+key+'\','+i+')">⧉</button>'
        +'<button class="x" title="删除" onclick="Ledger.delRow(\''+key+'\','+i+')">×</button>'
        +'</td>');
      h.push('</tr>');
    });
    h.push('</tbody></table></div></div>');
    HOST.innerHTML = h.join("");
  }

  /* ================================================================
     导出
     ================================================================ */
  function exportCsv(key){
    var d = DEFS[key];
    if(!d) return;
    var vw = view(key);
    if(!vw.length){ global.toast("没有可导出的行","warn"); return; }
    var head = (d.columns||[]).map(function(c){ return c.label; });
    var rows = [[d.title], [d.subtitle||""], []];
    rows.push(head);
    vw.forEach(function(o){
      var r = o.r;
      rows.push((d.columns||[]).map(function(c){
        var v = r[c.k];
        if(typeof v==="boolean") return v?"是":"否";
        return v==null?"":v;
      }));
    });
    if(d.exportNote){ rows.push([]); rows.push(["说明", d.exportNote]); }
    global.downloadCsv((d.exportName||d.title)+"_"+today()+".csv", rows);
    global.toast("已导出 "+(d.exportName||d.title));
  }

  function exportWord(key){
    var d = DEFS[key];
    if(!d) return;
    var vw = view(key);
    if(!vw.length){ global.toast("没有可导出的行","warn"); return; }
    var h = [];
    h.push("<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\">");
    h.push("<head><meta charset='utf-8'><title>"+esc(d.title)+"</title><style>");
    h.push("@page{size:A4 landscape;margin:1.2cm 1cm;}");
    h.push("body{font-family:'Microsoft YaHei',SimSun,sans-serif;font-size:9.5pt;line-height:1.5;}");
    h.push("h1{font-size:15pt;text-align:center;margin:0 0 3pt;}");
    h.push("h2{font-size:10.5pt;margin:8pt 0 3pt;}");
    h.push("table{border-collapse:collapse;width:100%;}");
    h.push("td,th{border:0.5pt solid #666;padding:3pt 4pt;vertical-align:top;font-size:8.5pt;}");
    h.push("th{background:#f0f0f0;font-weight:bold;}");
    h.push(".note{font-size:8pt;color:#555;margin-top:6pt;}");
    h.push("</style></head><body>");
    h.push("<h1>"+esc(d.title)+"</h1>");
    if(d.subtitle) h.push("<div style='text-align:center;font-size:9pt;margin-bottom:6pt'>"+esc(d.subtitle)+"</div>");

    if(d.signBlock){
      h.push("<table style='margin-bottom:6pt'><tbody>");
      h.push("<tr><td style='border:0;width:70pt'>项目编号：</td><td style='border:0'>"+esc(d.signBlock.id||"")+"</td>"
        +"<td style='border:0;width:70pt'>项目名称：</td><td style='border:0'>"+esc(d.signBlock.name||"")+"</td></tr>");
      h.push("<tr><td style='border:0'>编制人：</td><td style='border:0'></td>"
        +"<td style='border:0;width:70pt'>日期：</td><td style='border:0'></td></tr>");
      h.push("</tbody></table>");
    }

    h.push("<table><thead><tr>");
    (d.columns||[]).forEach(function(c){ h.push("<th>"+esc(c.label)+"</th>"); });
    h.push("</tr></thead><tbody>");
    vw.forEach(function(o){
      h.push("<tr>");
      (d.columns||[]).forEach(function(c){
        var v = o.r[c.k];
        if(typeof v==="boolean") v = v?"是":"否";
        h.push("<td>"+esc(v==null?"":v)+"</td>");
      });
      h.push("</tr>");
    });
    h.push("</tbody></table>");
    if(d.exportNote) h.push("<p class='note'>"+esc(d.exportNote)+"</p>");
    h.push("<p class='note'>由「食品质量与安全管理系统」导出。本表不含标准正文。</p>");
    h.push("</body></html>");

    var blob = new Blob(["﻿", h.join("\n")], {type:"application/msword;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = (d.exportName||d.title)+"_"+today()+".doc";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    global.toast("已导出 Word，可打印签字");
  }

  function today(){
    var d=new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }

  /* 单个字段的 HTML（卡片式用） */
  function fieldHtml(c, r, i, key, wide){
    var v = r[c.k];
    var on = "Ledger.setCell('"+key+"',"+i+",'"+c.k+"',";
    var h = '<label class="'+(wide?"lg-wide":"")+'"><span class="lfl">'+esc(c.label)+'</span>';
    if(c.type==="check"){
      h += '<input type="checkbox" '+(v?" checked":"")+(c.ro?" disabled":"")
        + ' onchange="'+on+'this.checked)">';
    } else if(c.type==="select"){
      h += '<select '+(c.ro?" disabled":"")+' onchange="'+on+'this.value)">'
        + (c.opts||[]).map(function(o2){
            return '<option'+(String(v)===String(o2)?" selected":"")+'>'+esc(o2)+'</option>'; }).join("")
        + '</select>';
    } else if(c.type==="textarea"){
      h += '<textarea rows="2"'+(c.ro?" readonly":"")+' placeholder="'+esc(c.ph||"")+'"'
        + ' oninput="'+on+'this.value)">'+esc(v)+'</textarea>';
    } else {
      h += '<input type="'+(c.type||"text")+'" value="'+esc(v)+'"'
        + (c.type==="number"?' step="any"':'')
        + (c.ro?" readonly":"")
        + (c.ph?' placeholder="'+esc(c.ph)+'"':'')
        + ' oninput="'+on+'this.value)">';
    }
    h += '</label>';
    return h;
  }

  /* ================================================================
     导入
     ================================================================
     一键导入要解决三件事：
       ① CSV 解析 —— 引号、内嵌逗号、换行、BOM都得对
       ② 列映射 —— 用户填的表头是中文，要对上内部字段
       ③ 别把数据搞坏 —— 导入前先预览，确认了才写
     ================================================================ */

  /* CSV → 二维数组（支持引号包裹、内嵌逗号与换行、双引号转义） */
  function parseCsv(text){
    if(text.charCodeAt(0)===0xFEFF) text = text.slice(1);   // 去 BOM
    var rows = [], row = [], cur = "", inQ = false;
    for(var i=0;i<text.length;i++){
      var c = text.charAt(i);
      if(inQ){
        if(c==='"'){
          if(text.charAt(i+1)==='"'){ cur+='"'; i++; }
          else inQ = false;
        } else cur += c;
      } else {
        if(c==='"') inQ = true;
        else if(c===','){ row.push(cur); cur=""; }
        else if(c==='\r'){ /* 忽略，等 \n */ }
        else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
        else cur += c;
      }
    }
    if(cur!=="" || row.length){ row.push(cur); rows.push(row); }
    return rows.filter(function(r){ return r.length && r.join("").trim()!==""; });
  }

  /* 表头 → 字段 key 的映射
     优先按中文标签精确匹配；匹配不上就按列顺序兜底 */
  function mapColumns(def, header){
    var map = [], used = {};
    header.forEach(function(h, hi){
      var hit = null;
      (def.columns||[]).forEach(function(c){
        if(used[c.k]) return;
        if(c.label === h.trim()){ hit = c.k; }
      });
      if(!hit){
        (def.columns||[]).forEach(function(c){
          if(used[c.k]) return;
          if(c.k === h.trim()) hit = c.k;
        });
      }
      if(hit){ used[hit]=1; map.push({k:hit, idx:hi}); }
      else map.push({k:null, idx:hi});
    });
    return map;
  }

  /* 把二维数组转成行对象 */
  function rowsFromMatrix(def, matrix){
    if(!matrix.length) return [];
    var header = matrix[0];
    var mp = mapColumns(def, header);
    var out = [];
    for(var i=1;i<matrix.length;i++){
      var r = matrix[i];
      var o = {};
      (def.columns||[]).forEach(function(c){ o[c.k] = c.def!==undefined?c.def:(c.type==="number"?0:""); });
      var any = false;
      mp.forEach(function(m){
        if(!m.k) return;
        var v = r[m.idx];
        if(v===undefined) return;
        v = String(v).trim();
        if(v==="") return;
        var c2 = (def.columns||[]).filter(function(x){return x.k===m.k;})[0];
        if(c2 && c2.type==="number"){
          var n = parseFloat(v);
          if(!isNaN(n)){ o[m.k]=n; any=true; }
        } else if(c2 && c2.type==="check"){
          o[m.k] = (v==="是"||v==="true"||v==="1"||v==="✓"); any=true;
        } else { o[m.k]=v; any=true; }
      });
      if(any) out.push(o);
    }
    return out;
  }

  /* 选择文件并导入 */
  function importFile(key, mode){
    var d = DEFS[key];
    if(!d) return;
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".csv,.json,text/csv,application/json";
    inp.onchange = function(){
      var f = inp.files && inp.files[0];
      if(!f) return;
      var rd = new FileReader();
      rd.onload = function(){
        var text = String(rd.result||"");
        var matrix = null;
        if(/\.json$/i.test(f.name)){
          try{
            var obj = JSON.parse(text);
            if(Array.isArray(obj)) matrix = obj;
            else if(obj && Array.isArray(obj.rows)){
              // 备份格式：{title, columns:[...], rows:[{...}]}
              var cols = obj.columns || (def.columns||[]).map(function(c){return c.label;});
              matrix = [cols].concat(obj.rows.map(function(r){
                return (def.columns||[]).map(function(c){ return r[c.k]; });
              }));
            }
          }catch(e){
            global.toast("JSON 解析失败："+e.message,"warn"); return;
          }
        } else {
          matrix = parseCsv(text);
        }
        if(!matrix || matrix.length<2){
          global.toast("文件里没有可导入的数据行","warn"); return;
        }
        previewImport(key, matrix, f.name, mode||"replace");
      };
      rd.readAsText(f, "UTF-8");
    };
    inp.click();
  }

  /* 导入预览：确认后才写 */
  function previewImport(key, matrix, fname, mode){
    var d = DEFS[key];
    var parsed = rowsFromMatrix(d, matrix);
    var mp = mapColumns(d, matrix[0]);
    var matched = mp.filter(function(m){ return m.k; }).length;
    var unmatched = mp.filter(function(m){ return !m.k; }).map(function(m){ return matrix[0][m.idx]; });

    var cur = rows(key);
    var html = `<div style="font-size:13px;line-height:1.8">
      <div><b>文件：</b>${esc(fname)}</div>
      <div><b>解析到 ${parsed.length} 行</b>，当前台账 ${cur.length} 行</div>
      <div><b>列匹配：</b>${matched} / ${mp.length} 列已对上</div>
      ${unmatched.length?`<div style="color:var(--mid)"><b>未匹配的列</b>（导入时忽略）：${esc(unmatched.join("、"))}</div>`:""}
      <div style="margin-top:10px"><b>导入方式：</b></div>
      <div style="margin:6px 0 12px 18px">
        <label style="display:block;margin-bottom:4px">
          <input type="radio" name="impMode" value="replace" checked> <b>覆盖</b> —— 清空现有 ${cur.length} 行，全部换成导入的 ${parsed.length} 行
        </label>
        <label style="display:block">
          <input type="radio" name="impMode" value="append"> <b>追加</b> —— 保留现有 ${cur.length} 行，在后面加上导入的 ${parsed.length} 行
        </label>
      </div>
      <div class="muted" style="font-size:11.5px">导入后会立即落盘到本机，可在「管理后台 → 本机数据」里清空或备份。</div>
    </div>`;

    global.dlg({
      kind:"warn",
      title:"确认导入",
      body: html,
      buttons:[{t:"取消", val:"cancel"}, {t:"确认导入", cls:"pri"}],
      onClose:function(v){
        if(!v) return;
        var m = (document.querySelector('input[name=impMode]:checked')||{}).value || "replace";
        if(m==="replace"){
          CACHE[key] = parsed;
        } else {
          CACHE[key] = cur.concat(parsed);
        }
        save(key);
        render(key);
        global.toast("已导入 " + parsed.length + " 行（" + (m==="replace"?"覆盖":"追加") + "）");
      }
    });
  }

  /* 导出空白模板（只有表头），供用户照着填 */
  function exportTemplate(key){
    var d = DEFS[key];
    if(!d) return;
    var rows = [(d.columns||[]).map(function(c){ return c.label; })];
    global.downloadCsv((d.exportName||d.title)+"_导入模板.csv", rows);
    global.toast("已导出模板：填好后用「导入」读回来");
  }

  /* ================================================================
     联动广播
     ================================================================
     某个台账改了 → 通知关心它的模块刷新。
     联动关系由各模块自己注册：Ledger.on("equip", fn) */
  var LISTENERS = {};
  function on(key, fn){
    (LISTENERS[key] = LISTENERS[key]||[]).push(fn);
  }
  function fire(key){
    (LISTENERS[key]||[]).forEach(function(fn){
      try{ fn(rows(key)); }catch(e){ console.warn("联动失败", key, e); }
    });
  }
  /* save() 里调用 fire */
  var _save = save;
  save = function(key){
    _save(key);
    fire(key);
  };

  /* ================================================================
     导出 API
     ================================================================ */
  global.Ledger = {
    register: register,
    render: render,
    rows: rows,
    save: save,
    setCell: setCell,
    addRow: addRow,
    delRow: delRow,
    dupRow: dupRow,
    setFilter: setFilter,
    setSort: setSort,
    view: view,
    exportCsv: exportCsv,
    exportWord: exportWord,
    importFile: importFile,
    exportTemplate: exportTemplate,
    parseCsv: parseCsv,
    rowsFromMatrix: rowsFromMatrix,
    on: on,
    _defs: DEFS
  };

})(window);
