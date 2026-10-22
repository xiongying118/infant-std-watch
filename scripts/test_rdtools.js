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
const Q = global.window.STDWATCH_DATA.RDTOOLS;
const M = Array.isArray(Q) ? Q[0] : Q;

console.log('=== 1. 导航层级 ===');
const nav = html.slice(html.indexOf('<nav class="nav">'), html.indexOf('</nav>'));
const labels = [...nav.matchAll(/nav-label">([^<]+)</g)].map(m => m[1]);
ck(labels.includes('研发管理'), '导航有「研发管理」分组');
ck(labels.indexOf('质量管理') < labels.indexOf('研发管理'),
   '研发管理排在质量管理之后');
ck(labels.indexOf('研发管理') < labels.indexOf('实验室'),
   '★ 研发管理排在实验室之前');
ck(nav.indexOf('data-v="rdtools"') > nav.indexOf('>研发管理<'),
   '入口在研发管理组内');
// 入口必须有 .tx 包裹（漏了会折行 + 徽标被挤扁）
ck(/data-v="rdtools"[^>]*><span class="ic">[^<]*<\/span><span class="tx">/.test(nav),
   '★ 研发管理入口的文字包在 .tx 里');

console.log('\n=== 2. 六个分组 ===');
const GROUPS = ['法规与标准依据', '配方设计', '小试与中试',
                '稳定性与保质期', '合规性验证', '变更与知识库'];
ck(M && M.groups.length === 6, '共 6 个分组（实际 ' +
   (M ? M.groups.length : 0) + '）');
GROUPS.forEach(g => ck(M && M.groups.includes(g), '含分组「' + g + '」'));

console.log('\n=== 3. 8 个必备功能点 ===');
const NEED = {
  'nutrient_calc': '营养素配比计算',
  'formula_version': '配方版本管理',
  'material_sub': '原料选型与替代评估',
  'human_milk_research': '母乳成分研究参考库',
  'pilot_scaleup': '中试放大验证',
  'shelf_life': '稳定性与货架期判定',
  'reg_filing': '配方注册申报管理',
  'change_control': '配方变更管理',
};
ck(M && M.modules.length === 18,
   '共 18 个功能点（实际 ' + (M ? M.modules.length : 0) + '）');
const byKey = {};
(M ? M.modules : []).forEach(m => { byKey[m.moduleKey] = m; });
Object.keys(NEED).forEach(k =>
  ck(!!byKey[k], '★ 含 ' + NEED[k] + '（' + k + '）'));

console.log('\n=== 4. 八字段完整 ===');
const FIELDS = ['moduleKey', 'name', 'group', 'summary', 'whenToUse',
                'steps', 'template', 'case'];
(M ? M.modules : []).forEach(m => {
  const bad = FIELDS.filter(f => !m[f] || (Array.isArray(m[f]) && !m[f].length));
  ck(bad.length === 0, m.moduleKey + ' 八字段齐全' +
     (bad.length ? '（缺 ' + bad.join(',') + '）' : ''));
});

console.log('\n=== 5. steps 为 3~6 步动宾短语 ===');
(M ? M.modules : []).forEach(m => {
  ck(m.steps.length >= 3 && m.steps.length <= 6,
     m.moduleKey + ' 步数 ' + m.steps.length + '（应 3~6）');
  ck(m.steps.every(s => typeof s === 'string' && s.length >= 8),
     m.moduleKey + ' 每步是完整动宾短语');
  ck(m.template.includes('|'), m.moduleKey + ' template 用竖线分隔字段');
  ck(m.case.length >= 30, m.moduleKey + ' case 有实质内容');
  ck(M.groups.includes(m.group), m.moduleKey + ' group 在六组内');
});

console.log('\n=== 6. 法规口径 ===');
const ALL = JSON.stringify(M || {});
['GB 10765', 'GB 10766', 'GB 10767', 'GB 19644'].forEach(law =>
  ck(ALL.includes(law), '含 ' + law));
ck(/配方注册/.test(ALL), '含「配方注册」术语');
ck(/乳基/.test(ALL) && /豆基/.test(ALL), '含「乳基」「豆基」术语');
ck(/段位/.test(ALL) || /1段|2段|3段/.test(ALL), '含「段位」术语');
// 核心模块各自要写清对应标准
ck(/GB 10765/.test(byKey['nutrient_calc'] ?
   JSON.stringify(byKey['nutrient_calc']) : ''), '营养素配比计算写了 GB 10765');
ck(/GB 19644/.test(byKey['reg_law'] ?
   JSON.stringify(byKey['reg_law']) : ''), '配方注册法规写了 GB 19644');
// 1/2/3 段与乳基/豆基要在选段位那一步出现
ck(/1段/.test(JSON.stringify(byKey['nutrient_calc'])) &&
   /乳基/.test(JSON.stringify(byKey['nutrient_calc'])),
   '营养素配比计算含「1段」与「乳基/豆基」');

console.log('\n=== 7. 分布 ===');
M.groups.forEach(g => {
  const n = M.modules.filter(m => m.group === g).length;
  ck(n > 0, g + ' 有功能点（' + n + ' 个）');
});
console.log('    ' + M.groups.map(g =>
  (M.catMeta[g] || {}).icon + g + M.modules.filter(m => m.group === g).length
).join('  '));

console.log('\n=== 8. 路由与渲染 ===');
ck(/"rdtools"/.test(html.match(/const OK=\[[^\]]*\]/)[0]), 'route 白名单含 rdtools');
ck(/if\(v==="rdtools"\) renderRdTools\(\);/.test(html), 'route 调用 renderRdTools');
ck(/rdtools:"研发管理"/.test(html), 'TITLES 含 rdtools');
ck((html.match(/if\(v==="rdtools"\)/g) || []).length === 1,
   '路由里只有一处（防重复插入）');
ck(/v-rdtools/.test(html), '有 v-rdtools 视图容器');
ck(/function toggleRd/.test(html), '有 toggleRd 展开函数');
ck(/function copyRdTpl/.test(html), '有复制字段功能');
ck(/\.rdcard\{/.test(html) || /\.rdcard::before\{/.test(html),
   '研发卡片有独立配色（与质量管理工具区分）');
// 徽标启动时要填上，不能停在「—」
ck(/set\("qmBadge"/.test(html) && /set\("rdBadge"/.test(html),
   '★ 两个新模块的徽标在启动时赋值');

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);