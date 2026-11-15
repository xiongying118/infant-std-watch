/* ================================================================
   test_labrecord_20261115.js —— 原始记录「Word 原表 1:1」回归（2026-11-15 第三版）
   铁律：Word 原表所有文字/表格/合并/公式图/页眉页脚一字不改；
        字体、字号、列宽、行高、页面方向也照 Word 原生属性还原；
        只有样品名称、生产商、批号/生产日期、检测日期 4 项是自动填充位，
        检测日期默认空、不写死；标准溶液编码与有效期至默认原值，
        仅过期重配时改一次、本机记住。
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

  let navOK = false;
  for (let i = 0; i < 6 && !navOK; i++) {
    try { await p.goto(URL + '#lab', { waitUntil: 'domcontentloaded', timeout: 60000 }); navOK = true; }
    catch (e) { console.log('  (重试 ' + (i + 1) + ')'); await p.waitForTimeout(4000); }
  }
  if (!navOK) { console.log('网络不通，中止'); await b.close(); process.exit(2); }
  await p.waitForTimeout(1200);

  console.log('=== ① 数据层：9 份 Word 原表 1:1 ===');
  const meta = await p.evaluate(() => (window.LABREC && window.LABREC.projects || []).map(x => ({
    key: x.key, name: x.name, file: x.file,
    html: x.html || '', sol: x.solutions || []
  })));
  ck(meta.length === 9, '共 9 个检测项目模板');
  const KEYS = ['protein', 'fat', 'moisture', 'chloride', 'phosphorus', 'choline', 'nitrite', 'acidvalue', 'peroxide'];
  KEYS.forEach(k => ck(meta.some(m => m.key === k), '含项目 ' + k));
  ck(new Set(meta.map(m => m.html)).size === 9, '9 份模板内容互不相同（没有套通用表）');
  ck(meta.every(m => m.html.length > 600), '每份模板都含完整原文');
  ck(meta.every(m => m.html.indexOf('class="lr-wt"') >= 0), '每份都保留 Word 原表表格');
  ck(meta.every(m => m.html.indexOf('class="lr-hdr') >= 0), '每份都保留 Word 页眉');
  ck(meta.every(m => m.html.indexOf('lr-hdr-flex') >= 0), '页眉按 Word 分散对齐还原成同一行左右两栏');
  ck(meta.every(m => m.html.indexOf('class="lr-ftr"') >= 0), '每份都保留 Word 页脚');
  ck(meta.every(m => m.html.indexOf('data-lr="sample"') >= 0), '每份都有样品名称自动填充位');
  ck(meta.every(m => m.html.indexOf('data-lr="maker"') >= 0), '每份都有生产商自动填充位');
  ck(meta.every(m => m.html.indexOf('data-lr="batch"') >= 0), '每份都有批号/生产日期自动填充位');
  ck(meta.every(m => m.html.indexOf('data-lr="date"') >= 0), '每份都有可填的检测日期动态位');
  ck(!/2026102[78]/.test(meta.map(m => m.html).join('')), '检测日期没有写死原表里那份示例日期');
  ck(meta.every(m => m.html.indexOf('class="lr-title"') < 0 && m.html.indexOf('class="lr-head"') < 0),
    '没有上一版自造的标题/抬头表（已改为 Word 原表）');
  ck(meta.every(m => m.html.indexOf('检测方法 / 仪器 / 计算式（原文照录）') < 0),
    '没有把原文抽出来另放的说明块（说明都在原表格里）');
  const allHtml = meta.map(m => m.html).join('');
  const eqCount = (allHtml.match(/<img class="lr-eq"/g) || []).length;
  ck(eqCount >= 12, '还原了 Word 里的计算公式图片（共 ' + eqCount + ' 张）');
  ck(allHtml.indexOf('data:image/png;base64,') >= 0, '公式图片是内嵌高清 PNG');
  ck(allHtml.indexOf('高培（广州）乳业有限公司检测中心') >= 0, '页眉公司名原文保留');
  ck(allHtml.indexOf('GOLDMAX-QM-FORM-005d(01)') >= 0, '页眉记录编号原文保留');
  const byKey = Object.fromEntries(meta.map(m => [m.key, m]));
  ck(byKey.moisture.html.indexOf('称量瓶恒重质量m3') >= 0, '水分原表列名「称量瓶恒重质量m3」');
  ck(byKey.protein.html.indexOf('消化液体积V3') >= 0, '蛋白质原表列名「消化液体积V3」');
  ck(byKey.choline.html.indexOf('氯化胆碱-d4') >= 0, '胆碱原表内标「氯化胆碱-d4」');
  ck(byKey.nitrite.html.indexOf('镉柱还原效率') >= 0, '亚硝酸盐原表「镉柱还原效率」');
  ck(byKey.peroxide.html.indexOf('硫代硫酸钠') >= 0, '过氧化值原表「硫代硫酸钠」');
  ck(byKey.fat.html.indexOf('空白瓶恒重质量m4') >= 0, '脂肪原表「空白瓶恒重质量m4」');
  ck(byKey.acidvalue.html.indexOf('氢氧化钠标液浓度') >= 0, '酸价原表「氢氧化钠标液浓度」');
  ck(byKey.phosphorus.html.indexOf('钒钼酸铵') >= 0, '磷原表「钒钼酸铵」');
  ck(byKey.chloride.html.indexOf('硝酸银标准滴定溶液') >= 0, '氯化物原表「硝酸银标准滴定溶液」');

  console.log('=== ①-b Word 原生排版：字体 / 字号 / 列宽 / 行高 ===');
  ck(meta.every(m => m.html.indexOf('font-family:') >= 0), '每份都带 Word 原生字体（宋体等）');
  ck(meta.every(m => m.html.indexOf('font-size:') >= 0), '每份都带 Word 原生字号（pt）');
  ck(meta.every(m => m.html.indexOf('<colgroup>') >= 0), '每份都带 Word 原生每列宽度');
  ck(meta.every(m => /<table class="lr-wt" style="width:\d+px/.test(m.html)), '表格宽度按 Word 原值，不再被 CSS 拉成 100%');
  ck(meta.every(m => m.html.indexOf('table-layout:fixed') >= 0), '列宽按 Word 固定，不会被均分');
  ck(allHtml.indexOf('font-size:22pt') >= 0, '标题的 Word 原字号 22pt（小二）保留');
  ck(allHtml.indexOf('font-size:10.5pt') >= 0, '正文的 Word 原字号 10.5pt（五号）保留');
  ck(!/font-size:\d+px/.test(allHtml), '模板自身没有用 px 覆盖 Word 字号');
  ck(meta.some(m => /<tr style="(?:min-)?height:\d+px"/.test(m.html)), '行高按 Word trHeight 还原');

  console.log('=== ② 标准溶液：默认原值，无需每次填 ===');
  const sols = await p.evaluate(() => LAB.lrAllSolutions());
  ck(sols.length === 6, '共 6 条标准溶液（氯化物1/磷1/胆碱2/亚硝酸盐2），实得 ' + sols.length);
  ck(sols.some(s => s.name === '硝酸银滴定溶液标准物质' && s.code === '070-20260423-E' && s.expiry === '20271207'),
    '氯化物：编码与有效期至默认就是 Word 原值');
  ck(sols.some(s => s.name === '胆碱' && s.code === '058-20261022-01'), '胆碱：默认原值');
  ck(sols.some(s => s.name === '硝酸钠标准溶液' && s.code === '072-20251231-E'), '硝酸钠：默认原值');
  ck(meta.filter(m => m.sol.length).length === 4, '只有 4 个项目含标准溶液表');

  console.log('=== ③ 进入原始记录页：只有 4 个动态输入 ===');
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

  console.log('=== ④ 填一次，9 张表自动带出 ===');
  await p.evaluate(() => LAB.lrAll());
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    LAB.lrSet('sample', '迪唯恩2段（长期24个月）');
    LAB.lrSet('maker', '高培');
    LAB.lrSet('batch', '20261101 / A261101');
    LAB.lrSet('date', '20261115');
  });
  await p.waitForTimeout(350);
  const filled = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.lr-paper').forEach(el => {
      out.push({
        key: el.getAttribute('data-lr-sheet'),
        sample: (el.querySelector('[data-lr="sample"]') || {}).textContent,
        maker: (el.querySelector('[data-lr="maker"]') || {}).textContent,
        batch: (el.querySelector('[data-lr="batch"]') || {}).textContent,
        date: (el.querySelector('[data-lr="date"]') || {}).textContent,
        hasTitle: !!el.querySelector('.lr-title'),
        noInputs: el.querySelectorAll('input,textarea,select,[contenteditable]').length === 0,
        signText: /检\s*验\s*人/.test(el.textContent)
      });
    });
    return out;
  });
  ck(filled.length === 9, '全选后铺出 9 张 Word 原表');
  ck(filled.every(x => x.sample === '迪唯恩2段（长期24个月）'), '9 张表样品名称全部自动带出');
  ck(filled.every(x => x.maker === '高培'), '9 张表生产商全部自动带出');
  ck(filled.every(x => x.batch === '20261101 / A261101'), '9 张表批号/生产日期全部自动带出');
  ck(filled.every(x => x.date === '20261115'), '9 张表检测日期全部自动带出（不写死）');
  ck(filled.every(x => !/2026102[78]/.test(x.date)), '没有残留 Word 示例日期');
  ck(filled.every(x => !x.hasTitle), '没有额外加自造标题');
  ck(filled.every(x => x.noInputs), '记录纸里没有任何输入框：除动态位外都不可编辑');
  ck(filled.every(x => x.signText), '签字栏保持 Word 原表原文');

  console.log('=== ④-b 实际渲染：字体字号与列宽确实按 Word ===');
  const styles = await p.evaluate(() => {
    const paper = document.querySelector('.lr-paper[data-lr-sheet="protein"]');
    const ps = [...paper.querySelectorAll('.lr-wp')].slice(0, 40);
    const ff = new Set(ps.map(e => getComputedStyle(e).fontFamily));
    const fs = new Set(ps.map(e => getComputedStyle(e).fontSize));
    const t = paper.querySelector('table.lr-wt');
    const cols = [...t.querySelectorAll('colgroup col')].map(c => Math.round(c.getBoundingClientRect().width));
    return { ff: [...ff], fs: [...fs], cols, tableW: Math.round(t.getBoundingClientRect().width) };
  });
  ck(styles.ff.some(f => /宋体|SimSun/.test(f)), '渲染字体是 Word 的宋体（不是网站无衬线体）');
  ck(styles.fs.length >= 2, '同页存在多种字号（Word 原生字号未被统一覆盖），实得 ' + styles.fs.join('/'));
  ck(styles.cols.length >= 4 && new Set(styles.cols).size >= 3,
    '各列宽度不同，按 Word 原列宽渲染（' + styles.cols.join('/') + '）');
  ck(styles.tableW > 500 && styles.tableW < 750, '整表宽度接近 Word 原宽 ' + styles.tableW + 'px');

  console.log('=== ⑤ 标准溶液打印时不用填，改一次就记住 ===');
  const before = await p.evaluate(() => {
    const el = document.querySelector('.lr-paper[data-lr-sheet="chloride"] [data-lr="stdcode"]');
    return el ? el.textContent : '';
  });
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
    cell: (document.querySelector('.lr-paper[data-lr-sheet="chloride"] [data-lr="stdcode"]') || {}).textContent,
    sol: LAB.lrSol()['硝酸银滴定溶液标准物质']
  }));
  ck(after.cell === '070-20261115-N', '改一次，对应项目的编码立刻更新');
  ck(after.sol && after.sol.code === '070-20261115-N', '覆盖值已写进本机保存');

  console.log('=== ⑥ 打印 HTML：原表 1:1 + 已填值 ===');
  const printHtml = await p.evaluate(() => {
    let out = '';
    const orig = window.open;
    window.open = function () { return { document: { write: s => { out += s }, close: () => {} }, focus: () => {}, print: () => {} } };
    LAB.lrPrint();
    window.open = orig;
    return out;
  });
  ck((printHtml.match(/class="pg"/g) || []).length === 9, '9 个项目各占一页');
  ck(printHtml.indexOf('迪唯恩2段（长期24个月）') >= 0, '打印页含自动填充的样品名称');
  ck(printHtml.indexOf('20261115') >= 0, '打印页含自动填充的检测日期');
  ck(printHtml.indexOf('070-20261115-N') >= 0, '打印页含改过的标准溶液编码');
  ck(printHtml.indexOf('高培（广州）乳业有限公司检测中心') >= 0, '打印页保留 Word 页眉');
  ck(printHtml.indexOf('data:image/png;base64,') >= 0, '打印页保留公式图片');
  ck(printHtml.indexOf('class="lr-title"') < 0, '打印页没有自造标题');
  ck(printHtml.indexOf('@page{size:A4 portrait') >= 0, '按 Word 原页面设置 A4 纵向打印');
  ck(printHtml.indexOf('A4 landscape') < 0, '不再用上一版的 A4 横向');
  ck(!/\.lr-wt td\{[^}]*font-size/.test(printHtml), '打印 CSS 不再统一覆盖单元格字号');
  ck(!/\.lr-wp\{[^}]*font-size/.test(printHtml), '打印 CSS 不再统一覆盖段落字号');
  ck(!/\.lr-wt td\{[^}]*height:/.test(printHtml), '打印 CSS 不再强制行高');

  console.log('=== ⑦ 刷新后仍在（本机保存） ===');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.click('button[data-lab="record"]');
  await p.waitForTimeout(450);
  const persisted = await p.evaluate(() => ({
    info: LAB.lrInfo(),
    sol: LAB.lrSol()['硝酸银滴定溶液标准物质'],
    selected: LAB.lrSelected().length,
    first: (document.querySelector('.lr-paper [data-lr="sample"]') || {}).textContent
  }));
  ck(persisted.info.sample === '迪唯恩2段（长期24个月）', '刷新后样品名称还在');
  ck(persisted.info.maker === '高培', '刷新后生产商还在');
  ck(persisted.info.batch === '20261101 / A261101', '刷新后批号还在');
  ck(persisted.info.date === '20261115', '刷新后检测日期还在（本机保存，下次不用重填）');
  ck(persisted.sol && persisted.sol.code === '070-20261115-N', '刷新后标准溶液新编码还在（不用每次改）');
  ck(persisted.selected === 9, '刷新后项目勾选还在');
  ck(persisted.first === '迪唯恩2段（长期24个月）', '刷新后模板里自动带出样品信息');

  console.log('=== ⑧ 手机端不溢出 ===');
  for (const w of [390, 430]) {
    const m = await ctx.newPage();
    await m.setViewportSize({ width: w, height: 844 });
    await m.goto(URL + '#lab', { waitUntil: 'domcontentloaded' });
    await m.waitForTimeout(1000);
    await m.click('button[data-lab="record"]');
    await m.waitForTimeout(400);
    const sw = await m.evaluate(() => document.documentElement.scrollWidth);
    ck(sw === w, w + 'px 手机无横向溢出（scrollWidth=' + sw + '）');
    await m.close();
  }

  ck(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs[0] : ''));
  console.log('\n=== 结果：' + pass + '/' + (pass + fail) + ' ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
