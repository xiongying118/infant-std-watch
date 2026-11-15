/* ================================================================
   test_labrecord_20261115.js —— 原始记录「Word 原页 100% 复刻」回归（第四版）
   铁律：底图 = Word 自己导出的 PDF 逐页渲染；标题位置/字体/框线/公式图/
        页码/哪一页放什么内容全部原样；页面不再重排任何一个字。
        只有 4 项（样品名称、生产商、批号/生产日期、检测日期）自动填充；
        标准溶液编码/有效期至默认 Word 原值，仅过期重配时改一次。
        打印 @page margin:0，浏览器自带日期/标题/about:blank/1-1 全不出现。
   用法：NODE_PATH=<playwright路径> STD_TARGET=local|online node scripts/test_labrecord_20261115.js
   ================================================================ */
const { chromium } = require('playwright-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROTOTYPE = 'file:///' + path.join(ROOT, 'prototype').replace(/\\/g, '/');
const URL = (process.env.STD_TARGET === 'online'
  ? 'https://xiongying118.github.io/infant-std-watch'
  : PROTOTYPE) + '/index.html';

let pass = 0, fail = 0;
function ck(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true
  });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  let navOK = false;
  for (let i = 0; i < 6 && !navOK; i++) {
    try { await p.goto(URL + '#lab', { waitUntil: 'domcontentloaded', timeout: 60000 }); navOK = true; }
    catch (e) { console.log('  (重试 ' + (i + 1) + ')'); await p.waitForTimeout(4000); }
  }
  if (!navOK) { console.log('网络不通，中止'); await b.close(); process.exit(2); }
  await p.waitForTimeout(1200);

  console.log('=== ① 原文数据层：9 份 Word 原表一字不改 ===');
  const meta = await p.evaluate(() => (window.LABREC && window.LABREC.projects || []).map(x => ({
    key: x.key, name: x.name, file: x.file, html: x.html || '', sol: x.solutions || []
  })));
  ck(meta.length === 9, '共 9 个检测项目模板');
  const KEYS = ['protein', 'fat', 'moisture', 'chloride', 'phosphorus', 'choline', 'nitrite', 'acidvalue', 'peroxide'];
  KEYS.forEach(k => ck(meta.some(m => m.key === k), '含项目 ' + k));
  ck(new Set(meta.map(m => m.html)).size === 9, '9 份模板内容互不相同（没有套通用表）');
  ck(meta.every(m => m.html.length > 600), '每份模板都含完整原文');
  const allHtml = meta.map(m => m.html).join('');
  ck(allHtml.indexOf('高培（广州）乳业有限公司检测中心') >= 0, '页眉公司名原文保留');
  ck(allHtml.indexOf('GOLDMAX-QM-FORM-005d(01)') >= 0, '页眉记录编号原文保留');
  ck(!/2026102[78]/.test(allHtml.replace(/<[^>]+>/g, '')), '检测日期没有写死原表示例日期');
  const byKey = Object.fromEntries(meta.map(m => [m.key, m]));
  ck(byKey.moisture.html.indexOf('称量瓶恒重质量m3') >= 0, '水分原表列名「称量瓶恒重质量m3」');
  ck(byKey.protein.html.indexOf('消化液体积V3') >= 0, '蛋白质原表列名「消化液体积V3」');
  ck(byKey.choline.html.indexOf('氯化胆碱-d4') >= 0, '胆碱原表内标「氯化胆碱-d4」');
  ck(byKey.nitrite.html.indexOf('镉柱还原效率') >= 0, '亚硝酸盐原表「镉柱还原效率」');
  ck(byKey.peroxide.html.indexOf('硫代硫酸钠') >= 0, '过氧化值原表「硫代硫酸钠」');
  ck(byKey.fat.html.indexOf('空白瓶恒重质量m4') >= 0, '脂肪原表列名「空白瓶恒重质量m4」');
  ck(byKey.acidvalue.html.indexOf('氢氧化钠标液浓度') >= 0, '酸价原表「氢氧化钠标液浓度」');
  ck(byKey.phosphorus.html.indexOf('钒钼酸铵') >= 0, '磷原表「钒钼酸铵」');
  ck(byKey.chloride.html.indexOf('硝酸银标准滴定溶液') >= 0, '氯化物原表「硝酸银标准滴定溶液」');

  console.log('=== ② 整页底图：Word 自己的分页 / 页码 / 框线 ===');
  const pages = await p.evaluate(() => {
    const L = window.LABPAGES || {};
    return Object.keys(L).map(k => ({
      k, w: L[k].w, h: L[k].h, n: L[k].pages.length,
      imgs: L[k].pages.slice(), f: L[k].fields.length,
      keys: L[k].fields.map(f => f.k)
    }));
  });
  ck(pages.length === 9, '9 个项目都有整页底图数据');
  ck(pages.every(x => x.n >= 1), '每个项目至少 1 页');
  const PAGE_COUNT = { protein: 1, fat: 1, moisture: 1, chloride: 1, phosphorus: 2,
                       choline: 2, nitrite: 3, acidvalue: 1, peroxide: 1 };
  KEYS.forEach(k => ck((pages.find(x => x.k === k) || {}).n === PAGE_COUNT[k],
    k + ' 按 Word 原页数为 ' + PAGE_COUNT[k] + ' 页（不合并、不拆页）'));
  ck(pages.reduce((s, x) => s + x.n, 0) === 13, '9 份共 13 页，与 Word 分页完全一致');
  ck(pages.every(x => Math.abs(x.w - 595.32) < 1 && Math.abs(x.h - 841.92) < 1),
    '每页都是 Word 原 A4 纵向尺寸 595.32×841.92pt');
  ck(pages.every(x => x.imgs.every(s => /^recpages\/.+\.png$/.test(s))), '每页底图都是独立 PNG');
  ck(pages.every(x => x.f >= 4), '每页至少 4 个动态位坐标');
  ck(pages.every(x => x.keys.filter(k => k === 'sample').length === 1 &&
                      x.keys.filter(k => k === 'maker').length === 1 &&
                      x.keys.filter(k => k === 'batch').length === 1 &&
                      x.keys.filter(k => k === 'date').length === 1),
    '每个项目只标记 4 个动态位，不多不少');

  console.log('=== ③ 标准溶液：默认原值，无需每次填 ===');
  const sols = await p.evaluate(() => LAB.lrAllSolutions());
  ck(sols.length === 6, '共 6 条标准溶液，实得 ' + sols.length);
  ck(sols.some(s => s.name === '硝酸银滴定溶液标准物质' && s.code === '070-20260423-E' && s.expiry === '20271207'),
    '氯化物：编码与有效期至默认就是 Word 原值');
  ck(sols.some(s => s.name === '胆碱' && s.code === '058-20261022-01'), '胆碱：默认原值');
  ck(sols.some(s => s.name === '硝酸钠标准溶液' && s.code === '072-20251231-E'), '硝酸钠：默认原值');
  ck(meta.filter(m => m.sol.length).length === 4, '只有 4 个项目含标准溶液表');

  console.log('=== ④ 进入原始记录页：只有 4 个动态输入 ===');
  await p.click('button[data-lab="record"]');
  await p.waitForTimeout(500);
  const fields = await p.evaluate(() => ({
    labels: [...document.querySelectorAll('.lr-fields label span')].map(e => e.textContent.trim()),
    inputs: document.querySelectorAll('.lr-fields input').length,
    solOpen: !!document.querySelector('.lr-solbar[open]'),
    hasSignInput: /检验人|复核人/.test(document.querySelector('.lr-fields').textContent)
  }));
  ck(fields.inputs === 4, '顶部只有 4 个输入框（实得 ' + fields.inputs + '）');
  ck(fields.labels.join('|') === '样品名称|生产商|批号/生产日期|检测日期',
    '四个输入分别是样品名称/生产商/批号·生产日期/检测日期');
  ck(!fields.hasSignInput, '检验人、复核人不是变量，没有做成输入框');
  ck(!fields.solOpen, '标准溶液维护默认折叠，打印时不用管');

  console.log('=== ⑤ 预览 = Word 原页，不再重排文字 ===');
  await p.evaluate(() => LAB.lrAll());
  await p.waitForTimeout(500);
  const prev = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.lr-paper').forEach(el => {
      const imgs = [...el.querySelectorAll('img.lr-pageimg')];
      const svgs = [...el.querySelectorAll('svg.lr-ov')];
      out.push({
        key: el.getAttribute('data-lr-sheet'),
        wraps: el.querySelectorAll('.lr-pagewrap').length,
        imgs: imgs.length,
        imgOK: imgs.every(i => i.complete && i.naturalWidth > 1000),
        svgs: svgs.length,
        vb: svgs[0] && svgs[0].getAttribute('viewBox'),
        noTables: el.querySelectorAll('table.lr-wt,.lr-wp,.lr-title,.lr-hdr,.lr-ftr').length === 0,
        noInputs: el.querySelectorAll('input,textarea,select,[contenteditable]').length === 0,
        noWhiteRect: el.querySelectorAll('svg rect').length === 0,
        dyn: [...el.querySelectorAll('text.lr-dyn')].length
      });
    });
    return out;
  });
  ck(prev.length === 9, '全选后铺出 9 张记录');
  ck(prev.every(x => x.wraps === PAGE_COUNT[x.key]), '每张记录页数 = Word 原页数');
  ck(prev.every(x => x.imgs === x.wraps && x.svgs === x.wraps), '每页一张原页图 + 一层动态文字');
  ck(prev.every(x => x.imgOK), '13 张原页位图全部真实加载（2382px 宽）');
  ck(prev.every(x => x.vb === '0 0 595.32 841.92'), 'SVG 坐标与 Word 页面 pt 一一对应');
  ck(prev.every(x => x.noTables), '页面不再重排 HTML 表格：框线/分页都由 Word 原页给出');
  ck(prev.every(x => x.noInputs), '记录纸里没有任何输入框：除动态位外都不可编辑');
  ck(prev.every(x => x.noWhiteRect), '不盖白块，不会遮断 Word 的表格竖框线');
  ck(prev.every(x => x.dyn >= 4), '每份都有动态位文字层');

  console.log('=== ⑥ 填一次，9 张表自动带出（原位覆盖） ===');
  await p.evaluate(() => {
    LAB.lrSet('sample', '迪唯恩2段（长期24个月）');
    LAB.lrSet('maker', '高培');
    LAB.lrSet('batch', '20261101 / A261101');
    LAB.lrSet('date', '20261115');
  });
  await p.waitForTimeout(350);
  const filled = await p.evaluate(() => {
    return [...document.querySelectorAll('.lr-paper')].map(el => {
      const g = k => (el.querySelector('text.lr-dyn[data-lr="' + k + '"]') || {}).textContent;
      return { key: el.getAttribute('data-lr-sheet'), sample: g('sample'), maker: g('maker'),
               batch: g('batch'), date: g('date') };
    });
  });
  ck(filled.length === 9, '9 张表全部更新');
  ck(filled.every(x => x.sample === '迪唯恩2段（长期24个月）'), '9 张表样品名称全部自动带出');
  ck(filled.every(x => x.maker === '高培'), '9 张表生产商全部自动带出');
  ck(filled.every(x => x.batch === '20261101 / A261101'), '9 张表批号/生产日期全部自动带出');
  ck(filled.every(x => x.date === '20261115'), '9 张表检测日期全部自动带出（不写死）');
  ck(filled.every(x => !/2026102[78]/.test(x.date)), '没有残留 Word 示例日期');
  const geo = await p.evaluate(() => {
    const t = document.querySelector('.lr-paper[data-lr-sheet="chloride"] text.lr-dyn[data-lr="sample"]');
    const wrap = t.closest('.lr-pagewrap').getBoundingClientRect();
    return { x: +t.getAttribute('x'), y: +t.getAttribute('y'), fs: +t.getAttribute('font-size'),
             w: Math.round(wrap.width), h: Math.round(wrap.height) };
  });
  ck(geo.x > 240 && geo.x < 280 && geo.y > 120 && geo.y < 135, '样品名称写在 Word 原格中心（x/y 精确）');
  ck(geo.fs >= 10 && geo.fs <= 11, '动态文字沿用 Word 原字号');
  ck(Math.abs(geo.w / geo.h - 595.32 / 841.92) < 0.02, '预览整页保持 Word A4 比例，不变形');

  console.log('=== ⑦ 标准溶液打印时不用填，改一次就记住 ===');
  const before = await p.evaluate(() =>
    (document.querySelector('.lr-paper[data-lr-sheet="chloride"] text[data-lr="stdcode"]') || {}).textContent);
  ck(before === '070-20260423-E', '未改时打印出来的就是 Word 原值（不用填）');
  await p.click('.lr-solbar summary');
  await p.waitForTimeout(250);
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.lr-solrow')];
    const row = rows.find(r => r.querySelector('b').textContent.indexOf('硝酸银') >= 0);
    const inp = row.querySelectorAll('input')[0];
    inp.value = '070-20261115-N';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({
    cell: (document.querySelector('.lr-paper[data-lr-sheet="chloride"] text[data-lr="stdcode"]') || {}).textContent,
    sol: LAB.lrSol()['硝酸银滴定溶液标准物质']
  }));
  ck(after.cell === '070-20261115-N', '改一次，对应项目的编码立刻更新');
  ck(after.sol && after.sol.code === '070-20261115-N', '覆盖值已写进本机保存');

  console.log('=== ⑧ 打印：13 页原页 + 无浏览器页眉页脚 ===');
  const printHtml = await p.evaluate(() => {
    let out = '';
    const orig = window.open;
    window.open = function () { return { document: { write: s => { out += s }, close: () => {} }, focus: () => {}, print: () => {} } };
    LAB.lrPrint();
    window.open = orig;
    return out;
  });
  ck((printHtml.match(/class="pg"/g) || []).length === 13, '9 个项目共送 13 页（Word 原分页）');
  ck(printHtml.indexOf('@page{size:A4 portrait;margin:0}') >= 0, '@page margin:0 → 浏览器自带页眉页脚无落点');
  ck(!/class="pg"[^>]*>\s*<div class="lr-paper"/.test(printHtml), '打印页里没有重排后的 HTML 记录纸');
  ck(printHtml.indexOf('class="lr-title"') < 0, '打印页没有自造标题');
  ck(printHtml.indexOf('class="lr-wt"') < 0 && printHtml.indexOf('class="lr-hdr') < 0,
    '打印页不再有自画的表格/页眉框线（避免多出框线）');
  ck(printHtml.indexOf('about:blank') < 0 && printHtml.indexOf('1/1') < 0, '打印文档不含浏览器页眉页脚文字');
  ck((printHtml.match(/class="lr-pageimg"/g) || []).length === 13, '13 页都引用 Word 原页位图');
  ck((printHtml.match(/width:595\.32pt;height:841\.92pt/g) || []).length === 13, '每页固定 A4 物理尺寸');
  ck(printHtml.indexOf('迪唯恩2段（长期24个月）') >= 0, '打印页含自动填充的样品名称');
  ck(printHtml.indexOf('20261115') >= 0, '打印页含自动填充的检测日期');
  ck(printHtml.indexOf('070-20261115-N') >= 0, '打印页含改过的标准溶液编码');
  ck(!/\.lr-wt td\{[^}]*font-size/.test(printHtml), '打印 CSS 不统一覆盖字号');
  ck(!/\.lr-wt td\{[^}]*height:/.test(printHtml), '打印 CSS 不强制行高');
  ck(printHtml.indexOf('position:relative;display:block') >= 0, '每页独立定位，不串页');

  console.log('=== ⑨ 刷新后仍在（本机保存） ===');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.click('button[data-lab="record"]');
  await p.waitForTimeout(450);
  const persisted = await p.evaluate(() => ({
    info: LAB.lrInfo(),
    sol: LAB.lrSol()['硝酸银滴定溶液标准物质'],
    selected: LAB.lrSelected().length,
    first: (document.querySelector('.lr-paper text[data-lr="sample"]') || {}).textContent,
    imgOK: (() => { const i = document.querySelector('.lr-pageimg'); return !!i && i.complete && i.naturalWidth > 1000; })()
  }));
  ck(persisted.info.sample === '迪唯恩2段（长期24个月）', '刷新后样品名称还在');
  ck(persisted.info.maker === '高培', '刷新后生产商还在');
  ck(persisted.info.batch === '20261101 / A261101', '刷新后批号还在');
  ck(persisted.info.date === '20261115', '刷新后检测日期还在（本机保存，下次不用重填）');
  ck(persisted.sol && persisted.sol.code === '070-20261115-N', '刷新后标准溶液新编码还在');
  ck(persisted.selected === 9, '刷新后项目勾选还在');
  ck(persisted.first === '迪唯恩2段（长期24个月）', '刷新后模板里自动带出样品信息');
  ck(persisted.imgOK, '刷新后 Word 原页底图仍在');

  console.log('=== ⑩ 手机端不溢出 ===');
  for (const w of [390, 430]) {
    const m = await ctx.newPage();
    await m.setViewportSize({ width: w, height: 844 });
    await m.goto(URL + '#lab', { waitUntil: 'domcontentloaded' });
    await m.waitForTimeout(1000);
    await m.click('button[data-lab="record"]');
    await m.waitForTimeout(400);
    const r = await m.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      paper: Math.round((document.querySelector('.lr-paper') || {}).getBoundingClientRect().width || 0),
      side: getComputedStyle(document.querySelector('.side')).position
    }));
    ck(r.sw === w, w + 'px 手机无横向溢出（scrollWidth=' + r.sw + '）');
    ck(r.paper <= w, w + 'px 手机整页等比缩小到屏宽（记录宽 ' + r.paper + 'px）');
    ck(r.side === 'fixed', w + 'px 侧栏仍是抽屉 fixed');
    await m.close();
  }

  ck(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs[0] : ''));
  console.log('\n=== 结果：' + pass + '/' + (pass + fail) + ' ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
