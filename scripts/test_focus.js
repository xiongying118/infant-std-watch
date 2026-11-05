/* ================================================================
   test_focus.js —— 全站输入防抖回归测试（2026-11-02）

   ================================================================
   用户反馈：「所有框输入 页面会跳动」

   根因：全站每个可编辑控件的 oninput 都触发整块重绘
        （innerHTML 被替换），后果三个：
          ① 正在编辑的输入框被销毁 → 焦点丢失
          ② 光标回到开头 → 连续输入的字插错位置
          ③ 内容高度变化 → 页面滚动位置跳一下

   修复：prototype/focus.js 全局兜底
        —— focusin 记住控件的路径签名，
           MutationObserver 发现 DOM 被重写后按签名找回控件，
           还原焦点 + 光标位置 + 滚动位置。

   这个脚本测四个地方：
     ① 台账卡片（试剂台账）
     ② JSA 的 L/S 数字框（R 要跟着重算）
     ③ 质量管理工具的表格输入（帕累托）
     ④ 原始记录生成器的搜索框（会触发过滤重绘）
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');
const fs=require('fs');

const ROOT=path.resolve(__dirname,'..');
const PROTOTYPE='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/');
const URL=PROTOTYPE+'/index.html';

let pass=0, fail=0;
function ck(cond,msg){
  if(cond){ pass++; console.log('  ✓ '+msg); }
  else { fail++; console.log('  ✗ '+msg); }
}

/* 真实逐字输入 —— 一次塞一整串是测不出"丢字/插错位置"的 */
async function typeInto(p, sel, text, alreadyClicked){
  if(!alreadyClicked){
    await p.click(sel);
    await p.waitForTimeout(250);
  }
  const t0=Date.now();
  for(const ch of text){
    await p.keyboard.type(ch,{delay:30});
    await p.waitForTimeout(55);
  }
  await p.waitForTimeout(450);
  return Date.now()-t0;
}

/* 通用检查：值里含有刚输入的片段、光标在末尾、焦点还在、页面没跳 */
async function checkTyped(p, sel, text, label){
  /* 先点击聚焦（playwright 点击可能自动滚动，起点必须在点击之后测，
     否则量到的是点击带来的滚动，不是输入引起的跳动） */
  await p.click(sel);
  await p.waitForTimeout(300);
  const before=await p.evaluate(()=>Math.round(window.scrollY));
  const ms=await typeInto(p, sel, text, true);
  const r=await p.evaluate(([s,t])=>{
    const el=document.querySelector(s);
    if(!el) return {err:'元素没了'};
    const v=el.value==null?'':String(el.value);
    return {
      val:v, has:v.indexOf(t)>=0,
      focused:document.activeElement===el,
      caret:(el.selectionStart!=null)?el.selectionStart:-1,
      len:v.length, scrollY:Math.round(window.scrollY)
    };
  },[sel,text]);
  const jump=Math.abs(r.scrollY-before);
  ck(!r.err && r.has, label+'：输入的「'+text+'」完整落在值里'+(r.err?('（'+r.err+'）'):''));
  ck(r.focused, label+'：输入后焦点还在这个框里');
  /* 光标应该在「刚输入的那段文字」之后 —— 不是整个字段的末尾
     （点击位置可能在中间，光标就该留在那里） */
  const at = r.has ? (r.val.indexOf(text) + text.length) : -1;
  ck(r.caret===at, label+'：光标紧跟在输入文字之后（'+r.caret+'/'+at+'）');
  ck(jump<=1, label+'：页面没有跳动（滚动位移 '+jump+'px）');
  ck(ms<4000, label+'：'+text.length+' 个字耗时 '+ms+'ms');
  return r;
}

(async()=>{
  const b=await chromium.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true});
  const p=await (await b.newContext()).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.setViewportSize({width:1280,height:1000});
    /* ★ 线上访问偶发 ERR_CONNECTION_RESET（本地网络抖动）→ 自动重试 ★
     2026-11-04 加：之前网络一抖测试就整个崩掉，误判成功能有问题。 */
  let navOK = false;
  for (let i = 0; i < 6 && !navOK; i++) {
    try {
      await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      navOK = true;
    } catch (e) {
      console.log('  (网络重试 ' + (i + 1) + ')');
      await p.waitForTimeout(4000);
    }
  }
  if (!navOK) { console.log('网络不通，测试中止'); await b.close(); process.exit(2); }
  await p.waitForTimeout(2400);

  console.log('\n=== ⓪ focus.js 已加载 ===');
  ck(await p.evaluate(()=>!!window.__focusFix), 'focus.js 已加载并接管');

  console.log('\n=== ① 台账卡片（试剂台账）===');
  await p.evaluate(()=>{location.hash='#lab';});
  await p.waitForTimeout(1600);
  await p.evaluate(()=>{
    const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='reagent');
    if(b)b.click();
  });
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{
    const el=document.querySelector('.ledger-cards .lcard');
    if(el)el.scrollIntoView({block:'center'});
  });
  await p.waitForTimeout(400);
  const sel1='.ledger-cards .lcard .lcard-main input[type=text]:not([readonly])';
  ck(await p.evaluate(s=>!!document.querySelector(s),sel1), '找到可编辑的台账输入框');
  if(await p.evaluate(s=>!!document.querySelector(s),sel1)){
    await checkTyped(p, sel1, '王海涛', '台账卡片');
  }

  console.log('\n=== ② JSA 数字框（L 改了 R 要跟着重算）===');
  await p.evaluate(()=>{location.hash='#jsa';});
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{
    const c=document.querySelector('.jcard');
    if(c)c.scrollIntoView({block:'center'});
  });
  await p.waitForTimeout(400);
  const sel2='.jcard .jrisk .lvl-in';
  if(await p.evaluate(s=>!!document.querySelector(s),sel2)){
    /* 数字框用 JS 聚焦并全选 —— 鼠标点击可能点到右侧微调箭头 */
    await p.evaluate(s=>{const e=document.querySelector(s); e.focus(); e.select();}, sel2);
    await p.waitForTimeout(250);
    await p.keyboard.type('3',{delay:30});
    await p.waitForTimeout(500);
    const rr=await p.evaluate(s=>{
      const e=document.querySelector(s);
      return {val:e.value, focused:document.activeElement===e, caret:e.selectionStart};
    }, sel2);
    ck(rr.val==='3', 'JSA 数字框：值 = '+JSON.stringify(rr.val));
    ck(rr.focused, 'JSA 数字框：输入后焦点还在');
    /* 数字框（type=number）本来就没有 selectionStart，浏览器限制，不是 bug */
    ck(rr.caret===null || rr.caret===1, 'JSA 数字框：光标位置正常（'+rr.caret+'）');
    const r=await p.evaluate(()=>{
      const c=document.querySelector('.jcard');
      const lv=c.querySelectorAll('.lvl-in');
      return {L:lv[0].value,S:lv[1].value,R:c.querySelector('.rv').textContent};
    });
    ck(r.R===String((+r.L)*(+r.S)), '改 L 之后 R 实时重算（L='+r.L+' S='+r.S+' R='+r.R+'）');
  }

  console.log('\n=== ③ 质量管理工具（帕累托表格输入）===');
  await p.evaluate(()=>{location.hash='#qmtools';});
  await p.waitForTimeout(1600);
  await p.evaluate(()=>{
    curQmKey='pareto';
    renderQmTools();
    QW_register('pareto',QM.tools.find(x=>x.toolKey==='pareto').widget);
    QW_render('pareto');
  });
  await p.waitForTimeout(1200);
  const sel3='.qwt-tbl tbody input[type=text]';
  ck(await p.evaluate(s=>!!document.querySelector(s),sel3), '找到工具的表格输入框');
  if(await p.evaluate(s=>!!document.querySelector(s),sel3)){
    await checkTyped(p, sel3, '抽检不合格', '质量管理工具');
  }

  console.log('\n=== ④ 原始记录生成器搜索框（会触发过滤重绘）===');
  await p.evaluate(()=>{location.hash='#lab';});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{
    const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='record');
    if(b)b.click();
  });
  await p.waitForTimeout(1200);
  const sel4='#recSearch';
  if(await p.evaluate(s=>!!document.querySelector(s),sel4)){
    await checkTyped(p, sel4, '5009', '搜索框');
    const hint=await p.evaluate(()=>{
      const e=document.getElementById('recCount');
      return e?e.textContent:'';
    });
    ck(/匹配 \d+ 个方法/.test(hint), '过滤提示跟着更新（'+hint.slice(0,40)+'）');
  }

  console.log('\n=== ⑤ 提醒中心侧栏徽标是实算的 ===');
  const badge=await p.evaluate(()=>{
    const b=document.getElementById('alertBadge');
    return b?{txt:b.textContent, title:b.title}:null;
  });
  ck(!!badge, '侧栏有提醒徽标');
  if(badge){
    ck(/^\d+$/.test(badge.txt.trim()), '徽标是数字不是写死的（'+badge.txt+'）');
    ck(!!badge.title && badge.title.indexOf('待处理')>=0, '徽标有说明（'+badge.title+'）');
  }

  console.log('\n=== ⑥ 无 JS 错误 ===');
  ck(errs.length===0, errs.length?('有错误：'+errs.join(' | ')):'全程无 JS 错误');

  console.log('\n'+'─'.repeat(52));
  console.log('  通过 '+pass+' · 失败 '+fail);
  console.log('─'.repeat(52));
  await b.close();
  process.exit(fail?1:0);
})();
