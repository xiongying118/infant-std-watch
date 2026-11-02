const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/index.html#lab',{waitUntil:'networkidle'});
 await p.waitForTimeout(2200);
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 console.log('徽标:', await p.evaluate(()=>{const b=document.getElementById('labBadge');return b?b.textContent:'(无)';}));
 console.log('页签:', await p.evaluate(()=>[...document.querySelectorAll('#labTabs button')].map(x=>x.textContent.trim()).join(' | ')));
 console.log();
 for(const t of ['capability','equip','reagent','sample','qc','pt','record']){
   await p.evaluate(x=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab===x); if(b)b.click();}, t);
   await p.waitForTimeout(600);
   const r = await p.evaluate(()=>{
     const el=document.getElementById('labBody');
     return {txt:el.innerText.replace(/\s+/g,' ').length,
             rows:el.querySelectorAll('tbody tr').length,
             html:el.innerHTML.length};
   });
   console.log('  '+t.padEnd(11)+' 文字'+String(r.txt).padStart(6)+'  行'+String(r.rows).padStart(4)+'  HTML'+r.html);
 }
 console.log();
 console.log('=== 原始记录生成器：选方法 → 出表 ===');
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='record'); if(b)b.click();});
 await p.waitForTimeout(600);
 const opts = await p.evaluate(()=>document.querySelectorAll('#recMethod option').length);
 console.log('  可选方法数:', opts);
 await p.evaluate(()=>{const s=document.getElementById('recMethod'); s.selectedIndex=1; LAB.pickMethod('1');});
 await p.waitForTimeout(700);
 console.log('  生成后:', await p.evaluate(()=>{
   const el=document.getElementById('labBody');
   const h=el.querySelector('.card-h h3');
   return (h?h.textContent:'(无)')+' · 记录项 '+el.querySelectorAll('tbody tr').length+' 行';
 }));
 console.log();
 console.log('=== 导出功能 ===');
 const dl = await p.evaluate(()=>{
   const out=[];
   const orig=HTMLAnchorElement.prototype.click;
   let last=null;
   HTMLAnchorElement.prototype.click=function(){ last=this.download; };
   try{
     LAB.exportCapability(); out.push('能力矩阵: '+(last||'未触发'));
     LAB.exportEquip(); out.push('设备台账: '+(last||'未触发'));
     LAB.exportReagent(); out.push('试剂台账: '+(last||'未触发'));
     LAB.exportSample(); out.push('样品留样: '+(last||'未触发'));
     LAB.exportQCPlan(); out.push('QC方案: '+(last||'未触发'));
     LAB.exportQCRec(); out.push('QC记录: '+(last||'未触发'));
     LAB.exportPT(); out.push('能力验证: '+(last||'未触发'));
     LAB.exportRecord(); out.push('原始记录: '+(last||'未触发'));
   }catch(e){ out.push('异常: '+e.message); }
   HTMLAnchorElement.prototype.click=orig;
   return out;
 });
 dl.forEach(x=>console.log('  '+x));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
