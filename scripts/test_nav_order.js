const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');

const nav = html.slice(html.indexOf('<nav class="nav">'),
                       html.indexOf('</nav>'));

// 按出现顺序抽出「分组标签 → 归属项」
const rows = [];
let cur = '(顶部)';
const re = /<div class="nav-label">([^<]+)<\/div>|(<a\s+href="([^"]+)"[^>]*>(?:<span class="ic">[^<]*<\/span>)?([^<]*))/g;
let m;
while ((m = re.exec(nav))) {
  if (m[1]) cur = m[1].trim();
  else rows.push({ group: cur, href: m[3], text: (m[4] || '').trim() });
}

console.log('左侧导航当前顺序：\n');
let last = null;
rows.forEach(r => {
  if (r.group !== last) { console.log('  【' + r.group + '】'); last = r.group; }
  console.log('      ' + r.text + '   (' + r.href + ')');
});

console.log('\n分组顺序：' + rows.map(r => r.group).filter((v, i, a) => a.indexOf(v) === i).join(' → '));

// ---- 断言 ----
const fails = [];
function ck(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); }

console.log('\n=== 校验 ===');
const groups = rows.map(r => r.group).filter((v, i, a) => a.indexOf(v) === i);
const gi = {};
groups.forEach((g, i) => { gi[g] = i; });
ck('实验室' in gi, '存在「实验室」分组');
ck('提醒' in gi, '存在「提醒」分组');
if ('实验室' in gi && '提醒' in gi) {
  ck(gi['实验室'] < gi['提醒'], '「实验室」排在「提醒」之前（用户要求）');
}

// 完整性：不能因为移动而丢项
// ★ 2026-10-22 用户要求：删掉「检验方法卡片」与「录入经验」，
//   实验室组只剩「工作安全分析 (JSA)」与「检测方法原理」。
const hrefs = rows.map(r => r.href);
[['#home', '今日待办'], ['#refs', '通则引用标准'], ['#list', '标准清单'],
 ['#law', '法规与体系'], ['#cnas', '认可规范（CNAS）'], ['#subs', '我的订阅'],
 ['#alerts', '提醒中心'], ['#jsa', '工作安全分析 (JSA)'],
 ['#method', '检测方法原理'], ['#admin', '管理后台']].forEach(([h, label]) => {
  ck(hrefs.includes(h), '入口仍在：' + label);
});
// 已下线的两个入口必须真的不在了
ck(!hrefs.includes('cards.html'), '「检验方法卡片」已下线');
ck(!hrefs.includes('card-editor.html'), '「录入经验」已下线');

// 归属：JSA 与方法原理都在「实验室」组，且 JSA 排第一
const inLab = rows.filter(r => r.group === '实验室').map(r => r.href);
ck(inLab.includes('#jsa') && inLab.includes('#method'),
   'JSA 与检测方法原理都在「实验室」组');
ck(inLab[0] === '#jsa', '★ JSA 排在实验室组第一位（实际 ' + inLab[0] + '）');
ck(rows.find(r => r.href === '#alerts').group === '提醒', '提醒中心归属「提醒」组');

// ★ 2026-10-22 用户截图：长导航名折行，把徽标挤成竖条 ★
//   → 文字必须包在 .tx 里（单行+省略号），徽标 flex:0 0 auto 永不压缩。
const navHtml = nav;
ck((navHtml.match(/class="tx"/g) || []).length ===
   (navHtml.match(/class="ic"/g) || []).length,
   '每个导航项的文字都包在 .tx 里（' +
   (navHtml.match(/class="tx"/g) || []).length + ' 个）');
ck(/\.nav a \.tx\{[^}]*white-space:nowrap/.test(html),
   '.tx 单行不折行');
ck(/\.badge\{[^}]*flex:0 0 auto/.test(html), '徽标不压缩');
// 徽标内容只能是数字/短文本，不能是「5 区」这种会撑宽的
ck(!/Badge[^;]*zones\.length \+ "/.test(html), 'JSA 徽标只放数字');
// ★ 2026-10-22 用户截图：侧栏太窄，长名被 ellipsis 截断 ★
//   「认可规范（CNAS）」「工作安全分析 (JSA)」显示成「认可规范（CN…」
//   → 侧栏宽度要够放下最长的一条。
const sideW = (html.match(/\.side\{[^}]*width:(\d+)px/) || [])[1];
ck(!!sideW, '侧栏有固定宽度');
if (sideW) {
  ck(parseInt(sideW, 10) >= 240,
     '侧栏宽度 ≥240px（实际 ' + sideW + '）—— 否则长名会被截断');
}
ck(!/text-overflow:ellipsis/.test(html) ||
   /\.nav a \.tx\{[^}]*overflow:hidden/.test(html),
   '.tx 溢出处理有对应样式（截断时至少给省略号）');
// ★ 今日待办：括号内容放下面一行 ★
ck(/今日待办<span class="sub">（标准更新提醒）<\/span>/.test(navHtml),
   '今日待办的副标题在下一行');
ck(/\.nav a \.tx \.sub\{[^}]*display:block/.test(html), '.sub 是块级（换行显示）');
// ★ 品牌副标题已删 ★
ck(!/婴配标准变更提醒/.test(html.slice(html.indexOf('<div class="brand">'),
                                         html.indexOf('</nav>'))),
   '侧栏品牌区已删副标题');
ck(!/婴配标准变更提醒 · 实验室安全 · 方法原理/.test(html),
   '居中品牌头已删副标题');

// 分组标签不重复
const labelCount = (nav.match(/nav-label/g) || []).length;
ck(labelCount === groups.length, '分组标签无重复（' + labelCount + ' 个）');

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);