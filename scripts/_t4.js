const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 p.on('console',m=>{ if(m.type()==='error') console.log('  [console.error]', m.text()); });
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(1500);
 // 先手动写一份订阅
 await p.evaluate(()=>{ SUBS[0].on=[0,0,1,1,1,1]; persistSubs(); });
 console.log('写入后 storage:', await p.evaluate(()=>localStorage.getItem('swd:subs')));
 await p.reload({waitUntil:'networkidle'});
 await p.waitForTimeout(2000);
 console.log('刷新后 SUBS[0].on:', await p.evaluate(()=>JSON.stringify(SUBS[0].on)));
 console.log('刷新后 storage   :', await p.evaluate(()=>localStorage.getItem('swd:subs')));
 console.log('restoreSubs 可用 :', await p.evaluate(()=>typeof restoreSubs));
 console.log('手动再跑一次恢复 :', await p.evaluate(()=>{const r=restoreSubs(); return JSON.stringify({r:r, on:SUBS[0].on});}));
 await b.close();
})();
