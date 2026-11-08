/* 通则引用标准 ⊆ 标准清单（子集关系）回归测试 · 2026-11-08
 *
 * 用户的口径（不能弄反）：
 *   标准清单 STD        = 全部现行标准（全集）
 *   通则引用 REFGROUPS  = 标准清单里的一部分（子集）
 *
 * 踩过的两个坑，这里都盯着：
 *   ① T/CIQA 团体标准被当成 GB 强制国标的「替代者」，把 GB 4789.10 / 4789.4
 *      从清单里剔除，但引用页仍把它们列为现行执行版本 → 子集关系撕开。
 *   ② 云端每天重建 STD 与 REFGROUPS，只改 data.js 不改源头脚本，第二天就丢。
 *
 * 跑法： node scripts/test_refs_subset.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function ck(ok, msg) {
  if (ok) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

const box = { window: {} };
vm.runInNewContext(read('prototype/data.js'), box, { timeout: 10000 });
const D = box.window.STDWATCH_DATA;
const STD = D.STD || [];
const RG = D.REFGROUPS || [];

const norm = s => (s || '').replace(/\s+/g, '').toUpperCase().replace('GB/T', 'GBT');
const stdNos = new Set(STD.map(s => norm(s.no)));
const refItems = RG.flatMap(g => g.items.map(x => Object.assign({ g: g.g }, x)));
const refNos = new Set(refItems.map(x => norm(x.no)));
const special = RG.find(g => g.g === '婴配特殊成分');
const NEW = ['GB 5009.303-2025', 'GB 1903.80-2025'];

console.log('=== 数据规模 ===');
ck(RG.length === 14, '通则引用标准 14 个分组（实际 ' + RG.length + '）');
ck(refItems.length === 67, '引用条目共 67 项（实际 ' + refItems.length + '）');
ck(STD.length > refItems.length, '标准清单是更大的全集（清单 ' + STD.length
   + ' 条 > 引用 ' + refItems.length + ' 项）');
ck(stdNos.size > refNos.size, '清单的唯一标准号多于引用页（'
   + stdNos.size + ' > ' + refNos.size + '）');
ck([...refNos].some(n => !stdNos.has(n)) === false,
   '★ 引用标准全部能在标准清单里找到（子集关系）');

console.log('=== 子集关系的反证：清单里确实有引用页没有的标准 ===');
const outside = [...stdNos].filter(n => !refNos.has(n));
ck(outside.length > 100, '清单含 ' + outside.length + ' 个非引用标准（证明清单不是引用页的另一种展示）');

console.log('=== 本次点名新增 ===');
ck(!!special, '存在「婴配特殊成分」分组');
ck(special && special.items.length === 12, '婴配特殊成分 12 项（实际 '
   + (special ? special.items.length : 0) + '）');
for (const no of NEW) {
  const it = special && special.items.find(x => x.no === no);
  ck(!!it, '引用页「婴配特殊成分」含 ' + no);
  ck(!!it && it.validity === '现行有效', '  ' + no + ' 标为现行有效');
  ck(!!it && !!it.title && !!it.pub && !!it.imp, '  ' + no + ' 全称/发布日期/实施日期齐全');
  ck(stdNos.has(norm(no)), '标准清单含 ' + no);
  const s = STD.find(x => norm(x.no) === norm(no));
  ck(!!s && s.status === '现行有效', '  ' + no + ' 在清单中标为现行有效');
  ck(!!s && /酵母β-葡聚糖/.test(s.title), '  ' + no + ' 用官方名「酵母β-葡聚糖」');
  // 官方详情页 staticPages/<GUID>.html 或带标准号的检索页，都能落到这一条；
  // 只有 .../db?task=index（站点首页）才不合格。
  ck(!!s && (s.url.includes('staticPages/') || s.url.includes('keyword=')),
     '  ' + no + ' 官方链接能落到该标准（详情页或带号检索页）');
}
ck(special && special.items.filter(x => NEW.includes(x.no)).length === 2,
   '两条新增都归在「婴配特殊成分」且没有重复');

console.log('=== 原先漏在清单外的两条微生物标准 ===');
for (const no of ['GB 4789.10-2016', 'GB 4789.4-2024']) {
  ck(stdNos.has(norm(no)), '标准清单含 ' + no);
  const s = STD.find(x => norm(x.no) === norm(no));
  ck(!!s && s.status === '现行有效', '  ' + no + ' 状态为现行有效（未被团标误判替代）');
  ck(!!s && s.newer === '', '  ' + no + ' 没有被登记「已被 X 替代」');
}

console.log('=== 完整性 / 无脏数据 ===');
ck(STD.every(s => s.no && s.title && s.cat && s.sub), '清单每条都有标准号、全称、分类');
ck(STD.filter(s => /酵母贝塔/.test(s.title)).length === 0,
   '不再有乱码修正留下的旧名「酵母贝塔」');
for (const g of RG) {
  const ns = g.items.map(x => norm(x.no));
  ck(new Set(ns).size === ns.length, '  「' + g.g + '」组内无重复标准号');
}

console.log('=== 源头脚本（保证云端每日重建不丢）===');
const gr = JSON.parse(read('data/general_refs.json'));
ck(!!gr.details['GB 1903.80-2025'], 'general_refs.json 已补录 GB 1903.80-2025 元数据');
ck(gr.details['GB 1903.80-2025'] && gr.details['GB 1903.80-2025'].implement_date === '2026-03-02',
   '  实施日期 2026-03-02 正确');
const br = read('scripts/build_refgroups.py');
ck(br.includes('EXTRA_ITEMS'), 'build_refgroups.py 有点名条目附加机制');
for (const no of NEW) ck(br.includes(no), '  build_refgroups.py 含 ' + no);
const vv = read('scripts/verify_validity2.py');
ck(vv.includes('团体标准（T/…）不能替代'), 'verify_validity2.py 拦住团标误判');
const html = read('prototype/index.html');
ck(html.includes('本页是「标准清单」的一部分'), '页面写明「引用页是清单的一部分」');
ck(!html.includes('共引用 62 个标准'), '页面不再写死过时的引用数量');

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
