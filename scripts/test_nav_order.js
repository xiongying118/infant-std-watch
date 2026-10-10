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
const hrefs = rows.map(r => r.href);
[['#home', '今日待办'], ['#refs', '通则引用标准'], ['#list', '标准清单'],
 ['#law', '法规与体系'], ['#cnas', '认可规范（CNAS）'], ['#subs', '我的订阅'],
 ['#alerts', '提醒中心'], ['cards.html', '检验方法卡片'],
 ['card-editor.html', '录入经验'], ['#admin', '管理后台']].forEach(([h, label]) => {
  ck(hrefs.includes(h), '入口仍在：' + label);
});

// 归属正确：卡片两项必须还在「实验室」组，alerts 在「提醒」组
const inLab = rows.filter(r => r.group === '实验室').map(r => r.href);
ck(inLab.includes('cards.html') && inLab.includes('card-editor.html'),
   '两张卡片仍归属「实验室」组');
ck(rows.find(r => r.href === '#alerts').group === '提醒', '提醒中心归属「提醒」组');

// 分组标签不重复
const labelCount = (nav.match(/nav-label/g) || []).length;
ck(labelCount === groups.length, '分组标签无重复（' + labelCount + ' 个）');

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);