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
const Q = global.window.STDWATCH_DATA.QMTOOLS;
const M = Array.isArray(Q) ? Q[0] : Q;

console.log('=== 1. 导航层级（质量管理在实验室上面）===');
const nav = html.slice(html.indexOf('<nav class="nav">'), html.indexOf('</nav>'));
const labels = [...nav.matchAll(/nav-label">([^<]+)</g)].map(m => m[1]);
ck(labels.includes('质量管理'), '导航有「质量管理」分组');
ck(labels.includes('实验室'), '导航仍有「实验室」分组');
const iq = labels.indexOf('质量管理'), il = labels.indexOf('实验室');
ck(iq >= 0 && il >= 0 && iq < il,
   '★ 「质量管理」排在「实验室」上面（实际 ' + labels.join(' → ') + '）');
ck(nav.indexOf('data-v="qmtools"') > nav.indexOf('>质量管理<'),
   '工具入口在质量管理组内');
ck(nav.indexOf('data-v="qmtools"') < nav.indexOf('data-v="jsa"'),
   '工具入口在实验室入口之前');

console.log('\n=== 2. 分组 ===');
const NEED_CATS = ['体系工具', '问题分析', '过程控制', '现场管理', '风险预防'];
ck(M && M.cats.length === 5, '共 5 个分组');
NEED_CATS.forEach(c => ck(M && M.cats.includes(c), '含分组「' + c + '」'));

console.log('\n=== 3. 16 个必备工具 ===');
const NEED = {
  'haccp': 'HACCP', 'prp_oprp': 'PRP/OPRP', 'iso22000': 'ISO22000',
  'fishbone': '鱼骨图', 'five_why': '5Why', 'pareto': '帕累托图',
  'checklist': '检查表', 'spc_control_chart': 'SPC控制图',
  'histogram': '直方图', 'stratification': '层别法', 'five_s': '5S',
  'batch_trace': '批次追溯', 'allergen': '过敏原管理', 'fmea': 'FMEA',
  'pdca': 'PDCA', 'poka_yoke': '防错法',
};
ck(M && M.tools.length === 16,
   '共 16 个工具（实际 ' + (M ? M.tools.length : 0) + '）');
const byKey = {};
(M ? M.tools : []).forEach(t => { byKey[t.toolKey] = t; });
Object.keys(NEED).forEach(k => {
  ck(!!byKey[k], '★ 含 ' + NEED[k] + '（' + k + '）');
});

console.log('\n=== 4. 字段完整性 ===');
const FIELDS = ['toolKey', 'name', 'category', 'summary', 'whenToUse',
                'steps', 'template', 'case'];
(M ? M.tools : []).forEach(t => {
  const bad = FIELDS.filter(f => !t[f] || (Array.isArray(t[f]) && !t[f].length));
  ck(bad.length === 0, t.toolKey + ' 八字段齐全' +
     (bad.length ? '（缺 ' + bad.join(',') + '）' : ''));
});

console.log('\n=== 5. 内容质量（能教会人做）===');
(M ? M.tools : []).forEach(t => {
  ck(t.steps.length >= 5,
     t.toolKey + ' 步骤 ≥5 步（实际 ' + t.steps.length + '）');
  ck(t.steps.every(s => typeof s === 'string' && s.length >= 8),
     t.toolKey + ' 每步都是完整句子');
  ck(t.template.includes('|'),
     t.toolKey + ' template 是竖线分隔的字段表');
  ck(t.case.length >= 30, t.toolKey + ' case 有实质内容');
  ck(M.cats.includes(t.category), t.toolKey + ' category 在五组内');
});

console.log('\n=== 6. 分布 ===');
M.cats.forEach(c => {
  const n = M.tools.filter(t => t.category === c).length;
  ck(n > 0, c + ' 有工具（' + n + ' 个）');
});
console.log('    ' + M.cats.map(c =>
  (M.catMeta[c] || {}).icon + c + M.tools.filter(t => t.category === c).length
).join('  '));

console.log('\n=== 7. 路由与渲染 ===');
ck(/"qmtools"/.test(html.match(/const OK=\[[^\]]*\]/)[0]), 'route 白名单含 qmtools');
ck(/if\(v==="qmtools"\) renderQmTools\(\);/.test(html), 'route 调用 renderQmTools');
ck(/qmtools:"质量管理工具"/.test(html), 'TITLES 含 qmtools');
ck((html.match(/if\(v==="qmtools"\)/g) || []).length === 1,
   '路由里只有一处（防重复插入）');
['.qmcard', '.qmsteps', '.qmtpl', '.qmcase', '.qmrow'].forEach(c =>
  ck(html.includes(c), 'CSS 含 ' + c));
ck(/function toggleQm/.test(html), '有 toggleQm 展开函数');
ck(/function copyQmTpl/.test(html), '有复制字段功能');
ck(/v-qmtools/.test(html), '有 v-qmtools 视图容器');

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);