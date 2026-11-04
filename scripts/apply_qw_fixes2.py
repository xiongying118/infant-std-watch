#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
apply_qw_fixes.py 的第二部分：SPC / 直方图 / 鱼骨图 / 层别 / 感官 /
5Why / 货架期 / 追溯 / 通用表格 / 清单 的可编辑·可联动·可交付改造。

★ 每次运行前先把 workbench.js 还原成 prototype/_wb_base.js（干净基线），
   然后按顺序应用 part1 → part2，避免半截状态。★
★ 换行符自动归一化，锚点匹配失败立即退出。★
"""
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
# SPC 控制图：真正实现编辑态 + 导入导出 + 复制图
# ================================================================
rep(
'''function QW_spc(key, cfg){
  const st = QWD[key] || (QWD[key] = { data: (cfg.seed||[]).slice() });
  const d = st.data.map(Number).filter(x=>!isNaN(x));
  const n = d.length;
  if(!n) return `<div class="qwt"><div class="qwt-h"><b>SPC 控制图</b></div>
    <div class="qwt-wrap"><div class="qwinput">
      <div class="muted" style="margin-bottom:5px">粘贴数据（逗号、空格或换行分隔）：</div>
      <textarea oninput="QW_spcSet('${key}',this.value)" rows="4">${escHtml(st.data.join(", "))}</textarea>
      <button class="btn sm pri" onclick="QW_spcCalc('${key}')">计算控制限</button>
    </div></div></div>`;
''',
'''function QW_spc(key, cfg){
  const st = QWD[key] || (QWD[key] = { data: (cfg.seed||[]).slice(), edit:false });
  /* ★ st.data 可能是数字数组，也可能是用户粘贴的文本 → 统一归一化 */
  if(!Array.isArray(st.data)) st.data = QW_parseNums(st.data);
  const d = st.data.map(Number).filter(x=>!isNaN(x));
  const n = d.length;
  if(!n) return `<div class="qwt"><div class="qwt-h">
      <b>${escHtml(cfg.title||"SPC 控制图")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm pri" onclick="QW_importDlg('${key}','num')">⬆ 导入数据</button>
      </div>
    </div>
    <div class="qwinput"><div class="muted">还没有数据 —— 点右上角「导入数据」把 Excel 里的数据贴进来，或手动添加。</div></div>
  </div>`;
''',
'SPC 头部+空态')

rep(
'''  const pts = d.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
''',
'''  const pts = d.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const svgId = "qwsvg_spc_"+key;
''',
'SPC svgId')

rep(
'''  return `<div class="qwt">
    <div class="qwt-h">
      <b>${escHtml(cfg.title||"SPC 控制图")}</b>
      <span class="muted">n=${n} · ${escHtml(cfg.unit||"")}</span>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_spcEdit('${key}')">改数据</button>
    </div>
    <div class="qwt-stats">
      <span class="qws"><b>${mean.toFixed(3)}</b><i>中心线 CL</i></span>
      <span class="qws"><b>${ucl.toFixed(3)}</b><i>UCL (+3σ)</i></span>
      <span class="qws"><b>${lcl.toFixed(3)}</b><i>LCL (−3σ)</i></span>
      <span class="qws ${sd?"":"bad"}"><b>${sd.toFixed(4)}</b><i>σ</i></span>
      <span class="qws ${uniq.length?"bad":"ok"}"><b>${uniq.length}</b><i>失控信号</i></span>
    </div>
    <svg class="qwsvg" viewBox="0 0 ${W} ${H}">''',
'''  const statsHtml = `<div class="qwt-stats">
      <span class="qws"><b>${mean.toFixed(3)}</b><i>中心线 CL</i></span>
      <span class="qws"><b>${ucl.toFixed(3)}</b><i>UCL (+3σ)</i></span>
      <span class="qws"><b>${lcl.toFixed(3)}</b><i>LCL (−3σ)</i></span>
      <span class="qws ${sd?"":"bad"}"><b>${sd.toFixed(4)}</b><i>σ</i></span>
      <span class="qws ${uniq.length?"bad":"ok"}"><b>${uniq.length}</b><i>失控信号</i></span>
    </div>`;

  return `<div class="qwt">
    <div class="qwt-h">
      <b>${escHtml(cfg.title||"SPC 控制图")}</b>
      <span class="muted">n=${n} · ${escHtml(cfg.unit||"")}</span>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm ${st.edit?"":"pri"}" onclick="QW_spcEdit('${key}')">${st.edit?"收起数据":"改数据"}</button>
        <button class="btn sm" onclick="QW_importDlg('${key}','num')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_numExport('${key}')">⬇ 导出数据</button>
        <button class="btn sm" onclick="QWIO.copySvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"SPC控制图")}')">📋 复制图</button>
        <button class="btn sm" onclick="QWIO.downloadSvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"SPC控制图")}')">⬇ 下载图</button>
      </div>
    </div>
    ${st.edit ? QW_numGrid(key, "原始数据（改任意一个数，控制限和失控判定立刻重算）",
        "也可以用「导入数据」从 Excel 整列贴进来。") : statsHtml}
    <svg class="qwsvg" id="${svgId}" viewBox="0 0 ${W} ${H}">''',
'SPC 工具条+编辑面板')

rep(
'''      ${d.map((v,i)=>{
        const bad = uniq.some(r=>r.i===i+1);
        return `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${bad?4.5:3}"
          fill="${bad?"#dc2626":"#334155"}"/>`;
      }).join("")}''',
'''      ${d.map((v,i)=>{
        const bad = uniq.some(r=>r.i===i+1);
        return `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${bad?4.5:3}"
          fill="${bad?"#dc2626":"#334155"}"><title>第${i+1}点 ${v}</title></circle>`;
      }).join("")}''',
'SPC 圆点加 title')

rep(
'''    ${uniq.length ? `<div class="qwflag">⚠ 检出 ${uniq.length} 处失控信号：''',
'''    ${st.edit ? `<div class="qwflag ok">✓ 数据已改 —— 收起数据即可看新的控制限与失控判定。</div>` : ""}
    ${uniq.length ? `<div class="qwflag">⚠ 检出 ${uniq.length} 处失控信号：''',
'SPC 编辑提示')

rep(
'''function QW_spcEdit(key){
  const st = QWD[key]; if(!st) return;
  st.edit = true; QW_render(key);
}
function QW_spcSet(key,v){ QWD[key].data = v; }
function QW_spcCalc(key){
  const st = QWD[key]; if(!st) return;
  st.data = String(st.data||"").split(/[,，\\s\\n]+/).filter(x=>x!=="").map(Number).filter(x=>!isNaN(x));
  st.edit = false; QW_render(key);
}''',
'''function QW_spcEdit(key){
  const st = QWD[key]; if(!st) return;
  st.edit = !st.edit;
  QW_render(key);
}
function QW_spcSet(key,v){ QWD[key].data = v; }
function QW_spcCalc(key){
  const st = QWD[key]; if(!st) return;
  st.data = QW_parseNums(st.data);
  st.edit = false; QW_render(key);
}''',
'SPC edit 开关')

# ================================================================
# 直方图
# ================================================================
rep(
'''function QW_histogram(key, cfg){
  const st = QWD[key] || (QWD[key] = { data: (cfg.seed||[]).slice() });
  const d = st.data.map(Number).filter(x=>!isNaN(x));
  if(!d.length) return `<div class="qwt"><div class="qwt-h"><b>直方图</b></div></div>`;''',
'''function QW_histogram(key, cfg){
  const st = QWD[key] || (QWD[key] = { data: (cfg.seed||[]).slice(), edit:false });
  if(!Array.isArray(st.data)) st.data = QW_parseNums(st.data);
  const d = st.data.map(Number).filter(x=>!isNaN(x));
  if(!d.length) return `<div class="qwt"><div class="qwt-h">
      <b>${escHtml(cfg.title||"直方图")}</b>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm pri" onclick="QW_importDlg('${key}','num')">⬆ 导入数据</button>
      </div></div>
    <div class="qwinput"><div class="muted">还没有数据 —— 点「导入数据」把 Excel 里的数据贴进来。</div></div>
  </div>`;''',
'直方图 头部+空态')

rep(
'''  const bw=iw/gN;
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"直方图")}</b>
      <span class="muted">n=${d.length} · ${escHtml(cfg.unit||"")}</span>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_spcEdit('${key}')">改数据</button></div>
    <div class="qwt-stats">
      <span class="qws"><b>${mn.toFixed(1)}~${mx.toFixed(1)}</b><i>范围</i></span>
      <span class="qws"><b>${gN}</b><i>组数</i></span>
      <span class="qws ${shapeCls}"><b style="font-size:12px">${escHtml(shape)}</b><i>形态判读</i></span>
    </div>
    <svg class="qwsvg" viewBox="0 0 ${W} ${H}">''',
'''  const bw=iw/gN;
  const svgId = "qwsvg_hist_"+key;
  const statsHtml = `<div class="qwt-stats">
      <span class="qws"><b>${mn.toFixed(1)}~${mx.toFixed(1)}</b><i>范围</i></span>
      <span class="qws"><b>${gN}</b><i>组数</i></span>
      <span class="qws ${shapeCls}"><b style="font-size:12px">${escHtml(shape)}</b><i>形态判读</i></span>
    </div>`;
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"直方图")}</b>
      <span class="muted">n=${d.length} · ${escHtml(cfg.unit||"")}</span>
      <div class="sp"></div>
      <div class="qwt-tools">
        <button class="btn sm ${st.edit?"":"pri"}" onclick="QW_histEdit('${key}')">${st.edit?"收起数据":"改数据"}</button>
        <button class="btn sm" onclick="QW_importDlg('${key}','num')">⬆ 导入数据</button>
        <button class="btn sm" onclick="QW_numExport('${key}')">⬇ 导出数据</button>
        <button class="btn sm" onclick="QWIO.copySvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"直方图")}')">📋 复制图</button>
        <button class="btn sm" onclick="QWIO.downloadSvg(document.getElementById('${svgId}'),'${escHtml(cfg.title||"直方图")}')">⬇ 下载图</button>
      </div>
    </div>
    ${st.edit ? QW_numGrid(key, "原始数据（改任意一个数，分组和形态判读立刻重算）",
        "分组数按 √n 自动定，也可以把数据整列从 Excel 贴进来。") : statsHtml}
    <svg class="qwsvg" id="${svgId}" viewBox="0 0 ${W} ${H}">''',
'直方图 工具条+编辑面板')

rep(
'''        return `<rect x="${(PL+bw*i+1).toFixed(1)}" y="${(PT+ih-bh).toFixed(1)}"
          width="${(bw-2).toFixed(1)}" height="${bh.toFixed(1)}" fill="#3b82f6" rx="2"/>
          <text x="${(PL+bw*i+bw/2).toFixed(1)}" y="${(PT+ih+13).toFixed(1)}" class="ax" text-anchor="middle">${b.lo.toFixed(0)}</text>''',
'''        return `<rect x="${(PL+bw*i+1).toFixed(1)}" y="${(PT+ih-bh).toFixed(1)}"
          width="${(bw-2).toFixed(1)}" height="${bh.toFixed(1)}" fill="#3b82f6" rx="2">
          <title>${b.lo.toFixed(1)}~${b.hi.toFixed(1)}：${b.n} 个</title></rect>
          <text x="${(PL+bw*i+bw/2).toFixed(1)}" y="${(PT+ih+13).toFixed(1)}" class="ax" text-anchor="middle">${b.lo.toFixed(0)}</text>''',
'直方图 柱加 title')

rep(
'''    <div class="qwfoot">双峰时先查：是否同一台设备两个时段？两台设备？两种原料？批间混料？</div>
  </div>`;
}''',
'''    ${st.edit ? `<div class="qwflag ok">✓ 数据已改 —— 收起数据即可看新的分组与形态判读。</div>` : ""}
    <div class="qwfoot">双峰时先查：是否同一台设备两个时段？两台设备？两种原料？批间混料？</div>
  </div>`;
}
function QW_histEdit(key){
  const st = QWD[key]; if(!st) return;
  st.edit = !st.edit;
  QW_render(key);
}''',
'直方图 edit 函数')

io.open(P, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if CRLF else s)
print('本轮已应用:')
for a in applied:
    print('  ✓', a)
print('文件长度 %d → %d' % (ORIG_LEN, len(s)))
