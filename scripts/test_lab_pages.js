const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractInlineScript, sliceBefore } = require('./extract_script.js');
const ROOT = path.resolve(__dirname, '..');

const fails = [];
function ck(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); }

const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');

console.log('=== 1. 导航：删两页、JSA 第一 ===');
const nav = html.slice(html.indexOf('<nav class="nav">'), html.indexOf('</nav>'));
ck(!/cards\.html/.test(nav) && !/card-editor/.test(nav), '导航里已无检验方法卡片/录入经验');
ck(/data-v="jsa"/.test(nav), '导航含 JSA');
ck(/data-v="method"/.test(nav), '导航含检测方法原理');
ck(nav.indexOf('data-v="jsa"') < nav.indexOf('data-v="method"'),
   '★ JSA 排在检测方法原理之前');
// 实验室组归属
const lab = nav.indexOf('>实验室<');
const jsa = nav.indexOf('data-v="jsa"');
const rem = nav.indexOf('>提醒<');
ck(lab > 0 && jsa > lab && (rem < 0 || jsa < rem), 'JSA 在「实验室」组内');

console.log('\n=== 2. 文件已删 ===');
ck(!fs.existsSync(path.join(ROOT, 'prototype', 'cards.html')), 'cards.html 已删除');
ck(!fs.existsSync(path.join(ROOT, 'prototype', 'card-editor.html')),
   'card-editor.html 已删除');
ck(html.indexOf('cards.html') < 0, 'index.html 无 cards.html 引用');
ck(html.indexOf('card-editor') < 0, 'index.html 无 card-editor 引用');

console.log('\n=== 3. 品牌名===');
ck(/食品质量与安全管理系统/.test(html), '含「食品质量与安全管理系统」');
ck(!/标准雷达/.test(html.slice(html.indexOf('<title>'), html.indexOf('</title>'))),
   'title 不再是「标准雷达」');
ck(/class="topbrand"/.test(html), '有居中品牌头容器');
ck(/jsa/.test(html.match(/const OK=\[[^\]]*\]/)[0]), 'route 白名单含 jsa');
ck(/if\(v==="jsa"\) renderJsa\(\);/.test(html), 'route 调用 renderJsa');
ck(/jsa:"工作安全分析 JSA"/.test(html), 'TITLES 含 jsa');

console.log('\n=== 4. JSA 数据 ===');
global.window = {};
vm.runInNewContext(
  fs.readFileSync(path.join(ROOT, 'prototype', 'data.js'), 'utf8'),
  { window: global.window });
const J = global.window.STDWATCH_DATA.JSA;
const J0 = Array.isArray(J) ? J[0] : J;
ck(!!J0, 'data.js 含 JSA');
if (J0) {
  const J = J0;
  ck(J.zones.length === 5, '5 个分区（实际 ' + J.zones.length + '）');
  const steps = J.zones.reduce((a, z) => a + z.steps.length, 0);
  ck(steps === 22, '22 个作业步骤（实际 ' + steps + '）');
  ck(J.guide.redlines.length === 6, '6 条红线（实际 ' + J.guide.redlines.length + '）');
  ck(J.wha.sample.length === 7, '危害分析示例 7 行');
  ck(J.zones.every(z => z.steps.every(s => s.step && s.hazard && s.control)),
     '每个步骤都有作业步骤/危害/控制措施');
  ck(J.guide.matrix.length === 5, '风险矩阵 5 行（L=1..5）');
  ck((J.guide.levels['可能性 L'] || []).length === 5, '可能性 L 五档');
  ck((J.guide.levels['严重度 S'] || []).length === 5, '严重度 S 五档');
  ck((J.guide.grades || []).length === 4, '风险等级四档');
  ck(J.signoff.roles.length === 4, '审批角色 4 个');
  // ★ 拆分质量 ★
  //   踩过：值里带半角逗号（4=严重(重伤/中毒)）被 split("/") 切坏 →
  //   严重度 S 变成 7 项；正则前瞻又切出 10 片 grades 碎片。
  const S = J.guide.levels['严重度 S'] || [];
  ck(S.length === 5, '严重度 S 恰好 5 档');
  ck(S[3] === '4=严重(重伤/中毒)', '第 4 档完整未碎：' + S[3]);
  ck(S[4] === '5=特别严重(死亡/群伤)', '第 5 档完整未碎：' + S[4]);
  ck((J.guide.grades || []).every(x => /风险\s*R=/.test(x)),
     '风险等级每项完整');
  console.log('    分区: ' + J.zones.map(z => z.icon + z.title.split('（')[0]).join(' / '));
}

console.log('\n=== 5. 合规：签字与日期不代填 ===');
// 审批区只能出现空白下划线，不能出现任何具体日期或人名
const sg = J0 ? J0.signoff : { roles: [] };
ck(sg.roles.every(r => !/\d{4}\s*年\s*\d+\s*月\s*\d+\s*日/.test(r.line)),
   '审批签字行只有空白下划线，无预填日期');
ck(sg.roles.every(r => /_{4,}/.test(r.line)), '每行都有签字/日期下划线');
// 页面文案里也不能替人填日期
// ★ 只截 jsaSignoff 函数体 ★
//   三个坑都踩过：
//   ① 用「下一个同名 function」切 → jsaSignoff 是最后一个函数 → 切到文件尾
//   ② 截固定 2600 字符 → 同样会吃到后面的注释
//   ③ 用「下一个 \nfunction 」切 → jsaSignoff 后面紧跟的是 `const SUBS`，
//      不是 function，一样切不出去。
//   → 改成「下一个顶层声明」：function / const / let / var 都算。
const sgStart = html.indexOf('function jsaSignoff');
const rest = html.slice(sgStart + 10);
const mNext = rest.search(/\n(function |const |let |var )/);
const signoffHtml = html.slice(sgStart, mNext > 0 ? sgStart + 10 + mNext : sgStart + 2000);
ck(!/\d{4}-\d{2}-\d{2}/.test(signoffHtml), '审批区函数体内不含具体日期');
ck(/sign-line/.test(signoffHtml), '审批行用了签字行样式');
// 下划线来自数据（signoff.roles[].line），不在函数体里
ck(sg.roles.every(r => /_{4,}/.test(r.line)), '数据里的签字行都是空白下划线');
ck(/签字必须手签|页面不代填|不代你签字/.test(html), '页面明示「不代填签字」');

console.log('\n=== 6. 视觉类名已就位 ===');
['.mcard', '.mgroup', '.jsa-tbl', '.matrix', '.rk', '.sign-line', '.topbrand']
  .forEach(c => ck(html.indexOf(c) >= 0, 'CSS 含 ' + c));
ck(html.indexOf('class="mcard"') >= 0 || /class="mcard"/.test(html),
   '方法卡用新类名 mcard');

console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
process.exit(fails.length ? 1 : 0);