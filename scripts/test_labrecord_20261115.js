/* ================================================================
   test_labrecord_20261115.js —— 原始记录「按检测项目」模板回归
   覆盖：9 份 Word 原表完整性 / 样品信息一次填充 / 多选 / 打印 / 落盘 / 手机
   用法：NODE_PATH=<playwright路径> STD_TARGET=local node scripts/test_labrecord_20261115.js
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
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  let navOK = false;
  for (let i = 0; i < 6 && !navOK; i++) {
    try { await p.goto(URL + '#lab', { waitUntil: 'domcontentloaded', timeout: 60000 }); navOK = true; }
    catch (e) { console.log('  (重试 ' + (i + 1) + ')'); await p.waitForTimeout(4000); }
  }
  if (!navOK) { console.log('网络不通，中止'); await b.close(); process.exit(2); }
  await p.waitForTimeout(1200);

  console.log('=== ① 数据层：9 份原表 ===');
  const meta = await p.evaluate(() => (window.LABREC && window.LABREC.projects || []).map(x => ({
    key: x.key, name: x.name, basis: x.basis, item: x.item,
    tables: x.tables.length, notes: x.notes.length,
    heads: x.tables.map(t => (t.grid[0] || []).map(c => c.t).join('|'))
  })));
  ck(meta.length === 9, '共 9 个检测项目模板');
  const KEYS = ['protein', 'fat', 'moisture', 'chloride', 'phosphorus', 'choline', 'nitrite', 'acidvalue', 'peroxide'];
  KEYS.forEach(k => ck(meta.some(m => m.key === k), '含项目 ' + k));
  ck(meta.every(m => m.basis && m.basis.indexOf('GB ') === 0), '每个项目都有原文检验依据');
  ck(meta.every(m => m.item), '每个项目都有检验项目及单位');
  ck(meta.every(m => m.tables >= 1), '每个项目至少一张数据表');
  ck(meta.every(m => m.notes >= 1), '每个项目都保留原文方法/计算式');
  ck(new Set(meta.map(m => m.basis)).size === 9, '9 个项目的检验依据互不相同（没有套同一模板）');
  const byKey = Object.fromEntries(meta.map(m => [m.key, m]));
  ck(byKey.moisture.heads[0].indexOf('称量瓶恒重质量m3') >= 0, '水分表含原表列名「称量瓶恒重质量m3」');
  ck(byKey.protein.heads[0].indexOf('消化液体积V3') >= 0, '蛋白质表含原表列名「消化液体积V3」');
  ck(byKey.nitrite.tables === 6, '亚硝酸盐与硝酸盐保留 6 张原表（标准溶液/曲线/还原效率/试样等）');
  ck(byKey.fat.tables === 2, '脂肪保留空白试验 + 试样测定 2 张表');

  console.log('=== ② 进入原始记录页 ===');
  await p.click('button[data-lab="record"]');
  await p.waitForTimeout(500);
  ck(await p.locator('#labBody').innerText().then(t => t.indexOf('按检测项目出模板') >= 0), '默认进入「按检测项目」模式');
  ck((await p.locator('.lr-chip').count()) === 9, '9 个项目可勾');
  ck((await p.locator('[data-lr-sheet]').count()) >= 1, '默认已出一张模板');

  console.log('=== ③ 样品信息一次填充 ===');
  await p.click('button:has-text("全选")');
  await p.waitForTimeout(350);
  ck((await p.locator('[data-lr-sheet]').count()) === 9, '全选后 9 张模板全部出来');
  const inputs = p.locator('.lr-fields input');
  await inputs.nth(0).fill('迪唯恩2段（长期24个月）');
  await inputs.nth(1).fill('高培');
  await inputs.nth(2).fill('20261101 / 批号 A261101');
  await p.waitForTimeout(250);
  const vals = await p.evaluate(() => ({
    s: [...document.querySelectorAll('[data-lr="sample"]')].map(e => e.textContent),
    m: [...document.querySelectorAll('[data-lr="maker"]')].map(e => e.textContent),
    b: [...document.querySelectorAll('[data-lr="batch"]')].map(e => e.textContent),
    focus: document.activeElement && document.activeElement.getAttribute('oninput')
  }));
  ck(vals.s.length === 9 && vals.s.every(x => x === '迪唯恩2段（长期24个月）'), '样品名称自动填进 9 张表');
  ck(vals.m.length === 9 && vals.m.every(x => x === '高培'), '生产商自动填进 9 张表');
  ck(vals.b.length === 9 && vals.b.every(x => x.indexOf('A261101') >= 0), '批号/生产日期自动填进 9 张表');
  ck(String(vals.focus || '').indexOf('lrSet') >= 0, '填写过程不重绘、输入框焦点未丢');
  const stat = await p.locator('#lrStat').innerText();
  ck(stat.indexOf('9 张') >= 0, '状态条显示已填充 9 张');

  console.log('=== ④ 每个项目内容不同 ===');
  const sheets = await p.evaluate(() => [...document.querySelectorAll('[data-lr-sheet]')].map(e => ({
    key: e.getAttribute('data-lr-sheet'), text: e.innerText
  })));
  ck(sheets.length === 9, '预览里 9 张纸');
  ck(new Set(sheets.map(s => s.text)).size === 9, '9 张纸正文互不相同');
  ck(sheets.find(s => s.key === 'moisture').text.indexOf('GB 5009.3-2016') >= 0, '水分页用 GB 5009.3-2016');
  ck(sheets.find(s => s.key === 'nitrite').text.indexOf('GB 5009.33-2025') >= 0, '亚硝酸盐页用 GB 5009.33-2025');
  ck(sheets.find(s => s.key === 'choline').text.indexOf('GB 5413.20') >= 0, '胆碱页用 GB 5413.20-2022');
  ck(sheets.every(s => s.text.indexOf('样品名称') >= 0 || s.text.indexOf('样 品 名 称') >= 0), '每张都有样品抬头');
  ck(sheets.every(s => s.text.indexOf('检验人') >= 0 && s.text.indexOf('复核人') >= 0), '每张都有检验人/复核人签字栏');

  console.log('=== ⑤ 选择与打印 ===');
  await p.click('button:has-text("清空")');
  await p.waitForTimeout(250);
  ck((await p.locator('[data-lr-sheet]').count()) === 0, '清空后不出模板');
  await p.evaluate(() => LAB.lrToggle('moisture'));
  await p.waitForTimeout(200);
  ck((await p.locator('[data-lr-sheet="moisture"]').count()) === 1, '单选水分只出水分模板');

  await p.evaluate(() => {
    window.__printHtml = '';
    window.open = function () {
      return {
        document: { write: s => { window.__printHtml += s; }, close: () => {} },
        focus: () => {}, print: () => {}
      };
    };
  });
  await p.evaluate(() => LAB.lrPrint());
  await p.waitForTimeout(500);
  const ph = await p.evaluate(() => window.__printHtml);
  ck(ph.indexOf('@page{size:A4 landscape') >= 0, '打印页 A4 横向');
  ck((ph.match(/class="pg"/g) || []).length === 1, '只打选中的 1 张');
  ck(ph.indexOf('迪唯恩2段') >= 0 && ph.indexOf('高培') >= 0, '打印页带自动填充的样品信息');
  ck(ph.indexOf('称量瓶恒重质量m3') >= 0, '打印页含水分原表列名');
  ck(ph.indexOf('计算式') >= 0 || ph.indexOf('计算公式') >= 0, '打印页含原文计算式（默认附）');

  await p.evaluate(() => { LAB.lrNotes(false); window.__printHtml = ''; LAB.lrPrint(); });
  await p.waitForTimeout(450);
  const ph2 = await p.evaluate(() => window.__printHtml);
  ck(ph2.indexOf('检测方法 / 仪器 / 计算式') < 0, '取消勾选后只打空白表');
  ck(ph2.indexOf('称量瓶恒重质量m3') >= 0, '空白表仍保留原表列名');
  await p.evaluate(() => LAB.lrNotes(true));

  console.log('=== ⑥ 批量打印 / 落盘 / 模式切换 ===');
  await p.evaluate(() => { LAB.lrAll(); window.__printHtml = ''; LAB.lrPrint(); });
  await p.waitForTimeout(450);
  const ph3 = await p.evaluate(() => window.__printHtml);
  ck((ph3.match(/class="pg"/g) || []).length === 9, '一次打印 9 张，每张独立成页');
  ck((ph3.match(/page-break-after:always/g) || []).length >= 1, '打印样式含分页控制');

  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.click('button[data-lab="record"]');
  await p.waitForTimeout(400);
  const persisted = await p.evaluate(() => LAB.lrInfo());
  ck(persisted.sample === '迪唯恩2段（长期24个月）' && persisted.maker === '高培', '刷新后样品信息还在');
  ck((await p.locator('[data-lr-sheet]').count()) === 9, '刷新后项目选择也保留');

  await p.click('button:has-text("按方法标准")');
  await p.waitForTimeout(300);
  ck(await p.locator('#labBody').innerText().then(t => t.indexOf('选检测方法') >= 0), '可切回按方法标准模式');
  await p.click('button:has-text("按检测项目")');
  await p.waitForTimeout(300);
  ck((await p.locator('.lr-chip').count()) === 9, '可切回按检测项目模式');

  console.log('=== ⑦ 手机端 ===');
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.goto(URL + '#lab', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mp.waitForTimeout(1000);
  await mp.click('button[data-lab="record"]');
  await mp.waitForTimeout(400);
  const ov = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ck(ov.sw <= ov.iw + 1, '390px 手机宽度不溢出 (scrollWidth=' + ov.sw + ')');
  ck((await mp.locator('.lr-scroll').count()) >= 1, '手机端表格走横滚容器');
  await mp.close();

  console.log('=== ⑧ JS 报错 ===');
  ck(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs.slice(0, 3).join(' / ') : ''));

  console.log('\n=== ' + pass + '/' + (pass + fail) + ' 通过 ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
