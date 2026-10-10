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
global.document = {
  getElementById(id) {
    return {
      set innerHTML(v) { grabbed[id] = v; },
      get innerHTML() { return grabbed[id] || ''; },
      set textContent(v) { grabbed[id] = String(v); },
      get textContent() { return grabbed[id] || ''; },
    };
  },
};
global.$$ = () => [];
// 页面的 $ 辅助函数（等价于 document.querySelector），渲染函数里到处在用
global.$ = (sel) => {
  const id = String(sel).replace(/^#/, '');
  return {
    set innerHTML(v) { grabbed[id] = v; },
    get innerHTML() { return grabbed[id] || ''; },
    set textContent(v) { grabbed[id] = String(v); },
    get textContent() { return grabbed[id] || ''; },
    style: {},
  };
};

let src = html;
const e = src.lastIndexOf('</script>');
let body = src.slice(src.lastIndexOf('<script>', e) + 8, e);
// 只取到renderCnas 定义结束，避免执行整页其它依赖 DOM 的代码
const cut = body.indexOf('const REFGROUPS =');
body = body.slice(0, cut > 0 ? cut : body.length);

try {
  new Function('window', 'document', '$', '$$',
               body + '\nrenderCnas();')
    (global.window, global.document, global.$, global.$$);
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