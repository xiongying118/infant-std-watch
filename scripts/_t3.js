const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(1500);
 // 直接调 persistSubs 看看存储内容
 console.log('persistSubs 后:', await p.evaluate(()=>{
   SUBS[0].on[0]=0;
   persistSubs();
   return localStorage.getItem('swd:subs');
 }));
 console.log();
 console.log('restoreSubs 后 SUBS[0].on:', await p.evaluate(()=>{
   // 模拟刷新：重置 SUBS 再恢复
   SUBS[0].on = [1,1,1,1,1,1,1];
   const r = restoreSubs();
   return JSON.stringify({returned:r, on:SUBS[0].on});
 }));
 await b.close();
})();
