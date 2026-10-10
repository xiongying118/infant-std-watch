const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');

const fails = [];
function ck(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); }

console.log('=== 1. 结构 ===');
ck(/data-v="method"/.test(html), '导航含 method 入口');
ck(/href="#method"/.test(html), '导航链接指向 #method');
ck(/id="v-method"/.test(html), '存在 v-method 视图');
ck(/function renderMethod\(\)/.test(html), '定义 renderMethod()');
ck(/method:"检测方法原理"/.test(html), 'TITLES 含 method');
ck(/"method","mdetail"/.test(html) || /method.*mdetail.*subs/.test(html), 'route 白名单含 method/mdetail');
ck(/if\(v==="method"\) renderMethod\(\);/.test(html), 'route 调用 renderMethod');
ck(/id="methodList"/.test(html) && /id="methodSearch"/.test(html), '视图含列表/搜索框');
ck(/id="mdetailBox"/.test(html), '存在 mdetailBox');

// 导航归属：method 必须在「实验室」组内
const nav = html.slice(html.indexOf('<nav class="nav">'), html.indexOf('</nav>'));
const labStart = nav.indexOf('>实验室<');
const remStart = nav.indexOf('>提醒<');
const mPos = nav.indexOf('data-v="method"');
ck(labStart > 0 && mPos > labStart && (remStart < 0 || mPos < remStart),
   'method 入口归属「实验室」组');

console.log('\n=== 2. 数据 ===');
global.window = {};
// ★ 必须用 vm 单独求值，不能 require ★
//   require 会缓存模块，同一进程里多次跑测试会拿到上一次的旧 data.js，
//   表现为「明明注入是 18 条，测试却报 35 条」—— 白排查一轮。
const vm = require('vm');
const src = fs.readFileSync(path.join(ROOT, 'prototype', 'data.js'), 'utf8');
vm.runInNewContext(src, { window: global.window });
const d = global.window.STDWATCH_DATA;
const M = d.METHODS || [];
ck(M.length === 18, 'METHODS 18 份（实际 ' + M.length + '）');
ck(M.every(x => x.stdNo && x.title && x.principle), '每份都有标准号/标题/原理');
ck(M.every(x => Array.isArray(x.reagents) && x.reagents.length), '每份都有试剂');
ck(M.every(x => x.reagents.every(r => r.name && r.role)), '每种试剂都有名称和作用');
ck(new Set(M.map(x => x.stdNo)).size === M.length, '标准号无重复');
ck(M.filter(x => Array.isArray(x.sections) && x.sections.length).length >= 15,
   '至少 15 份带要点章节');

// ---- 归类与排序（用户 2026-10-10 要求）----
ck(M.every(x => x.cat), '每份都有分类 cat');
const byCat = {};
M.forEach(x => { (byCat[x.cat] = byCat[x.cat] || []).push(x.stdNo); });
console.log('\n  分类分布：');
Object.keys(byCat).forEach(k => console.log('    ' + k.padEnd(12) + byCat[k].length + ' 个'));
ck(!byCat['其它'], '没有落到「其它」的未分类项');
ck(Object.keys(byCat).length === 5, '共 5 个检测项目分类');
// 脂肪酸类必须含 168 与5413.36，且不含蛋白质/脂肪
ck((byCat['脂肪酸与反式脂肪酸'] || []).some(n => /168/.test(n)), '脂肪酸类含 GB5009.168');
ck((byCat['脂肪酸与反式脂肪酸'] || []).some(n => /5413\.36/.test(n)), '脂肪酸类含 GB5413.36');
// 维生素类 5 个
ck((byCat['维生素'] || []).length === 5, '维生素类 5 个标准');
// 组内按标准号数值序：44 < 87 < 267
const min = (byCat['矿物质'] || []).map(n => {
  const m = n.match(/(\d+)\.(\d+)-/); return m ? parseInt(m[2], 10) : -1;
});
ck(JSON.stringify(min) === JSON.stringify([...min].sort((a, b) => a - b)),
   '矿物质组内按标准号数值升序（' + min.join(' < ') + '）');

console.log('\n=== 3. 真实渲染 ===');
const grabbed = {};
function mkEl(id) {
  return {
    set innerHTML(v) { grabbed[id] = v; },
    get innerHTML() { return grabbed[id] || ''; },
    set textContent(v) { grabbed[id] = String(v); },
    get textContent() { return grabbed[id] || ''; },
    set value(v) { grabbed[id + '.value'] = v; },
    get value() { return grabbed[id + '.value'] || ''; },
    style: {},
  };
}
// 页面里的 $ 是 document.querySelector 的包装，两种都要 stub。
// 只给 getElementById 会漏。
const byId = (id) => mkEl(id);
global.document = {
  getElementById: byId,
  querySelector: (sel) => mkEl(String(sel).replace(/^#/, '')),
  // ★ $$ 必须返回**可迭代**对象 ★
  //   页面用 $$("#methodCats button").forEach(...) 绑定分类标签点击，
  //   返回 undefined 会抛 "not a function or its return value is not iterable"。
  //   这里返回空数组即可 —— 标签的点击绑定不影响渲染断言。
  querySelectorAll: () => [],
};
// 页面自己就声明了 const $ / $$（在切出来的片段之前），
// 再用函数参数传同名变量会报 "Identifier '$' has already been declared"。
// 正确做法：只把 window/document 作为参数传进去，$ / $$ 直接挂到 global。
global.$ = (sel) => mkEl(String(sel).replace(/^#/, ''));
global.$$ = () => [];

const e = html.lastIndexOf('</script>');
let body = html.slice(html.lastIndexOf('<script>', e) + 8, e);
// ★ 切分点必须晚于 renderMethod 定义 ★
//   原来切在 'const REFGROUPS ='，但 REFGROUPS 的声明位置在 renderMethod
//   **之前**（METHODS 段被插在 REFGROUPS 那行后面），
//   于是切完把 renderMethod 一起切掉了 → "renderMethod is not defined"。
//   改切在 renderLaw —— 它是第一个依赖真实 DOM、我不需要的函数。
const cut = body.indexOf('function renderLaw(');
body = body.slice(0, cut > 0 ? cut : body.length);

const RUN = (extra) => new Function('window', 'document',
                                     body + (extra || ''))
  (global.window, global.document);

try {
  RUN('\nrenderMethod();');
} catch (err) {
  console.log('  ✗ renderMethod 抛错: ' + err.message);
  fails.push('renderMethod 抛错: ' + err.message);
}

const list = grabbed.methodList || '';
ck(list.length > 2000, 'methodList 渲染出内容（' + list.length + '字符）');
ck((list.match(/toggleMethod\(/g) || []).length === M.length,
   '每份标准都有展开入口（' + (list.match(/toggleMethod\(/g) || []).length + '）');
ck(list.indexOf('GB5009.5-2025') >= 0, '列表含 GB5009.5-2025');
ck(list.indexOf('凯氏定氮法') >= 0, '列表显示方法名');
ck(grabbed.methodBadge === String(M.length), '侧栏徽标数字正确');
ck(list.indexOf('undefined') < 0, '无 undefined');
ck(list.indexOf('[object Object]') < 0, '无 [object Object]');

console.log('\n=== 4. 展开详情 ===');
try {
  RUN('\n_methodOpen["GB5009.5-2025"]=true;renderMethod();');
} catch (err) {
  console.log('  ✗ 展开抛错: ' + err.message);
  fails.push('展开抛错: ' + err.message);
}
const l2 = grabbed.methodList || '';
ck(l2.indexOf('试剂与作用') >= 0, '展开后显示「试剂与作用」');
ck(l2.indexOf('硫酸铜') >= 0, '展开后显示具体试剂名');
ck(l2.indexOf('不能替代标准原文') >= 0, '展开后有合规提示');
ck(l2.indexOf('<table') >= 0, '试剂用表格呈现');
ck((l2.match(/<tr/g) || []).length >= 8, '试剂表格行数合理');

console.log('\n=== 4b. 分类分组渲染 ===');
const cats = grabbed.methodCats || '';
ck(cats.length > 20, '分类标签已渲染（' + cats.length + '字符）');
ck(cats.indexOf('全部') >= 0, '有「全部」标签');
['蛋白质与基础成分', '脂肪酸与反式脂肪酸', '矿物质', '维生素', '婴配特殊成分']
  .forEach(c => ck(cats.indexOf(c) >= 0, '分类标签含「' + c + '」'));
ck(l2.indexOf('个标准') >= 0, '分组标题带条数');
// 分组顺序：矿物质段应排在脂肪酸段之后
const iFat = l2.indexOf('>脂肪酸与反式脂肪酸<');
const iMin = l2.indexOf('>矿物质<');
ck(iFat > 0 && iMin > iFat, '分组按检测项目顺序渲染');

console.log('\n=== 5. 搜索 ===');
try {
  global.$('#methodSearch').value = '凯氏';
  RUN('\nrenderMethod();');
  const l3 = grabbed.methodList || '';
  ck(l3.indexOf('GB5009.5-2025') >= 0, '搜「凯氏」命中凯氏定氮法');
  ck(l3.indexOf('GB5413.20-2022') < 0, '搜「凯氏」排除无关标准');
  ck(/1 \/ 18/.test(grabbed.methodCount || ''), '计数显示 1 / 18');
} catch (err) {
  console.log('  ✗ 搜索抛错: ' + err.message);
  fails.push('搜索抛错: ' + err.message);
}

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);