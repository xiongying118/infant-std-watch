const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(1500);
 await p.evaluate(()=>{location.hash='#subs';}); await p.waitForTimeout(800);
 await p.evaluate(()=>{ document.querySelectorAll('#subGrid .chk input[type=checkbox]')[0].click(); });
 await p.waitForTimeout(600);
 await p.reload({waitUntil:'networkidle'});
 await p.waitForTimeout(2000);
 console.log(await p.evaluate(()=>{
   const out=[];
   out.push('hash = '+location.hash);
   out.push('SUBS[0].on = '+JSON.stringify(SUBS[0].on));
   out.push('SUBS[0].items = '+SUBS[0].items.length);
   const cbs=[...document.querySelectorAll('#subGrid input[type=checkbox]')];
   out.push('DOM 里 checkbox 总数 = '+cbs.length);
   out.push('checked 数 = '+cbs.filter(c=>c.checked).length);
   // 第一组里的框
   const box=document.querySelectorAll('#subGrid .sub-box')[0];
   const inBox=[...box.querySelectorAll('input[type=checkbox]')];
   out.push('第一组 DOM 框数 = '+inBox.length+'（含组标题）');
   out.push('第一组 checked = '+inBox.filter(c=>c.checked).length);
   // 手动重渲染再数
   renderSubs();
   const cbs2=[...document.querySelectorAll('#subGrid input[type=checkbox]')];
   out.push('手动 renderSubs 后 checked = '+cbs2.filter(c=>c.checked).length);
   return out.join(String.fromCharCode(10));
 }));
 await b.close();
})();
