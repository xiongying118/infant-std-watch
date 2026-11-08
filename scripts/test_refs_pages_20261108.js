/* 通则引用标准 / 标准清单 两页的真实浏览器回归 · 2026-11-08
 *
 * 覆盖：
 *   · 点名新增的两条标准在「婴配特殊成分」组、也在标准清单里
 *   · 「全部 67」在第一位、子集说明写在页面上
 *   · 标准清单默认能列出全部（curSub 未初始化曾导致「共 0 条」）
 *   · 分组模式下搜索生效（曾出现「计数 1 条、表格铺出全部团标」）
 *
 * 跑法：
 *   NODE_PATH=<playwright 路径> node scripts/test_refs_pages_20261108.js          # 线上
 *   NODE_PATH=<...> STD_TARGET=local node scripts/test_refs_pages_20261108.js     # 本地 file://
 */
const { chromium } = require('playwright-core');
const path = require('path');
const PROT = path.resolve(__dirname, '..', 'prototype');
const URL = (process.env.STD_TARGET === 'local'
  ? 'file:///' + PROT.replace(/\\/g, '/') + '/index.html'
  : 'https://xiongying118.github.io/infant-std-watch/');
const EXE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let pass = 0, fail = 0, errs = [];
function ck(ok, msg) { if (ok) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
async function gotoRetry(p, url) {
  for (let i = 0; i < 6; i++) {
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(1400);
      return true;
    } catch (e) {
      console.log('   goto 重试 ' + (i + 1) + '：' + String(e).slice(0, 70));
      await p.waitForTimeout(4000);
    }
  }
  return false;
}

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });

  console.log('=== 通则引用标准页 #refs ===');
  if (!(await gotoRetry(p, URL + '#refs'))) { console.log('网络不通，中止'); await b.close(); process.exit(2); }
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#refTabs button')]
    .map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  ck(/^全部\s*67$/.test(tabs[0] || ''), '第一位「全部 67」');
  ck(tabs.some(t => /婴配特殊成分\s*12/.test(t)), '「婴配特殊成分 12」页签存在');
  const notice = await p.evaluate(() => document.querySelector('#v-refs .notice').innerText.replace(/\s+/g, ''));
  ck(notice.includes('本页是「标准清单」的一部分'), '页面写明「引用页是清单的一部分」');
  ck(!notice.includes('共引用 62 个标准'), '不再显示过时的引用数量');

  const idx = await p.evaluate(() => [...document.querySelectorAll('#refTabs button')]
    .findIndex(x => x.innerText.includes('婴配特殊成分')));
  await p.evaluate(i => document.querySelectorAll('#refTabs button')[i].click(), idx);
  await p.waitForTimeout(350);
  const body = await p.evaluate(() => document.querySelector('#refBox').innerText.replace(/\s+/g, ' '));
  ck(body.includes('GB 5009.303-2025'), '分组内可见 GB 5009.303-2025');
  ck(body.includes('GB 1903.80-2025'), '分组内可见 GB 1903.80-2025');
  ck(body.includes('食品营养强化剂 酵母β-葡聚糖'), '显示完整官方全称');
  ck((body.match(/GB 5009\.303-2025/g) || []).length === 1, 'GB 5009.303 在该组只出现一次');
  const nItems = await p.evaluate(() => document.querySelectorAll('#refBox .rem-item').length);
  ck(nItems === 12, '该组渲染 12 项（实际 ' + nItems + '）');

  console.log('=== 标准清单页 #list ===');
  if (!(await gotoRetry(p, URL + '#list'))) { console.log('网络不通，中止'); await b.close(); process.exit(2); }
  const first = await p.evaluate(() => ({
    cnt: document.querySelector('#listCnt').innerText,
    rows: document.querySelectorAll('#listBody tr.rowlink').length,
    empty: document.querySelector('#listBody').innerText.includes('没有匹配的标准'),
  }));
  console.log('  默认：' + first.cnt + ' / ' + first.rows + ' 行');
  ck(!first.empty && first.rows > 100, '★ 直接点导航进清单能列出全部（不是「共 0 条」）');
  const allTab = await p.evaluate(() => document.querySelector('#listTabs button')
    .innerText.replace(/\s+/g, ' ').trim());
  ck(/^全部\s*\d+$/.test(allTab), '「全部」页签带动态总数（' + allTab + '）');

  for (const kw of ['GB 1903.80-2025', 'GB 5009.303-2025', 'GB 4789.10-2016', 'GB 4789.4-2024']) {
    const r = await p.evaluate(k => {
      doSearch(k);
      return {
        txt: document.querySelector('#listBody').innerText,
        cnt: document.querySelector('#listCnt').innerText,
        rows: document.querySelectorAll('#listBody tr.rowlink').length,
      };
    }, kw);
    ck(r.txt.includes(kw), '清单能搜到 ' + kw);
    ck(r.rows === 1, '  搜索 ' + kw + ' 只显示 1 行（分组模式不再铺出全部）');
  }
  await p.evaluate(() => doSearch(''));

  console.log('=== 首页 ===');
  if (!(await gotoRetry(p, URL + '#home'))) { console.log('网络不通，中止'); await b.close(); process.exit(2); }
  const kpis = await p.evaluate(() => [...document.querySelectorAll('#v-home .grid.kpi4 .kpi')]
    .map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  ck(kpis.length === 4, '首页仍是 4 张 KPI（实际 ' + kpis.length + '）');
  ck(kpis.some(k => k.includes('（通则引用标准）')) && kpis.some(k => k.includes('（标准清单全部）')),
     'KPI 仍区分「通则引用标准」与「标准清单全部」两种口径');
  ck(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs.slice(0, 3).join(' / ') : ''));

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
