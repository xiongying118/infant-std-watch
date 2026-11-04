/* ================================================================
   test_qw_guide.js —— 小白引导 + 公式术语 + 工具关联 的自测
   ================================================================
   2026-11-04 用户三轮需求：
     ① 「这些计算公式要写出来，每个专业名词要解释清楚」
     ② 「质量管理工具再完善下，我要的是能用，小白都能用，一看就懂，
         要有可实操性，行业是婴幼儿奶粉及乳粉和调制乳粉生产企业」
     ③ 「在质量管理工具最后加多一个功能列，解释各个工具之间的关联性」
   ================================================================ */
const { chromium } = require('playwright-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROT = path.join(ROOT, 'prototype');
const LOCAL = 'file:///' + PROT.replace(/\\/g, '/') + '/index.html';
const URL = process.env.STD_TARGET === 'local' ? LOCAL
  : 'https://xiongying118.github.io/infant-std-watch/';

let pass = 0, fail = 0;
const failures = [];
function ck(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; failures.push(msg); console.log('  ✗ ' + msg); }
}

async function openTool(p, key) {
  await p.evaluate(k => {
    const isRd = (typeof RD !== 'undefined' && RD.modules || []).some(m => m.moduleKey === k);
    if (isRd && typeof toggleRd === 'function') {
      if (typeof curRdKey === 'undefined' || curRdKey !== k) toggleRd(k);
    } else if (typeof toggleQm === 'function') {
      if (typeof curQmKey === 'undefined' || curQmKey !== k) toggleQm(k);
    }
  }, key);
  await p.waitForTimeout(400);
  await p.evaluate(k => {
    const isRd = (typeof RD !== 'undefined' && RD.modules || []).some(m => m.moduleKey === k);
    if (isRd) { if (typeof RD_open === 'function') RD_open(k); }
    else if (typeof QW_open === 'function') QW_open(k);
  }, key);
  await p.waitForTimeout(800);
}

(async () => {
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
  await p.waitForTimeout(4000);
  /* ★ qwlink.json 是异步载入的 → 等它到位 ★ */
  await p.waitForFunction(() => window.QWLink && window.QWLink.LINK, null, { timeout: 15000 })
    .catch(() => console.log('  (关联表未载入，继续)'));

  console.log('\n=== ① 三个新模块都加载了 ===');
  const mods = await p.evaluate(() => ({
    QWForm: typeof window.QWForm,
    QWGuide: typeof window.QWGuide,
    QWLink: typeof window.QWLink,
    terms: window.QWForm ? Object.keys(window.QWForm.DICT).length : 0,
    guides: window.QWGuide ? Object.keys(window.QWGuide.GUIDE).length : 0,
    links: window.QWLink ? (window.QWLINK_DATA ? Object.keys(window.QWLINK_DATA).length : 0) : 0
  }));
  ck(mods.QWForm === 'object', 'QWForm 已加载');
  ck(mods.QWGuide === 'object', 'QWGuide 已加载');
  ck(mods.QWLink === 'object', 'QWLink 已加载');
  ck(mods.terms >= 55, '术语字典 ' + mods.terms + ' 条（期望 ≥55）');
  ck(mods.guides >= 11, '使用说明 ' + mods.guides + ' 类（期望 ≥11）');
  ck(mods.links >= 30, '工具关联 ' + mods.links + ' 个（期望 ≥30）');

  console.log('\n=== ② 每个 QM 工具都有「怎么用」引导 ===');
  const qmKeys = await p.evaluate(() => {
    const q = window.STDWATCH_DATA && window.STDWATCH_DATA.QMTOOLS;
    const t = Array.isArray(q) ? (q[0] || q) : q;
    return (t && t.tools || []).map(x => x.toolKey);
  });
  for (const k of qmKeys) {
    await openTool(p, k);
    const r = await p.evaluate(() => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      if (!host) return { noHost: true };
      const g = host.querySelector('.qwg-box');
      return {
        hasGuide: !!g,
        open: g ? g.hasAttribute('open') : false,
        steps: g ? g.querySelectorAll('.qwg-step').length : 0,
        who: g ? ((g.querySelector('.qwg-who') || {}).textContent || '') : '',
        hasData: g ? !!g.querySelector('.qwg-pre') : false,
        hasRead: g ? g.querySelectorAll('.qwg-read').length : 0,
        hasAction: g ? g.querySelectorAll('.qwg-act').length : 0
      };
    });
    ck(!r.noHost && r.hasGuide, `QM ${k} 有「怎么用」引导`);
    ck(r.steps >= 3, `QM ${k} 引导有 ${r.steps} 个步骤（期望 ≥3）`);
    ck(r.who.indexOf('谁用') >= 0, `QM ${k} 说明了谁用（${r.who}）`);
    ck(r.hasData, `QM ${k} 有行业示例数据`);
    ck(r.hasRead >= 2, `QM ${k} 有 ${r.hasRead} 条「结果怎么看」`);
    ck(r.hasAction >= 2, `QM ${k} 有 ${r.hasAction} 条「下一步做什么」`);
  }

  console.log('\n=== ③ 公式与术语面板（SPC 最全）===');
  await openTool(p, 'spc_control_chart');
  const spc = await p.evaluate(() => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const f = host.querySelector('.qwf-box');
    if (!f) return { noForm: true };
    return {
      formulas: f.querySelectorAll('.qwf-row').length,
      terms: f.querySelectorAll('.qwt-term').length,
      exprs: [...f.querySelectorAll('.qwf-expr code')].map(x => x.textContent.trim()),
      hasVars: !!f.querySelector('.qwf-var'),
      hasTip: !!host.querySelector('.qws[title]')
    };
  });
  ck(!spc.noForm, 'SPC 有公式与术语面板');
  ck(spc.formulas >= 4, 'SPC 列出 ' + spc.formulas + ' 个公式（期望 ≥4）');
  ck(spc.terms >= 10, 'SPC 解释 ' + spc.terms + ' 个术语（期望 ≥10）');
  ck(spc.exprs.some(e => e.indexOf('CL') >= 0 && e.indexOf('/') >= 0),
    'SPC 写出中心线公式：' + (spc.exprs[0] || ''));
  ck(spc.exprs.some(e => e.indexOf('UCL') >= 0 && e.indexOf('3') >= 0),
    'SPC 写出控制限公式');
  ck(spc.hasVars, 'SPC 公式解释了每个符号的含义');
  ck(spc.hasTip, 'SPC 统计卡片带悬停解释');

  console.log('\n=== ④ 工具关联区块 ===');
  for (const k of ['spc_control_chart', 'fishbone', 'five_why', 'pareto', 'batch_trace']) {
    await openTool(p, k);
    const r = await p.evaluate(() => {
      const host = document.querySelector('.view:not(.hide) [data-qw-host]');
      const b = host.querySelector('.qwl-box');
      if (!b) return { noBox: true };
      return {
        rows: b.querySelectorAll('.qwl-row').length,
        links: b.querySelectorAll('.qwl-link').length,
        why: b.querySelectorAll('.qwl-w').length,
        note: !!b.querySelector('.qwl-note'),
        labels: [...b.querySelectorAll('.qwl-label')].map(x => x.textContent.trim())
      };
    });
    ck(!r.noBox, `QM ${k} 有「工具关联」区块`);
    ck(r.links >= 2, `QM ${k} 关联了 ${r.links} 个工具`);
    ck(r.why >= 2, `QM ${k} 有 ${r.why} 条关联理由说明`);
    ck(r.note, `QM ${k} 有使用要点提示`);
    ck(r.labels.some(x => /之前|接着|配套/.test(x)),
      `QM ${k} 关联分三类：${r.labels.join(' / ')}`);
  }

  console.log('\n=== ⑤ 关联链接可点击跳转 ===');
  await openTool(p, 'spc_control_chart');
  const jump = await p.evaluate(async () => {
    const host = document.querySelector('.view:not(.hide) [data-qw-host]');
    const link = host.querySelector('.qwl-link');
    if (!link) return { noLink: true };
    const target = link.getAttribute('onclick').match(/'([^']+)'/)[1];
    link.click();
    await new Promise(r => setTimeout(r, 900));
    const h2 = document.querySelector('.view:not(.hide) [data-qw-host]');
    return {
      target,
      newTool: h2 ? (h2.innerText || '').slice(0, 60) : '',
      hasGuide: h2 ? !!h2.querySelector('.qwg-box') : false
    };
  });
  ck(!jump.noLink, '关联链接存在');
  ck(jump.target && jump.hasGuide,
    `点关联跳到「${jump.target}」并打开了（页面已显示该工具的引导）`);

  console.log('\n=== ⑥ 术语悬停解释有效 ===');
  const tip = await p.evaluate(() => {
    const t = window.QWForm.term('spc.sigma');
    return { len: t.length, has: t.indexOf('标准差') >= 0 };
  });
  ck(tip.has && tip.len > 30, '术语解释内容完整（' + tip.len + ' 字）');

  console.log('\n=== ⑦ 行业特化内容存在 ===');
  const indus = await p.evaluate(() => {
    const g = window.QWGuide.GUIDE;
    const all = JSON.stringify(g) + JSON.stringify(window.QWGuide.BY_KEY || {});
    return {
      hasGb: all.indexOf('GB 10767') >= 0,
      hasWater: all.indexOf('水分') >= 0,
      hasVp: all.indexOf('过氧化值') >= 0,
      hasAllergen: all.indexOf('过敏原') >= 0,
      hasLabel: all.indexOf('标签') >= 0,
      hasMilk: all.indexOf('乳粉') >= 0
    };
  });
  ck(indus.hasGb, '引用了 GB 10767 等婴配粉标准');
  ck(indus.hasWater && indus.hasVp, '示例用水分、过氧化值等真实指标');
  ck(indus.hasAllergen, '涉及过敏原（婴配粉高风险项）');
  ck(indus.hasLabel, '涉及标签核对（注册不符高发点）');
  ck(indus.hasMilk, '涉及乳粉/调制乳粉场景');

  console.log('\n=== 汇总 ===');
  ck(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  ✗ ' + f));
  }
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩了:', e); process.exit(2); });
