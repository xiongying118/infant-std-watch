const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(1500);
 console.log(await p.evaluate(()=>{
   const raw = localStorage.getItem('swd:subs');
   const saved = Store.subs.get();
   return JSON.stringify({
     raw: raw ? raw.slice(0,140) : null,
     savedKeys: saved?Object.keys(saved):null,
     firstSaved: saved?JSON.stringify(saved[Object.keys(saved)[0]]):null,
     SUBS组名: SUBS.map(g=>g.g),
     SUBS0_on: SUBS[0].on
   }, null, 1);
 }));
 await b.close();
})();
