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
  await p.evaluate(() => {
    if (typeof RD_open === 'function') RD_open('nutrient_calc');
  });
  await p.waitForTimeout(350);
  // 视图没切过去时 QW_render 找不到宿主 → 兜底手动挂一个，保证能测交互
  await p.evaluate(() => {
    const host = document.getElementById('gbCalc');
    if (!host || !host.querySelector('.gbc-head')) {
      let d = document.getElementById('gbCalc');
      if (!d) { d = document.createElement('div'); d.id = 'gbCalc'; document.body.appendChild(d); }
      if (typeof gbRender === 'function') gbRender();
    }
  });
  await p.waitForTimeout(250);
}
const val = async (p, n) => (await p.textContent(
  '#gbCalc .gbc-tbl tbody tr:nth-child(' + n + ') td.v') || '').trim();

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
  ck((await p.locator('#gbCalc .gbc-srcbar').innerText()).includes('行业典型参考值'),
     '说明条写明内置值是演示/参考值，不是实测值');
  ck(await p.locator('#gbCalc .gbc-row').count() >= 8, '默认配方原料行都在');
  ck(await p.locator('#gbCalc .gbc-row .cmp').count() >= 8, '每味原料都有「成分」入口');
  ck(await p.locator('#gbCalc .gbc-row .gbc-flag').count() >= 8, '每味原料都标了数据来源');
  const protein0 = await val(p, 2);
  const energy0 = await val(p, 1);
  ck(!!protein0 && !!energy0, '右侧初始有计算值（蛋白 ' + protein0 + ' / 能量 ' + energy0 + '）');
  ck(!protein0.includes('~'), '内置参考值 min=max 时计算值只显示一个数');

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
  await ins.nth(0).fill('20');
  await ins.nth(1).fill('30');
  await p.click('#gbCalc .gbc-comp-f .btn.pri');
  const protein1 = await val(p, 2);
  ck(protein1.includes('~'), '★ 计算值出现两个数（区间 ' + protein1 + '）');
  ck(protein1 !== protein0, '录入区间后蛋白质计算值变了（' + protein0 + ' → ' + protein1 + '）');
  const rng1 = protein1.split('~').map(Number);
  ck(rng1.length === 2 && rng1[0] <= rng1[1], '区间下限 ≤ 上限');
  ck((await p.locator('#gbCalc .gbc-row').first().innerText()).includes('实测'),
     '该原料行徽标变成「实测」');
  ck((await p.locator('#gbCalc .gbc-tbl thead').innerText()).includes('低~高'),
     '表头写明「计算值（低~高）」');

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
  await p.click('#gbCalc .gbc-comp-f .btn:has-text("恢复内置参考值")');
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

  console.log('=== JS 报错 ===');
  ck(errs.length === 0, '全程无 JS 报错' + (errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常：', e); process.exit(2); });
