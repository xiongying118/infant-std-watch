const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/index.html#lab',{waitUntil:'networkidle'});
 await p.waitForTimeout(2200);
 console.log('=== 联动看板 ===');
 console.log(await p.evaluate(()=>{
   const el=document.getElementById('labBody');
   const bd=el.querySelector('.card-h h3');
   if(!bd||bd.textContent.indexOf('需要处理')<0) return '(看板未出现)';
   const items=[...el.querySelectorAll('.alert')].map(a=>{
     const t=a.querySelector('.t').textContent.trim();
     const tag=(a.querySelector('.tag')||{}).textContent||'';
     const d=(a.querySelector('.kv')||{}).textContent||'';
     return '  ['+tag+'] '+t+'\n      '+d.replace(/\s+/g,' ').slice(0,150);
   });
   return items.join(String.fromCharCode(10));
 }));
 console.log();
 console.log('=== 编辑落盘：设备台账改「下次校准」→ KPI 跟着变 ===');
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip'); if(b)b.click();});
 await p.waitForTimeout(600);
 const kpi0 = await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | '));
 console.log('  改前:', kpi0);
// 找第一行的「下次校准」输入框（date 类型），改成过去日期
 await p.evaluate(()=>{
   const tbl=document.querySelector('[data-ledger="equip"]');
   const row=tbl.querySelector('tbody tr');
   const dates=[...row.querySelectorAll('input[type=date]')];
   dates[1].value='2020-01-01';
   dates[1].dispatchEvent(new Event('input',{bubbles:true}));
 });
 await p.waitForTimeout(800);
 const kpi1 = await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | '));
 console.log('  改后:', kpi1);
 console.log('  已落盘:', await p.evaluate(()=>{const k=localStorage.getItem('swd:ledger.equip'); return k?('是（'+k.length+' 字节）'):'否';}));
 console.log();
 console.log('=== 刷新后是否保留 ===');
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2200);
 await p.evaluate(()=>{location.hash='#lab';}); await p.waitForTimeout(1200);
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip'); if(b)b.click();});
 await p.waitForTimeout(700);
 const kpi2 = await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | '));
 console.log('  刷新后:', kpi2, kpi2===kpi1?'✓ 保住了':'✗ 丢了');
 console.log();
 console.log('=== 联动：设备超期 → 能力矩阵标红 ===');
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='capability'); if(b)b.click();});
 await p.waitForTimeout(700);
 console.log('  能力矩阵标红行数:', await p.evaluate(()=>document.querySelectorAll('#labBody tbody tr.bad').length));
 console.log('  超期提示:', await p.evaluate(()=>{
   const t=[...document.querySelectorAll('#labBody tbody tr.bad')].map(r=>r.innerText.replace(/\n/g,' ')).join(' | ');
   return t?t.slice(0,200):'（无）';
 }));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
