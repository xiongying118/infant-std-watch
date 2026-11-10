/* 营养素配比计算 · 原料成分可录入 回归（2026-11-09）
 *
 * 用户质疑：「没有原料可输入营养成分数据，营养素计算值怎么来的？」
 * → 内置成分表（data.js GBNUTRITION.materials）写死了每 100g 值，页面只录用料量。
 * 本轮把成分表开放出来：逐项录入 / 自定义原料 / CSV 导入导出 / 本地存盘 / 来源徽标。
 *
 * 跑法：
 *   NODE_PATH=<playwright 路径> node scripts/test_gbcomp_20261109.js             # 本地 file://
 *   NODE_PATH=<...> STD_TARGET=online node scripts/test_gbcomp_20261109.js       # 线上
 */
const { chromium } = require('playwright-core');
const path = require('path');
const PROT = path.resolve(__dirname, '..', 'prototype');
const ONLINE = process.env.STD_TARGET === 'online';
const URL = ONLINE ? 'https://xiongying118.github.io/infant-std-watch/'
                   : 'file:///' + PROT.replace(/\\/g, '/') + '/index.html';
const EXE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let pass = 0, fail = 0, errs = [];
function ck(ok, msg) {
  if (ok) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

async function gotoRetry(p, url) {
  for (let i = 0; i < 6; i++) {
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1200);
      return true;
    } catch (e) {
      await p.waitForTimeout(ONLINE ? 4000 : 500);
    }
  }
  return false;
}
async function openTool(p) {
  // ★ 必须走真实 UI 路径：先展开研发工具卡片（生成 [data-qw-host]），再打开工具。
  //   以前直接 RD_open 找不到宿主，测试自己造了个 #gbCalc，结果测的不是用户看到的那个。
  await p.evaluate(() => {
    if (typeof toggleRd === 'function') toggleRd('nutrient_calc');
    if (typeof RD_open === 'function') RD_open('nutrient_calc');
  });
  await p.waitForTimeout(500);
}
/* ★ 表格按标准表 1~4 插了分组标题行，tr:nth-child(n) 会指到标题行。
   统一用第 n 个 td.v（顺序与 GB.nutrients 一致）。 */
const val = async (p, n) => (await p.locator(
  '#gbCalc .gbc-tbl tbody td.v').nth(n - 1).textContent() || '').trim();
const limCell = async (p, nk, col) => (await p.textContent(
  '#gbCalc .gbc-tbl tbody tr[data-nk="' + nk + '"] td:nth-child(' + col + ')') || '').trim();

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  console.log('=== 打开工具 / 初始状态 ===');
  if (!(await gotoRetry(p, URL + '#rdtools'))) {
    console.log('页面打不开，中止'); await b.close(); process.exit(2);
  }
  await openTool(p);
  ck(await p.locator('#gbCalc .gbc-head').count() === 1, '营养素配比计算工具能打开');
  ck((await p.locator('#gbCalc .gbc-srcbar').count()) === 1, '有「计算值怎么来的」说明条');
  const srcBar = await p.locator('#gbCalc .gbc-srcbar').innerText();
  ck(srcBar.includes('非实测') && srcBar.includes('不可用于配方注册'),
     '说明条写明内置参考基线非实测、不可用于申报');
  ck(await p.locator('#gbCalc .gbc-row').count() >= 8, '默认配方原料行都在');
  ck(await p.locator('#gbCalc .gbc-row .cmp').count() >= 8, '每味原料都有「成分」入口');
  ck(await p.locator('#gbCalc .gbc-row .gbc-flag').count() >= 8, '每味原料都标了数据来源');
  const protein0 = await val(p, 2);
  const energy0 = await val(p, 1);
  ck(!!protein0 && !!energy0, '右侧初始有计算值（蛋白 ' + protein0 + ' / 能量 ' + energy0 + '）');
  ck((protein0.match(/~/g) || []).length === 1,
     '★ 计算值恒显示低~高两个数（内置值两端相等时写 x~x）');
  ck((energy0.match(/~/g) || []).length === 1, '能量同样是两个数');
  ck(await p.locator('#gbVerdictTag').count() === 1, '顶部总判定有独立容器可实时更新');

  console.log('=== 逐项录入成分并实时重算 ===');
  await p.click('#gbCalc .gbc-ctl .btn:has-text("原料成分录入")');
  ck(await p.locator('#gbCalc .gbc-comp').count() === 1, '成分录入面板展开');
  const nFields = await p.locator('#gbCalc .gbc-grid .gbc-fld input').count();
  ck(nFields >= 36, '每个成分两个输入框，共 ' + nFields + ' 个（≥36）');
  ck(nFields % 2 === 0, '输入框成对（下限 / 上限）');
  ck((await p.locator('#gbCalc .gbc-rng').innerText()).includes('下限 ~ 上限'),
     '面板写明按区间录入、计算值也出区间');
  ck(await p.locator('#gbCalc .gbc-mtab').count() >= 20, '原料切换页签含全部内置原料');
  // 第一味原料的 p 填 20~30 → 计算值必须是两个值
  const ins = p.locator('#gbCalc .gbc-grid .gbc-fld input');
  const baseHi = await ins.nth(1).inputValue();
  await ins.nth(0).fill('20');
  const livePreview = await val(p, 2);
  ck(livePreview !== protein0, '★ 没点保存，右侧已实时重算（' + protein0 + ' → ' + livePreview + '）');
  ck((await p.locator('#gbCompStatus').innerText()).includes('未保存'), '标注「有未保存改动」');
  ck((await p.evaluate(() => JSON.stringify(gbCompDraft))).includes('"max":"' + baseHi + '"'),
     '★ 只改下限框时，上限框原值 ' + baseHi + ' 一并进草稿（不再被压成单值）');
  await ins.nth(1).fill('30');
  await p.click('#gbCalc .gbc-comp-f .btn.pri');
  let protein1 = await val(p, 2);
  ck((await p.locator('#gbCompStatus').innerText()).includes('已保存'), '★ 保存后给出明确反馈');
  ck(await p.locator('#gbCalc .gbc-tbl tr.changed').count() > 0, '★ 变化的计算值单元格高亮闪烁');
  ck(!(await p.locator('#dlgMask').isVisible().catch(() => false)),
     '★ 保存不会弹模态遮罩把页面挡死');
  ck(protein1.includes('~'), '★ 计算值出现两个数（区间 ' + protein1 + '）');
  ck(protein1 !== protein0, '录入区间后蛋白质计算值变了（' + protein0 + ' → ' + protein1 + '）');
  const rng1 = protein1.split('~').map(Number);
  ck(rng1.length === 2 && rng1[0] <= rng1[1], '区间下限 ≤ 上限');
  ck((await p.locator('#gbCalc .gbc-row').first().innerText()).includes('实测'),
     '该原料行徽标变成「实测」');
  ck((await p.locator('#gbCalc .gbc-tbl thead').innerText()).includes('低~高'),
     '表头写明「计算值（低~高）」');

  console.log('=== 兜底：oninput 没触发也能保存 ===');
  await p.evaluate(() => {
    const i = document.querySelector('#gbCalc .gbc-grid .gbc-fld input');
    i.value = '18';                 // 故意不派发任何事件
  });
  await p.click('#gbCalc .gbc-comp-f .btn.pri');
  const fallbackVal = await val(p, 2);
  ck(fallbackVal !== protein1, '★ 直接改 DOM 值不触发 oninput，保存仍生效（' +
     protein1 + ' → ' + fallbackVal + '）');
  protein1 = fallbackVal;

  console.log('=== 刷新后录入值还在 ===');
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(1200);
  await openTool(p);
  const protein2 = await val(p, 2);
  ck(protein2 === protein1, '刷新后计算值仍按录入区间算（' + protein2 + '）');
  ck(protein2.includes('~'), '刷新后仍是两个数');
  ck((await p.locator('#gbCalc .gbc-row').first().innerText()).includes('实测'),
     '刷新后来源徽标仍是「实测」');

  console.log('=== 恢复内置参考值 ===');
  await p.click('#gbCalc .gbc-ctl .btn:has-text("原料成分录入")');
  await p.click('#gbCalc .gbc-comp-f .btn:has-text("恢复内置")');
  const protein3 = await val(p, 2);
  ck(protein3 === protein0, '恢复内置值后计算值回到初始（' + protein3 + '）');

  console.log('=== 自定义原料 ===');
  await p.click('#gbCalc .gbc-ctl .btn:has-text("自定义原料")');
  ck(await p.locator('#gbNewName').count() === 1, '新增自定义原料表单出现');
  await p.fill('#gbNewName', '测试原料A（供应商甲）');
  await p.click('#gbCalc .gbc-new .btn.pri');
  ck((await p.locator('#gbCalc .gbc-rows').innerText()).includes('测试原料A'),
     '自定义原料进入配方列表');
  ck((await p.locator('#gbCalc .gbc-row').last().innerText()).includes('实测'),
     '自定义原料标为「实测」来源');
  await p.locator('#gbCalc .gbc-grid .gbc-fld input').nth(0).fill('50');
  await p.locator('#gbCalc .gbc-grid .gbc-fld input').nth(1).fill('60');
  await p.click('#gbCalc .gbc-comp-f .btn.pri');
  const protein4 = await val(p, 2);
  ck(protein4 !== protein3, '自定义原料的成分参与计算（' + protein3 + ' → ' + protein4 + '）');
  ck(protein4.includes('~'), '自定义原料按区间参与计算');
  await p.click('#gbCalc .gbc-comp-f .btn:has-text("删除该原料")');
  ck(!(await p.locator('#gbCalc .gbc-rows').innerText()).includes('测试原料A'),
     '删除自定义原料后从配方移除');
  ck(await val(p, 2) === protein3, '删除后计算值回到基准');

  console.log('=== CSV 批量导入 / 导出 ===');
  await p.click('#gbCalc .gbc-ctl .btn:has-text("批量导入")');
  ck(await p.locator('#gbCsvText').count() === 1, 'CSV 导入面板展开');
  await p.fill('#gbCsvText', 'key,name,kind,p\nblend_oil,调和植物油（植物脂肪粉）,油,20~30');
  await p.click('#gbCalc .gbc-imp .btn.pri');
  ck((await p.locator('#gbCalc .gbc-srcbar').innerText()).includes('已导入'),
     '导入后给出结果提示');
  ck(await val(p, 2) !== protein3, 'CSV 的 20~30 区间覆盖内置值并重算');
  ck((await val(p, 2)).includes('~'), 'CSV 导入后计算值也是两个数');
  let dl = false;
  try {
    await p.click('#gbCalc .gbc-ctl .btn:has-text("批量导入")');
    const [d] = await Promise.all([
      p.waitForEvent('download', { timeout: 8000 }),
      p.click('#gbCalc .gbc-imp .btn:has-text("导出当前成分表")')
    ]);
    dl = /原料营养成分\.csv/.test(d.suggestedFilename());
  } catch (e) { dl = false; }
  ck(dl, '能导出当前成分表 CSV 当模板');

  console.log('=== 区间判定：只有一侧踩线要单独提醒 ===');
  if (await p.locator('#gbCalc .gbc-comp').count() === 0) {
    await p.click('#gbCalc .gbc-ctl .btn:has-text("原料成分录入")');
  }
  const ins2 = p.locator('#gbCalc .gbc-grid .gbc-fld input');
  await ins2.nth(0).fill('0');
  await ins2.nth(1).fill('300');
  await p.click('#gbCalc .gbc-comp-f .btn.pri');
  const verdicts = await p.locator('#gbCalc .gbc-tbl tbody .vd').allInnerTexts();
  ck(verdicts.some(v => v === '波动越界' || v === '超限'),
     '宽区间触发越界提醒：' + verdicts.filter(v => v !== '达标' && v !== '—').slice(0, 4).join(','));
  ck((await p.locator('#gbCalc .gbc-bads').count()) === 1, '下方列出需要处理的项');

  console.log('=== 移动端不溢出 ===');
  if (await p.locator('#gbCalc .gbc-comp').count() === 0) {
    await p.click('#gbCalc .gbc-ctl .btn:has-text("原料成分录入")');
  }
  for (const w of [390, 430]) {
    await p.setViewportSize({ width: w, height: 844 });
    await p.waitForTimeout(350);
    const m = await p.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      rowW: (document.querySelector('#gbCalc .gbc-row') || {}).scrollWidth || 0,
      rowC: (document.querySelector('#gbCalc .gbc-row') || {}).clientWidth || 0,
      fldW: (document.querySelector('#gbCalc .gbc-fld') || {}).scrollWidth || 0,
      fldC: (document.querySelector('#gbCalc .gbc-fld') || {}).clientWidth || 0
    }));
    ck(m.sw <= m.iw + 1, w + 'px 视口整机无横向溢出（' + m.sw + '/' + m.iw + '）');
    ck(m.rowW <= m.rowC + 2, w + 'px 视口原料行不溢出（' + m.rowW + '/' + m.rowC + '）');
    ck(m.fldW <= m.fldC + 2, w + 'px 视口双输入框不溢出（' + m.fldW + '/' + m.fldC + '）');
  }

  console.log('=== 三个产品标准全项核算 ===');
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.waitForTimeout(300);
  if (await p.locator('#gbCalc .gbc-comp').count() === 0) {
    await p.click('#gbCalc .gbc-ctl .btn:has-text("原料成分录入")');
  }
  ck(await p.locator('#gbCalc .gbc-tbl tbody tr[data-nk]').count() === 39,
     '★ 计算表列出 39 项指标（三份标准表 1~4 并集）');
  ck(await p.locator('#gbCalc .gbc-tbl tbody tr.gbc-grp-row').count() === 4,
     '★ 按宏量/维生素/矿物质/可选择成分分成 4 组');
  ck(await p.locator('#gbCalc .gbc-grid .gbc-fld').count() === 36,
     '★ 原料成分可录入 36 项（39 项减去能量与 2 个比值）');
  ck(await p.locator('#gbCalc .gbc-grid .gbc-grp-t').count() === 4,
     '成分录入面板同样按 4 组分区');
  ck(await p.locator('#gbCalc .gbc-grid .gbc-fld input').count() === 72,
     '36 项 × 下限/上限 = 72 个输入框');
  ck((await p.locator('#gbCalc .gbc-srcbar').innerText()).includes('39 项指标'),
     '说明条写明按三份标准全项核算');
  for (const key of ['vk1', 'vb1', 'vb2', 'vb6', 'vb12', 'pantothenic',
                     'k', 'cu', 'mg', 'fe', 'zn', 'mn', 'iodine',
                     'chloride', 'selenium', 'carnitine']) {
    ck(await p.locator('#gbCalc .gbc-tbl tbody tr[data-nk="' + key + '"]').count() === 1,
       '新增标准指标已入表：' + key);
  }
  const segSel = p.locator('#gbCalc .gbc-ctl select').first();
  await segSel.selectOption('1');
  await p.waitForTimeout(250);
  ck((await p.locator('#gbCalc .gbc-sub').innerText()).includes('GB 10765-2021'),
     '★ 切 1 段显示 GB 10765-2021《婴儿配方食品》');
  ck((await p.locator('#gbCalc .gbc-sub').innerText()).includes('250~295'),
     '1 段即食能量 250~295 kJ/100mL');
  ck((await limCell(p, 'protein', 4)) === '0.720', '1 段乳基蛋白上限 0.720 g/100kJ');
  ck((await limCell(p, 'va', 4)) === '36.0', '1 段维生素A 上限 36.0 μg/100kJ');
  ck((await limCell(p, 'ca_ratio', 3)) === '1.00', '1 段钙磷比下限 1:1');
  await segSel.selectOption('2');
  await p.waitForTimeout(250);
  ck((await p.locator('#gbCalc .gbc-sub').innerText()).includes('GB 10766-2021'),
     '★ 切 2 段显示 GB 10766-2021');
  ck((await p.locator('#gbCalc .gbc-sub').innerText()).includes('250~314'),
     '2 段即食能量 250~314 kJ/100mL');
  ck((await limCell(p, 'protein', 4)) === '0.840', '2 段乳基蛋白上限 0.840 g/100kJ');
  ck((await limCell(p, 'vb6', 3)) === '11.0', '2 段 VB6 下限 11.0 μg/100kJ');
  await segSel.selectOption('3');
  await p.waitForTimeout(250);
  ck((await p.locator('#gbCalc .gbc-sub').innerText()).includes('GB 10767-2021'),
     '★ 切 3 段显示 GB 10767-2021');
  ck((await p.locator('#gbCalc .gbc-sub').innerText()).includes('250~334'),
     '3 段即食能量 250~334 kJ/100mL');
  ck((await limCell(p, 'vb2', 4)) === '155.0', '3 段 VB2 上限 155.0 μg/100kJ');
  ck((await limCell(p, 'protein', 4)) === '0.960', '3 段蛋白上限 0.960 g/100kJ');
  ck((await limCell(p, 'dha', 3)).indexOf('—') === 0 &&
     (await limCell(p, 'dha', 3)).includes('起'), '3 段 DHA 只有上限（N.S. 下限）');
  ck((await p.locator('#gbCalc .gbc-tbl tbody tr[data-nk="choline"] .vf.gray').innerText()).includes('可选'),
     '3 段胆碱标注为可选择成分');
  await segSel.selectOption('1');
  await p.locator('#gbCalc .gbc-ctl select').nth(1).selectOption('豆基');
  await p.waitForTimeout(250);
  ck((await limCell(p, 'protein', 3)) === '0.530', '1 段豆基蛋白下限 0.530 g/100kJ');
  ck((await limCell(p, 'fe', 3)) === '0.15', '1 段豆基铁下限 0.15 mg/100kJ');
  await p.locator('#gbCalc .gbc-ctl select').nth(1).selectOption('乳基');
  await segSel.selectOption('3');

  console.log('=== JS 报错 ===');
  ck(errs.length === 0, '全程无 JS 报错' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常：', e); process.exit(2); });
