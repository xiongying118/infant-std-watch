#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""apply_qw_fixes3.py —— 鱼骨图 / 层别 / 感官 / 5Why / 货架期 / 追溯 / 表格 / 清单"""
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
# 鱼骨图：输入即时重绘 + 全部条目 + 候选根因标红 + 导入导出复制图
# ================================================================
rep(
'''function QW_fishbone(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    items: JSON.parse(JSON.stringify(cfg.seed||{})),
    root: "", picked: {}
  });
  const br = cfg.branches||[];
  const W=700,H=340, cx=W/2, cy=60;
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"鱼骨图")}</b>
      <div class="sp"></div>
      <span class="muted">先写问题，再往下铺开</span></div>
    <div class="qwt-cols2">
      <div>
        <div class="qwinput">
          <div class="muted" style="margin-bottom:5px">问题（骨尖）</div>
          <input type="text" style="width:100%" value="${escHtml(st.root)}"
            placeholder="例：灌装环节冲调异常率 3.2%，超过内控 1%"
            oninput="QW_fbSet('root',this.value)">
        </div>
        <svg class="qwsvg" viewBox="0 0 ${W} ${H}">
          <line x1="18" y1="${cy}" x2="${cx-6}" y2="${cy}" stroke="#334155" stroke-width="2.5"/>
          <text x="${cx+6}" y="${cy-8}" class="fbt">${escHtml(st.root||"问题")}</text>
          ${br.map((b,i)=>{
            const up = i%2===0;
            const bx = cx-260 + (i%3)*150, by = up? cy-100 : cy+100;
            return `<line x1="${bx}" y1="${by}" x2="${cx-20}" y2="${cy}" stroke="#94a3b8" stroke-width="1.6"/>
              <text x="${bx-6}" y="${up?by-4:by+14}" class="fbb" text-anchor="end">${escHtml(b.name)}</text>
              ${(st.items[b.key]||[]).slice(0,3).map((t,j)=>`
                <text x="${bx-6}" y="${up?by+14+j*13:by-6-j*13}" class="fbi" text-anchor="end">· ${escHtml(t)}</text>`).join("")}
              <circle cx="${bx}" cy="${by}" r="3" fill="#94a3b8"/>`;
          }).join("")}
        </svg>
      </div>
      <div>
        ${br.map(b=>`
          <div class="qwfb-b">
            <div class="qwfb-h"><b>${escHtml(b.name)}</b><span class="muted">${escHtml(b.ph||"")}</span>
              <div class="sp"></div>
              <button class="btn sm" onclick="QW_fbAdd('${key}','${b.key}')">+ 加一条</button></div>
            ${(st.items[b.key]||[]).map((t,j)=>`
              <div class="qwfb-i">
                <input type="checkbox" ${st.picked[b.key+"|"+j]?"checked":""}
                  onchange="QW_fbPick('${key}','${b.key}',${j},this.checked)">
                <input type="text" value="${escHtml(t)}" oninput="QW_fbSetItem('${key}','${b.key}',${j},this.value)">
                <button class="x" onclick="QW_fbDel('${key}','${b.key}',${j})">×</button>
              </div>`).join("")}
          </div>`).join("")}
      </div>
    </div>
    <div class="qwfoot">勾选的是<b>候选根因</b> —— 还要去现场验证：能不能观察到？测得到吗？验证过的才是真根因。</div>
  </div>`;
}
function QW_fbSet(key,v){ QWD[key].root = v; QW_render(key); }
function QW_fbSetItem(key,b,j,v){ QWD[key].items[b][j] = v; }
function QW_fbAdd(key,b){ QWD[key].items[b] = QWD[key].items[b]||[]; QWD[key].items[b].push(""); QW_render(key); }
function QW_fbDel(key,b,j){
  /* ★ 删除条目 → 二次确认（2026-11-03）★ */
  const items = (QWD[key].items[b]) || [];
  const txt = items[j]==null ? "" : String(items[j]);
  window.Guard.ask("确定删除这一条？"
    + (txt?"<br><b style='color:var(--ink)'>"+window.Guard.esc(txt.slice(0,120))+"</b>":""), {
    onOk:function(){ QWD[key].items[b].splice(j,1); QW_render(key); }
  });
}
function QW_fbPick(key,b,j,v){ QWD[key].picked[b+"|"+j] = v; }''',
'''function QW_fishbone(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    items: JSON.parse(JSON.stringify(cfg.seed||{})),
    root: "", picked: {}
  });
  const br = cfg.branches||[];
  const W=700,H=360, cx=W/2, cy=62;

  /* 骨头布局：每侧 3 条，条目全部显示（超过 5 条折叠成 +N） */
  const perSide = Math.max(1, Math.ceil(br.length/2));
  const bones = br.map((b,i)=>{
    const up = i < perSide;
    const k = up ? i : (i - perSide);
    const bx = cx - 300 + k*170;
    const by = up ? cy-108 : cy+108;
    const items = (st.items[b.key]||[]).filter(t=>String(t).trim()!=="");
    const shown = items.slice(0,5);
    const more = items.length - shown.length;
    const pickedIdx = shown.map((t,j)=> st.picked[b.key+"|"+j] ? j : -1).filter(x=>x>=0);
    return {b:b, up:up, bx:bx, by:by, items:shown, more:more, pickedIdx:pickedIdx};
  });

  const svgId = "qwsvg_fb_"+key;
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"鱼骨图")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm" onclick="QW_importDlg('${key}','fishbone')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_fbExport('${key}')">⬇ 导出</button>
        <button class="btn sm" onclick="QWIO.copySvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"鱼骨图")}')">📋 复制图</button>
        <button class="btn sm" onclick="QWIO.downloadSvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"鱼骨图")}')">⬇ 下载图</button>
      </div>
    </div>
    <div class="qwt-cols2">
      <div>
        <div class="qwinput">
          <div class="muted" style="margin-bottom:5px">问题（骨尖）</div>
          <input type="text" style="width:100%" value="${escHtml(st.root)}"
            placeholder="例：灌装环节冲调异常率 3.2%，超过内控 1%"
            oninput="QW_fbSet('${key}','root',this.value)">
        </div>
        <svg class="qwsvg" id="${svgId}" viewBox="0 0 ${W} ${H}">
          <line x1="18" y1="${cy}" x2="${cx-6}" y2="${cy}" stroke="#334155" stroke-width="2.5"/>
          <text x="${cx+8}" y="${cy-9}" class="fbt">${escHtml(st.root||"问题")}</text>
          ${bones.map(o=>`
            <line x1="${o.bx}" y1="${o.by}" x2="${cx-20}" y2="${cy}" stroke="#94a3b8" stroke-width="1.6"/>
              <text x="${o.bx-7}" y="${o.up?o.by-5:o.by+15}" class="fbb" text-anchor="end">${escHtml(o.b.name)}</text>
              ${o.items.map((t,j)=>{
                const hot = o.pickedIdx.indexOf(j)>=0;
                const y = o.up ? o.by+16+j*14 : o.by-8-j*14;
                return `<text x="${o.bx-7}" y="${y}" class="fbi" text-anchor="end"
                  ${hot?'fill="#dc2626" font-weight="700"':''}>${hot?"▶ ":"· "}${escHtml(t)}</text>`;
              }).join("")}
              ${o.more>0?`<text x="${o.bx-7}" y="${o.up?o.by+16+5*14:o.by-8-5*14}" class="fbi" text-anchor="end">…还有 ${o.more} 条</text>`:""}
              <circle cx="${o.bx}" cy="${o.by}" r="3" fill="#94a3b8"/>`).join("")}
        </svg>
        <div class="qwlegend" style="padding-left:13px">
          <span class="lg"><i style="background:#dc2626"></i>▶ 标记 = 勾选的候选根因</span>
          <span class="lg">未勾选的条是待排查项</span>
        </div>
      </div>
      <div>
        ${br.map(b=>{
          const items = st.items[b.key]||[];
          return `
          <div class="qwfb-b">
            <div class="qwfb-h"><b>${escHtml(b.name)}</b><span class="muted">${escHtml(b.ph||"")}</span>
              <div class="sp"></div>
              <button class="btn sm" onclick="QW_fbAdd('${key}','${b.key}')">+ 加一条</button></div>
            ${items.map((t,j)=>`
              <div class="qwfb-i">
                <input type="checkbox" ${st.picked[b.key+"|"+j]?"checked":""}
                  title="勾上 = 标记为候选根因，图上会标红"
                  onchange="QW_fbPick('${key}','${b.key}',${j},this.checked)">
                <input type="text" value="${escHtml(t)}" oninput="QW_fbSetItem('${key}','${b.key}',${j},this.value)">
                <button class="x" onclick="QW_fbDel('${key}','${b.key}',${j})">×</button>
              </div>`).join("")}
            ${items.length?"":`<div class="muted" style="font-size:11.5px;padding:2px 0">还没填，点「+ 加一条」</div>`}
          </div>`;
        }).join("")}
      </div>
    </div>
    <div class="qwfoot">勾选的是<b>候选根因</b>（图上标红）—— 还要去现场验证：能不能观察到？测得到吗？验证过的才是真根因。</div>
  </div>`;
}
/* ★ 下面这几个函数原来只写数据、不重绘 → 图永远不动（用户说的"死"）★
   现在每一个都会触发重绘。 */
function QW_fbSet(key,col,v){
  const st = QWD[key]; if(!st) return;
  st[col] = v;
  QW_render(key);
}
function QW_fbSetItem(key,b,j,v){
  const st = QWD[key]; if(!st) return;
  st.items[b] = st.items[b]||[];
  st.items[b][j] = v;
  QW_render(key);
}
function QW_fbAdd(key,b){
  const st = QWD[key]; if(!st) return;
  st.items[b] = st.items[b]||[];
  st.items[b].push("");
  QW_render(key);
}
function QW_fbDel(key,b,j){
  /* ★ 删除条目 → 二次确认（2026-11-03）★ */
  const st = QWD[key]; if(!st) return;
  const items = (st.items[b]) || [];
  const txt = items[j]==null ? "" : String(items[j]);
  window.Guard.ask("确定删除这一条？"
    + (txt?"<br><b style='color:var(--ink)'>"+window.Guard.esc(txt.slice(0,120))+"</b>":""), {
    onOk:function(){
      QWD[key].items[b].splice(j,1);
      /* picked 的索引会整体前移，必须一起清掉，否则图上标红错位 */
      const p = QWD[key].picked||{};
      const np = {};
      Object.keys(p).forEach(k=>{
        const parts = k.split("|");
        if(parts[0]===b){
          const idx = parseInt(parts[1],10);
          if(idx===j) return;
          if(idx>j) np[b+"|"+(idx-1)] = p[k];
          return;
        }
        np[k]=p[k];
      });
      QWD[key].picked = np;
      QW_render(key);
    }
  });
}
function QW_fbPick(key,b,j,v){
  const st = QWD[key]; if(!st) return;
  st.picked = st.picked||{};
  st.picked[b+"|"+j] = v;
  QW_render(key);
}
/* 鱼骨图导出（文字版 + 候选根因标记） */
function QW_fbExport(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const br = cfg.branches||[];
  const rows = [["分支","方向","条目","是否候选根因"]];
  br.forEach(b=>{
    const items = st.items[b.key]||[];
    if(!items.length) rows.push([b.name, b.ph||"", "（未填）", ""]);
    items.forEach((t,j)=>{
      rows.push([b.name, b.ph||"", t, st.picked[b.key+"|"+j]?"★ 候选根因":""]);
    });
  });
  rows.push([]);
  rows.push(["问题（骨尖）", st.root||""]);
  QWIO.downloadCsv((cfg.title||"鱼骨图")+"_"+QWIO.today()+".csv", rows);
}
/* 鱼骨图导入：两列（分类 / 原因条目） */
function QW_fbImport(key, m){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const br = cfg.branches||[];
  const byName = {};
  br.forEach(b=>{ byName[String(b.name).trim()] = b.key; });
  const items = {};
  let root = st.root || "";
  let n = 0, unknown = [];
  for(let i=0;i<m.length;i++){
    const c = (m[i]||[]).map(x=>String(x==null?"":x).trim());
    if(!c.length || !c[0]) continue;
    const cat = c[0];
    const txt = c.slice(1).filter(x=>x!=="").join(" / ");
    if(i===0 && /^(分类|类别|类型|category)$/i.test(cat)) continue;
    if(/^问题/.test(cat)){
      root = txt || cat.replace(/^问题[:：]?\\s*/,"");
      continue;
    }
    const bk = byName[cat];
    if(!bk){ unknown.push(cat); continue; }
    if(!txt) continue;
    items[bk] = items[bk]||[];
    items[bk].push(txt);
    n++;
  }
  if(!n){ toast("没识别到内容（第一列要填「人/机/料/法/环/测」之一）", "warn"); return; }
  st.items = items;
  if(root) st.root = root;
  QW_render(key);
  toast("已导入 "+n+" 条" + (unknown.length?("（"+unknown.length+" 行分类无法识别，已跳过）"):""));
}''',
'鱼骨图 全面改造')

io.open(P, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if CRLF else s)
print('本轮已应用:')
for a in applied:
    print('  ✓', a)
print('文件长度 %d → %d' % (ORIG_LEN, len(s)))
