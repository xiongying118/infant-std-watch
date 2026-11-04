#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 2026-11-04 的「工具工作台可编辑/可联动/可交付」改动，
一次性写入 prototype/workbench.js。

★ 为什么用脚本而不是逐个 Edit ★
   上一轮用 Edit 改完后，又用 Python 脚本做批量替换，
   脚本的字符串扫描逻辑有 bug，把文件从第 413 行到末尾整段吞掉了，
   1139 行 → 429 行，损失约 1200 行代码，只能从 GitHub 远端拉回基线重建。
   → 这次所有替换都用**唯一锚点 + 精确整段匹配**，且每一步都断言成功，
     失败立即退出，绝不留下半截文件。

用法：python scripts/apply_qw_fixes.py
"""
import io, os, sys

P = os.path.join('prototype', 'workbench.js')
raw = io.open(P, encoding='utf-8', newline='').read()

# ★ 关键：源文件可能是 CRLF 也可能是 LF。
#   锚点里的换行统一写成 \n，匹配前把源文件归一化成 LF，
#   写回时再还原成原来的换行符 —— 否则永远匹配不上。
CRLF = '\r\n' in raw
s = raw.replace('\r\n', '\n')
ORIG_LEN = len(s)
applied = []


def rep(old, new, label):
    """精确整段替换。找不到就报错退出，绝不静默跳过。"""
    global s
    old = old.replace('\r\n', '\n')
    new = new.replace('\r\n', '\n')
    n = s.count(old)
    if n != 1:
        print('!! %s: 锚点出现 %d 次（应为 1 次）' % (label, n))
        sys.exit(1)
    s = s.replace(old, new, 1)
    applied.append(label)


# ================================================================
# 1. 引入公共数值序列编辑器 + 解析函数
# ================================================================
rep(
'''/* ------------------------------------------------------------
   帕累托图
   ------------------------------------------------------------ */
function QW_pareto(key, cfg){''',
'''/* ================================================================
   公共：数值序列编辑器（SPC / 直方图 共用）
   ================================================================
   2026-11-04 用户反馈：「SPC等图改数据也是死的」
   真凶：QW_spcEdit 只设了 st.edit=true，而 QW_spc() 渲染时
        **从头到尾没读过 st.edit** → 按钮点了等于没点。
   现在真正实现：编辑态下展开可增删改的数据表 + 导入/导出 + 图复制，
   改任何一个数，控制限、直方图、失控判定全部实时重算。

   数据结构统一成 st.data = [数值, ...]（不是字符串），
   导入时可接受 "3.2, 3.4\\n3.5 3.6" 这类粘贴内容。
   ================================================================ */

/* 把一段文本解析成数字数组（容忍逗号/空格/换行/中文逗号/百分号） */
function QW_parseNums(text){
  if(Array.isArray(text)) return text.map(Number).filter(x=>!isNaN(x));
  return String(text==null?"":text)
    .split(/[,，;；\\s\\n\\r\\t]+/)
    .map(s=>s.replace(/[^\\d.\\-+]/g,""))
    .filter(s=>s!=="" && s!=="-" && s!=="+" && s!==".")
    .map(Number)
    .filter(x=>!isNaN(x));
}

/* 数值序列的数据表（编辑器里那张可增删改的表） */
function QW_numGrid(key, title, hint){
  const st = QWD[key];
  const d = (st && st.data) || [];
  const rows = d.map((v,i)=>`<tr>
      <td class="num" style="width:44px">${i+1}</td>
      <td><input type="number" step="any" value="${escHtml(v)}"
           oninput="QW_numSet('${key}',${i},this.value)"></td>
    </tr>`).join("");
  return `<div class="qwio-grid">
    <div class="qwio-gh"><b>${escHtml(title||"数据点")}</b>
      <span class="muted">${d.length} 个</span>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_numAdd('${key}')">+ 加一个</button>
      <button class="btn sm" onclick="QW_importDlg('${key}','num')">⬆ 导入数据</button>
      <button class="btn sm" onclick="QW_numExport('${key}')">⬇ 导出数据</button>
    </div>
    <div class="qwio-gw"><table class="qwt-tbl">
      <thead><tr><th>序号</th><th>数值</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2" class="muted" style="text-align:center;padding:12px">还没有数据，点「导入数据」或「+ 加一个」</td></tr>'}</tbody>
    </table></div>
    ${hint?`<div class="qwfoot" style="padding:6px 12px">${hint}</div>`:""}
  </div>`;
}
function QW_numSet(key,i,v){
  const st=QWD[key]; if(!st) return;
  const n = parseFloat(v);
  st.data[i] = isNaN(n) ? "" : n;
  QW_render(key);
}
function QW_numAdd(key){
  const st=QWD[key]; if(!st) return;
  st.data = (st.data||[]).slice();
  st.data.push("");
  QW_render(key);
}
function QW_numImport(key, m){
  const st=QWD[key]; if(!st) return;
  const nums = QWIO.flattenNumbers(m);
  if(!nums.length){ toast("没有识别到数字", "warn"); return; }
  st.data = nums;
  st.edit = true;
  QW_render(key);
  toast("已导入 "+nums.length+" 个数据点");
}
function QW_numExport(key){
  const st=QWD[key]; if(!st) return;
  const d = (st.data||[]).map(x=>parseFloat(x)).filter(x=>!isNaN(x));
  if(!d.length){ toast("没有可导出的数据", "warn"); return; }
  const rows = [["序号","数值"]].concat(d.map((v,i)=>[i+1, v]));
  QWIO.downloadCsv((QW_CFG[key]&&QW_CFG[key].title||"数值序列")+"_"+QWIO.today()+".csv", rows);
}

/* ------------------------------------------------------------
   帕累托图
   ------------------------------------------------------------ */
function QW_pareto(key, cfg){''',
'公共数值序列编辑器')

# ================================================================
# 2. 帕累托：导入/导出/删除 + 焦点保持 + data-pi
# ================================================================
rep(
'''      <div class="sp"></div>
      <button class="btn sm" onclick="QW_addRow('${key}')">+ 加一项</button>
    </div>
    <div class="qwt-cols2">
      <div>
        <div class="qwt-wrap">
        <table class="qwt-tbl">
          <thead><tr><th>类别</th><th style="width:70px">次数</th>
            <th style="width:66px">占比%</th><th style="width:66px">累计%</th>
            <th style="width:52px">梯队</th></tr></thead>
          <tbody>
          ${rows.map((r,i)=>`<tr class="${r.tier==="A"?"warn":""}">
            <td><input type="text" value="${escHtml(r.cat)}" oninput="QW_pSet('${key}',${st.rows.indexOf(r)},'cat',this.value)"></td>
            <td><input type="number" value="${r.n}" oninput="QW_pSet('${key}',${st.rows.indexOf(r)},'n',this.value)"></td>
            <td class="num">${r.pct.toFixed(1)}</td>
            <td class="num">${r.cum.toFixed(1)}</td>
            <td><span class="tier tier${r.tier}">${r.tier}</span></td>
          </tr>`).join("")}''',
'''      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_addRow('${key}')">+ 加一项</button>
        <button class="btn sm" onclick="QW_importDlg('${key}','pareto')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_pExport('${key}')">⬇ 导出数据</button>
        <button class="btn sm" onclick="QWIO.copySvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"帕累托图")}')">📋 复制图</button>
        <button class="btn sm" onclick="QWIO.downloadSvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"帕累托图")}')">⬇ 下载图</button>
      </div>
    </div>
    <div class="qwt-cols2">
      <div>
        <div class="qwt-wrap">
        <table class="qwt-tbl">
          <thead><tr><th>类别</th><th style="width:70px">次数</th>
            <th style="width:66px">占比%</th><th style="width:66px">累计%</th>
            <th style="width:52px">梯队</th><th style="width:34px"></th></tr></thead>
          <tbody>
          ${rows.map((r,i)=>`<tr class="${r.tier==="A"?"warn":""}">
            <td><input type="text" data-pi="${st.rows.indexOf(r)}" value="${escHtml(r.cat)}" oninput="QW_pSet('${key}',${st.rows.indexOf(r)},'cat',this.value)"></td>
            <td><input type="number" data-pi="${st.rows.indexOf(r)}" value="${r.n}" oninput="QW_pSet('${key}',${st.rows.indexOf(r)},'n',this.value)"></td>
            <td class="num">${r.pct.toFixed(1)}</td>
            <td class="num">${r.cum.toFixed(1)}</td>
            <td><span class="tier tier${r.tier}">${r.tier}</span></td>
            <td><button class="x" title="删除这一项" onclick="QW_pDel('${key}',${st.rows.indexOf(r)})">×</button></td>
          </tr>`).join("")}''',
'帕累托工具条+删除列')

rep(
'''        <svg class="qwsvg" viewBox="0 0 ${W} ${H}">
          ${[0,25,50,75,100].map(p=>{''',
'''        <svg class="qwsvg" id="${svgId}" viewBox="0 0 ${W} ${H}">
          ${[0,25,50,75,100].map(p=>{''',
'帕累托 svg id')

rep(
'''  const cumPts = rows.map((r,i)=>
    `${(PL + bw*i + bw/2).toFixed(1)},${(PT + ih - ih*r.cum/100).toFixed(1)}`).join(" ");''',
'''  const cumPts = rows.map((r,i)=>
    `${(PL + bw*i + bw/2).toFixed(1)},${(PT + ih - ih*r.cum/100).toFixed(1)}`).join(" ");
  const svgId = "qwsvg_pareto_"+key;''',
'帕累托 svgId 变量')

rep(
'''function QW_pSet(key,i,col,v){
  const st = QWD[key]; if(!st) return;
  st.rows[i][col] = (col==="n") ? (parseFloat(v)||0) : v;
  QW_render(key);
}''',
'''function QW_pSet(key,i,col,v){
  const st = QWD[key]; if(!st) return;
  if(i<0 || i>=st.rows.length) return;
  st.rows[i][col] = (col==="n") ? (parseFloat(v)||0) : v;
  /* ★ 关键：表格按「次数」排序渲染 → 改一次数字，整张表行序就变了，
     用户正在编辑的那一行会跳走 → 焦点丢失、看着像抽风。
     解法：记住正在编辑的行，渲染后把焦点还给同一个输入框。 */
  const host = document.querySelector(".view:not(.hide) [data-qw-host]");
  const idx = st.rows.indexOf(st.rows[i]);
  QW_render(key);
  if(host){
    const target = host.querySelector("[data-pi='"+idx+"']");
    if(target){ try{ target.focus(); }catch(e){} }
  }
}
/* 帕累托导入：两列（类别、次数），也兼容一列 */
function QW_pImport(key, m){
  const st = QWD[key]; if(!st) return;
  const rows = [];
  for(let i=0;i<m.length;i++){
    const cells = m[i]||[];
    const cat = String(cells[0]==null?"":cells[0]).trim();
    const numStr = String(cells[1]==null?"":cells[1]).trim();
    const n = parseFloat(numStr);
    if(!isNaN(n)){
      rows.push({cat: cat || ("项"+(i+1)), n:n});
    } else if(cat && !/^(类别|category|项目|名称)$/i.test(cat)){
      rows.push({cat:cat, n:1});
    }
  }
  if(!rows.length){ toast("没识别到数据（需要「类别」和「次数」两列）", "warn"); return; }
  st.rows = rows;
  QW_render(key);
  toast("已导入 "+rows.length+" 项");
}
function QW_pExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const rows = st.rows.slice().sort((a,b)=>(b.n||0)-(a.n||0));
  const total = rows.reduce((s,r)=>s+(r.n||0),0)||1;
  let cum=0;
  const out = [["排名","类别","次数","占比%","累计%","梯队"]];
  rows.forEach((r,i)=>{
    const pct=(r.n||0)/total*100; cum+=pct;
    const tier = cum<=80?"A":(cum<=95?"B":"C");
    out.push([i+1, r.cat||"", r.n||0, pct.toFixed(1), cum.toFixed(1), tier]);
  });
  out.push([]);
  out.push(["合计","",total,"100.0","",""]);
  QWIO.downloadCsv((cfg.title||"帕累托分析")+"_"+QWIO.today()+".csv", out);
}
function QW_pDel(key,i){
  const st = QWD[key]; if(!st) return;
  if(i<0 || i>=st.rows.length) return;
  const name = st.rows[i].cat || ("第"+(i+1)+"项");
  window.Guard.ask("确定删除这一项？<br><b style='color:var(--ink)'>"+window.Guard.esc(String(name))+"</b>", {
    onOk:function(){ st.rows.splice(i,1); QW_render(key); }
  });
}''',
'帕累托 set/import/export/del')

io.open(P, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if CRLF else s)
print('本轮已应用:')
for a in applied:
    print('  ✓', a)
print('文件长度 %d → %d（换行符 %s）' % (ORIG_LEN, len(s), 'CRLF' if CRLF else 'LF'))
