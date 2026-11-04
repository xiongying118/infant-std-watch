#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""apply_qw_fixes5.py —— 货架期 / 追溯 / 感官 / 流程"""
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
# 货架期：样品行本来完全没有输入框（死数据）→ 改成可编辑 + 导入导出
# ================================================================
rep(
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"货架期")}</b>
      <div class="sp"></div>
      <span class="muted">限值 ${limit}（过氧化值）</span></div>''',
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"货架期")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_shAdd('${key}')">+ 加一行</button>
        <button class="btn sm" onclick="QW_importDlg('${key}','shelf')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_shelfExport('${key}')">⬇ 导出数据</button>
      </div>
      <span class="muted">限值 ${limit}（过氧化值）</span></div>''',
'货架期 工具条')

rep(
'''    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr><th>温度℃</th><th>周数</th><th>过氧化值</th><th>感官</th><th>判定</th></tr></thead>
      <tbody>
      ${S.slice().sort((a,b)=>a.temp-b.temp||a.weeks-b.weeks).map(s=>{
        const bad = parseFloat(s.vp)>limit || s.sens!=="正常";
        return `<tr class="${bad?"bad":""}">
          <td class="num">${s.temp}</td><td class="num">${s.weeks}</td>
          <td class="num">${s.vp}</td><td>${escHtml(s.sens)}</td>
          <td><span class="vd ${bad?"bad":"ok"}">${bad?"劣变":"正常"}</span></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
    </div>''',
'''    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr><th style="width:80px">温度℃</th><th style="width:70px">周数</th>
        <th style="width:90px">过氧化值</th><th style="width:110px">感官</th>
        <th style="width:80px">判定</th><th style="width:34px"></th></tr></thead>
      <tbody>
      ${S.slice().sort((a,b)=>a.temp-b.temp||a.weeks-b.weeks).map(s=>{
        const bad = parseFloat(s.vp)>limit || s.sens!=="正常";
        const si = S.indexOf(s);
        return `<tr class="${bad?"bad":""}">
          <td class="num"><input type="number" step="any" value="${s.temp}"
            oninput="QW_shSet('${key}',${si},'temp',this.value)"></td>
          <td class="num"><input type="number" step="any" value="${s.weeks}"
            oninput="QW_shSet('${key}',${si},'weeks',this.value)"></td>
          <td class="num"><input type="number" step="any" value="${s.vp}"
            oninput="QW_shSet('${key}',${si},'vp',this.value)"></td>
          <td><select onchange="QW_shSet('${key}',${si},'sens',this.value)">
            <option ${s.sens==="正常"?"selected":""}>正常</option>
            <option ${s.sens!=="正常"?"selected":""}>${escHtml(s.sens||"异常")}</option>
          </select></td>
          <td><span class="vd ${bad?"bad":"ok"}">${bad?"劣变":"正常"}</span></td>
          <td><button class="x" title="删除这一行" onclick="QW_shDel('${key}',${si})">×</button></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
    </div>''',
'货架期 数据表可编辑')

rep(
'''    <div class="qwfoot">★ 加速结论必须被实时留样数据支持 ★ 两者不一致时，以实时留样为准。<br>
      另：保质期是「在标示储存条件下」才成立，条件要写清（温度、避光、干燥）。</div>
  </div>`;
}''',
'''    <div class="qwfoot">★ 加速结论必须被实时留样数据支持 ★ 两者不一致时，以实时留样为准。<br>
      另：保质期是「在标示储存条件下」才成立，条件要写清（温度、避光、干燥）。</div>
  </div>`;
}
/* 货架期的样品行可编辑（原来完全是死数据，一个输入框都没有） */
function QW_shSet(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  const s = (st.samples||[])[i]; if(!s) return;
  if(col==="temp"||col==="weeks"||col==="vp") s[col] = parseFloat(v)||0;
  else s[col] = v;
  QW_render(key);
}
function QW_shAdd(key){
  const st=QWD[key]; if(!st) return;
  st.samples = st.samples||[];
  st.samples.push({temp:25, weeks:0, vp:0, sens:"正常"});
  QW_render(key);
}
function QW_shDel(key,i){
  const st=QWD[key]; if(!st) return;
  if(i<0 || i>=(st.samples||[]).length) return;
  window.Guard.ask("确定删除这一行试验数据？", {
    onOk:function(){ st.samples.splice(i,1); QW_render(key); }
  });
}
function QW_shImport(key, m){
  const st=QWD[key]; if(!st) return;
  const rows = [];
  for(let i=0;i<m.length;i++){
    const c = (m[i]||[]).map(x=>String(x==null?"":x).trim());
    if(!c.length) continue;
    const temp = parseFloat(c[0]), weeks = parseFloat(c[1]), vp = parseFloat(c[2]);
    if(isNaN(temp)) continue;
    if(i===0 && isNaN(weeks)) continue;
    rows.push({temp:temp, weeks: isNaN(weeks)?0:weeks, vp: isNaN(vp)?0:vp,
                sens: c[3] || "正常"});
  }
  if(!rows.length){ toast("没识别到数据（需要「温度 / 周数 / 过氧化值 / 感官」）", "warn"); return; }
  st.samples = rows;
  QW_render(key);
  toast("已导入 "+rows.length+" 行");
}
function QW_shelfExport(key){
  const st=QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const limit = parseFloat(st.limit)||2.0;
  const out = [["温度℃","周数","过氧化值","感官","判定"]];
  (st.samples||[]).slice().sort((a,b)=>a.temp-b.temp||a.weeks-b.weeks).forEach(s=>{
    const bad = parseFloat(s.vp)>limit || s.sens!=="正常";
    out.push([s.temp, s.weeks, s.vp, s.sens||"", bad?"劣变":"正常"]);
  });
  QWIO.downloadCsv((cfg.title||"货架期试验")+"_"+QWIO.today()+".csv", out);
}''',
'货架期 编辑导入导出函数')

# ================================================================
# 追溯：链条可编辑 + 导出
# ================================================================
rep(
'''      <span class="muted">正向 + 反向都要能查</span></div>''',
'''      <span class="muted">正向 + 反向都要能查</span>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_trExport('${key}')">⬇ 导出</button>
      </div>
    </div>''',
'追溯 导出按钮')

rep(
'''          ${(fw.chain||[]).map(c=>`
            <div class="qwtr">
              <div class="qwtr-l ${c.level==="成品批"?"l1":(c.level==="过程批"?"l2":"l3")}">${escHtml(c.level)}</div>
              <div class="qwtr-b"><b>${escHtml(c.no)}</b>
                <div class="muted" style="font-size:11.5px">${escHtml(c.info||"")}</div></div>
            </div>`).join("")}''',
'''          ${(fw.chain||[]).map((c,i)=>`
            <div class="qwtr">
              <div class="qwtr-l ${c.level==="成品批"?"l1":(c.level==="过程批"?"l2":"l3")}">${escHtml(c.level)}</div>
              <div class="qwtr-b">
                <input type="text" value="${escHtml(c.no)}" style="font-weight:700;width:100%"
                  oninput="QW_trChain('${key}',${i},'no',this.value)">
                <input type="text" value="${escHtml(c.info||"")}"
                  style="width:100%;margin-top:3px;font-size:11.5px;color:var(--ink3);border:1px solid transparent;background:transparent;border-radius:4px;padding:2px 5px"
                  oninput="QW_trChain('${key}',${i},'info',this.value)">
              </div>
            </div>`).join("")}''',
'追溯 反向链条可编辑')

rep(
'''          ${(bk.products||[]).map(p=>`
            <div class="qwtr">
              <div class="qwtr-l l1">成品批</div>
              <div class="qwtr-b"><b>${escHtml(p.no)}</b>
                <div class="muted" style="font-size:11.5px">${escHtml(p.qty)} · ${escHtml(p.cust)}</div></div>
            </div>`).join("")}''',
'''          ${(bk.products||[]).map((p,i)=>`
            <div class="qwtr">
              <div class="qwtr-l l1">成品批</div>
              <div class="qwtr-b">
                <input type="text" value="${escHtml(p.no)}" style="font-weight:700;width:100%"
                  oninput="QW_trProd('${key}',${i},'no',this.value)">
                <input type="text" value="${escHtml(p.qty)}" style="width:45%"
                  oninput="QW_trProd('${key}',${i},'qty',this.value)">
                <input type="text" value="${escHtml(p.cust)}" style="width:50%;margin-top:3px;font-size:11.5px;color:var(--ink3);border:1px solid transparent;background:transparent;border-radius:4px;padding:2px 5px"
                  oninput="QW_trProd('${key}',${i},'cust',this.value)">
              </div>
            </div>`).join("")}''',
'追溯 正向产品可编辑')

rep(
'''function QW_trSet(key,col,v){ QWD[key][col]=v; }''',
'''function QW_trSet(key,col,v){ QWD[key][col]=v; }
/* 追溯链条可编辑（原来批号和链条全是死的静态数据） */
function QW_trChain(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  const c = ((st.forward||{}).chain||[])[i]; if(!c) return;
  c[col] = v;
  QW_render(key);
}
function QW_trProd(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  const p = ((st.backward||{}).products||[])[i]; if(!p) return;
  p[col] = v;
  QW_render(key);
}
function QW_trExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const out = [["方向","层级/类型","批号","数量","客户/说明"]];
  ((st.forward||{}).chain||[]).forEach(c=>{
    out.push(["反向（成品→原料）", c.level||"", c.no||"", "", c.info||""]);
  });
  ((st.backward||{}).products||[]).forEach(p=>{
    out.push(["正向（原料→成品）", "成品批", p.no||"", p.qty||"", p.cust||""]);
  });
  QWIO.downloadCsv((cfg.title||"批次追溯")+"_"+QWIO.today()+".csv", out);
}''',
'追溯 编辑导出函数')

# ================================================================
# 感官：「+ 加样品」原来调 QW_addRow → 读 st.rows → 直接抛异常
# ================================================================
rep(
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"感官评价")}</b>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_addRow('${key}')">+ 加样品</button></div>''',
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"感官评价")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_snAdd('${key}')">+ 加样品</button>
        <button class="btn sm" onclick="QW_importDlg('${key}','sensory')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_snExport('${key}')">⬇ 导出数据</button>
      </div>
    </div>''',
'感官 工具条')

rep(
'''      <thead><tr><th style="width:110px">样品</th>
        ${dims.map(d=>`<th style="width:78px">${escHtml(d)}</th>`).join("")}
        <th style="width:82px">均值</th><th style="width:82px">标准差</th></tr></thead>
      <tbody>
      ${all.map((x,si)=>`<tr>
        <td><input type="text" value="${escHtml(x.sc.sample)}"
          oninput="QW_snSet('${key}',${si},'sample',this.value)"></td>
        ${dims.map((d,di)=>`<td><input type="number" step="0.1" min="1" max="5" value="${x.sc.scores[di]}"
          oninput="QW_snScore('${key}',${si},${di},this.value)"></td>`).join("")}
        <td class="num">${x.total.toFixed(2)}</td>
        <td class="num">${x.s.sd.toFixed(2)}</td>
      </tr>`).join("")}''',
'''      <thead><tr><th style="width:110px">样品</th>
        ${dims.map(d=>`<th style="width:78px">${escHtml(d)}</th>`).join("")}
        <th style="width:82px">均值</th><th style="width:82px">标准差</th><th style="width:34px"></th></tr></thead>
      <tbody>
      ${all.map((x,si)=>`<tr>
        <td><input type="text" value="${escHtml(x.sc.sample)}"
          oninput="QW_snSet('${key}',${si},'sample',this.value)"></td>
        ${dims.map((d,di)=>`<td><input type="number" step="0.1" min="1" max="5" value="${x.sc.scores[di]}"
          oninput="QW_snScore('${key}',${si},${di},this.value)"></td>`).join("")}
        <td class="num">${x.total.toFixed(2)}</td>
        <td class="num">${x.s.sd.toFixed(2)}</td>
        <td><button class="x" title="删除这个样品" onclick="QW_snDel('${key}',${si})">×</button></td>
      </tr>`).join("")}''',
'感官 表格删除列')

rep(
'''function QW_snSet(key,si,col,v){ QWD[key].samples[si][col]=v; }
function QW_snScore(key,si,di,v){ QWD[key].samples[si].scores[di]=parseFloat(v)||0; QW_render(key); }''',
'''/* ★ 感官的数据在 st.samples，不是 st.rows ★
   原来这里调 QW_addRow（它读 st.rows）→ st.rows 是 undefined → 直接抛异常。
   按钮一点就崩，等于死的。 */
function QW_snAdd(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const dims = cfg.dims||[];
  st.samples.push({sample:"样品"+(st.samples.length+1), scores:dims.map(()=>3)});
  QW_render(key);
}
function QW_snDel(key,si){
  const st = QWD[key]; if(!st) return;
  if(si<0 || si>=st.samples.length) return;
  const name = st.samples[si].sample || ("第"+(si+1)+"个样品");
  window.Guard.ask("确定删除这个样品？<br><b style='color:var(--ink)'>"+window.Guard.esc(String(name))+"</b>", {
    onOk:function(){ st.samples.splice(si,1); QW_render(key); }
  });
}
function QW_snImport(key, m){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const dims = cfg.dims||[];
  const rows = [];
  for(let i=0;i<m.length;i++){
    const cells = (m[i]||[]).map(c=>String(c==null?"":c).trim());
    if(!cells.length || !cells[0]) continue;
    const scores = cells.slice(1).map(v=>parseFloat(v)).filter(v=>!isNaN(v));
    if(i===0 && !scores.length && dims.length) continue;
    const sc = [];
    for(let k=0;k<dims.length;k++) sc.push(scores[k]==null?0:scores[k]);
    rows.push({sample:cells[0], scores:sc});
  }
  if(!rows.length){ toast("没识别到数据（第一列样品名，后面是各维度打分）", "warn"); return; }
  st.samples = rows;
  QW_render(key);
  toast("已导入 "+rows.length+" 个样品");
}
function QW_snExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const dims = cfg.dims||[];
  const out = [["样品"].concat(dims).concat(["均值","标准差"])];
  st.samples.forEach(sc=>{
    const arr = sc.scores.map(Number).filter(x=>!isNaN(x));
    const mean = arr.reduce((a,b)=>a+b,0)/(arr.length||1);
    const sd = Math.sqrt(arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(arr.length-1||1));
    out.push([sc.sample||""].concat(sc.scores).concat([mean.toFixed(2), sd.toFixed(2)]));
  });
  QWIO.downloadCsv((cfg.title||"感官评价")+"_"+QWIO.today()+".csv", out);
}
function QW_snSet(key,si,col,v){ QWD[key].samples[si][col]=v; }
function QW_snScore(key,si,di,v){ QWD[key].samples[si].scores[di]=parseFloat(v)||0; QW_render(key); }''',
'感官 加样品修复+导入导出')

# ================================================================
# 流程：加导出
# ================================================================
rep(
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"流程")}</b>
      <div class="sp"></div>
      <span class="muted">${ph.length} 个环节</span></div>''',
'''    <div class="qwt-h"><b>${escHtml(cfg.title||"流程")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_flowExport('${key}')">⬇ 导出</button>
      </div>
      <span class="muted">${ph.length} 个环节</span></div>''',
'流程 导出按钮')

rep(
'''function QW_flowSet(key,k,v){ QWD[key].vals[k] = v; }''',
'''function QW_flowSet(key,k,v){ QWD[key].vals[k] = v; }
/* 流程导出：把所有环节的字段值摊平成一张表 */
function QW_flowExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const ph = cfg.phases||[];
  const out = [["环节","字段","内容"]];
  ph.forEach(p=>{
    (p.fields||[]).forEach(f=>{
      const k = (p.key||"")+"|"+f.k;
      const v = st.vals[k]!=null ? st.vals[k] : (f.v||"");
      out.push([p.name||"", f.k||"", v]);
    });
  });
  QWIO.downloadCsv((cfg.title||"流程记录")+"_"+QWIO.today()+".csv", out);
}''',
'流程 导出函数')

io.open(P, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if CRLF else s)
print('本轮已应用:')
for a in applied:
    print('  ✓', a)
print('文件长度 %d → %d' % (ORIG_LEN, len(s)))
