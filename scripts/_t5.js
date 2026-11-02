const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(1800);
 const cnt = ()=>p.evaluate(()=>({
   items: document.querySelectorAll('#subGrid .chk input[type=checkbox]').length,
   on: document.querySelectorAll('#subGrid .chk input[type=checkbox]:checked').length
 }));
 await p.evaluate(()=>{location.hash='#subs';}); await p.waitForTimeout(900);
 console.log('=== 订阅落盘（只数项目框，不数组标题）===');
 const b0=await cnt(); console.log('  初始:', b0.on+'/'+b0.items);
 await p.evaluate(()=>{ document.querySelectorAll('#subGrid .chk input[type=checkbox]')[0].click(); });
 await p.waitForTimeout(500);
 const b1=await cnt(); console.log('  点第一项后:', b1.on+'/'+b1.items);
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1800);
 await p.evaluate(()=>{location.hash='#subs';}); await p.waitForTimeout(900);
 const b2=await cnt(); console.log('  刷新后:', b2.on+'/'+b2.items, (b2.on===b1.on?'✓ 保住了':'✗ 丢了'));
 console.log('  订阅状态文字:', await p.evaluate(()=>document.getElementById('subStat').innerText));
 console.log();
 console.log('=== 提醒已处理落盘 ===');
 await p.evaluate(()=>{location.hash='#alerts';}); await p.waitForTimeout(900);
 const t0=await p.evaluate(()=>document.getElementById('alertBtn').textContent.trim());
 console.log('  顶栏:', t0);
 console.log('  页签:', await p.evaluate(()=>[...document.querySelectorAll('#alertFilters .chip')].map(c=>c.textContent.trim()).join(' | ')));
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#alertList button')].find(x=>x.textContent.includes('标记已处理')); if(b)b.click();});
 await p.waitForTimeout(800);
 await p.evaluate(()=>{const b=document.querySelector('#dlgHost .dlg-f button'); if(b)b.click();});
 await p.waitForTimeout(800);
 const t1=await p.evaluate(()=>document.getElementById('alertBtn').textContent.trim());
 console.log('  标记后顶栏:', t1);
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1800);
 await p.evaluate(()=>{location.hash='#alerts';}); await p.waitForTimeout(900);
 const t2=await p.evaluate(()=>document.getElementById('alertBtn').textContent.trim());
 console.log('  刷新后顶栏:', t2, (t2===t1?'✓ 保住了':'✗ 丢了'));
 console.log('  已处理页签:', await p.evaluate(()=>{const c=[...document.querySelectorAll('#alertFilters .chip')].find(x=>x.textContent.includes('已处理')); return c?c.textContent.trim():'无';}));
 // 看已处理视图
 await p.evaluate(()=>{const c=[...document.querySelectorAll('#alertFilters .chip')].find(x=>x.textContent.includes('已处理')); if(c)c.click();});
 await p.waitForTimeout(700);
 console.log('  已处理列表:', await p.evaluate(()=>document.getElementById('alertList').innerText.replace(/\n+/g,' | ').slice(0,180)));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
