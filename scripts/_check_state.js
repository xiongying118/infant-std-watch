const {chromium}=require('playwright-core');
const U='https://xiongying118.github.io/infant-std-watch/index.html';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const ctx=await b.newContext();
 const p=await ctx.newPage();
 await p.goto(U,{waitUntil:'networkidle',timeout:60000});
 await p.waitForTimeout(2000);
 console.log('=== 1. 订阅勾选是否落盘 ===');
 await p.evaluate(()=>{location.hash='#subs';});
 await p.waitForTimeout(900);
 const before=await p.evaluate(()=>{
   const boxes=[...document.querySelectorAll('#subGrid input[type=checkbox]')];
   return {total:boxes.length, on:boxes.filter(b=>b.checked).length};
 });
 // 取消第一个
 await p.evaluate(()=>{document.querySelectorAll('#subGrid input[type=checkbox]')[0].click();});
 await p.waitForTimeout(600);
 const after=await p.evaluate(()=>{
   const boxes=[...document.querySelectorAll('#subGrid input[type=checkbox]')];
   return {on:boxes.filter(b=>b.checked).length,
           ls:Object.keys(localStorage).filter(k=>k.indexOf('sub')>=0||k.indexOf('std')>=0)};
 });
 console.log('  勾选数：'+before.on+' → '+after.on);
 console.log('  localStorage 里的订阅键：'+(after.ls.length?after.ls.join(','):'（无 —— 刷新即丢）'));
 // 刷新
 await p.reload({waitUntil:'networkidle'});
 await p.waitForTimeout(2000);
 await p.evaluate(()=>{location.hash='#subs';});
 await p.waitForTimeout(900);
 const reload=await p.evaluate(()=>{
   const boxes=[...document.querySelectorAll('#subGrid input[type=checkbox]')];
   return boxes.filter(b=>b.checked).length;
 });
 console.log('  刷新后勾选数：'+reload+(reload===before.on?'  → 未保存 ✗':'  → 已保存 ✓'));
 console.log();
 console.log('=== 2. 提醒「标记已处理」是否落盘 ===');
 await p.evaluate(()=>{location.hash='#alerts';});
 await p.waitForTimeout(900);
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#alertList button')].find(x=>x.textContent.includes('标记已处理')); if(b) b.click();});
 await p.waitForTimeout(700);
 const al=await p.evaluate(()=>{
   const t=document.body.innerText;
   return {unread:(t.match(/未读/g)||[]).length,
           ls:Object.keys(localStorage)};
 });
 console.log('  页面「未读」标记数：'+al.unread);
 console.log('  localStorage 全部键：'+(al.ls.length?al.ls.join(','):'（无）'));
 await p.reload({waitUntil:'networkidle'});
 await p.waitForTimeout(2000);
 await p.evaluate(()=>{location.hash='#alerts';});
 await p.waitForTimeout(900);
 const al2=await p.evaluate(()=>(document.body.innerText.match(/未读/g)||[]).length);
 console.log('  刷新后「未读」数：'+al2+(al2===al.unread?'  → 未保存 ✗':'  → 已保存 ✓'));
 console.log();
 console.log('=== 3. 顶栏「待处理」数字是否实算 ===');
 console.log('  顶栏按钮：'+await p.evaluate(()=>{const b=[...document.querySelectorAll('.top button')].find(x=>x.textContent.includes('待处理')); return b?b.textContent.trim():'无';}));
 console.log();
 console.log('=== 4. 质量/研发工具的计算结果刷新后是否保留 ===');
 await p.evaluate(()=>{location.hash='#qmtools';});
 await p.waitForTimeout(1200);
 await p.evaluate(()=>{curQmKey='pareto';renderQmTools();QW_register('pareto',QM.tools.find(x=>x.toolKey==='pareto').widget);QW_render('pareto');});
 await p.waitForTimeout(700);
 const hasInput=await p.evaluate(()=>document.querySelectorAll('.qwt-tbl input').length);
 console.log('  帕累托可编辑单元格：'+hasInput+' 个（改后刷新 → 丢失，无草稿机制）');
 await b.close();
})();
