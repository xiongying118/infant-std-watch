/* 2026-11-11 回归
   ① 三段标题不再出现重复的「-2021-2021」
   ② 配方设计 / 营养素配比计算增加第 4 套标准 GB 19644-2024（表 2 理化指标）
   ③ 检测值可录入、自动判定、刷新不丢，切回 1/2/3 段不受影响
   跑法：NODE_PATH=<playwright路径> node scripts/test_gb19644_20261111.js
        STD_TARGET=local 验本地 file://，默认验线上 */
const { chromium } = require('playwright-core');
const path = require('path');
const PROT = path.resolve(__dirname, '..', 'prototype');
const LOCAL = 'file:///' + PROT.replace(/\\/g, '/') + '/index.html';
const LOCAL_MODE = process.env.STD_TARGET === 'local';
const URL = LOCAL_MODE ? LOCAL : 'https://xiongying118.github.io/infant-std-watch/';
const EXE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let pass = 0, fail = 0;
const errs = [];
function ck(ok, msg) { ok ? (pass++, console.log('  ✓ ' + msg)) : (fail++, console.log('  ✗ ' + msg)); }
async function gotoRetry(p, url) {
  for (let i = 0; i < 6; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(1100); return true; }
    catch (e) { console.log('  (网络重试 ' + (i + 1) + ')'); await p.waitForTimeout(LOCAL_MODE ? 500 : 4000); }
  }
  return false;
}
async function openTool(p, key) {
  await p.evaluate(k => {
    if (typeof toggleRd === 'function') toggleRd(k);
    if (typeof RD_open === 'function') RD_open(k);
  }, key);
  await p.waitForTimeout(300);
}
const title = p => p.locator('#gbCalc .gbc-ph').nth(1).innerText();
const segSel = p => p.locator('#gbCalc .gbc-ctl select').first();

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 180)); });

  if (!(await gotoRetry(p, URL + '#rdtools'))) { console.log('页面打不开'); await b.close(); process.exit(2); }
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoRetry(p, URL + '#rdtools');
  await openTool(p, 'nutrient_calc');

  console.log('=== ① 三段标题：不再重复年份 ===');
  for (const [s, std] of [['1', 'GB 10765-2021'], ['2', 'GB 10766-2021'], ['3', 'GB 10767-2021']]) {
    await segSel(p).selectOption(s);
    await p.waitForTimeout(120);
    const t = await title(p);
    ck(t.includes(std) && !/-2021-2021|-\d{4}-\d{4}/.test(t), s + '段标题正确：' + t.trim());
  }
  const sub = await p.locator('#gbCalc .gbc-sub').innerText();
  ck(sub.includes('GB 10767-2021'), '顶部目标仍显示完整标准号');

  console.log('=== ② 第 4 套标准 GB 19644-2024 ===');
  const opts = await segSel(p).locator('option').allTextContents();
  ck(opts.length === 4, '段位/标准下拉 4 项（实为 ' + opts.length + '）');
  ck(opts.some(x => x.includes('GB 19644-2024')), '第 4 项是 GB 19644-2024');
  await segSel(p).selectOption('19644');
  await p.waitForTimeout(200);
  const t44 = await title(p);
  ck(t44.includes('GB 19644-2024') && t44.includes('表 2 理化指标'), '标题切到表 2：' + t44.trim());
  ck(!t44.includes('-2024-2024'), '19644 标题也不重复年份');
  const head = await p.locator('#gbCalc .gbc-tbl thead').innerText();
  ck(head.includes('理化指标') && head.includes('计算值 / 实测值'), '表头换成理化指标口径');
  const rows = await p.locator('#gbCalc tr[data-nk]').count();
  ck(rows === 5, '表 2 共 5 项指标（实为 ' + rows + '）');
  const cls = await p.locator('#gbCalc .gbc-ctl select').nth(1).locator('option').count();
  ck(cls === 12, '产品类别 12 类（6 乳粉 + 6 调制乳粉，实为 ' + cls + '）');
  const src = await p.locator('#gbCalc .gbc-srcbar').innerText();
  ck(src.includes('GB 19644-2024 表 2'), '来源条说明按表 2 核算');
  const unit = await p.locator('#gbCalc .gbc-unit').innerText();
  ck(unit.includes('水分') && unit.includes('非脂乳固体'), '口径说明写明水分与蛋白下限算法');
  const inputs = await p.locator('#gbCalc input.gbc-v44').count();
  ck(inputs === 3, '水分/杂质度/复原乳酸度 3 个可录入框（实为 ' + inputs + '）');

  console.log('=== ③ 真实录入 → 自动判定 ===');
  const row = k => p.locator(`#gbCalc tr[data-nk="${k}"]`);
  const vd = k => p.locator(`[data-vd44="${k}"]`).innerText();
  ck((await vd('protein')) === '待录入', '牛乳粉未录水分时蛋白质判定「待录入」');
  ck((await row('protein').locator('[data-lim44]').innerText()).includes('—'), '蛋白质下限暂不显示数值');
  await p.locator('#gbCalc input.gbc-v44').first().fill('4');
  await p.waitForTimeout(180);
  const lim44 = await row('protein').locator('[data-lim44]').innerText();
  ck(/^\d/.test(lim44.trim()), '录入水分后蛋白质下限自动算出：' + lim44.trim());
  ck((await vd('water')) === '达标', '水分 4.0 ≤5.0 判定达标');
  ck((await vd('impurity')) === '待录入' && (await vd('acidity')) === '待录入',
     '其余检测项仍显示「待录入」，不会被误判达标');

  await p.locator('#gbCalc input.gbc-v44').first().fill('8');
  await p.waitForTimeout(180);
  ck((await vd('water')) === '超限', '水分 8.0 判定超限');
  const adv = await p.locator('#gbAdviceBox').innerText();
  ck(adv.includes('水分'), '建议块给出水分超限处置');

  console.log('=== ④ 调制乳粉口径 ===');
  await p.locator('#gbCalc .gbc-ctl select').nth(1).selectOption('bovine_mod');
  await p.waitForTimeout(200);
  const pmin = await row('protein').locator('[data-lim44]').innerText();
  ck(pmin.trim().startsWith('16.5'), '调制牛乳粉蛋白质固定下限 16.5（实为 ' + pmin.trim() + '）');
  for (const k of ['fat', 'impurity', 'acidity']) {
    const txt = await row(k).innerText();
    ck(txt.includes('未设限'), k + ' 在调制乳粉下显示「未设限」');
  }

  console.log('=== ⑤ 落盘与切回 ===');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1300);
  await openTool(p, 'nutrient_calc');
  ck((await segSel(p).inputValue()) === '19644', '刷新后仍停在 GB 19644');
  ck((await p.locator('#gbCalc .gbc-ctl select').nth(1).inputValue()) === 'bovine_mod', '刷新后产品类别保留');
  ck((await p.locator('#gbCalc input.gbc-v44').first().inputValue()) === '8', '刷新后录入的水分实测值保留');
  await segSel(p).selectOption('2');
  await p.waitForTimeout(150);
  const back = await title(p);
  ck(back.includes('GB 10766-2021') && !back.includes('-2021-2021'), '切回 2 段正常：' + back.trim());
  ck((await p.locator('#gbCalc .gbc-ctl select').nth(1).locator('option').count()) === 2, '产品类型恢复乳基/豆基');

  console.log('=== ⑥ 手机端 ===');
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', e => errs.push('mobile: ' + String(e).slice(0, 200)));
  if (await gotoRetry(m, URL + '#rdtools')) {
    await m.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await gotoRetry(m, URL + '#rdtools');
    await openTool(m, 'nutrient_calc');
    await segSel(m).selectOption('19644');
    await m.waitForTimeout(200);
    const w = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    ck(w.sw === w.iw, '390px 下 GB 19644 视图不横向溢出（' + w.sw + '/' + w.iw + '）');
  } else ck(false, '手机页面打不开');

  ck(errs.length === 0, '全程无 JS 报错' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log('\n结果 ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
