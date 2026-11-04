#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""apply_qw_fixes6.py —— 鱼骨图 SVG 布局重做（第 2 版）

上一版的问题：斜排文字用了 text-anchor="end"，
  → 旋转后文字整体往画布左侧跑，大半条目被裁掉，全挤在左上角。

这一版的做法（更贴近真正的石川图，也更好读）：
  · 骨头从主轴斜插向外，条目**水平排**（不斜排），
    但每条占一行、位置沿骨的锚点逐条往上/往下挪 —— 这样绝不会被裁。
  · 条目文字用 text-anchor="start"，从骨的外端往画布内侧排，
    保证文字始终落在画布内。
  · 画布加宽加高，上下留足空间。
"""
import io, os, sys

P = os.path.join('prototype', 'workbench.js')
raw = io.open(P, encoding='utf-8', newline='').read()
CRLF = '\r\n' in raw
s = raw.replace('\r\n', '\n')
ORIG_LEN = len(s)


def rep(old, new, label):
    global s
    old = old.replace('\r\n', '\n')
    new = new.replace('\r\n', '\n')
    n = s.count(old)
    if n != 1:
        print('!! %s: 锚点出现 %d 次（应为 1 次）' % (label, n))
        sys.exit(1)
    s = s.replace(old, new, 1)
    print('  ✓', label)


rep(
'''  const W=700,H=360, cx=W/2, cy=62;''',
'''  const W=760, H=420, cx=W/2+40, cy=H/2;''',
'鱼骨画布尺寸')

rep(
'''  /* ★ 鱼骨布局（标准石川图）★
     主轴水平贯通 → 骨尖（问题）在右端；
     骨头斜插进主轴，每根骨头上的条目沿骨方向斜排，
     分类名画在骨的外端，条目画在靠主轴那侧 —— 不会互相压、不会溢出画布。 */
  const SPINE_X0 = 26;            /* 主轴左端 */
  const SPINE_X1 = cx - 46;        /* 主轴右端（骨尖前） */
  const SPAN = SPINE_X1 - SPINE_X0;
  const perSide = Math.max(1, Math.ceil(br.length/2));
  /* 斜率：骨头与主轴夹角（dy/dx），向上为负 */
  const SLOPE = 0.62;
  const bones = br.map((b,i)=>{
    const up = i < perSide;
    const k = up ? i : (i - perSide);
    /* 骨头插进主轴的位置：沿主轴均分，末端留空 */
    const t = perSide>1 ? (k+0.5)/perSide : 0.5;
    const ax = SPINE_X0 + SPAN*t;         /* 插进主轴的锚点 */
    const len = 168;                       /* 骨头长度（水平投影） */
    const ex = ax - len;                   /* 骨头外端 x */
    const ey = up ? cy - len*SLOPE : cy + len*SLOPE;  /* 骨头外端 y */
    const items = (st.items[b.key]||[]).filter(x=>String(x).trim()!=="");
    const shown = items.slice(0,4);
    const more = items.length - shown.length;
    const pickedIdx = shown.map((x,j)=> st.picked[b.key+"|"+j] ? j : -1).filter(x=>x>=0);
    /* 条目起点：沿骨头从锚点往外排（离主轴 30% 处开始） */
    const tx = ax - len*0.22, ty = up ? cy - len*SLOPE*0.22 : cy + len*SLOPE*0.22;
    return {b:b, up:up, ax:ax, ex:ex, ey:ey, items:shown, more:more,
            pickedIdx:pickedIdx, tx:tx, ty:ty};
  });''',
'''  /* ★ 鱼骨布局（标准石川图，第 2 版）★
     主轴水平贯通 → 骨尖（问题）在右端；
     每侧 3 根骨头斜插进主轴；
     条目文字**水平排**（斜排会被裁），锚点在骨的外端往内排，
     文字永远落在画布内。
     上下两侧的条目分别在主轴上方 / 下方，互不干扰。 */
  const SPINE_X0 = 30;            /* 主轴左端 */
  const SPINE_X1 = cx - 30;        /* 主轴右端（骨尖前） */
  const SPAN = SPINE_X1 - SPINE_X0;
  const perSide = Math.max(1, Math.ceil(br.length/2));
  const SLOPE = 0.55;              /* 骨头斜率 */
  const bones = br.map((b,i)=>{
    const up = i < perSide;
    const k = up ? i : (i - perSide);
    /* 沿主轴均分插点 */
    const t = perSide>1 ? (k+0.55)/perSide : 0.5;
    const ax = SPINE_X0 + SPAN*t;                  /* 插进主轴的锚点 */
    const len = 150;                                /* 骨头水平长度 */
    const ex = ax - len;                            /* 骨头外端 x */
    const ey = up ? cy - len*SLOPE : cy + len*SLOPE;/* 骨头外端 y */
    const items = (st.items[b.key]||[]).filter(x=>String(x).trim()!=="");
    const shown = items.slice(0,4);
    const more = items.length - shown.length;
    const pickedIdx = shown.map((x,j)=> st.picked[b.key+"|"+j] ? j : -1).filter(x=>x>=0);
    /* 条目起始位置：骨外端往主轴方向挪一点，文字从这里往内排 */
    const tx = ex + 6;
    const ty = ey + (up ? -4 : 12);
    return {b:b, up:up, ax:ax, ex:ex, ey:ey, items:shown, more:more,
            pickedIdx:pickedIdx, tx:tx, ty:ty};
  });''',
'鱼骨布局计算 v2')

rep(
'''        <svg class="qwsvg" id="${svgId}" viewBox="0 0 ${W} ${H}">
          <!-- 主轴（脊） -->
          <line x1="${SPINE_X0}" y1="${cy}" x2="${SPINE_X1}" y2="${cy}" stroke="#334155" stroke-width="2.5"/>
          <!-- 骨尖箭头 -->
          <polygon points="${SPINE_X1},${cy} ${SPINE_X1-13},${cy-6} ${SPINE_X1-13},${cy+6}" fill="#334155"/>
          <!-- 骨尖文字（问题） -->
          <text x="${SPINE_X1-16}" y="${cy+4}" class="fbt" text-anchor="end">${escHtml(st.root||"问题")}</text>
          ${bones.map(o=>`
            <!-- 骨头（从主轴斜插向外） -->
            <line x1="${o.ax}" y1="${cy}" x2="${o.ex}" y2="${o.ey}" stroke="#94a3b8" stroke-width="1.8"/>
            <circle cx="${o.ax}" cy="${cy}" r="3" fill="#94a3b8"/>
            <!-- 分类名：画在骨的外端 -->
            <text x="${o.ex}" y="${o.ey + (o.up? -6 : 15)}" class="fbb"
              text-anchor="${o.ex>W/2?"end":"middle"}">${escHtml(o.b.name)}</text>
            <!-- 条目：沿骨方向斜排，靠主轴一侧 -->
            ${o.items.map((t,j)=>{
              const hot = o.pickedIdx.indexOf(j)>=0;
              const off = 26 + j*17;
              const px = o.ax - off;
              const py = o.up ? cy - off*SLOPE : cy + off*SLOPE;
              return `<text x="${px.toFixed(1)}" y="${(py + (o.up?4:10)).toFixed(1)}" class="fbi"
                text-anchor="end" ${hot?'fill="#dc2626" font-weight="700"':''}
                transform="rotate(${o.up?-32:32} ${px.toFixed(1)} ${(py + (o.up?4:10)).toFixed(1)})"
                >${hot?"▶ ":""}${escHtml(t)}</text>`;
            }).join("")}
            ${o.more>0?`<text x="${(o.ax-26-4*17).toFixed(1)}" y="${(cy + (o.up?-1:1)*(26+4*17)*SLOPE + (o.up?4:10)).toFixed(1)}"
              class="fbi" text-anchor="end">…还有 ${o.more} 条</text>`:""}
          `).join("")}
        </svg>''',
'''        <svg class="qwsvg" id="${svgId}" viewBox="0 0 ${W} ${H}">
          <!-- 主轴（脊） -->
          <line x1="${SPINE_X0}" y1="${cy}" x2="${SPINE_X1}" y2="${cy}" stroke="#334155" stroke-width="2.5"/>
          <!-- 骨尖箭头 -->
          <polygon points="${SPINE_X1+14},${cy} ${SPINE_X1+2},${cy-6} ${SPINE_X1+2},${cy+6}" fill="#334155"/>
          <!-- 骨尖文字（问题） -->
          <text x="${SPINE_X1-4}" y="${cy+4}" class="fbt" text-anchor="end">${escHtml(st.root||"问题")}</text>
          ${bones.map(o=>`
            <!-- 骨头（从主轴斜插向外） -->
            <line x1="${o.ax}" y1="${cy}" x2="${o.ex}" y2="${o.ey}" stroke="#94a3b8" stroke-width="1.8"/>
            <circle cx="${o.ax}" cy="${cy}" r="3" fill="#94a3b8"/>
            <!-- 分类名：画在骨的外端（主轴上方/下方分开） -->
            <text x="${o.ex}" y="${o.up ? o.ey - 7 : o.ey + 17}" class="fbb"
              text-anchor="middle">${escHtml(o.b.name)}</text>
            <!-- 条目：水平排，起点在分类名旁边，往内排 -->
            ${o.items.map((t,j)=>{
              const hot = o.pickedIdx.indexOf(j)>=0;
              const px = o.tx;
              const py = o.ty + (o.up ? -j*14 : j*14);
              return `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" class="fbi"
                text-anchor="start" ${hot?'fill="#dc2626" font-weight="700"':''}
                >${hot?"▶ ":""}${escHtml(t)}</text>`;
            }).join("")}
            ${o.more>0?`<text x="${o.tx.toFixed(1)}" y="${(o.ty + (o.up?-4*14:4*14)).toFixed(1)}"
              class="fbi" text-anchor="start">…还有 ${o.more} 条</text>`:""}
          `).join("")}
        </svg>''',
'鱼骨 SVG 渲染 v2')

io.open(P, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if CRLF else s)
print('文件长度 %d → %d' % (ORIG_LEN, len(s)))
