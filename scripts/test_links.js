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

console.log('=== offLink 渲染行为（当前设计：普通 <a> + rel="noopener noreferrer"）===');
/* ★ 2026-11-08 更新 ★
   页面 11-05 已删掉 postJump（POST 表单被浏览器拦成 404），改成普通 GET <a>。
   防盗链靠 rel="noopener noreferrer" 清掉 Referer —— 这才是现在要守的铁律。
   旧断言「必须走 postJump」「不能有 cfsa 裸 href」与现状相反，已废弃。 */
try {
  const fn = new Function('window', 'document', body + `
    return [
      offLink("官方", officialUrl("GB 5009.5-2025")),
      offLink("官方", "https://www.ttbz.org.cn/#/standardDetail/xyz"),
      offLink("官方", CFSA_SEARCH("GB 5413.20-2022")),
      offLink("官方", ""),
      offLink("官方", "https://sppt.cfsa.net.cn:8086/db?type=2&guid=ABC-123"),
    ].join("\\u0001");
  `);
  const parts = fn(global.window, global.document).split('\u0001');
  const a = parts[0] || '', b = parts[1] || '', c = parts[2] || '',
        d = parts[3] || '', e = parts[4] || '';
  const links = [a, b, c, e].filter(Boolean);
  console.log('  cfsa 详情: ' + a.slice(0, 100));
  console.log('  ttbz     : ' + b.slice(0, 100));
  console.log('  cfsa 检索: ' + c.slice(0, 100));
  console.log('  空 url   : "' + d + '"');
  ck(links.length === 4, '四种 URL 都渲染出链接');
  ck(links.every(x => /rel="noopener noreferrer"/.test(x)),
     '★ 所有外链都带 rel="noopener noreferrer"（cfsa 防盗链）');
  ck(links.every(x => /target="_blank"/.test(x)), '所有外链在新标签打开');
  ck(a.indexOf('href="https://') >= 0, 'cfsa 详情 → 普通 href，不再走 postJump 表单');
  ck(b.indexOf('href="https://www.ttbz.org.cn') >= 0, '非 cfsa 站点 → 保持原 href');
  ck(c.indexOf('keyword=') >= 0, 'cfsa 检索链接带 keyword');
  ck(d === '', '空 url → 返回空串（不渲染坏按钮）');
  ck(e.indexOf('type=2&guid=') < 0 && e.indexOf('href="https://') >= 0,
     'GET 必 404 的 POST 形态详情链接 → 换成能打开的官方检索页');
  ck(body.indexOf('function postJump') < 0,
     '页面已不再定义 postJump（别把旧行为写回来）');
} catch (err) {
  ck(false, '执行抛错: ' + err.message);
}

console.log('\n=== 各视图真实渲染（抓 href + rel 检查）===');
/* ★ 2026-11-08：标准清单页 curSub 初始化修好后才真正渲染出外链，
   之前「无 cfsa 裸 href」是空白页带来的假绿。现在按当前设计检查：
   cfsa 链接必须带 noreferrer，且不能出现 GET 必 404 的 type=2&guid= 裸链。 */
const views = [
  ['通则引用', '\nrenderRefs();', 'refBox'],
  ['标准清单', '\ncurCat="all";curSub="all";renderList();', 'listBody'],
  ['方法原理', '\nrenderMethod();', 'methodList'],
  ['CNAS', '\nrenderCnas();', 'cnasList'],
];
for (const [label, code, box] of views) {
  try {
    new Function('window', 'document', body + code)(global.window, global.document);
    const s = grabbed[box] || '';
    if (!s) { console.log('  (' + label + ') 未抓到内容，跳过'); continue; }
    const tags = [...s.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g)].map(m => m[0]);
    const cfsa = tags.filter(t => /sppt\.cfsa\.net\.cn/.test(t));
    const badRel = cfsa.filter(t => !/rel="[^"]*noreferrer/.test(t));
    const badGet = cfsa.filter(t => /[?&]type=2&/.test(t) && /[?&]guid=/.test(t));
    ck(badRel.length === 0,
       label + '：cfsa 外链 ' + cfsa.length + ' 个全部带 noreferrer（缺 ' + badRel.length + '）');
    ck(badGet.length === 0,
       label + '：无 GET 必 404 的裸详情链接（' + badGet.length + '）');
  } catch (err) {
    ck(false, '(' + label + ') 渲染抛错: ' + err.message);
  }
}

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);