/**
 * 用**真实浏览器**验证「官方查询」链接。
 *
 * ★ 为什么必须有这个脚本 ★
 * 2026-10-21 用户三次报「链接到食品安全国家标准数据检索平台都是错的」，
 * 我前两次都只验数据（URL 是不是 200、页面里有没有标准号），
 * 全绿，浏览器里照样错。
 *
 * 根因：sppt.cfsa.net.cn 对任何 GET 都返回 597 字符的空壳，
 * 空壳里的 form 是 action=/db、task=index ——
 * URL 上带的 guid 会被整个丢掉，浏览器自动提交后回到首页。
 * → 「URL 返回 200」和「页面含该标准号」**都证明不了浏览器里能打开**。
 *
 * 这个脚本做浏览器真正做的事：点按钮，等新标签页落地，读出真实 URL 与内容。
 */
const { chromium } = require('playwright-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8901';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext();
  const fails = [];
  const ck = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails.push(m); };

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [页面 JS 错误] ' + e.message));

  console.log('=== A. 页面脚本能否正常执行 ===');
  await page.goto(BASE + '/index.html#refs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const refCount = await page.evaluate(() =>
    document.querySelectorAll('#refBox a').length).catch(() => -1);
  console.log('  通则引用页外链数 =', refCount);
  ck(refCount > 0, '页面脚本正常执行（能渲染出外链）');
  ck(await page.title() !== '' , '页面标题非空');

  console.log('\n=== B. 逐个点击，看真实落地页 ===');
  // ★ 只有 cfsa 需要严格判据 ★
  //   其它站点（CNAS / 法规库）本来就不是 GB 标准详情页，
  //   对它们要求「页面含标准号」是判据套错 —— 实测 CNAS 页面正常打开、
  //   只是内容是认可规则正文而非标准条。
  //   cfsa 的特殊性是「返回 200 但只有空壳」，所以只对它严查。
  const cases = [
    ['通则引用', '#refs', '#refBox a', true],
    ['标准清单', '#list', '#listBody a', true],
    ['CNAS', '#cnas', '#cnasList a', false],
    ['法规与体系', '#law', '#lawList a', false],
  ];
  for (const [label, hash, sel, isCfsa] of cases) {
    const idx = 0;
    await page.goto(BASE + '/index.html' + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const info = await page.evaluate(([s, i]) => {
      const as = [...document.querySelectorAll(s)];
      const a = as.filter(x => x.offsetParent !== null)[i] || as[i];
      if (!a) return null;
      return { text: (a.textContent || '').trim(), href: a.getAttribute('href'),
               onclick: a.getAttribute('onclick') || '' };
    }, [sel, idx]);
    if (!info) { console.log('  (' + label + ') 没有可点链接'); continue; }
    console.log('\n  [' + label + '] 按钮文字=' + info.text);
    console.log('    href=' + (info.href || '(无，用 onclick)'));

    const target = ctx.waitForEvent('page', { timeout: 25000 }).catch(() => null);
    await page.evaluate(([s, i]) => {
      const as = [...document.querySelectorAll(s)];
      const a = as.filter(x => x.offsetParent !== null)[i] || as[i];
      a && a.click();
    }, [sel, idx]);
    const np = await target;
    if (!np) { ck(false, label + '：点击后没有新标签页'); continue; }
    await np.waitForLoadState('domcontentloaded').catch(() => {});
    await np.waitForTimeout(2500);
    const url = np.url();
    let txt = '';
    try { txt = await np.evaluate(() => document.body.innerText); }
    catch (e) { txt = '(读取失败)'; }
    const flat = txt.replace(/\s+/g, '');
    console.log('    落地 URL = ' + url.slice(0, 110));
    console.log('    正文 ' + txt.length + ' 字符');
    // ★ 判据不能用「字符数」 ★
    //   cfsa 的**详情页正文只有 591 字符**（内容全在表格里，很紧凑），
    //   而**空壳页是 597 字符**且正文只有一行标题 —— 两者长度几乎一样，
    //   按长度判会把正确的详情页误判成空壳。
    //   真正的判据是**内容特征**。
    const isShell = /^\s*食品安全国家标准数据检索平台\s*$/.test(txt);
    ck(!isShell, label + '：不是空壳页');
    if (isCfsa) {
      // cfsa 详情页正文只有 591 字符，但内容特征齐全
      ck(/GB\s?\d{4,5}\.\d+-\d{4}|JJ[FG]/.test(flat), label + '：含标准号');
      ck(/实施日期|发布日期/.test(flat), label + '：有发布/实施日期');
      ck(/下载|预览/.test(flat), label + '：有下载或预览');
    } else {
      // 其它站点：只要正常响应且不是错误页即可
      ck(txt.length > 80, label + '：正常返回内容（' + txt.length + ' 字符）');
      ck(!/404|找不到|Not Found|页面不存在/i.test(txt),
         label + '：不是错误页');
    }
    await np.close().catch(() => {});
  }

  console.log('\n=== C. 用真实 POST 验证 cfsa 详情页 ===');
  const guid = 'C25BD1F3-AC52-4788-8D31-71E9EE800241';
  const p2 = await ctx.newPage();
  // 直接在页面上构造 POST 表单跳过去 —— 和postJump 做的事一样
  await p2.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p2.evaluate((g) => {
    const f = document.createElement('form');
    f.method = 'POST';
    f.action = 'https://sppt.cfsa.net.cn:8086/db?type=2&guid=' + g;
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = 'task'; i.value = 'goto';
    f.appendChild(i);
    document.body.appendChild(f);
    f.submit();
  }, guid);
  await p2.waitForLoadState('domcontentloaded').catch(() => {});
  await p2.waitForTimeout(3500);
  const t2 = await p2.evaluate(() => document.body.innerText);
  const f2 = t2.replace(/\s+/g, '');
  console.log('  POST 落地：' + p2.url().slice(0, 90));
  console.log('  正文 ' + t2.length + ' 字符');
  ck(/GB\s?5009\.5-2025/.test(f2), 'POST 到达 GB 5009.5-2025 详情页');
  ck(/食品中蛋白质的测定/.test(f2), '详情页含标准名');
  ck(/实施日期/.test(f2), '页面含实施日期');
  ck(/下载/.test(f2), '页面含 PDF 下载');

  // 对照：GET 同一个 URL 会怎样（这就是用户看到的现象）
  const p3 = await ctx.newPage();
  await p3.goto('https://sppt.cfsa.net.cn:8086/db?type=2&guid=' + guid,
                { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p3.waitForTimeout(4000);
  const t3 = await p3.evaluate(() => document.body.innerText);
  console.log('\n  GET 同一 URL：最终落地 ' + p3.url().slice(0, 90));
  console.log('  正文 ' + t3.length + ' 字符');
  console.log('  → 这就是用户看到的现象：GET 带 guid 也会被丢回首页');
  ck(!/GB\s?5009\.5-2025/.test(t3.replace(/\s+/g, '')),
     '对照：GET 确实到不了详情页（证明必须用 POST）');

  await browser.close();
  console.log('\n' + (fails.length ? '✗ 失败 ' + fails.length + ' 项' : '✓ 全部通过'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });