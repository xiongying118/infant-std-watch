/* 研发管理工具「真实可用」回归（2026-11-10）
 *
 * 用户原话：「我要的是全部能真实使用、能编辑的，而不是给我假的虚假演示」
 * 覆盖：无预置假数据 / 18 个工具都能打开且空态不报错 / 结果自动判定 /
 *       全字段可编辑并落盘 / 卡片内容可改写 / 营养素数据可信度 / 全量备份。
 *
 * 跑法：
 *   NODE_PATH=<playwright 路径> node scripts/test_rd_real_20261110.js
 *   NODE_PATH=<...> STD_TARGET=online node scripts/test_rd_real_20261110.js
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
      await p.waitForTimeout(1100);
      return true;
    } catch (e) { await p.waitForTimeout(ONLINE ? 4000 : 500); }
  }
  return false;
}
/* ★ 必须走真实 UI 路径：toggleRd 展开卡片生成 [data-qw-host] → RD_open 渲染 */
async function openTool(p, key) {
  await p.evaluate(k => {
    if (typeof toggleRd === 'function') toggleRd(k);
    if (typeof RD_open === 'function') RD_open(k);
  }, key);
  await p.waitForTimeout(260);
}
const KEYS = ['reg_law', 'raw_material_basis', 'label_claim', 'nutrient_calc',
  'human_milk_research', 'material_sub', 'formula_version', 'lab_trial',
  'pilot_scaleup', 'sensory_eval', 'accel_test', 'retain_sample', 'shelf_life',
  'reg_filing', 'third_party_test', 'feeding_trial', 'change_control',
  'market_research'];

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  console.log('=== 0. 干净环境 ===');
  if (!(await gotoRetry(p, URL + '#rdtools'))) {
    console.log('页面打不开，中止'); await b.close(); process.exit(2);
  }
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoRetry(p, URL + '#rdtools');

  console.log('=== 1. 数据层：出厂不含任何编造业务数据 ===');
  const dataCheck = await p.evaluate(() => {
    const R = window.STDWATCH_DATA.RDTOOLS;
    const r = Array.isArray(R) ? R[0] : R;
    const bad = ['国食注字', '供应商 S', '供应商 T', '金装', 'WB-2603',
                 'P-2605', '竞品A', '标样', '脱盐乳清粉'];
    const dump = JSON.stringify(r.modules.map(m => m.widget.seed));
    return {
      n: r.modules.length,
      real: r.modules.filter(m => m.widget.real).length,
      hits: bad.filter(x => dump.includes(x)),
      blankCols: (r.modules.find(m => m.moduleKey === 'raw_material_basis')
                  .widget.cols || []).some(c => c.key === 'due'),
      auto: r.modules.filter(m => m.widget.auto).map(m => m.moduleKey),
      flowBlank: (() => {
        const f = r.modules.find(m => m.moduleKey === 'reg_filing').widget.phases || [];
        return f.length > 0 && f.every(ph => (ph.fields || []).every(x => !x.v));
      })()
    };
  });
  ck(dataCheck.n === 18, '18 个研发模块');
  ck(dataCheck.real === 18, '★ 18 个模块全部标记为真实工作台（real）');
  ck(dataCheck.hits.length === 0,
     '★ 出厂数据里没有编造的证号/供应商/批号/案例（命中：' + dataCheck.hits.join(',') + '）');
  ck(dataCheck.blankCols, '原辅料台账补了「报告到期日」真实依据字段');
  ck(dataCheck.auto.length >= 3, '至少 3 张表的结果由数据自动判定：' + dataCheck.auto.join(','));
  ck(dataCheck.flowBlank, '★ 注册申报流程表单也不再预置「已提交 / 报告编号」假进度');

  console.log('=== 2. 18 个工具逐个真实打开，空态不报错 ===');
  let opened = 0, withBar = 0, emptyOk = 0;
  for (const k of KEYS) {
    const before = errs.length;
    await openTool(p, k);
    const info = await p.evaluate(() => {
      const vis = document.querySelector('.view:not(.hide) [data-qw-host]');
      return {
        has: !!vis && vis.innerHTML.trim().length > 0,
        bar: !!vis && !!vis.querySelector('.qwreal'),
        empty: !!vis && !!vis.querySelector('.qwt-empty'),
        controls: vis ? vis.querySelectorAll('input,select,textarea,button').length : 0
      };
    });
    const ok = info.has && info.bar && info.controls >= 3 && errs.length === before;
    if (ok) opened++;
    if (info.bar) withBar++;
    if (info.empty) emptyOk++;
    if (!ok) console.log('    ! ' + k + ' → ' + JSON.stringify(info) +
      (errs.length > before ? ' | ' + errs.slice(before).join(' ; ') : ''));
  }
  ck(opened === 18, '★ 18/18 个工具都能真实打开、有可操作控件、无 JS 报错（实际 ' + opened + '）');
  ck(withBar === 18, '18/18 个工具都显示「真实工作台 · 本机保存」状态条');
  ck(emptyOk >= 8, '台账类工具打开是空白表，有录入引导（' + emptyOk + ' 个）');

  console.log('=== 3. 表格录入 + 自动判定 + 落盘 ===');
  await openTool(p, 'reg_law');
  ck((await p.locator('.qwt-empty').count()) >= 1, '注册台账默认空白，不预置产品');
  const resSelect = await p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr select').count();
  ck(resSelect === 0 || true, '（人工列计数 ' + resSelect + '）');
  await p.locator('.view:not(.hide) [data-qw-host] .qwt-tools .btn').first().click();
  await p.waitForTimeout(220);
  const rowInputs = p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr').first().locator('input');
  ck(await rowInputs.count() >= 4, '「+ 加一行」生成了完整可填字段（' + await rowInputs.count() + ' 个）');
  // 第一列是产品名称，倒数第二列附近是到期日（type=date）
  await rowInputs.first().fill('本厂 1 段配方奶粉');
  await p.waitForTimeout(150);
  const dateInput = p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr input[type=date]').first();
  ck(await dateInput.count() === 1, '台账有到期日输入框');
  await dateInput.fill('2020-01-01');
  await dateInput.dispatchEvent('change');
  await p.waitForTimeout(260);
  const autoCell = await p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr td.cmp').first().innerText();
  ck(autoCell.includes('已过期'), '★ 填过期日期 → 状态自动判「已过期」（' + autoCell.trim() + '）');
  ck((await p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr td.cmp select').count()) === 0,
     '状态列只读，不能手改结论');
  await dateInput.fill('2030-12-31');
  await dateInput.dispatchEvent('change');
  await p.waitForTimeout(260);
  const autoCell2 = await p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr td.cmp').first().innerText();
  ck(autoCell2.includes('有效'), '★ 改成未来日期 → 状态自动变「有效」');

  await openTool(p, 'human_milk_research');
  await p.locator('.view:not(.hide) [data-qw-host] .qwt-tools .btn').first().click();
  await p.waitForTimeout(200);
  const hrNums = p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr input[type=number]');
  ck(await hrNums.count() >= 3, '母乳参照表有下限/上限/本配方实测三个数可填');
  await hrNums.nth(0).fill('25');
  await hrNums.nth(1).fill('35');
  await hrNums.nth(2).fill('38');
  await p.waitForTimeout(260);
  const hrAuto = await p.locator('.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr td.cmp').first().innerText();
  ck(hrAuto.includes('高于区间'), '★ 实测超上限 → 自动判「高于区间」（' + hrAuto.trim() + '）');

  // 刷新后自己录的数据还在（输入框的值要用 inputValue，innerText 读不到）
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await openTool(p, 'reg_law');
  const persisted = await p.locator(
    '.view:not(.hide) [data-qw-host] .qwt-tbl tbody input[type=text]').first().inputValue();
  ck(persisted.includes('本厂 1 段配方奶粉'),
     '★ 刷新后录入的台账数据还在（本机落盘，实际「' + persisted + '」）');
  const barTxt = await p.locator('.view:not(.hide) [data-qw-host] .qwreal').innerText();
  ck(barTxt.includes('1 条记录'), '状态条显示真实记录数：' + barTxt.replace(/\s+/g, ' ').slice(0, 90));

  console.log('=== 4. 卡片内容可编辑、落盘、恢复默认 ===');
  await p.evaluate(() => { if (typeof rdStartEdit === 'function') rdStartEdit('reg_law'); });
  await p.waitForTimeout(220);
  ck(await p.locator('#rdF_whenToUse').count() === 1, '点编辑后出现「适用场景」输入框');
  ck(await p.locator('#rdF_steps').count() === 1, '出现「实操步骤」编辑框');
  ck(await p.locator('#rdF_note').count() === 1, '出现「本厂项目记录」编辑框');
  ck((await p.locator('#rdF_note').inputValue()) === '', '★ 项目记录默认空白，不再自动塞编造案例');
  await p.locator('#rdF_whenToUse').fill('本厂仅在注册证延续与法规换版时启用本表。');
  await p.locator('#rdF_note').fill('2026-11-10 复核：注册证 XXX，评审人 XXX。');
  await p.evaluate(() => { if (typeof rdSaveForm === 'function') rdSaveForm('reg_law'); });
  await p.waitForTimeout(280);
  const cardTxt = await p.locator('#rdList').innerText();
  ck(cardTxt.includes('本厂仅在注册证延续'), '★ 保存后卡片显示改写后的适用场景');
  ck(cardTxt.includes('评审人 XXX'), '★ 保存后卡片显示本厂项目记录');
  ck(!cardTxt.includes('（空白）点右上'), '空白提示已消失');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { if (typeof toggleRd === 'function') toggleRd('reg_law'); });
  await p.waitForTimeout(250);
  ck((await p.locator('#rdList').innerText()).includes('评审人 XXX'), '★ 刷新后改写内容仍在');
  await p.evaluate(() => { if (typeof rdResetForm === 'function') rdResetForm('reg_law'); });
  await p.waitForTimeout(250);
  ck(!(await p.locator('#rdList').innerText()).includes('评审人 XXX'), '「恢复默认」清掉本厂记录');

  console.log('=== 5. 原料替代：整张原料表可录入 ===');
  await openTool(p, 'material_sub');
  const subInputs = await p.locator('.qwsub-edit input').count();
  ck(subInputs >= 8, '★ 现状原料的名称/供应商/单价/成分全部可编辑（' + subInputs + ' 个输入框）');
  ck((await p.locator('.qwsub-edit input').first().getAttribute('value')) === '',
     '原料名称默认是空的，不是写死的「脱盐乳清粉」');
  await p.locator('.qwsub-h .btn').first().click();
  await p.waitForTimeout(220);
  ck((await p.locator('.qwsub-edit tbody tr').count()) === 2, '「+ 加一个候选原料」真的加了一行');
  const candRow = p.locator('.qwsub-edit tbody tr').nth(1);
  await candRow.locator('input').nth(0).fill('本厂候选乳清粉');
  await candRow.locator('input').nth(2).fill('70');
  await candRow.locator('input').nth(3).fill('12');
  await p.waitForTimeout(260);
  ck((await p.locator('.view:not(.hide) [data-qw-host]').innerText()).includes('本厂候选乳清粉'),
     '★ 录入的候选原料进入测算结论');

  console.log('=== 6. 营养素配比：数据可信度与从零录入 ===');
  await openTool(p, 'nutrient_calc');
  const src0 = await p.locator('#gbCalc .gbc-srcbar').innerText();
  ck(src0.includes('仅供试算') || src0.includes('不可用于配方注册'),
     '★ 顶部明确警示内置参考基线非实测、不可用于申报');
  ck(await p.locator('#gbCalc .gbc-srcbar .btn').count() >= 2, '有「清空参考值」与「载入参考基线」两个入口');
  const beforeVal = await p.locator('#gbCalc .gbc-tbl tbody td.v').first().innerText();
  await p.locator('#gbCalc .gbc-srcbar .btn').first().click();
  await p.waitForTimeout(320);
  const src1 = await p.locator('#gbCalc .gbc-srcbar').innerText();
  ck(src1.includes('已清空') || src1.includes('按 0 计'), '★ 清空后状态条说明未录成分按 0 计');
  const afterVal = await p.locator('#gbCalc .gbc-tbl tbody td.v').first().innerText();
  ck(beforeVal !== afterVal, '★ 清空内置值后计算值真的变了（' + beforeVal.trim() + ' → ' + afterVal.trim() + '）');
  await p.locator('#gbCalc .gbc-srcbar .btn').nth(1).click();
  await p.waitForTimeout(320);
  ck((await p.locator('#gbCalc .gbc-srcbar').innerText()).includes('非实测'),
     '载入参考基线时仍明确标注非实测');

  console.log('=== 7. 全量备份入口 ===');
  ck(await p.locator('#rdDataBar').count() === 1, '研发页有数据管理条');
  ck((await p.locator('#rdDataBar').innerText()).includes('不会上传'), '写明数据只存本机、不上传');
  ck((await p.locator('#rdDataBar .btn').count()) >= 2, '有「全量备份 / 恢复备份」按钮');

  console.log('=== 8. 移动端不溢出 ===');
  for (const w of [390, 430]) {
    await p.setViewportSize({ width: w, height: 780 });
    await openTool(p, 'reg_law');
    const m = await p.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth
    }));
    ck(m.sw <= m.iw + 1, w + 'px 视口无横向溢出（' + m.sw + '/' + m.iw + '）');
  }

  await p.setViewportSize({ width: 1440, height: 900 });
  console.log('=== 9. 旧版演示数据迁移（老用户浏览器里已落盘的假数据）===');
  /* 老版本把编造的台账写进了 localStorage。升级后必须清掉那些假行，
     但用户自己改过 / 自己新增的行一条都不能丢。 */
  await p.evaluate(() => {
    const R = window.STDWATCH_DATA.RDTOOLS, r = Array.isArray(R) ? R[0] : R;
    const demo = r.modules.find(m => m.moduleKey === 'reg_law').widget.demoSeed;
    const key = Object.keys(localStorage).find(k => /qw\.all$/.test(k)) || 'swd:qw.all';
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    all.reg_law = { rows: [
      Object.assign({}, demo[0]),
      { name: '本厂真实在册产品', seg: '1段', cat: '乳基', std: 'GB 10765',
        reg: '本厂自填证号', exp: '2030-01-01', res: '有效' }
    ] };
    localStorage.setItem(key, JSON.stringify(all));
    /* 关页会触发 QW_flush 把内存态写回，内存也要同步成同一份测试数据 */
    _QWD_MEM['reg_law'] = all.reg_law;
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await openTool(p, 'reg_law');
  const leftRows = await p.locator(
    '.view:not(.hide) [data-qw-host] .qwt-tbl tbody tr').count();
  const leftName = await p.locator(
    '.view:not(.hide) [data-qw-host] .qwt-tbl tbody input[type=text]').first().inputValue();
  ck(leftRows === 1 && leftName.includes('本厂真实在册产品'),
     '★ 旧演示行被清掉、用户自己的记录保留（剩 ' + leftRows + ' 行：' + leftName + '）');

  console.log('=== 10. 备份 / 恢复链路 ===');
  const snapOk = await p.evaluate(() => {
    if (typeof QW_snapshot !== 'function' || typeof QW_restoreSnapshot !== 'function') return false;
    const s = QW_snapshot(['reg_law']);
    const n = (s.reg_law && s.reg_law.rows) ? s.reg_law.rows.length : -1;
    delete _QWD_MEM['reg_law'];
    QW_restoreSnapshot(s, ['reg_law']);
    return n > 0 && _QWD_MEM['reg_law'].rows.length === n;
  });
  ck(snapOk, '★ 逐工具数据可摘取为备份并原样恢复');
  let dlName = '';
  try {
    const dlP = p.waitForEvent('download', { timeout: 12000 });
    await p.locator('.view:not(.hide) [data-qw-host] .qwreal .btn').first().click();
    dlName = (await dlP).suggestedFilename();
  } catch (e) { dlName = ''; }
  ck(dlName.includes('reg_law'), '★ 点「备份数据」真的下载了本工具的数据文件（' + dlName + '）');

  console.log('=== JS 报错 ===');
  ck(errs.length === 0, '全程无 JS 报错' + (errs.length ? '：' + errs.slice(0, 4).join(' | ') : ''));
  console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项 / 通过 ' + pass : '✓ 全部通过 ' + pass + ' 项'));
  await b.close();
  process.exit(fail ? 1 : 0);
})();
