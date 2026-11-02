const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(2000);
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 console.log('Store 已加载:', await p.evaluate(()=>typeof Store==='object'));
 console.log('顶栏按钮:', await p.evaluate(()=>document.getElementById('alertBtn').textContent.trim()));
 console.log();
 console.log('=== 1. 订阅落盘 ===');
 await p.evaluate(()=>{location.hash='#subs';}); await p.waitForTimeout(900);
 const b0=await p.evaluate(()=>document.querySelectorAll('#subGrid input[type=checkbox]').length);
 await p.evaluate(()=>{document.querySelectorAll('#subGrid input[type=checkbox]')[0].click();});
 await p.waitForTimeout(500);
 const after=await p.evaluate(()=>({
   on:document.querySelectorAll('#subGrid input[type=checkbox]:checked').length,
   ls:Object.keys(localStorage).filter(k=>k.indexOf('swd:subs')>=0)
 }));
 console.log('  勾选后:', after.on+' 项 · localStorage:', after.ls.join(','));
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2000);
 await p.evaluate(()=>{location.hash='#subs';}); await p.waitForTimeout(900);
 const rl=await p.evaluate(()=>document.querySelectorAll('#subGrid input[type=checkbox]:checked').length);
 console.log('  刷新后:', rl+' 项 '+(rl===after.on?'✓ 保住了':'✗ 丢了'));
 console.log();
 console.log('=== 2. 提醒已处理落盘 ===');
 await p.evaluate(()=>{location.hash='#alerts';}); await p.waitForTimeout(900);
 console.log('  筛选标签:', await p.evaluate(()=>[...document.querySelectorAll('#alertFilters .chip')].map(c=>c.textContent.trim()).join(' | ')));
 const pend0=await p.evaluate(()=>document.getElementById('alertBtn').textContent.trim());
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#alertList button')].find(x=>x.textContent.includes('标记已处理')); if(b)b.click();});
 await p.waitForTimeout(900);
 // 弹窗要确认
 await p.evaluate(()=>{const b=document.querySelector('#dlgHost .dlg-f button'); if(b)b.click();});
 await p.waitForTimeout(700);
 const p1=await p.evaluate(()=>({
   btn:document.getElementById('alertBtn').textContent.trim(),
   done:Object.keys(JSON.parse(localStorage.getItem('swd:alerts.done')||'{}')).length
 }));
 console.log('  标记后 顶栏:', p1.btn+' · 已存记录', p1.done, '条');
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2000);
 await p.evaluate(()=>{location.hash='#alerts';}); await p.waitForTimeout(900);
 const p2=await p.evaluate(()=>({
   btn:document.getElementById('alertBtn').textContent.trim(),
   done:Object.keys(JSON.parse(localStorage.getItem('swd:alerts.done')||'{}')).length,
   hasDoneTab:[...document.querySelectorAll('#alertFilters .chip')].some(c=>c.textContent.includes('已处理'))
 }));
 console.log('  刷新后 顶栏:', p2.btn+' · 已存记录', p2.done, '条 · 已处理页签', p2.hasDoneTab?'✓':'✗');
 console.log();
 console.log('=== 3. 今日待办 ===');
 await p.evaluate(()=>{location.hash='#home';}); await p.waitForTimeout(1200);
 console.log('  '+(await p.evaluate(()=>document.getElementById('todoStat').textContent)));
 console.log('  待办行数:', await p.evaluate(()=>document.querySelectorAll('#todoList .rem-item').length));
 console.log('  前 4 条:');
 console.log(await p.evaluate(()=>[...document.querySelectorAll('#todoList .rem-item')].slice(0,4).map(r=>
   '    '+r.innerText.replace(/\n/g,' / ')).join(String.fromCharCode(10))));
 console.log();
 console.log('=== 4. 标准清单导出 + 影响分析 ===');
 await p.evaluate(()=>{location.hash='#list';}); await p.waitForTimeout(1000);
 console.log('  工具栏按钮:', await p.evaluate(()=>[...document.querySelectorAll('#v-list .btn')].map(b=>b.textContent.trim()).join(' | ')));
 await p.evaluate(()=>{showImpactPanel();}); await p.waitForTimeout(900);
 console.log('  影响面板行数:', await p.evaluate(()=>document.querySelectorAll('#impactPanel tbody tr').length));
 console.log('  '+(await p.evaluate(()=>{const c=document.querySelector('#impactPanel .card-h .muted'); return c?c.innerText:'无';})));
 console.log();
 console.log('=== 5. 管理后台本机数据 ===');
 await p.evaluate(()=>{location.hash='#admin';}); await p.waitForTimeout(1000);
 console.log('  '+(await p.evaluate(()=>{const e=document.getElementById('localStateBox'); return e?e.innerText.replace(/\n+/g,' | ').slice(0,320):'(无)';})));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
