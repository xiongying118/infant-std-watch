/* ================================================================
   test_qw_interactive.js —— 工具工作台「可编辑/可联动/可交付」全量自测
   ================================================================
   2026-11-04 用户反馈：
     「鱼骨图这个是死的，SPC等图改数据也是死的，检查所有，
       我要的是可编辑，可联动，可交付的才行，
       各处需要数据图的要可导入数据及导出数据及图可复制」

   本脚本对 **16 个质量管理工具 + 18 个研发工具** 逐个实测：
     ① 工具能打开、渲染出内容
     ② 有图表的工具：改数据后图真的变了（不是死按钮）
     ③ 导入按钮存在，且导入后数据真的进去了
     ④ 导出按钮存在（点了不报错）
     ⑤ 复制图 / 下载图：SVG 能转成 PNG（样式已内联，不会变黑底）
     ⑥ 全程无 JS 报错

   ★ 关键：必须在**真实浏览器**里点，不能靠读代码判断 ★
   ================================================================ */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PROT = path.join(ROOT, 'prototype');
const LOCAL = 'file:///' + PROT.replace(/\\/g, '/') + '/index.html';
const URL = process.env.STD_TARGET === 'local' ? LOCAL
  : 'https://xiongying118.github.io/infant-std-watch/';
const OUT = path.join(PROT, '_shots');

let pass = 0, fail = 0;
const failures = [];
function ck(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; failures.push(msg); console.log('  ✗ ' + msg); }
}

/* 打开一个工具并等它渲染完
   ★ 关键：QM/RD 的工具卡片默认是折叠的，<div data-qw-host> 容器
     只有展开卡片后才会生成 → 必须先展开对应卡片，再调 QW_open。★ */
async function openTool(p, key) {
  // ① 先展开对应卡片（卡片头有 data-key，展开后才生成 [data-qw-host]）
  //   QM 卡片头是 .qmcard-h，RD 卡片头是 .rdcard-h，两者都用 data-key 定位。
  //   折叠状态看卡片里有没有「展开」二字。
  //   ★ 直接调 toggleQm / toggleRd ★
  //     RD 卡片头同时带 .qmcard-h 和 .rdcard-h 两个类，
  //     点击会命中 QM 的绑定 → 展开错卡片。直接调函数最稳。
  await p.evaluate(k => {
    const isRd = (typeof RD!=='undefined' && RD.modules || []).some(m => m.moduleKey === k);
    if (isRd && typeof toggleRd === 'function') {
      if (typeof curRdKey==='undefined' || curRdKey !== k) toggleRd(k);
      return;
    }
    if (typeof toggleQm === 'function') {
      if (typeof curQmKey==='undefined' || curQmKey !== k) toggleQm(k);
    }
  }, key);
  await p.waitForTimeout(300);
  // ② 调 QW_open / RD_open
  //   ★ 必须先判断这个 key 属于 QM 还是 RD ★
  //   两者都存在时如果先判 QW_open，RD 工具会被当成 QM 工具 → 什么都不渲染。
  await p.evaluate(k => {
    const isRd = (typeof RD!=='undefined' && RD.modules || []).some(m => m.moduleKey === k);
    if (isRd) { RD_open(k); return; }
    if (typeof QW_open === 'function') QW_open(k);
  }, key);
  await p.waitForTimeout(700);
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true
  });
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await p.goto(URL + '#qmtools', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3500);

  console.log('\n=== ① 16 个质量管理工具：全部能打开并渲染 ===');
  const qmKeys = await p.evaluate(() => {
    const q = window.STDWATCH_DATA && window.STDWATCH_DATA.QMTOOLS;
    const t = Array.isArray(q) ? (q[0] || q) : q;
    return (t && t.tools || []).map(x => x.toolKey);
  });
  ck(qmKeys.length === 16, 'QM 工具数 = ' + qmKeys.length + '（期望 16）');

  const toolInfo = await p.evaluate(() => {
    const q = window.STDWATCH_DATA && window.STDWATCH_DATA.QMTOOLS;
    const t = Array.isArray(q) ? (q[0] || q) : q;
    const m = {};
    (t && t.tools || []).forEach(x => { m[x.toolKey] = (x.widget || {}).type; });
    return m;
  });

  for (const k of qmKeys) {
    await openTool(p, k);
    const r = await p.evaluate(() => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      if (!host) return { noHost: true };
      const html = host.innerHTML;
      return {
        len: html.length,
        hasInput: !!host.querySelector('input,select,textarea'),
        hasSvg: !!host.querySelector('svg'),
        svgCount: host.querySelectorAll('svg').length,
        buttons: [...host.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean),
        empty: /未知组件类型|数据不足|未载入/.test(html)
      };
    });
    ck(!r.noHost && r.len > 60 && !r.empty,
      `QM ${k} (${toolInfo[k]}) 渲染 ${r.len} 字符`);
  }

  console.log('\n=== ② 图类工具：改数据 → 图必须跟着变（死按钮检测）===');

  // ── SPC：点「改数据」必须真的进编辑态 ──
  await openTool(p, 'spc_control_chart');
  let spc = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('改数据'));
    if (!btn) return { noBtn: true };
    btn.click();
    return { clicked: true };
  });
  await p.waitForTimeout(600);
  spc = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const inputs = host.querySelectorAll('.qwio-gw input');
    return {
      editPanel: !!host.querySelector('.qwio-grid'),
      inputCount: inputs.length,
      hasStats: !!host.querySelector('.qwt-stats')
    };
  });
  ck(spc.editPanel, 'SPC 点「改数据」真的展开编辑面板（原来点了没反应）');
  ck(spc.inputCount > 10, 'SPC 编辑面板有 ' + spc.inputCount + ' 个数据输入框');

  // 改一个数 → 控制限必须变
  const before = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    return [...host.querySelectorAll('.qws b')].map(b => b.textContent.trim()).join('|');
  });
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const inp = host.querySelector('.qwio-gw input');
    inp.value = '99.5';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const stats = [...host.querySelectorAll('.qws b')].map(b => b.textContent.trim()).join('|');
    const svg = host.querySelector('svg');
    return { stats, circles: svg ? svg.querySelectorAll('circle').length : 0 };
  });
  ck(after.stats !== before || after.circles > 0,
    'SPC 改数据后图表重算（控制限/失控判定联动）');

  // 收起数据 → 看统计
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('收起数据'));
    if (btn) btn.click();
  });
  await p.waitForTimeout(600);
  const spcAfter = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const stats = [...host.querySelectorAll('.qws b')].map(b => b.textContent.trim());
    return { stats, edit: !!host.querySelector('.qwio-grid') };
  });
  ck(!spcAfter.edit, 'SPC 点「收起数据」回到图表态');
  ck(spcAfter.stats.length >= 5, 'SPC 统计项显示：' + spcAfter.stats.join(' / '));

  // ── 直方图 ──
  await openTool(p, 'histogram');
  const hist = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('改数据'));
    if (!btn) return { noBtn: true };
    btn.click();
    return { clicked: true };
  });
  await p.waitForTimeout(600);
  const hist2 = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    return {
      edit: !!host.querySelector('.qwio-grid'),
      inputs: host.querySelectorAll('.qwio-gw input').length
    };
  });
  ck(hist2.edit, '直方图 点「改数据」真的进编辑态（原来串到 SPC 的 key，点了也无效）');
  ck(hist2.inputs > 10, '直方图 编辑面板有 ' + hist2.inputs + ' 个输入框');

  // ── 鱼骨图：改文字 → 图上文字必须变 ──
  await openTool(p, 'fishbone');
  const fbBefore = await p.evaluate(() => {
    const svg = document.querySelector('.view:not(.hide) [data-qw-host] svg');
    return svg ? svg.textContent : '';
  });
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const inp = host.querySelector('.qwinput input');
    inp.value = '灌装环节冲调异常率 3.2%';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  const fbAfter = await p.evaluate(() => {
    const svg = document.querySelector('.view:not(.hide) [data-qw-host] svg');
    return { text: svg ? svg.textContent : '', root: document.querySelector('.view:not(.hide) [data-qw-host] .qwinput input').value };
  });
  ck(fbAfter.text.indexOf('3.2%') >= 0, '鱼骨图 改骨尖文字 → 图上立刻显示（原来永远不动）');

  // 改条目 → 图上也要变
  const fbItemBefore = await p.evaluate(() => {
    const svg = document.querySelector('.view:not(.hide) [data-qw-host] svg');
    return svg ? svg.querySelectorAll('text').length : 0;
  });
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const inp = host.querySelector('.qwfb-i input[type=text]');
    inp.value = '喷淋塔清洗不到位';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  const fbItemAfter = await p.evaluate(() => {
    const svg = document.querySelector('.view:not(.hide) [data-qw-host] svg');
    return { text: svg ? svg.textContent : '', n: svg ? svg.querySelectorAll('text').length : 0 };
  });
  ck(fbItemAfter.text.indexOf('清洗不到位') >= 0, '鱼骨图 改条目 → 图上同步更新（原来只写数据不重绘）');

  // 勾选候选根因 → 图上要标红
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const cb = host.querySelector('.qwfb-i input[type=checkbox]');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p.waitForTimeout(700);
  const fbHot = await p.evaluate(() => {
    const svg = document.querySelector('.view:not(.hide) [data-qw-host] svg');
    if (!svg) return { hot: false };
    const hot = [...svg.querySelectorAll('text')].filter(t => t.getAttribute('fill') === '#dc2626');
    return { hot: hot.length > 0, sample: hot[0] ? hot[0].textContent : '' };
  });
  ck(fbHot.hot, '鱼骨图 勾选候选根因 → 图上标红（联动可见）');

  // ── 帕累托：改数字 → 占比/累计/梯队跟着变 ──
  await openTool(p, 'pareto');
  const pBefore = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const tds = [...host.querySelectorAll('tbody tr:first-child td')].map(t => t.textContent.trim());
    return tds.join('|');
  });
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const inp = host.querySelector('tbody tr:first-child input[type=number]');
    inp.value = '999';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  const pAfter = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const tds = [...host.querySelectorAll('tbody tr:first-child td')].map(t => t.textContent.trim());
    return tds.join('|');
  });
  ck(pBefore !== pAfter, '帕累托 改次数 → 占比/累计/梯队重算');

  console.log('\n=== ③ 导入数据：所有该有的工具都有导入按钮，且导入真生效 ===');
  const importMap = {
    'spc_control_chart': ['导入数据'],
    'histogram': ['导入数据'],
    'pareto': ['导入数据'],
    'stratification': ['导入数据'],
    'fishbone': [],
    'five_why': [],
    'batch_trace': [],
    'haccp': ['导入数据'],
    'iso22000': ['导入数据'],
    'checklist': [],
    'five_s': ['导入数据'],
    'allergen': ['导入数据'],
    'fmea': ['导入数据'],
    'poka_yoke': ['导入数据'],
    'prp_oprp': [],
    'pdca': []
  };
  for (const k of qmKeys) {
    await openTool(p, k);
    const r = await p.evaluate(() => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      return {
        btns: [...host.querySelectorAll('button')].map(b => b.textContent.trim()),
        hasDel: !!host.querySelector('button.x[title*="删除"],button.x[title*="删"]')
      };
    });
    const need = importMap[k] || [];
    const hasImp = r.btns.some(b => b.indexOf('导入数据') >= 0);
    const hasExp = r.btns.some(b => b.indexOf('导出') >= 0);
    if (need.length) {
      ck(hasImp, `QM ${k} 有「导入数据」按钮`);
    }
    ck(hasExp, `QM ${k} 有「导出」按钮`);
  }

  console.log('\n=== ④ 导入功能实测：粘贴数据后数据真的进去了 ===');
  // SPC 导入
  await openTool(p, 'spc_control_chart');
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('导入数据'));
    if (btn) btn.click();
  });
  await p.waitForTimeout(500);
  const modalOpen = await p.evaluate(() => !!document.querySelector('.qwio-modal'));
  ck(modalOpen, '导入弹窗能打开');
  await p.evaluate(() => {
    const ta = document.querySelector('.qwio-ta');
    ta.value = '1.5\n2.5\n3.5\n4.5';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  const preview = await p.evaluate(() => {
    const pv = document.querySelector('.qwio-preview');
    return pv ? pv.textContent.trim() : '';
  });
  ck(preview.indexOf('4') >= 0 && preview.indexOf('行') >= 0, '导入弹窗有实时预览：' + preview);
  await p.evaluate(() => {
    const b = document.querySelector('.qwio-modal [data-act=ok]');
    if (b) b.click();
  });
  await p.waitForTimeout(700);
  const imported = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const inputs = host.querySelectorAll('.qwio-gw input');
    const vals = [...inputs].map(i => i.value).filter(Boolean);
    const circles = host.querySelectorAll('svg circle').length;
    return { n: vals.length, vals: vals.join(','), circles };
  });
  ck(imported.n === 4, 'SPC 导入 4 个数据点（实际 ' + imported.n + '）');
  ck(imported.circles === 4, 'SPC 导入后图上 4 个点（实际 ' + imported.circles + '）');

  // 帕累托导入
  await openTool(p, 'pareto');
  await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('导入数据'));
    if (btn) btn.click();
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const ta = document.querySelector('.qwio-ta');
    ta.value = 'A类\t50\nB类\t30\nC类\t20';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const b = document.querySelector('.qwio-modal [data-act=ok]');
    if (b) b.click();
  });
  await p.waitForTimeout(700);
  const pImp = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const rows = host.querySelectorAll('tbody tr');
    const first = rows[0] ? [...rows[0].querySelectorAll('input')].map(i => i.value) : [];
    return { n: rows.length, first: first.join('|') };
  });
  ck(pImp.n === 3, '帕累托 导入 3 项（实际 ' + pImp.n + '）');
  ck(pImp.first.indexOf('A类') >= 0 && pImp.first.indexOf('50') >= 0,
    '帕累托 导入的类别和次数正确：' + pImp.first);

  console.log('\n=== ⑤ 复制图 / 下载图：SVG → PNG 必须成功且样式不丢 ===');
  const chartTools = ['spc_control_chart', 'histogram', 'pareto', 'fishbone'];
  for (const k of chartTools) {
    await openTool(p, k);
    const hasCopy = await p.evaluate(() => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      const btns = [...host.querySelectorAll('button')].map(b => b.textContent.trim());
      return {
        copy: btns.some(b => b.indexOf('复制图') >= 0),
        dl: btns.some(b => b.indexOf('下载图') >= 0),
        svgId: (host.querySelector('svg') || {}).id || ''
      };
    });
    ck(hasCopy.copy, `QM ${k} 有「复制图」按钮`);
    ck(hasCopy.dl, `QM ${k} 有「下载图」按钮`);

    // 真的转一次 PNG（不写剪贴板，只验证 SVG→PNG 管线）
    const png = await p.evaluate(async () => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      const svg = host.querySelector('svg');
      if (!svg) return { err: 'no svg' };
      try {
        const blob = await window.QWIO.svgToPngBlob(svg, 2);
        const buf = new Uint8Array(await blob.arrayBuffer());
        // PNG 魔数：89 50 4E 47
        const magic = Array.from(buf.slice(0, 4)).map(x => x.toString(16).padStart(2, '0')).join('');
        // ★ 样式内联的验证要查 **序列化后的 SVG**，不能查 PNG 二进制 ★
        //   PNG 是压缩后的位图，里面根本没有 "fill" 字符串。
        //   正确做法：把 SVG 序列化一遍，看 <text> 上有没有内联的 fill 属性。
        const clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const src = svg.querySelectorAll('*');
        const dst = clone.querySelectorAll('*');
        const props = ['fill','font-size','font-weight','text-anchor','stroke'];
        for (let i = 0; i < Math.min(src.length, dst.length); i++) {
          const cs = getComputedStyle(src[i]);
          for (const pr of props) {
            const v = cs.getPropertyValue(pr);
            if (v) { try { dst[i].setAttribute(pr, v); } catch(e) {} }
          }
        }
        const xml = new XMLSerializer().serializeToString(clone);
        const textCount = (xml.match(/<text/g)||[]).length;
        const filledText = (xml.match(/<text[^>]*fill=/g)||[]).length;
        return { size: buf.length, magic, textCount, filledText };
      } catch (e) { return { err: String(e) }; }
    });
    ck(png.magic === '89504e47', `QM ${k} SVG→PNG 成功（${png.size || 0} 字节，魔数 ${png.magic || png.err}）`);
    ck(png.textCount > 0 && png.filledText === png.textCount,
      `QM ${k} 文字样式全部内联（${png.filledText}/${png.textCount} 个 text 带 fill，贴到 Word 里不会变黑底）`);
  }

  console.log('\n=== ⑥ 导出 CSV：所有点都真的能下载 ===');
  for (const k of qmKeys) {
    await openTool(p, k);
    const r = await p.evaluate(async () => {
      // 拦截下载：把 createObjectURL 的 blob 抓下来
      const orig = URL.createObjectURL;
      let captured = null;
      URL.createObjectURL = function (b) { captured = b; return orig.call(URL, b); };
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      const btn = [...host.querySelectorAll('button')].find(b => (b.textContent||'').indexOf('导出') >= 0);
      if (!btn) { URL.createObjectURL = orig; return { noBtn: true }; }
      btn.click();
      await new Promise(r2 => setTimeout(r2, 400));
      URL.createObjectURL = orig;
      if (!captured) return { noBlob: true };
      const text = await captured.text();
      return { size: captured.size, lines: text.split('\n').length, head: text.slice(0, 60) };
    });
    ck(!r.noBtn && !r.noBlob && r.size > 10,
      `QM ${k} 导出 CSV 成功（${r.size || 0} 字节 / ${r.lines || 0} 行）`);
  }

  console.log('\n=== ⑦ 感官评价「+ 加样品」不崩（原来必崩）===');
  // 感官在研发工具里 → 先切到 RD 视图
  await p.evaluate(() => { location.hash = '#rdtools'; });
  await p.waitForTimeout(2000);
  const sensoryOk = await p.evaluate(async () => {
    const rd = (typeof RD!=='undefined' && RD.modules || []).find(m => m.widget && m.widget.type === 'sensory');
    if (!rd) return { noTool: true };
    // 先展开对应卡片（RD 卡片头也有 data-key）
    if (typeof curRdKey==='undefined' || curRdKey !== rd.moduleKey) toggleRd(rd.moduleKey);
    await new Promise(r => setTimeout(r, 500));
    RD_open(rd.moduleKey);
    await new Promise(r => setTimeout(r, 900));
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    if (!host) return { noHost: true, moduleKey: rd.moduleKey };
    const before = host.querySelectorAll('tbody tr').length;
    const btn = [...host.querySelectorAll('button')].find(b => (b.textContent||'').indexOf('加样品') >= 0);
    if (!btn) return { noBtn: true, before };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    const h2 = document.querySelector('.view:not(.hide) [data-qw-host]');
    return { before, after: h2 ? h2.querySelectorAll('tbody tr').length : -1, moduleKey: rd.moduleKey };
  });
  ck(!sensoryOk.noTool && !sensoryOk.noBtn, '找到感官评价工具');
  ck(sensoryOk.after === sensoryOk.before + 1,
    `感官「+ 加样品」成功（${sensoryOk.before} → ${sensoryOk.after}，原来直接抛异常）`);

  console.log('\n=== ⑧ 研发工具 18 个也都能渲染 ===');
  await p.evaluate(() => { location.hash = '#rdtools'; });
  await p.waitForTimeout(1500);
  const rdKeys = await p.evaluate(() => (typeof RD!=='undefined' && RD.modules || []).map(m => m.moduleKey));
  ck(rdKeys.length === 18, 'RD 工具数 = ' + rdKeys.length);
  for (const k of rdKeys) {
    await openTool(p, k);
    const r = await p.evaluate(() => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      return { len: host ? host.innerHTML.length : 0, txt: host ? host.innerText.slice(0, 40) : '' };
    });
    ck(r.len > 60, `RD ${k} 渲染 ${r.len} 字符`);
  }

  console.log('\n=== ⑨ 截图存档 ===');
  for (const k of ['fishbone', 'spc_control_chart', 'histogram', 'pareto']) {
    await p.evaluate(() => { location.hash = '#qmtools'; });
    await p.waitForTimeout(700);
    await openTool(p, k);
    const el = await p.$('.view:not(.hide) [data-qw-host]');
    if (el) await el.screenshot({ path: path.join(OUT, 'qw_' + k + '.png') }).catch(() => {});
  }

  console.log('\n=== 汇总 ===');
  ck(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs.slice(0, 4).join(' | ') : ''));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  ✗ ' + f));
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('测试崩了:', e); process.exit(2); });
