#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""apply_qw_fixes4.py —— 层别 / 感官 / 5Why / 货架期 / 追溯 / 通用表格 / 清单"""
import io, os, sys

P = os.path.join('prototype', 'workbench.js')
raw = io.open(P, encoding='utf-8', newline='').read()
CRLF = '\r\n' in raw
s = raw.replace('\r\n', '\n')
ORIG_LEN = len(s)
applied = []


def rep(old, new, label):
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
# 通用表格：加导入/导出
# ================================================================
rep(
'''      <div class="sp"></div>
      <button class="btn sm" onclick="QW_addRow('${key}')">+ ${escHtml(cfg.addLabel||"加一行")}</button>
      <button class="btn sm" onclick="QW_copyTable('${key}')">复制表格</button>
    </div>''',
'''      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_addRow('${key}')">+ ${escHtml(cfg.addLabel||"加一行")}</button>
        <button class="btn sm" onclick="QW_importDlg('${key}','table')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_tExport('${key}')">⬇ 导出数据</button>
        <button class="btn sm" onclick="QW_copyTable('${key}')">复制表格</button>
      </div>
    </div>''',
'通用表格 工具条')

rep(
'''function QW_copyTable(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key] || {};
  const cols = cfg.cols||[];
  const txt = [cols.map(c=>c.label).join("\\t")]
    .concat(st.rows.map(r=>cols.map(c=>r[c.key]==null?"":r[c.key]).join("\\t")))
    .join("\\n");
  copyText(txt);
}''',
'''function QW_copyTable(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key] || {};
  const cols = cfg.cols||[];
  const txt = [cols.map(c=>c.label).join("\\t")]
    .concat(st.rows.map(r=>cols.map(c=>r[c.key]==null?"":r[c.key]).join("\\t")))
    .join("\\n");
  copyText(txt);
}
/* 通用表格导出 CSV（表头用中文列名，Excel 直开） */
function QW_tExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key] || {};
  const cols = cfg.cols||[];
  if(!cols.length){ toast("这个表没有可导出的列", "warn"); return; }
  const rows = [cols.map(c=>c.label)]
    .concat(st.rows.map(r=>cols.map(c=>r[c.key]==null?"":r[c.key])));
  QWIO.downloadCsv((cfg.title||"表格")+"_"+QWIO.today()+".csv", rows);
}
/* 通用表格导入：按 cfg.cols 的顺序映射列 */
function QW_tImport(key, m){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key] || {};
  const cols = cfg.cols||[];
  if(!cols.length){ toast("这个表不支持导入", "warn"); return; }
  const tpl = st.rows[0] || {};
  const out = [];
  let start = 0;
  if(m.length>1){
    const f = m[0].map(x=>String(x==null?"":x).trim());
    if(cols.some(c=>f.some(x=>x===c.label))) start = 1;
  }
  for(let i=start;i<m.length;i++){
    const cells = m[i]||[];
    if(!cells.length) continue;
    const row = {};
    let hasVal = false;
    cols.forEach((c,ci)=>{
      let v = cells[ci]==null ? "" : String(cells[ci]).trim();
      if(c.type==="number"){
        const n = parseFloat(v);
        v = isNaN(n) ? "" : n;
      }
      if(v!=="") hasVal = true;
      row[c.key] = v;
    });
    Object.keys(tpl).forEach(k=>{ if(!(k in row)) row[k] = tpl[k]; });
    if(hasVal) out.push(row);
  }
  if(!out.length){ toast("没识别到数据行", "warn"); return; }
  st.rows = out;
  QW_render(key);
  toast("已导入 "+out.length+" 行");
}''',
'通用表格 导入导出函数')

# ================================================================
# 清单：加导出
# ================================================================
rep(
'''      <div class="sp"></div>
      <button class="btn sm" onclick="QW_copyChecklist('${key}')">复制核查表</button>
    </div>''',
'''      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_clExport('${key}')">⬇ 导出核查表</button>
        <button class="btn sm" onclick="QW_copyChecklist('${key}')">复制核查表</button>
      </div>
    </div>''',
'清单 导出按钮')

rep(
'''function QW_copyChecklist(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const txt = st.items.map((it,i)=>
    `${i+1}. ${it.t}\\t${it.r||"—"}${it.note?"\\t"+it.note:""}${it.act?"\\t"+it.act:""}`
  ).join("\\n");
  copyText(txt);
}''',
'''function QW_copyChecklist(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const txt = st.items.map((it,i)=>
    `${i+1}. ${it.t}\\t${it.r||"—"}${it.note?"\\t"+it.note:""}${it.act?"\\t"+it.act:""}`
  ).join("\\n");
  copyText(txt);
}
/* 核查表导出 CSV —— 拿去打印签字或发整改通知 */
function QW_clExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const out = [["序号","检查项目","判定", cfg.noteLabel||"问题描述", cfg.needAction||"整改要求"]];
  st.items.forEach((it,i)=>{
    out.push([i+1, it.t||"", it.r||"", it.note||"", it.act||""]);
  });
  QWIO.downloadCsv((cfg.title||"核查表")+"_"+QWIO.today()+".csv", out);
}''',
'清单 导出函数')

# ================================================================
# 层别：加导入导出 + 删除行
# ================================================================
rep(
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"层别分析")}</b>
      <div class="sp"></div>
      <label class="qwl">分层维度
        <select onchange="QW_stSetDim('${key}',this.value)">
          ${(cfg.dims||[]).map(d=>`<option ${d===st.dim?"selected":""}>${escHtml(d)}</option>`).join("")}
        </select></label>
    </div>''',
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"层别分析")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_importDlg('${key}','strata')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_stExport('${key}')">⬇ 导出数据</button>
      </div>
      <label class="qwl">分层维度
        <select onchange="QW_stSetDim('${key}',this.value)">
          ${(cfg.dims||[]).map(d=>`<option ${d===st.dim?"selected":""}>${escHtml(d)}</option>`).join("")}
        </select></label>
    </div>''',
'层别 工具条')

rep(
'''      <thead><tr><th style="width:110px">维度</th><th style="width:130px">分组</th>
        <th style="width:80px">样本数</th><th style="width:80px">合格数</th></tr></thead>
      <tbody>
      ${st.rows.map((r,i)=>`<tr>
        <td><select onchange="QW_stSet('${key}',${i},'dim',this.value)">
          ${(cfg.dims||[]).map(d=>`<option ${d===r.dim?"selected":""}>${escHtml(d)}</option>`).join("")}</select></td>
        <td><input type="text" value="${escHtml(r.grp)}" oninput="QW_stSet('${key}',${i},'grp',this.value)"></td>
        <td><input type="number" value="${r.n}" oninput="QW_stSet('${key}',${i},'n',this.value)"></td>
        <td><input type="number" value="${r.ok}" oninput="QW_stSet('${key}',${i},'ok',this.value)"></td>
      </tr>`).join("")}''',
'''      <thead><tr><th style="width:110px">维度</th><th style="width:130px">分组</th>
        <th style="width:80px">样本数</th><th style="width:80px">合格数</th><th style="width:34px"></th></tr></thead>
      <tbody>
      ${st.rows.map((r,i)=>`<tr>
        <td><select onchange="QW_stSet('${key}',${i},'dim',this.value)">
          ${(cfg.dims||[]).map(d=>`<option ${d===r.dim?"selected":""}>${escHtml(d)}</option>`).join("")}</select></td>
        <td><input type="text" value="${escHtml(r.grp)}" oninput="QW_stSet('${key}',${i},'grp',this.value)"></td>
        <td><input type="number" value="${r.n}" oninput="QW_stSet('${key}',${i},'n',this.value)"></td>
        <td><input type="number" value="${r.ok}" oninput="QW_stSet('${key}',${i},'ok',this.value)"></td>
        <td><button class="x" title="删除这一行" onclick="QW_stDel('${key}',${i})">×</button></td>
      </tr>`).join("")}''',
'层别 原始数据表删除列')

rep(
'''function QW_stSetDim(key,v){ QWD[key].dim = v; QW_render(key); }''',
'''function QW_stSetDim(key,v){ QWD[key].dim = v; QW_render(key); }
function QW_stDel(key,i){
  const st=QWD[key]; if(!st) return;
  if(i<0 || i>=st.rows.length) return;
  const name = st.rows[i].grp || ("第"+(i+1)+"行");
  window.Guard.ask("确定删除这一行？<br><b style='color:var(--ink)'>"+window.Guard.esc(String(name))+"</b>", {
    onOk:function(){ st.rows.splice(i,1); QW_render(key); }
  });
}
/* 层别导入：四列（维度/分组/样本数/合格数），也兼容三列 */
function QW_stImport(key, m){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const dims = cfg.dims||[];
  const rows = [];
  for(let i=0;i<m.length;i++){
    const c = (m[i]||[]).map(x=>String(x==null?"":x).trim());
    if(!c.length) continue;
    const dim = c[0], grp = c[1];
    const n = parseFloat(c[2]), ok = parseFloat(c[3]);
    if(i===0 && isNaN(n)) continue;
    if(isNaN(n)) continue;
    const d = (dim && dims.indexOf(dim)>=0) ? dim : st.dim;
    rows.push({dim:d, grp: grp||("组"+(rows.length+1)), n:n, ok: isNaN(ok)?0:ok});
  }
  if(!rows.length){ toast("没识别到数据（需要「维度 / 分组 / 样本数 / 合格数」）", "warn"); return; }
  st.rows = rows;
  QW_render(key);
  toast("已导入 "+rows.length+" 行");
}
function QW_stExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const out = [["维度","分组","样本数","合格数","合格率%"]];
  st.rows.forEach(r=>{
    const rate = (+r.n>0) ? (+r.ok/+r.n*100).toFixed(1) : "0.0";
    out.push([r.dim||"", r.grp||"", r.n||0, r.ok||0, rate]);
  });
  QWIO.downloadCsv((cfg.title||"层别分析")+"_"+QWIO.today()+".csv", out);
}''',
'层别 导入导出删除函数')

# ================================================================
# 5Why：改链条要重绘（死胡同判定实时更新）+ 导出
# ================================================================
rep(
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"5Why")}</b>
      <div class="sp"></div>
      <span class="muted">${escHtml(cfg.stopHint||"")}</span></div>''',
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"5Why")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_whyExport('${key}')">⬇ 导出</button>
      </div>
      <span class="muted">${escHtml(cfg.stopHint||"")}</span></div>''',
'5Why 导出按钮')

rep(
'''function QW_whySet(key,col,v){
  const st = QWD[key]; if(!st) return;
  st[col] = v;
  if(col==="problem" || col==="spread") QW_render(key);
}
function QW_whySetItem(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  st.chain[i][col] = v;
}''',
'''function QW_whySet(key,col,v){
  const st = QWD[key]; if(!st) return;
  st[col] = v;
  QW_render(key);
}
function QW_whySetItem(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  st.chain[i][col] = v;
  /* ★ 2026-11-04：原来改链条不重绘 → 「死胡同」和「最后一层可整改」两条
     判定永远停在初始状态，用户写完看到的是过期提示，等于没提示。
     现在改任何一格都重绘，判定实时更新。 */
  QW_render(key);
}
/* 5Why 导出 */
function QW_whyExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const out = [["层","问题/为什么","证据","验证方式"]];
  (st.chain||[]).forEach((c,i)=>{
    out.push([i===0?"问题":("为什么 "+i), c.why||"", c.evi||"", c.veri||""]);
  });
  if(st.spread) out.push([],["横向展开", st.spread]);
  QWIO.downloadCsv((cfg.title||"5Why")+"_"+QWIO.today()+".csv", out);
}''',
'5Why 联动修复+导出')

io.open(P, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if CRLF else s)
print('本轮已应用:')
for a in applied:
    print('  ✓', a)
print('文件长度 %d → %d' % (ORIG_LEN, len(s)))
