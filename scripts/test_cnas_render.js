const fs = require('fs');
const path = require('path');
const ROOT = process.cwd().replace(/\\/g, '/');
const html = fs.readFileSync(ROOT + '/prototype/index.html', 'utf8');
const js = fs.readFileSync(ROOT + '/prototype/data.js', 'utf8');

const fails = [];
function ck(cond, msg) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) fails.push(msg);
}

// ---- 1) 结构检查 ----
console.log('=== 1. 结构 ===');
ck(/data-v="cnas"/.test(html), '左侧导航有 cnas 入口');
ck(/href="#cnas"/.test(html), '导航链接指向 #cnas');
ck(/id="v-cnas"/.test(html), '存在 v-cnas 视图');
ck(/function renderCnas\(\)/.test(html), '定义 renderCnas()');
ck(/cnas:"认可规范（CNAS）"/.test(html), 'TITLES 含 cnas');
ck(/const OK=\[[^\]]*"cnas"/.test(html), 'route 白名单含 cnas');
ck(/if\(v==="cnas"\) renderCnas\(\);/.test(html), 'route 调用 renderCnas');
ck(/id="cnasTabs"/.test(html) && /id="cnasList"/.test(html), '视图含 tabs/list 容器');

// 导航顺序：cnas 必须在 law 之后
const iLaw = html.indexOf('data-v="law"');
const iCnas = html.indexOf('data-v="cnas"');
ck(iLaw > 0 && iCnas > iLaw, 'cnas 排在 law（法规与体系）之后');

// ---- 2) 数据检查 ----
console.log('\n=== 2. 数据 ===');
global.window = {};
require(ROOT + '/prototype/data.js');
const d = global.window.STDWATCH_DATA;
ck(Array.isArray(d.CNASDOCS) && d.CNASDOCS.length > 0,
   'CNASDOCS 存在且非空（' + (d.CNASDOCS || []).length + ' 条）');
ck(Array.isArray(d.CNASKINDS) && d.CNASKINDS.length > 0,
   'CNASKINDS 存在且非空（' + (d.CNASKINDS || []).length + ' 类）');
ck(!(d.REFGROUPS || []).some(g => /CNAS/.test(g.g)),
   'REFGROUPS 里已无 CNAS 组');
ck(d.SRCS.some(s => s.code === 'SRC-11'), 'SRCS 含 SRC-11');
const bad = (d.CNASDOCS || []).filter(x => !x.no || !x.title || !x.url || !x.kind);
ck(bad.length === 0, 'CNASDOCS 字段完整（no/title/url/kind）');

// ---- 3) 真实渲染 ----
console.log('\n=== 3. 真实渲染 renderCnas() ===');
const grabbed = {};
// 统一元素桩：getElementById / querySelector / $ 三条路都返回它
function stubEl(id) {
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
global.document = {
  getElementById(id) { return stubEl(id); },
  // ★ createElement 必须有 ★
  //   offLink() 只拼字符串不建元素，但 postJump() 会建 form/input。
  //   缺了会抛 "document.createElement is not a function"，
  //   渲染函数整体挂掉 →看起来像「一条都渲染不出来」。
  createElement(tag) {
    return {
      tag, style: {}, children: [], name: '', value: '', type: '',
      appendChild(c) { this.children.push(c); },
      submit() { global.__submitted = (global.__submitted || 0) + 1; },
      remove() {},
    };
  },
  // ★ querySelector / querySelectorAll 都要有 ★
  //   页面的 $ 辅助函数是 document.querySelector 的包装，
  //   $$ 走 querySelectorAll。缺任一个都会抛
  //   "document.querySelector is not a function"，看起来像渲染逻辑坏了。
  querySelector(sel) { return stubEl(String(sel).replace(/^#/, '')); },
  querySelectorAll: () => [],
  body: { appendChild() {} },
};
global.$$ = () => [];
// 页面的 $ 辅助函数（等价于 document.querySelector），渲染函数里到处在用
global.$ = (sel) => stubEl(String(sel).replace(/^#/, ''));

// 用共用提取器（页里有 <script src> 自闭合对，倒着找会把整页 DOCTYPE 圈进来）
// ★ 切点必须在 renderLaw 之前 ★
//   offLink / postJump / CFSA_SEARCH 定义在 @4300~@5400，
//   而 REFGROUPS 常量在 @3206 —— 切在 REFGROUPS 会把这些函数一起切掉，
//   报 "offLink is not defined"。renderLaw 在 @31368，才是正确的切点。
const { extractInlineScript, sliceBefore } = require('./extract_script.js');
let body = sliceBefore(extractInlineScript(html), 'function renderLaw(');

try {
  // 页面自己就声明了 const $ / $$，再用参数传同名变量会报
  // "Identifier '$' has already been declared" —— 只传window/document。
  new Function('window', 'document',
               body + '\nrenderCnas();')
    (global.window, global.document);
} catch (err) {
  console.log('  ✗ 渲染抛错: ' + err.message);
  fails.push('render 抛错 ' + err.message);
}

const list = grabbed.cnasList || '';
const tabs = grabbed.cnasTabs || '';
ck(list.length > 500, 'cnasList 渲染出内容（' + list.length + ' 字符）');
ck(tabs.indexOf('认可准则') >= 0, '子标签含「认可准则」');
ck(tabs.indexOf('技术报告') >= 0, '子标签含「技术报告」');
ck(list.indexOf('CNAS-CL01') >= 0, '列表含 CNAS-CL01');
ck((list.match(/官网查看/g) || []).length === d.CNASDOCS.length,
   '每条都有官网查看按钮（' + (list.match(/官网查看/g) || []).length + '）');
ck(grabbed.cnasBadge === String(d.CNASDOCS.length), '侧栏徽标数字正确');
ck(list.indexOf('undefined') < 0, '渲染结果无 undefined');
ck(list.indexOf('[object Object]') < 0, '渲染结果无 [object Object]');

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);