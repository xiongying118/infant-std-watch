const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.goto(B+'/index.html#lab',{waitUntil:'networkidle'});
 await p.waitForTimeout(2200);
 await p.screenshot({path:'_lab_board.png', clip:{x:0,y:0,width:1440,height:900}});
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip'); if(b)b.click();});
 await p.waitForTimeout(900);
 await p.evaluate(()=>{const t=document.querySelector('[data-ledger=equip]'); if(t) t.scrollIntoView({block:'start'});});
 await p.waitForTimeout(400);
 await p.screenshot({path:'_lab_equip.png', clip:{x:190,y:60,width:1250,height:760}});
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='capability'); if(b)b.click();});
 await p.waitForTimeout(900);
 await p.screenshot({path:'_lab_cap.png', clip:{x:0,y:0,width:1440,height:800}});
 await b.close();
})();
