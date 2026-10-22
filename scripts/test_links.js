const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const fails = [];
function ck(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); }

// ---- 造一个够用的 DOM 环境 ----
const grabbed = {};
function mkEl(id) {
  return {
    set innerHTML(v) { grabbed[id] = v; },
    get innerHTML() { return grabbed[id] || ''; },
    set textContent(v) { grabbed[id] = String(v); },
    get textContent() { return grabbed[id] || ''; },
    set value(v) { grabbed[id + '.value'] = v; },
    get value() { return grabbed[id + '.value'] || ''; },
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
  };
}
let submitted = [];
function newForm() {
  return {
    method: '', action: '', target: '', style: {}, children: [],
    appendChild(c) { this.children.push(c); },
    submit() {
      const t = this.children.find(c => c.name === 'task');
      submitted.push({ action: this.action, task: t ? t.value : '',
                       target: this.target });
    },
    remove() {},
  };
}
global.document = {
  getElementById: (id) => mkEl(id),
  querySelector: (s) => mkEl(String(s).replace(/^#/, '')),
  querySelectorAll: () => [],
  createElement: (tag) => (tag === 'form' ? newForm() : mkEl(tag)),
  body: { appendChild() {} },
  // 页面在 onDOMContentLoaded 里注册事件；stub 必须提供，否则抛
  // "document.addEventListener is not a function"
  addEventListener() {},
};
global.$ = (s) => mkEl(String(s).replace(/^#/, ''));
global.$$ = () => [];
global.window = {};

const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
vm.runInNewContext(
  fs.readFileSync(path.join(ROOT, 'prototype', 'data.js'), 'utf8'),
  { window: global.window });
global.window.location = { hash: '' };

const { extractInlineScript } = require('./extract_script.js');
let body = extractInlineScript(html);
/* 切点必须落在**语句边界**，否则截出半个表达式会报
 * 「Unexpected token '==='」之类看不出真相的错。
 * 用最后一个顶层 `function` 声明的起点来切（正则 + 括号配平）。 */
function sliceAtLastFunction(src) {
  const marks = [];
  const re = /^function\s+\w+\s*\(/gm;
  let m;
  while ((m = re.exec(src))) marks.push(m.index);
  if (!marks.length) return src;
  // 从后往前找那个「切掉后面也不破坏语法」的位置：
  // 即该 function 之前最近的顶层语句起点。这里简单取最后一个 mark，
  // 再向前回退到空白/注释边界。
  for (let i = marks.length - 1; i >= 0; i--) {
    const head = src.slice(0, marks[i]);
    try { new Function('window', 'document', head); return head; }
    catch (e) { /* 继续往前 */ }
  }
  return src;
}
body = sliceAtLastFunction(body);

console.log('=== offLink 渲染行为（真实执行）===');
try {
  const fn = new Function('window', 'document', body + `
    return [
      offLink("官方", officialUrl("GB 5009.5-2025")),
      offLink("官方", "https://www.ttbz.org.cn/#/standardDetail/xyz"),
      offLink("官方", CFSA_SEARCH("GB 5413.20-2022")),
      offLink("官方", ""),
      CFSA_SEARCH("GB 4789.10-2016"),
    ].join("\\u0001");
  `);
  // postJump 要在同一段代码里调，才能观察到表单提交
  new Function('window', 'document',
    body + '\npostJump(officialUrl("GB 5009.5-2025"));')
    (global.window, global.document);

  const parts = fn(global.window, global.document).split('\u0001');
  const a = parts[0] || '', b = parts[1] || '', c = parts[2] || '',
        d = parts[3] || '';
  console.log('  cfsa 详情: ' + a.slice(0, 88));
  console.log('  ttbz     : ' + b.slice(0, 88));
  console.log('  cfsa 检索: ' + c.slice(0, 88));
  console.log('  空 url   : "' + d + '"');

  ck(a.indexOf('postJump') >= 0, 'cfsa 详情 → 走 postJump()');
  ck(a.indexOf('guid=') >= 0, 'postJump 的 url 带 guid');
  ck(b.indexOf('href="https://www.ttbz.org.cn') >= 0,
     '非 cfsa 站点 → 保持普通 href（GET 正常）');
  ck(b.indexOf('postJump') < 0, '非 cfsa 不用 POST');
  ck(c.indexOf('postJump') >= 0, 'cfsa 检索 → 也走 POST');
  ck(c.indexOf('keyword=') >= 0, 'cfsa 检索带 keyword');
  ck(d === '', '空 url → 返回空串（不渲染坏按钮）');

  ck(submitted.length === 1, 'postJump 真的提交了表单（' + submitted.length + '）');
  if (submitted.length) {
    const s = submitted[0];
    console.log('\n  实际提交: ' + s.action.slice(0, 76));
    console.log('  task=' + s.task + '  target=' + s.target);
    ck(s.action.indexOf('type=2&guid=') >= 0, 'action 含 type=2&guid=');
    ck(s.task === 'goto', 'task=goto（官方要求，缺了会被丢回首页）');
    ck(s.target === '_blank', 'target=_blank（新标签打开）');
  }
  console.log('\n  兜底示例: ' + (parts[4] || '').slice(0, 82));
} catch (err) {
  ck(false, '执行抛错: ' + err.message);
}

console.log('\n=== 各视图真实渲染（抓 href 检查）===');
const views = [
  ['通则引用', '\nrenderRefs();', 'refBox'],
  ['标准清单', '\ncurCat="all";renderList();', 'listBody'],
  ['方法原理', '\nrenderMethod();', 'methodList'],
  ['CNAS', '\nrenderCnas();', 'cnasList'],
];
for (const [label, code, box] of views) {
  try {
    new Function('window', 'document', body + code)(global.window, global.document);
    const s = grabbed[box] || '';
    if (!s) { console.log('  (' + label + ') 未抓到内容，跳过'); continue; }
    const hrefs = [...s.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    const cfsaHref = hrefs.filter(h => /sppt\.cfsa\.net\.cn/.test(h));
    const postJump = (s.match(/postJump\(/g) || []).length;
    ck(cfsaHref.length === 0,
       label + '：无 cfsa 裸 href（外链 ' + hrefs.length + ' · postJump ' + postJump + '）');
  } catch (err) {
    console.log('  (' + label + ') 渲染抛错: ' + err.message);
  }
}

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);