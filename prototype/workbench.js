/* ================================================================
   工具工作台引擎（2026-10-22）
   用户原话：「我要的是这种能直接使用的，不是你告诉我实操步骤这种垃圾」
   → 每个功能点都必须能输入、能算、能出结果。

   本文件提供：
     QW_table       可增删改表格 + 判定着色 + 统计 + 公式列
     QW_checklist   逐项判定清单 + 进度 + 问题清单
     QW_pareto      帕累托图（真图 + 累计曲线 + 梯队）
     QW_spc         SPC 控制图（控制限 + 失控判定）
     QW_histogram   直方图（分组 + 形态判读）
     QW_strata      层别分析
     QW_fishbone    鱼骨图
     QW_why         5Why
     QW_flow        流程推进
     QW_sub         原料替代测算
     QW_shelf       货架期推算
     QW_trace       批次追溯
     QW_sensory     感官评价统计
   ================================================================ */

/* 通用：各工具的工作台数据（key → {type, rows, ...}） */
const QWD = {};   // 工作台状态：toolKey → 运行时数据
let QW_ACTIVE = null;

/* ------------------------------------------------------------
   通用表格
   ------------------------------------------------------------ */
function QW_table(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    rows: (cfg.seed||[]).map(r=>Object.assign({}, r))
  });
  const cols = cfg.cols || [];
  const computed = cfg.computed || {};

  // 计算列（公式）
  if(computed.rpn){
    st.rows.forEach(r=>{
      r.s = clampN(r.s,1,10); r.o = clampN(r.o,1,10); r.d = clampN(r.d,1,10);
      r.rpn = r.s * r.o * r.d;
    });
  }

  // 判定着色
  const jd = cfg.judge || {};
  const rowCls = (r)=>{
    if(!jd.col) return "";
    const v = r[jd.col];
    if(jd.bad && jd.bad.indexOf(v)>=0) return "bad";
    if(jd.warn && jd.warn.indexOf(v)>=0) return "warn";
    return "";
  };

  // 统计
  const stats = (cfg.stats||[]).map(s=>{
    let v = "";
    if(s.fn==="count") v = st.rows.length;
    else if(s.fn==="countEq") v = st.rows.filter(r=>String(r[s.col])===String(s.val)).length;
    else if(s.fn==="countIn") v = st.rows.filter(r=>(s.vals||[]).indexOf(r[s.col])>=0).length;
    else if(s.fn==="countGe") v = st.rows.filter(r=>parseFloat(r[s.col])>=parseFloat(s.val)).length;
    else if(s.fn==="rate"){
      const g = st.rows.filter(r=>String(r[s.col])===String(s.good)).length;
      v = st.rows.length ? Math.round(g/st.rows.length*100) : 0;
    }
    return `<span class="qws"><b>${v}</b><i>${escHtml(s.label)}</i></span>`;
  }).join("");

  // 提示（flags）
  const flags = (cfg.flags||[]).map(f=>{
    const hits = st.rows.filter(r=>{
      if(f.empty) return !String(r[f.col]||"").trim();
      return (f.bad||[]).indexOf(r[f.col])>=0;
    });
    if(!hits.length) return "";
    return `<div class="qwflag">⚠ ${escHtml(f.text)}（${hits.length} 处）</div>`;
  }).join("");

  let h = `<div class="qwt">
    <div class="qwt-h">
      <b>${escHtml(cfg.title||"工作表")}</b>
      <span class="muted">共 ${st.rows.length} 行</span>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_addRow('${key}')">+ ${escHtml(cfg.addLabel||"加一行")}</button>
      <button class="btn sm" onclick="QW_copyTable('${key}')">复制表格</button>
    </div>
    <div class="qwt-stats">${stats}</div>
    ${flags}
    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr>
        <th style="width:30px">#</th>
        ${cols.map(c=>`<th style="width:${c.w||"auto"}">${escHtml(c.label)}</th>`).join("")}
        <th style="width:30px"></th>
      </tr></thead>
      <tbody>
      ${st.rows.map((r,i)=>`<tr class="${rowCls(r)}">
        <td class="idx">${i+1}</td>
        ${cols.map(c=>{
          const v = r[c.key];
          if(c.type==="select"){
            return `<td><select onchange="QW_set('${key}',${i},'${c.key}',this.value)">
              ${(c.opts||[]).map(o=>`<option ${o===v?"selected":""}>${escHtml(o)}</option>`).join("")}
            </select></td>`;
          }
          if(c.type==="number"){
            return `<td><input type="number" step="0.01" min="${c.min!=null?c.min:""}" max="${c.max!=null?c.max:""}"
              value="${v==null?"":v}" oninput="QW_set('${key}',${i},'${c.key}',this.value)"></td>`;
          }
          if(c.type==="date"){
            return `<td><input type="date" value="${v==null?"":v}"
              onchange="QW_set('${key}',${i},'${c.key}',this.value)"></td>`;
          }
          if(c.type==="computed"){
            const band = (computed[c.key]||{}).bands || [];
            const b = band.find(x=>parseFloat(r[c.key])<=x.max) || band[band.length-1] || {};
            return `<td class="cmp ${b.cls||""}"><b>${r[c.key]==null?"—":r[c.key]}</b>
              ${b.text?`<i>${escHtml(b.text)}</i>`:""}</td>`;
          }
          return `<td><input type="text" value="${v==null?"":escHtml(v)}"
            oninput="QW_set('${key}',${i},'${c.key}',this.value)"></td>`;
        }).join("")}
        <td><button class="x" onclick="QW_delRow('${key}',${i})" title="删除">×</button></td>
      </tr>`).join("")}
      </tbody>
    </table>
    </div>
  </div>`;
  return h;
}
function clampN(v,lo,hi){
  let n = parseFloat(v); if(isNaN(n)) n = lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function QW_set(key,i,col,v){
  const st = QWD[key]; if(!st) return;
  st.rows[i][col] = v;
  QW_render(key);
}
function QW_addRow(key){
  const st = QWD[key]; if(!st) return;
  const tpl = st.rows[0] || {};
  const row = {};
  Object.keys(tpl).forEach(k=>{ row[k] = (typeof tpl[k]==="number") ? 0 : ""; });
  st.rows.push(row);
  QW_render(key);
}
function QW_delRow(key,i){
  const st = QWD[key]; if(!st) return;
  st.rows.splice(i,1);
  QW_render(key);
}
function QW_copyTable(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key] || {};
  const cols = cfg.cols||[];
  const txt = [cols.map(c=>c.label).join("\t")]
    .concat(st.rows.map(r=>cols.map(c=>r[c.key]==null?"":r[c.key]).join("\t")))
    .join("\n");
  copyText(txt);
}
function copyText(txt){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>toast("已复制到剪贴板"),
                                            ()=>toast("复制失败，请手动选中"));
  } else {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); toast("已复制到剪贴板"); }
    catch(e){ toast("复制失败"); }
    document.body.removeChild(ta);
  }
}

/* ------------------------------------------------------------
   清单（逐项判定）
   ------------------------------------------------------------ */
function QW_checklist(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    items: (cfg.items||[]).map(i=>Object.assign({r:"", note:""}, i))
  });
  const bad = st.items.filter(i=>cfg.bad && cfg.bad.indexOf(i.r)>=0);
  const done = st.items.filter(i=>i.r && i.r!=="不适用");
  const rate = done.length ? Math.round(
    done.filter(i=>!(cfg.bad||[]).indexOf(i.r)).length/done.length*100) : 0;

  return `<div class="qwt">
    <div class="qwt-h">
      <b>${escHtml(cfg.title||"核查表")}</b>
      <span class="muted">已判 ${done.length} / ${st.items.length}</span>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_copyChecklist('${key}')">复制核查表</button>
    </div>
    <div class="qwt-stats">
      <span class="qws"><b>${done.length}/${st.items.length}</b><i>已判定</i></span>
      <span class="qws"><b>${rate}%</b><i>符合率</i></span>
      <span class="qws ${bad.length?"bad":""}"><b>${bad.length}</b><i>不符合项</i></span>
    </div>
    <div class="qwt-wrap">
    <table class="qwt-tbl qw-cl">
      <thead><tr>
        <th style="width:30px">#</th>
        <th>检查项目</th>
        <th style="width:130px">判定</th>
        <th style="width:26%">${escHtml(cfg.noteLabel||"问题描述")}</th>
        <th style="width:22%">${escHtml(cfg.needAction||"整改要求")}</th>
      </tr></thead>
      <tbody>
      ${st.items.map((it,i)=>{
        const isBad = cfg.bad && cfg.bad.indexOf(it.r)>=0;
        return `<tr class="${isBad?"bad":""}">
          <td class="idx">${i+1}</td>
          <td><b>${escHtml(it.t)}</b>
            ${it.hint?`<div class="muted" style="font-size:11.5px;margin-top:2px">${escHtml(it.hint)}</div>`:""}</td>
          <td><select onchange="QW_clSet('${key}',${i},'r',this.value)">
            <option value="">—</option>
            ${(cfg.judgeOptions||[]).map(o=>`<option ${o===it.r?"selected":""}>${escHtml(o)}</option>`).join("")}
          </select></td>
          <td><input type="text" value="${escHtml(it.note||"")}" placeholder="${isBad?"必填":"不适用则留空"}"
            oninput="QW_clSet('${key}',${i},'note',this.value)"></td>
          <td><input type="text" value="${escHtml(it.act||"")}"
            oninput="QW_clSet('${key}',${i},'act',this.value)"></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
    </div>
    ${bad.length?`<div class="qwflag">⚠ ${bad.length} 项不符合，需填写问题描述与整改要求并闭环</div>`:""}
  </div>`;
}
function QW_clSet(key,i,col,v){
  const st = QWD[key]; if(!st) return;
  st.items[i][col] = v;
  QW_render(key);
}
function QW_copyChecklist(key){
  const st = QWD[key]; if(!st) return;
  const cfg = QW_CFG[key]||{};
  const txt = st.items.map((it,i)=>
    `${i+1}. ${it.t}\t${it.r||"—"}${it.note?"\t"+it.note:""}${it.act?"\t"+it.act:""}`
  ).join("\n");
  copyText(txt);
}

/* ------------------------------------------------------------
   帕累托图
   ------------------------------------------------------------ */
function QW_pareto(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    rows: (cfg.seed||[]).map(r=>Object.assign({}, r))
  });
  // 排序 + 占比 + 累计
  const rows = st.rows.slice().sort((a,b)=>(b.n||0)-(a.n||0));
  const total = rows.reduce((s,r)=>s+(r.n||0),0) || 1;
  let cum = 0;
  rows.forEach(r=>{
    r.pct = (r.n||0)/total*100;
    cum += r.pct; r.cum = cum;
    r.tier = r.cum <= 80 ? "A" : (r.cum <= 95 ? "B" : "C");
  });
  const W = 640, H = 220, PL = 40, PB = 76, PT = 14;
  const iw = W - PL - 12, ih = H - PT - PB;
  const maxN = Math.max.apply(null, rows.map(r=>r.n||0).concat([1]));
  const bw = iw / Math.max(1, rows.length);
  const cumPts = rows.map((r,i)=>
    `${(PL + bw*i + bw/2).toFixed(1)},${(PT + ih - ih*r.cum/100).toFixed(1)}`).join(" ");

  return `<div class="qwt">
    <div class="qwt-h">
      <b>${escHtml(cfg.title||"帕累托分析")}</b>
      <span class="muted">合计 ${total} ${escHtml(cfg.unit||"")}</span>
      <div class="sp"></div>
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
          </tr>`).join("")}
          </tbody>
        </table>
        </div>
      </div>
      <div>
        <svg class="qwsvg" viewBox="0 0 ${W} ${H}">
          ${[0,25,50,75,100].map(p=>{
            const y = PT + ih - ih*p/100;
            return `<line x1="${PL}" y1="${y}" x2="${W-12}" y2="${y}" stroke="#eef1f5"/>
                    <text x="${PL-6}" y="${y+3}" class="ax" text-anchor="end">${p}</text>`;
          }).join("")}
          ${rows.map((r,i)=>{
            const bh = ih*(r.n||0)/maxN;
            const x = PL + bw*i;
            return `<rect x="${(x+bw*0.15).toFixed(1)}" y="${(PT+ih-bh).toFixed(1)}"
              width="${(bw*0.7).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"
              fill="${r.tier==="A"?"#ef4444":(r.tier==="B"?"#f59e0b":"#94a3b8")}"/>
              <text x="${(x+bw/2).toFixed(1)}" y="${(PT+ih+13).toFixed(1)}" class="ax" text-anchor="middle">${i+1}</text>`;
          }).join("")}
          <polyline points="${cumPts}" fill="none" stroke="#2563eb" stroke-width="2"/>
          ${rows.map((r,i)=>`<circle cx="${(PL+bw*i+bw/2).toFixed(1)}" cy="${(PT+ih-ih*r.cum/100).toFixed(1)}" r="3" fill="#2563eb"/>`).join("")}
          <line x1="${PL}" y1="${PT+ih-ih*0.8}" x2="${W-12}" y2="${PT+ih-ih*0.8}" stroke="#dc2626" stroke-dasharray="4 3"/>
          <text x="${W-14}" y="${(PT+ih-ih*0.8-4).toFixed(1)}" class="ax red" text-anchor="end">80%</text>
          <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+ih}" stroke="#cbd5e1"/>
          <line x1="${PL}" y1="${PT+ih}" x2="${W-12}" y2="${PT+ih}" stroke="#cbd5e1"/>
        </svg>
        <div class="qwlegend">
          ${rows.map((r,i)=>`<span class="lg"><i style="background:${r.tier==="A"?"#ef4444":(r.tier==="B"?"#f59e0b":"#94a3b8")}"></i>${i+1}. ${escHtml(r.cat)} <b>${r.n}</b>（${r.pct.toFixed(1)}%）</span>`).join("")}
        </div>
      </div>
    </div>
    <div class="qwflag ok">✓ A 梯队（累计 ≤80%）共 ${rows.filter(r=>r.tier==="A").length} 项 —— <b>只集中改这几项</b>，其余放第二梯队。</div>
  </div>`;
}
function QW_pSet(key,i,col,v){
  const st = QWD[key]; if(!st) return;
  st.rows[i][col] = (col==="n") ? (parseFloat(v)||0) : v;
  QW_render(key);
}

/* ------------------------------------------------------------
   SPC 控制图
   ------------------------------------------------------------ */
function QW_spc(key, cfg){
  const st = QWD[key] || (QWD[key] = { data: (cfg.seed||[]).slice() });
  const d = st.data.map(Number).filter(x=>!isNaN(x));
  const n = d.length;
  if(!n) return `<div class="qwt"><div class="qwt-h"><b>SPC 控制图</b></div>
    <div class="qwt-wrap"><div class="qwinput">
      <div class="muted" style="margin-bottom:5px">粘贴数据（逗号、空格或换行分隔）：</div>
      <textarea oninput="QW_spcSet('${key}',this.value)" rows="4">${escHtml(st.data.join(", "))}</textarea>
      <button class="btn sm pri" onclick="QW_spcCalc('${key}')">计算控制限</button>
    </div></div></div>`;

  const mean = d.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(d.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(n-1||1));
  const ucl = mean + 3*sd, lcl = mean - 3*sd;
  const W = 660, H = 240, PL = 46, PB = 40, PT = 12;
  const iw = W-PL-14, ih = H-PT-PB;
  const all = d.concat([ucl,lcl]);
  const mx = Math.max.apply(null, all), mn = Math.min.apply(null, all);
  const pad = (mx-mn)*0.15 || 1;
  const Y = v => PT + ih - ih*((v-(mn-pad))/((mx+pad)-(mn-pad)));
  const X = i => PL + (n>1 ? iw*i/(n-1) : iw/2);
  const pts = d.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  // 失控判定
  const rules = [];
  d.forEach((v,i)=>{
    if(v>ucl || v<lcl) rules.push({i:i+1, t:"单点超控制限", v:v});
  });
  for(let i=8;i<n;i++){
    const w = d.slice(i-8,i+1);
    if(w.every(x=>x>mean)) rules.push({i:i+1, t:"连续 9 点在中心线同侧", v:w[8]});
    if(w.every(x=>x<mean)) rules.push({i:i+1, t:"连续 9 点在中心线同侧", v:w[8]});
  }
  for(let i=5;i<n;i++){
    const w = d.slice(i-5,i+1);
    if(w.every((x,j)=>j===0||x>w[j-1])) rules.push({i:i+1, t:"连续 6 点递增", v:w[5]});
    if(w.every((x,j)=>j===0||x<w[j-1])) rules.push({i:i+1, t:"连续 6 点递减", v:w[5]});
  }
  const uniq = [];
  rules.forEach(r=>{ const k=r.i+"|"+r.t; if(!uniq.some(x=>x.i===r.i&&x.t===r.t)) uniq.push(r); });

  return `<div class="qwt">
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
    <svg class="qwsvg" viewBox="0 0 ${W} ${H}">
      ${[0,0.25,0.5,0.75,1].map(f=>{
        const y = PT + ih*f;
        return `<line x1="${PL}" y1="${y}" x2="${W-14}" y2="${y}" stroke="#eef1f5"/>`;
      }).join("")}
      <line x1="${PL}" y1="${Y(ucl)}" x2="${W-14}" y2="${Y(ucl)}" stroke="#dc2626" stroke-dasharray="5 3"/>
      <line x1="${PL}" y1="${Y(lcl)}" x2="${W-14}" y2="${Y(lcl)}" stroke="#dc2626" stroke-dasharray="5 3"/>
      <line x1="${PL}" y1="${Y(mean)}" x2="${W-14}" y2="${Y(mean)}" stroke="#2563eb" stroke-width="1.5"/>
      ${cfg.spec && cfg.spec.high<999 ? `<line x1="${PL}" y1="${Y(cfg.spec.high)}" x2="${W-14}" y2="${Y(cfg.spec.high)}" stroke="#f59e0b" stroke-dasharray="2 2"/>`:""}
      ${cfg.spec && cfg.spec.low ? `<line x1="${PL}" y1="${Y(cfg.spec.low)}" x2="${W-14}" y2="${Y(cfg.spec.low)}" stroke="#f59e0b" stroke-dasharray="2 2"/>`:""}
      <polyline points="${pts}" fill="none" stroke="#334155" stroke-width="1.6"/>
      ${d.map((v,i)=>{
        const bad = uniq.some(r=>r.i===i+1);
        return `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${bad?4.5:3}"
          fill="${bad?"#dc2626":"#334155"}"/>`;
      }).join("")}
      <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+ih}" stroke="#cbd5e1"/>
      <line x1="${PL}" y1="${PT+ih}" x2="${W-14}" y2="${PT+ih}" stroke="#cbd5e1"/>
      <text x="${PL-6}" y="${Y(ucl)+3}" class="ax red" text-anchor="end">UCL</text>
      <text x="${PL-6}" y="${Y(mean)+3}" class="ax blue" text-anchor="end">CL</text>
      <text x="${PL-6}" y="${Y(lcl)+3}" class="ax red" text-anchor="end">LCL</text>
      ${d.map((v,i)=>`<text x="${X(i).toFixed(1)}" y="${PT+ih+14}" class="ax" text-anchor="middle">${i+1}</text>`).join("")}
    </svg>
    <div class="qwlegend">
      <span class="lg"><i style="background:#2563eb"></i>中心线 CL</span>
      <span class="lg"><i style="background:#dc2626"></i>控制限 ±3σ</span>
      <span class="lg"><i style="background:#f59e0b"></i>规格限</span>
      <span class="lg">红点 = 触发失控规则</span>
    </div>
    ${uniq.length ? `<div class="qwflag">⚠ 检出 ${uniq.length} 处失控信号：
      ${uniq.slice(0,6).map(r=>`第 ${r.i} 点（${r.v.toFixed(3)}）${escHtml(r.t)}`).join("；")}
      ${uniq.length>6?" …":""}</div>
      <div class="qwflag">注意：<b>失控 ≠ 不合格</b>。即使产品还在规格内，过程已偏离就要处理 —— 隔离受影响产品、查原因、调整后重算控制限。</div>`
      : `<div class="qwflag ok">✓ 未检出失控规则：单点超限 / 连续 9 点同侧 / 连续 6 点递增递减。过程受控。</div>`}
    <div class="qwfoot">规格：${escHtml((cfg.spec||{}).label||"未设")}</div>
  </div>`;
}
function QW_spcEdit(key){
  const st = QWD[key]; if(!st) return;
  st.edit = true; QW_render(key);
}
function QW_spcSet(key,v){ QWD[key].data = v; }
function QW_spcCalc(key){
  const st = QWD[key]; if(!st) return;
  st.data = String(st.data||"").split(/[,，\s\n]+/).filter(x=>x!=="").map(Number).filter(x=>!isNaN(x));
  st.edit = false; QW_render(key);
}

/* ------------------------------------------------------------
   直方图
   ------------------------------------------------------------ */
function QW_histogram(key, cfg){
  const st = QWD[key] || (QWD[key] = { data: (cfg.seed||[]).slice() });
  const d = st.data.map(Number).filter(x=>!isNaN(x));
  if(!d.length) return `<div class="qwt"><div class="qwt-h"><b>直方图</b></div></div>`;
  const mn = Math.min.apply(null,d), mx = Math.max.apply(null,d);
  const gN = Math.max(5, Math.min(12, Math.round(Math.sqrt(d.length))));
  const w = (mx-mn)/gN || 1;
  const bins = [];
  for(let i=0;i<gN;i++) bins.push({lo:mn+i*w, hi:mn+(i+1)*w, n:0});
  d.forEach(v=>{
    let i = Math.floor((v-mn)/w);
    if(i>=gN) i = gN-1;
    if(i<0) i = 0;
    bins[i].n++;
  });
  const maxN = Math.max.apply(null, bins.map(b=>b.n));
  // 形态判读
  const peak = bins.map(b=>b.n).indexOf(maxN);
  const nonZero = bins.filter(b=>b.n>0);
  const nz = nonZero.length;
  let shape = "分布居中", shapeCls = "ok";
  const mid = (mn+mx)/2;
  const c0 = bins[0].n, cN = bins[gN-1].n;
  const half = Math.floor(gN/2);
  const leftSum = bins.slice(0,half).reduce((s,b)=>s+b.n,0);
  const rightSum = bins.slice(half).reduce((s,b)=>s+b.n,0);
  if(nz>=4){
    const zeros = bins.map(b=>b.n);
    let dips = 0;
    for(let i=1;i<gN-1;i++) if(zeros[i] < zeros[i-1] && zeros[i] < zeros[i+1] && zeros[i]<maxN*0.5) dips++;
    if(dips>=1 && nonZero.length>=2){
      shape = "出现双峰 —— 很可能是两批混合/两个来源"; shapeCls = "bad";
    } else if(leftSum>0 && rightSum>0 && Math.abs(leftSum-rightSum)/Math.max(1,leftSum+rightSum)>0.45){
      shape = leftSum>rightSum ? "偏峰（数据集中在低侧，过程可能偏移）" : "偏峰（数据集中在高侧，过程可能偏移）";
      shapeCls = "warn";
    } else if(c0===0 || cN===0){
      shape = "分布被截尾 —— 数据可能不是自然分布"; shapeCls = "warn";
    }
  }
  const W=640,H=210,PL=40,PB=42,PT=12;
  const iw=W-PL-14, ih=H-PT-PB;
  const bw=iw/gN;
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
    <svg class="qwsvg" viewBox="0 0 ${W} ${H}">
      ${bins.map((b,i)=>{
        const bh = ih*b.n/maxN;
        return `<rect x="${(PL+bw*i+1).toFixed(1)}" y="${(PT+ih-bh).toFixed(1)}"
          width="${(bw-2).toFixed(1)}" height="${bh.toFixed(1)}" fill="#3b82f6" rx="2"/>
          <text x="${(PL+bw*i+bw/2).toFixed(1)}" y="${(PT+ih+13).toFixed(1)}" class="ax" text-anchor="middle">${b.lo.toFixed(0)}</text>
          <text x="${(PL+bw*i+bw/2).toFixed(1)}" y="${(PT+ih-bh-3).toFixed(1)}" class="ax" text-anchor="middle">${b.n}</text>`;
      }).join("")}
      <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+ih}" stroke="#cbd5e1"/>
      <line x1="${PL}" y1="${PT+ih}" x2="${W-14}" y2="${PT+ih}" stroke="#cbd5e1"/>
      <text x="${(W/2).toFixed(0)}" y="${H-6}" class="ax" text-anchor="middle">${escHtml(cfg.unit||"")}</text>
    </svg>
    <div class="qwfoot">双峰时先查：是否同一台设备两个时段？两台设备？两种原料？批间混料？</div>
  </div>`;
}

/* ------------------------------------------------------------
   层别分析
   ------------------------------------------------------------ */
function QW_strata(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    rows: (cfg.seed||[]).map(r=>Object.assign({}, r)),
    dim: (cfg.seed&&cfg.seed[0]) ? cfg.seed[0].dim : (cfg.dims||[])[0]
  });
  const cur = st.rows.filter(r=>r.dim===st.dim);
  const groups = {};
  cur.forEach(r=>{ groups[r.grp] = groups[r.grp]||{n:0,ok:0}; groups[r.grp].n += +r.n||0; groups[r.grp].ok += +r.ok||0; });
  const list = Object.keys(groups).map(g=>({g:g, n:groups[g].n, ok:groups[g].ok,
      rate: groups[g].n? groups[g].ok/groups[g].n*100 : 0}));
  list.sort((a,b)=>b.rate-a.rate);
  const best = list[0], worst = list[list.length-1];
  const gap = best && worst ? best.rate - worst.rate : 0;

  // 建议下一步分层
  const usedDims = st.rows.map(r=>r.dim).filter((v,i,a)=>a.indexOf(v)===i);
  const nextDims = (cfg.dims||[]).filter(d=>usedDims.indexOf(d)<0);

  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"层别分析")}</b>
      <div class="sp"></div>
      <label class="qwl">分层维度
        <select onchange="QW_stSetDim('${key}',this.value)">
          ${(cfg.dims||[]).map(d=>`<option ${d===st.dim?"selected":""}>${escHtml(d)}</option>`).join("")}
        </select></label>
    </div>
    <div class="qwt-stats">
      <span class="qws"><b>${list.length}</b><i>组数</i></span>
      <span class="qws ok"><b>${best?best.rate.toFixed(1):"—"}%</b><i>最好组 ${best?escHtml(best.g):""}</i></span>
      <span class="qws ${gap>5?"bad":""}"><b>${gap.toFixed(1)}</b><i>组间差距(pp)</i></span>
    </div>
    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr><th>分组</th><th style="width:80px">样本数</th><th style="width:80px">合格数</th>
        <th style="width:90px">合格率%</th><th style="width:70px">与最好差距</th></tr></thead>
      <tbody>
      ${list.map(r=>`<tr class="${r.rate<95?"bad":(r.rate<99?"warn":"")}">
        <td><b>${escHtml(r.g)}</b></td>
        <td class="num">${r.n}</td><td class="num">${r.ok}</td>
        <td class="num">${r.rate.toFixed(1)}</td>
        <td class="num">${best?(best.rate-r.rate).toFixed(1):"—"}</td>
      </tr>`).join("")}
      </tbody>
    </table>
    </div>
    ${gap>5 ? `<div class="qwflag">⚠ 组间差距 ${gap.toFixed(1)} 个百分点 —— <b>「${escHtml(worst.g)}」是嫌疑点</b>，
      别看整体合格率（${(cur.reduce((s,r)=>s+(+r.ok||0),0)/(cur.reduce((s,r)=>s+(+r.n||0),0)||1)*100).toFixed(1)}%）就以为没问题。
      ${nextDims.length?`下一步可交叉分层：<b>${escHtml(nextDims.join(" × "))}</b>。`:""}</div>`
      : `<div class="qwflag ok">✓ 各组差距在 5 个百分点内，该维度不是主因，可换下一个维度拆。</div>`}
    <div class="qwt-h" style="margin-top:14px"><b>原始数据</b>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_addRow('${key}')">+ 加一行</button></div>
    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr><th style="width:110px">维度</th><th style="width:130px">分组</th>
        <th style="width:80px">样本数</th><th style="width:80px">合格数</th></tr></thead>
      <tbody>
      ${st.rows.map((r,i)=>`<tr>
        <td><select onchange="QW_stSet('${key}',${i},'dim',this.value)">
          ${(cfg.dims||[]).map(d=>`<option ${d===r.dim?"selected":""}>${escHtml(d)}</option>`).join("")}</select></td>
        <td><input type="text" value="${escHtml(r.grp)}" oninput="QW_stSet('${key}',${i},'grp',this.value)"></td>
        <td><input type="number" value="${r.n}" oninput="QW_stSet('${key}',${i},'n',this.value)"></td>
        <td><input type="number" value="${r.ok}" oninput="QW_stSet('${key}',${i},'ok',this.value)"></td>
      </tr>`).join("")}
      </tbody>
    </table>
    </div>
  </div>`;
}
function QW_stSet(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  st.rows[i][col] = (col==="n"||col==="ok") ? (parseFloat(v)||0) : v;
  QW_render(key);
}
function QW_stSetDim(key,v){ QWD[key].dim = v; QW_render(key); }

/* ------------------------------------------------------------
   鱼骨图
   ------------------------------------------------------------ */
function QW_fishbone(key, cfg){
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
function QW_fbDel(key,b,j){ QWD[key].items[b].splice(j,1); QW_render(key); }
function QW_fbPick(key,b,j,v){ QWD[key].picked[b+"|"+j] = v; }

/* ------------------------------------------------------------
   5Why
   ------------------------------------------------------------ */
function QW_why(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    problem: (cfg.seed||{}).problem || "",
    chain: JSON.parse(JSON.stringify((cfg.seed||{}).chain||[]))
  });
  const chain = st.chain;
  // 死胡同检测
  const bad = [];
  chain.forEach((c,i)=>{
    (cfg.badWords||[]).forEach(w=>{
      if(String(c.why||"").indexOf(w)>=0) bad.push({i:i+1, w:w});
    });
  });
  // 最后一层是否可整改
  const last = chain[chain.length-1]||{};
  const canFix = /清单|制度|设计|防错|流程|规范|标准|周期|配置|锁定/.test(last.why||"");

  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"5Why")}</b>
      <div class="sp"></div>
      <span class="muted">${escHtml(cfg.stopHint||"")}</span></div>
    <div class="qwinput">
      <div class="muted" style="margin-bottom:5px">问题（第一问的起点）</div>
      <input type="text" style="width:100%" value="${escHtml(st.problem)}"
        oninput="QW_whySet('${key}','problem',this.value)">
    </div>
    <div class="qwchain">
      ${chain.map((c,i)=>`
        <div class="qw5">
          <div class="qw5-n">${i===0?"问题":`为什么 ${i+1}`}</div>
          <div class="qw5-b">
            <input type="text" value="${escHtml(c.why||"")}" placeholder="答案必须基于事实，可验证"
              oninput="QW_whySetItem('${key}',${i},'why',this.value)">
            <div class="qw5-m">
              <input type="text" value="${escHtml(c.evi||"")}" placeholder="证据"
                oninput="QW_whySetItem('${key}',${i},'evi',this.value)">
              <input type="text" value="${escHtml(c.veri||"")}" placeholder="验证方式"
                oninput="QW_whySetItem('${key}',${i},'veri',this.value)">
            </div>
          </div>
        </div>`).join("")}
    </div>
    ${bad.length?`<div class="qwflag">⚠ 第 ${bad.map(x=>x.i).join("、")} 层出现「${bad.map(x=>x.w).join("、")}」——
      这是<b>死胡同</b>，不是根因。真根因通常是制度 / 设计 / 防错缺失。</div>`:""}
    ${!canFix?`<div class="qwflag">⚠ 最后一层没落到「能改动的地方」——
      继续往下问，直到答案指向<b>制度、设计、防错、流程</b>这类可整改项。</div>`
      :`<div class="qwflag ok">✓ 最后一层指向可整改项，可以据此定措施了。</div>`}
    <div class="qwinput">
      <div class="muted" style="margin-bottom:5px">
        横向展开：同样的原因在别处还有没有？（例「除湿机没装」→ 三个粉料间是不是都没装）
      </div>
      <textarea rows="2" style="width:100%" oninput="QW_whySet('${key}','spread',this.value)"
        placeholder="例：全厂三个粉料间均未配置除湿机">${escHtml(st.spread||"")}</textarea>
    </div>
  </div>`;
}
function QW_whySet(key,col,v){
  const st = QWD[key]; if(!st) return;
  st[col] = v;
  if(col==="problem" || col==="spread") QW_render(key);
}
function QW_whySetItem(key,i,col,v){
  const st=QWD[key]; if(!st) return;
  st.chain[i][col] = v;
}

/* ------------------------------------------------------------
   流程推进（PDCA / 注册申报）
   ------------------------------------------------------------ */
function QW_flow(key, cfg){
  const st = QWD[key] || (QWD[key] = { step: 0, vals: {} });
  const ph = cfg.phases||[];
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"流程")}</b>
      <div class="sp"></div>
      <span class="muted">${ph.length} 个环节</span></div>
    <div class="qwsteps">
      ${ph.map((p,i)=>`<button class="qws-b ${i===st.step?"on":""}" onclick="QW_flowStep('${key}',${i})">
        <span class="qws-n">${i+1}</span><span>${escHtml(p.name)}</span></button>`).join("")}
    </div>
    <div class="qwflow-p">
      ${(ph[st.step]||{fields:[]}).fields.map(f=>{
        const k = (ph[st.step].key||"")+"|"+f.k;
        const v = st.vals[k]!=null ? st.vals[k] : (f.v||"");
        return `<div class="qwflow-f">
          <div class="qwflow-k">${escHtml(f.k)}</div>
          <div><input type="text" value="${escHtml(v)}" oninput="QW_flowSet('${key}','${k}',this.value)"></div>
        </div>`;
      }).join("")}
    </div>
    <div class="qwflag ${st.step>=ph.length-1?"ok":""}">
      ${st.step>=ph.length-1 ? "✓ 已到最后环节" : `当前：<b>${escHtml(ph[st.step].name)}</b>`}
      ${cfg.keyPoint?`<br><br><b>要点：</b>${escHtml(cfg.keyPoint)}`:""}
    </div>
    <div class="qwfoot">改完内容点「下一个环节」，内容会跟着走 —— 每个环节的记录都会留在本页。</div>
  </div>`;
}
function QW_flowStep(key,i){ QWD[key].step = i; QW_render(key); }
function QW_flowSet(key,k,v){ QWD[key].vals[k] = v; }

/* ------------------------------------------------------------
   原料替代测算
   ------------------------------------------------------------ */
function QW_sub(key, cfg){
  const st = QWD[key] || (QWD[key] = JSON.parse(JSON.stringify(cfg.seed||{})));
  const cur = st.current, amt = parseFloat(st.useAmount)||0;
  const pct = parseFloat(st.replacePct)||0;
  const subAmt = amt*pct/100;
  const restAmt = amt - subAmt;
  const F = ["p","f","c","ca","phos"];
  const FN = {p:"蛋白质",f:"脂肪",c:"碳水",ca:"钙",phos:"磷"};
  const mix = (m,kg)=>({p:(m.p||0)*kg, f:(m.f||0)*kg, c:(m.c||0)*kg,
                        ca:(m.ca||0)*kg, phos:(m.phos||0)*kg});
  const curC = mix(cur, restAmt);
  const costCur = cur.price*amt;
  const rows = (st.cand||[]).map(cand=>{
    const candC = mix(cand, subAmt);
    const costNew = cur.price*restAmt + cand.price*subAmt;
    const d = {};
    F.forEach(f=>{ d[f] = (candC[f]-curC[f]); });
    return {cand:cand, d:d, costNew:costNew,
            dCost: costNew-costCur,
            costPct: costCur? (costNew-costCur)/costCur*100 : 0};
  });
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"替代测算")}</b>
      <div class="sp"></div>
      <span class="muted">现状：${escHtml(cur.name)}（${escHtml(cur.sup)}）</span></div>
    <div class="qwinput">
      <div class="qwflow-f"><div class="qwflow-k">当前用量</div>
        <div><input type="number" value="${amt}" oninput="QW_subSet('${key}','useAmount',this.value)">
          kg / 1000kg</div></div>
      <div class="qwflow-f"><div class="qwflow-k">替代比例</div>
        <div><input type="number" value="${pct}" oninput="QW_subSet('${key}','replacePct',this.value)">
          %（被替代部分）</div></div>
    </div>
    <div class="qwt-stats">
      <span class="qws"><b>${subAmt.toFixed(1)}</b><i>替代量 kg</i></span>
      <span class="qws"><b>${restAmt.toFixed(1)}</b><i>保留原量 kg</i></span>
      <span class="qws"><b>${costCur.toFixed(0)}</b><i>现状成本 元/1000kg</i></span>
    </div>
    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr><th>候选原料</th>
        ${F.map(f=>`<th style="width:88px">Δ${FN[f]}</th>`).join("")}
        <th style="width:96px">Δ成本 元</th><th style="width:76px">Δ%</th>
        <th style="width:120px">结论</th></tr></thead>
      <tbody>
      ${rows.map(r=>{
        const protBad = r.d.p < -3;      // 蛋白掉太多要警觉
        const fatBad  = Math.abs(r.d.f) > 20;
        const caBad   = Math.abs(r.d.ca) > 500;
        const bad = protBad||fatBad||caBad;
        return `<tr class="${bad?"warn":""}">
          <td><b>${escHtml(r.cand.name)}</b><div class="muted" style="font-size:11px">${escHtml(r.cand.sup)}</div></td>
          ${F.map(f=>`<td class="num ${r.d[f]<0?"neg":"pos"}">${r.d[f]>=0?"+":""}${r.d[f].toFixed(1)}</td>`).join("")}
          <td class="num ${r.dCost<0?"neg":"pos"}">${r.dCost>=0?"+":""}${r.dCost.toFixed(0)}</td>
          <td class="num ${r.dCost<0?"neg":"pos"}">${r.costPct>=0?"+":""}${r.costPct.toFixed(1)}%</td>
          <td><span class="vd ${bad?"warn":"ok"}">${bad?"需验证":"可替代"}</span></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>
    </div>
    <div class="qwflag">Δ 为「替代后 − 现状」，正数表示该营养素增加。
      蛋白掉超过 3g/100kg、钙变化超 500mg/100kg 都要重新算配方并验稳定性。</div>
    <div class="qwfoot">只算「营养+成本」不够 —— 还要看工艺影响（溶解性、喷雾干燥条件）与货架期（易氧化成分）。</div>
  </div>`;
}
function QW_subSet(key,col,v){
  const st=QWD[key]; if(!st) return;
  st[col] = (col==="useAmount"||col==="replacePct") ? (parseFloat(v)||0) : v;
  QW_render(key);
}

/* ------------------------------------------------------------
   货架期推算
   ------------------------------------------------------------ */
function QW_shelf(key, cfg){
  const st = QWD[key] || (QWD[key] = JSON.parse(JSON.stringify(cfg.seed||{})));
  const S = st.samples||[];
  const limit = parseFloat(st.limit)||2.0;
  // 按温度分组，各组找最早超限点
  const temps = {};
  S.forEach(s=>{ temps[s.temp] = temps[s.temp]||[]; temps[s.temp].push(s); });
  const perT = Object.keys(temps).map(t=>{
    const arr = temps[t].sort((a,b)=>a.weeks-b.weeks);
    let badAt = null;
    arr.forEach(s=>{ if(badAt===null && (parseFloat(s.vp)>limit || s.sens!=="正常")) badAt = s.weeks; });
    return {temp:parseFloat(t), arr:arr, badAt:badAt};
  });
  // ── 判定依据的选择（这一步很关键，别搞错）──
  // ★ 婴配粉的保质期必须以**实时留样**为准 ★
  //   加速试验（37/45℃）只作**指示性佐证** ——
  //   Q10 假设、基质变化、包装吸氧都会让加速结果偏保守，
  //   拿它直接定保质期会短得离谱。
  //   所以：① 有常温组 → 用常温组实测值（这是依据）
  //        ② 只有加速组 → 给出指示性推算，并明确标注「不能作为保质期依据」
  const tempsArr = perT.slice().sort((a,b)=>a.temp-b.temp);
  const ref = tempsArr[0];                       // 最低温组
  const acc = tempsArr[tempsArr.length-1];        // 最高温组
  const hasRoom = ref && ref.temp <= 25 && ref.badAt != null;
  const hasAcc = acc && acc.badAt != null && acc.temp > ref.temp;

  let accel = null, indicativeWeeks = null;
  if(hasAcc){
    accel = Math.pow(2, (acc.temp-ref.temp)/10);
    if(ref.badAt!=null){
      indicativeWeeks = acc.badAt / accel;        // 折算到参考温度
    } else {
      // 参考组还没劣变 → 用加速组折算过去
      indicativeWeeks = acc.badAt / accel;
    }
  }
  // 再从参考温度折算到 25℃
  let shelf25 = null;
  if(hasRoom){
    shelf25 = ref.badAt;                          // 常温实测 = 依据
  } else if(indicativeWeeks!=null && ref.temp > 25){
    shelf25 = indicativeWeeks / Math.pow(2, (ref.temp-25)/10);
  } else if(indicativeWeeks!=null){
    shelf25 = indicativeWeeks;
  }
  const shelfWeeks = shelf25;
  const shelfMonths = shelfWeeks!=null ? Math.round(shelfWeeks/4.345) : null;
  const target = parseFloat(st.targetMonths)||12;
  const safe = shelfMonths!=null ? Math.floor(shelfMonths*0.85) : null;
  const isIndicative = !hasRoom;

  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"货架期")}</b>
      <div class="sp"></div>
      <span class="muted">限值 ${limit}（过氧化值）</span></div>
    <div class="qwt-stats">
      <span class="qws ${shelfMonths==null?"":(isIndicative?"warn":"ok")}">
        <b>${shelfMonths!=null?shelfMonths:"—"}</b><i>${isIndicative?"指示性推算(月)":"推算保质期(月)"}</i></span>
      <span class="qws"><b>${safe!=null?safe:"—"}</b><i>建议(打85折)</i></span>
      <span class="qws ${target&&safe!=null&&safe<target?"bad":"ok"}"><b>${target}</b><i>目标(月)</i></span>
      ${accel?`<span class="qws"><b>${accel.toFixed(1)}×</b><i>加速因子 Q10</i></span>`:""}
    </div>
    <div class="qwt-wrap">
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
    </div>
    ${shelfMonths!=null ? `
    <div class="qwflag ${isIndicative?"":"ok"}">
      ${isIndicative ? `
        ⚠ <b>这是指示性推算（${shelfMonths} 个月），不能直接当保质期依据。</b><br>
        本页只有加速组（${tempsArr.map(t=>t.temp+"℃").join(" / ")}）数据，没有常温实时留样。
        加速试验因 Q10 假设、基质变化、包装吸氧等原因<b>偏保守</b>，直接拿来定保质期会短得离谱。
        <br><b>正确做法：</b>用实时留样数据定保质期，加速试验作为佐证 —— 两者不一致时以实时留样为准。`
      : (safe!=null&&safe<target
        ? `⚠ 推算 ${shelfMonths} 个月，打折后 <b>${safe} 个月</b>，<b>低于目标 ${target} 个月</b>。
           要么缩短保质期，要么改配方（易氧化成分换稳定形式）。`
        : `✓ 推算 ${shelfMonths} 个月，打折后 ${safe} 个月，可覆盖目标 ${target} 个月。`)}
      ${accel?`<br>加速因子 Q10 = ${accel.toFixed(1)}（${acc.temp}℃ 相对 ${ref.temp}℃）。`:""}
    </div>` : `<div class="qwflag">数据不足，还推不出保质期。</div>`}
    <div class="qwfoot">★ 加速结论必须被实时留样数据支持 ★ 两者不一致时，以实时留样为准。<br>
      另：保质期是「在标示储存条件下」才成立，条件要写清（温度、避光、干燥）。</div>
  </div>`;
}

/* ------------------------------------------------------------
   批次追溯
   ------------------------------------------------------------ */
function QW_trace(key, cfg){
  const st = QWD[key] || (QWD[key] = JSON.parse(JSON.stringify(cfg.seed||{})));
  const fw = st.forward||{}, bk = st.backward||{};
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"批次追溯")}</b>
      <div class="sp"></div>
      <span class="muted">正向 + 反向都要能查</span></div>
    <div class="qwtrace">
      <div class="qwtrace-b">
        <div class="qwtrace-h">↓ 反向追溯（成品 → 原料）</div>
        <div class="qwinput"><div class="muted" style="margin-bottom:4px">输入成品批号</div>
          <input type="text" style="width:100%" value="${escHtml(fw.batch||"")}"
            oninput="QW_trSet('${key}','fbatch',this.value)"></div>
        <div class="qwchain2">
          ${(fw.chain||[]).map(c=>`
            <div class="qwtr">
              <div class="qwtr-l ${c.level==="成品批"?"l1":(c.level==="过程批"?"l2":"l3")}">${escHtml(c.level)}</div>
              <div class="qwtr-b"><b>${escHtml(c.no)}</b>
                <div class="muted" style="font-size:11.5px">${escHtml(c.info||"")}</div></div>
            </div>`).join("")}
        </div>
      </div>
      <div class="qwtrace-b">
        <div class="qwtrace-h">↑ 正向追溯（原料 → 成品）</div>
        <div class="qwinput"><div class="muted" style="margin-bottom:4px">输入原料批号</div>
          <input type="text" style="width:100%" value="${escHtml(bk.batch||"")}"
            oninput="QW_trSet('${key}','bbatch',this.value)"></div>
        <div class="qwchain2">
          ${(bk.products||[]).map(p=>`
            <div class="qwtr">
              <div class="qwtr-l l1">成品批</div>
              <div class="qwtr-b"><b>${escHtml(p.no)}</b>
                <div class="muted" style="font-size:11.5px">${escHtml(p.qty)} · ${escHtml(p.cust)}</div></div>
            </div>`).join("")}
        </div>
        <div class="qwflag">合计影响 <b>${(bk.products||[]).reduce((s,p)=>s+parseInt(p.qty)||0,0)}</b> 罐</div>
      </div>
    </div>
    <div class="qwfoot">★ 演练：随机选一个成品批号，要求 2 小时内倒推出全部原料批号 ★ 不演练等于没做追溯。</div>
  </div>`;
}
function QW_trSet(key,col,v){ QWD[key][col]=v; }

/* ------------------------------------------------------------
   感官评价
   ------------------------------------------------------------ */
function QW_sensory(key, cfg){
  const st = QWD[key] || (QWD[key] = {
    samples: JSON.parse(JSON.stringify(cfg.seed||[])),
    evaluators: 8
  });
  const dims = cfg.dims||[];
  const stat = sc=>{
    const arr = sc.scores.map(Number).filter(x=>!isNaN(x));
    const mean = arr.reduce((a,b)=>a+b,0)/(arr.length||1);
    const sd = Math.sqrt(arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(arr.length-1||1));
    return {mean:mean, sd:sd, n:arr.length};
  };
  const all = st.samples.map(sc=>{
    const s = stat(sc);
    let tot=0, cnt=0;
    sc.scores.forEach(v=>{ const n=parseFloat(v); if(!isNaN(n)){tot+=n;cnt++;} });
    return {sc:sc, s:s, total: tot/cnt};
  });
  const spread = all.length>1 ? (Math.max.apply(null,all.map(x=>x.total)) -
                                Math.min.apply(null,all.map(x=>x.total))) : 0;
  return `<div class="qwt">
    <div class="qwt-h"><b>${escHtml(cfg.title||"感官评价")}</b>
      <div class="sp"></div>
      <button class="btn sm" onclick="QW_addRow('${key}')">+ 加样品</button></div>
    <div class="qwt-stats">
      <span class="qws"><b>${st.samples.length}</b><i>样品数</i></span>
      <span class="qws ${spread>1.2?"bad":"ok"}"><b>${spread.toFixed(2)}</b><i>样品间极差</i></span>
    </div>
    <div class="qwt-wrap">
    <table class="qwt-tbl">
      <thead><tr><th style="width:110px">样品</th>
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
      </tr>`).join("")}
      </tbody>
    </table>
    </div>
    <div class="qwlegend">${(cfg.scale||[]).map((s,i)=>`<span class="lg">${i+1} ${escHtml(s)}</span>`).join("")}</div>
    ${spread>1.2 ? `<div class="qwflag">⚠ 样品间极差 ${spread.toFixed(2)} 分，超出评价员一致性通常能接受的范围（≤1.0）。
      补做描述性分析，找出差异到底在哪个维度 —— 「差不多」不等于「没差别」。</div>`
      : `<div class="qwflag ok">✓ 样品间差异在可接受范围，评价员一致性良好。</div>`}
    <div class="qwfoot">感官结论要与理化结果并列看，<b>不单独下结论</b>。用标样 + 竞品做锚定，避免绝对评价漂移。</div>
  </div>`;
}
function QW_snSet(key,si,col,v){ QWD[key].samples[si][col]=v; }
function QW_snScore(key,si,di,v){ QWD[key].samples[si].scores[di]=parseFloat(v)||0; QW_render(key); }

/* ------------------------------------------------------------
   通用计算型（转调专用函数）
   ------------------------------------------------------------ */
function gbCalcWidget(key, cfg){
  /* ★ gbRender() 往 #gbCalc 里写 ★
     但此刻这段 HTML 还没插进 DOM —— 必须先返回占位，
     由 QW_render 插完之后再调 gbRender()。 */
  return `<div id="gbCalc"></div>`;
}

/* ------------------------------------------------------------
   渲染分发
   ------------------------------------------------------------ */
const QW_CFG = {};
function QW_register(key, cfg){ QW_CFG[key] = cfg; }

function QW_render(key, host){
  const cfg = QW_CFG[key];
  if(!cfg) return;
  /* ★ 必须限定在当前可见的视图里找容器 ★
     否则会抓到另一个视图的 [data-qw-host]（两个视图都在 DOM 里，
     rdtools 排在 qmtools 前面 → 质量管理工具的工具会渲染到研发视图里）。 */
  if(!host){
    const vis = document.querySelector(".view:not(.hide)");
    host = vis ? vis.querySelector("[data-qw-host]") : null;
  }
  if(!host) return;
  QW_ACTIVE = key;
  const fn = {
    table: QW_table, checklist: QW_checklist, pareto: QW_pareto,
    spc: QW_spc, histogram: QW_histogram, strata: QW_strata,
    fishbone: QW_fishbone, why: QW_why, flow: QW_flow, sub: QW_sub,
    shelf: QW_shelf, trace: QW_trace, sensory: QW_sensory,
    calc: gbCalcWidget,
  }[cfg.type];
  if(!fn){ host.innerHTML = `<div class="card empty">未知组件类型：${cfg.type}</div>`; return; }
  host.innerHTML = fn(key, cfg);
  /* 插入 DOM 之后再渲染计算型工具（它要往自己的容器里写） */
  if(cfg.type === "calc") gbRender();
}
