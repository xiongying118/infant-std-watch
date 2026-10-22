const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const fails = [];
const ck = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); };

const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
global.window = {};
vm.runInNewContext(
  fs.readFileSync(path.join(ROOT, 'prototype', 'data.js'), 'utf8'),
  { window: global.window });
const G = global.window.STDWATCH_DATA.GBNUTRITION;
const GB = Array.isArray(G) ? G[0] : G;

console.log('=== 1. 国标限值（GB 10765/10766/10767-2021 原文，每 100kJ）===');
ck(!!GB, 'data.js 含 GBNUTRITION');
if (GB) {
  const L1 = GB.limits['1'].milk, L2 = GB.limits['2'].milk, L3 = GB.limits['3'].milk;
  // ★ 2021 版真实值（此前凭记忆写的全错了）★
  ck(L1.protein.min === 0.72 && L1.protein.max === 1.80,
     '1段 蛋白 0.72~1.80（GB 10765-2021）');
  ck(L1.fat.min === 1.05 && L1.fat.max === 1.43,
     '1段 脂肪 1.05~1.43');
  ck(L1.carb.min === 2.2 && L1.carb.max === 3.3, '1段 碳水 2.2~3.3');
  ck(L3.protein.min === 0.43 && L3.protein.max === 0.96,
     '★ 3段 蛋白 0.43~0.96（2021版下调上下限，此前记成 0.71~2.2 是错的）');
  ck(L3.fat.min === 0.84 && L3.fat.max === 1.43,
     '★ 3段 脂肪 0.84~1.43（2021版上调下限）');
  ck(L3.carb.min === 1.8 && L3.carb.max === 3.6,
     '★ 3段 碳水 1.8~3.6（2021版新增范围）');
  ck(L3.la.min === 0.07 && L3.la.max === 0.29, '3段 亚油酸 0.07~0.29');
  ck(L3.ala.min === 12, '3段 α-亚麻酸 ≥12 mg');
  ck(L3.dha.min === 3.6 && L3.dha.max === 9.6, '3段 DHA 3.6~9.6 mg');
  ck(L3.ca_ratio.min === 1.0 && L3.ca_ratio.max === 2.0, '3段 钙磷比 1.0~2.0');
  // 豆基 1 段蛋白更严
  ck(GB.limits['1'].soy.protein.min === 0.53,
     '1段 豆基蛋白下限 0.53（乳基 0.72）');
  // N.S.（只有上限）
  ck(L3.ara.min === null && L3.ara.max === 19.1,
     '3段 ARA 只有上限 19.1（N.S.）');
}

console.log('\n=== 2. 营养素定义有基准与单位 ===');
ck(GB && GB.nutrients.length >= 20, '营养素 ≥20 项（实际 ' +
   (GB ? GB.nutrients.length : 0) + '）');
ck(GB && GB.nutrients.every(n => n.basis && n.unit && n.srcUnit),
   '每个营养素都有 basis / unit / srcUnit');
ck(GB && GB.nutrients.every(n => !n.key.startsWith('ca_ratio') || n.ratio),
   '比值型指标带 ratio 配置');
ck(GB && GB.materials.length >= 20, '原料 ≥20 种');
ck(GB && GB.defaultRecipe.length >= 10, '默认配方 ≥10 味');
ck(GB && !!GB.advice && Object.keys(GB.advice).length >= 15,
   '调整建议覆盖 ≥15 项');
ck(GB && GB.advice.protein && GB.advice.protein.over && GB.advice.protein.under,
   '★ 建议分「超限」与「不足」两个方向');

console.log('\n=== 3. 计算引擎：键名映射完整 ===');
// GB_KEYMAP 必须覆盖所有需要从原料表取的营养素
const need = ['protein', 'fat', 'carb', 'la', 'ala', 'ca', 'phos', 'na',
  'va', 'vd', 've', 'niacin', 'vc', 'folate', 'biotin', 'choline',
  'inositol', 'dha', 'ara', 'taurine'];
ck(/const GB_KEYMAP = \{[^}]*\}/s.test(html), 'index.html 有 GB_KEYMAP');
const km = (html.match(/const GB_KEYMAP = \{([\s\S]*?)\}/) || [])[1] || '';
need.forEach(k => {
  ck(new RegExp('\\b' + k + '\\s*:').test(km),
     'GB_KEYMAP 覆盖 ' + k + (new RegExp('\\b' + k + '\\s*:').test(km) ? '' : ' ← 漏了会算成 0'));
});

console.log('\n=== 4. 换算函数与基准处理 ===');
ck(/function convTo100kJ/.test(html), '有统一的 convTo100kJ 换算函数');
ck(/nt\.basis === "per100kJ"/.test(html), '按 basis 分别处理每 100g / 每 100kJ');
ck(/gbState\.basis === "豆基"/.test(html), '★ 限值分乳基/豆基两套（类别选错判定全错）');
ck(/L\.min!=null && val < L\.min/.test(html), '支持 N.S.（下限为 null）');
ck(/function pickAdvice/.test(html), '有 pickAdvice（按超限/不足分别给建议）');
ck(/nLow/.test(html) && /项不足/.test(html), '★ 顶部判定把「不足」也算进去');

console.log('\n=== 5. 工具已挂载 ===');
ck(/function renderQmTools/.test(html), '质量管理工具渲染函数');
ck(/function renderRdTools/.test(html), '研发管理渲染函数');
ck(/function QW_open/.test(html), '质量管理工具「打开工具」');
ck(/function RD_open/.test(html), '研发管理「打开工具」');
ck(/data-qw-host/.test(html), '有 widget 宿主容器');
ck(/const JSA = Array.isArray/.test(html), 'JSA 数组解包');
ck(/const QM = Array.isArray/.test(html), 'QM 数组解包');
ck(/const RD = Array.isArray/.test(html), 'RD 数组解包');
ck(/const GB = Array.isArray/.test(html), 'GB 数组解包');
ck(/workbench\.js/.test(html), '引入了 workbench.js');
ck(fs.existsSync(path.join(ROOT, 'prototype', 'workbench.js')),
   'workbench.js 存在');
const wb = fs.readFileSync(path.join(ROOT, 'prototype', 'workbench.js'), 'utf8');
ck(/function QW_table/.test(wb) && /function QW_pareto/.test(wb) &&
   /function QW_spc/.test(wb) && /function QW_histogram/.test(wb) &&
   /function QW_fishbone/.test(wb) && /function QW_why/.test(wb) &&
   /function QW_strata/.test(wb) && /function QW_shelf/.test(wb) &&
   /function QW_trace/.test(wb) && /function QW_sensory/.test(wb) &&
   /function QW_sub/.test(wb) && /function QW_flow/.test(wb) &&
   /function QW_checklist/.test(wb),
   '★ 12 类可交互组件都已实现');

console.log('\n=== 6. 全部工具都有 widget ===');
const Q = global.window.STDWATCH_DATA.QMTOOLS;
const M = global.window.STDWATCH_DATA.RDTOOLS;
const qm = Array.isArray(Q) ? Q[0].tools : Q.tools;
const rd = Array.isArray(M) ? M[0].modules : M.modules;
ck(qm.every(t => t.widget && t.widget.type),
   '★ 16 个质量管理工具全部有 widget');
ck(rd.every(m => m.widget && m.widget.type),
   '★ 18 个研发模块全部有 widget');
const types = {};
[...qm, ...rd].forEach(x => { types[x.widget.type] = (types[x.widget.type] || 0) + 1; });
console.log('    组件类型分布：' + Object.entries(types)
  .map(([k, v]) => k + '×' + v).join('  '));

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);