/* ================================================================
   test_delete_guard.js —— 删除权限与二次确认验证（2026-11-03）
   ================================================================
   用户要求：「各项删除需要权限才行（设置密码统一为qc2026）
              要不然容易删了 删除要二次确认」

   验收：
     ① 单行删除 → 弹二次确认；点取消 → 数据还在
     ② 危险删除（删分区）→ 二次确认 + 密码框
     ③ 密码错误 → 拒绝执行，提示"密码不对"
     ④ 密码正确（qc2026）→ 执行
     ⑤ 密码框连输错不会关掉（可连续试）
     ⑥ 页面其它地方无 JS 错误
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';

let pass=0,fail=0;
function ck(c,m){ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} }

(async()=>{
  const b=await chromium.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true});
  const ctx=await b.newContext({viewport:{width:1500,height:1000}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);

  console.log('\n=== ① Guard 已加载 ===');
  ck(await p.evaluate(()=>typeof window.Guard==='object'),'Guard 已加载');
  ck(await p.evaluate(()=>typeof window.Guard.ask==='function'),'Guard.ask 可用');
  ck(await p.evaluate(()=>window.Guard.checkPwd('qc2026')),'★ 密码 qc2026 校验通过');
  ck(await p.evaluate(()=>!window.Guard.checkPwd('wrong')),'★ 错误密码被拒');
  ck(await p.evaluate(()=>window.PERM && window.PERM.pass==='qc2026'),'PERM 已挂到 window 且口令一致');

  console.log('\n=== ② 单行删除：二次确认 + 取消不删 ===');
  const before=await p.evaluate(()=>window.JSAW._state().zones[0].steps.length);
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#v-jsa .jcard-act .x')][0];
    btn.click();
  });
  await p.waitForTimeout(700);
  const dlgOpen=await p.evaluate(()=>{
    const el=document.querySelector('#dlgHost .dlg');
    return el?{title:el.querySelector('.t')?el.querySelector('.t').textContent:'', body:el.querySelector('.dlg-b')?el.querySelector('.dlg-b').innerText.slice(0,80):''}:null;
  });
  ck(!!dlgOpen,'★ 弹出确认对话框');
  ck(dlgOpen && /删除/.test(dlgOpen.title),'对话框标题是「'+ (dlgOpen&&dlgOpen.title) +'」');
  // 点取消
  await p.evaluate(()=>{
    const btns=[...document.querySelectorAll('#dlgHost .dlg-f button')];
    const cancel=btns.find(b=>/取消/.test(b.textContent));
    if(cancel) cancel.click();
  });
  await p.waitForTimeout(600);
  const after=await p.evaluate(()=>window.JSAW._state().zones[0].steps.length);
  ck(after===before,'★ 点取消后数据没变（'+before+' → '+after+'）');

  console.log('\n=== ③ 单行删除：确认后真删 ===');
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#v-jsa .jcard-act .x')][0];
    btn.click();
  });
  await p.waitForTimeout(700);
  await p.evaluate(()=>{
    const btns=[...document.querySelectorAll('#dlgHost .dlg-f button')];
    const ok=btns.find(b=>/确认删除/.test(b.textContent));
    if(ok) ok.click();
  });
  await p.waitForTimeout(700);
  const after2=await p.evaluate(()=>window.JSAW._state().zones[0].steps.length);
  ck(after2===before-1,'★ 确认后删除成功（'+before+' → '+after2+'）');

  console.log('\n=== ④ 危险删除（删分区）：二次确认 + 密码 ===');
  const zb=await p.evaluate(()=>window.JSAW._state().zones.length);
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#v-jsa .btn')].find(b=>/删除分区/.test(b.textContent));
    if(btn) btn.click();
  });
  await p.waitForTimeout(700);
  await p.evaluate(()=>{
    const btns=[...document.querySelectorAll('#dlgHost .dlg-f button')];
    const ok=btns.find(b=>/确认删除/.test(b.textContent));
    if(ok) ok.click();
  });
  await p.waitForTimeout(800);
  const pwdBox=await p.evaluate(()=>{
    const el=document.querySelector('#__guardPwd');
    return el?{hasInput:!!el.querySelector('#__guardPwdIn'), title:(el.querySelector('div')||{}).textContent||''}:null;
  });
  ck(!!pwdBox,'★ 弹出密码框');
  ck(pwdBox&&pwdBox.hasInput,'密码框有输入框');
  ck(pwdBox&&/删除权限/.test(pwdBox.title),'标题含「需要删除权限」');

  console.log('\n=== ⑤ 密码错误：拒绝 + 可连续试 ===');
  await p.evaluate(()=>{ document.querySelector('#__guardPwdIn').value='wrongpwd'; });
  await p.evaluate(()=>{ document.querySelector('#__guardOk').click(); });
  await p.waitForTimeout(500);
  const errTxt=await p.evaluate(()=>{
    const e=document.querySelector('#__guardErr');
    const box=document.querySelector('#__guardPwd');
    return {err:e?e.textContent:'', stillOpen:!!box};
  });
  ck(errTxt.stillOpen,'★ 密码错后密码框没关闭（可继续输）');
  ck(/不对/.test(errTxt.err),'提示「'+errTxt.err+'」');
  const zb2=await p.evaluate(()=>window.JSAW._state().zones.length);
  ck(zb2===zb,'★ 密码错时分区没被删（'+zb+' → '+zb2+'）');

  console.log('\n=== ⑥ 密码正确：执行 ===');
  await p.evaluate(()=>{ document.querySelector('#__guardPwdIn').value='qc2026'; });
  await p.evaluate(()=>{ document.querySelector('#__guardOk').click(); });
  await p.waitForTimeout(800);
  const zb3=await p.evaluate(()=>window.JSAW._state().zones.length);
  ck(zb3===zb-1,'★ 密码正确后分区被删（'+zb+' → '+zb3+'）');

  console.log('\n=== ⑦ 台账行删除也要确认 ===');
  await p.evaluate(()=>{location.hash='#lab';});
  await p.waitForTimeout(1600);
  await p.evaluate(()=>{
    const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='reagent');
    if(b) b.click();
  });
  await p.waitForTimeout(1400);
  const ledgerDlg=await p.evaluate(async()=>{
    /* 台账用卡片模式，删除按钮在 .lcard-act 里，不是 .twrap */
    const btn=document.querySelector('#labBody .lcard-act button.x[title="删除"]')
           || document.querySelector('#labBody button.x[title="删除"]');
    if(!btn) return {noBtn:true, html:(document.querySelector('#labBody')||{}).innerHTML? '有内容':'空'};
    btn.click();
    await new Promise(r=>setTimeout(r,700));
    const el=document.querySelector('#dlgHost .dlg');
    return {open:!!el, title:el&&el.querySelector('.t')?el.querySelector('.t').textContent:''};
  });
  ck(ledgerDlg.open===true,'★ 台账行删除也弹确认（'+(ledgerDlg.title||JSON.stringify(ledgerDlg))+'）');
  await p.evaluate(()=>{
    const btns=[...document.querySelectorAll('#dlgHost .dlg-f button')];
    const c=btns.find(b=>/取消/.test(b.textContent));
    if(c) c.click();
  });

  console.log('\n=== ⑧ 无 JS 错误 ===');
  ck(errs.length===0,'无页面错误'+(errs.length?('：'+errs.slice(0,3).join(' | ')):''));

  await b.close();
  console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
  process.exit(fail?1:0);
})();
