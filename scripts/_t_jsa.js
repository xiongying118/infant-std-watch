const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/index.html#jsa',{waitUntil:'networkidle'});
 await p.waitForTimeout(2200);
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 console.log('页签:', await p.evaluate(()=>[...document.querySelectorAll('#jsaTabs button')].map(x=>x.textContent.trim()).join(' | ')));
 console.log('KPI:', await p.evaluate(()=>[...document.querySelectorAll('#jsaBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | ')));
 console.log('分区数:', await p.evaluate(()=>document.querySelectorAll('#jsaBody .jsa-zones .chip').length));
 console.log('可编辑输入框:', await p.evaluate(()=>document.querySelectorAll('#jsaBody .jsa-edit input,#jsaBody .jsa-edit textarea').length));
 console.log();
 console.log('=== 1. 可编辑：改步骤文字 ===');
 const before = await p.evaluate(()=>document.querySelector('.jsa-edit tbody tr td input').value);
 await p.evaluate(()=>{ const i=document.querySelector('.jsa-edit tbody tr td input'); i.value='改过的作业步骤'; i.dispatchEvent(new Event('input',{bubbles:true})); });
 await p.waitForTimeout(700);
 const after = await p.evaluate(()=>document.querySelector('.jsa-edit tbody tr td input').value);
 console.log('  改前:', before, '→ 改后:', after, after==='改过的作业步骤'?'✓':'✗');
 console.log('  已落盘:', await p.evaluate(()=>{const k=localStorage.getItem('swd:jsa.work'); return k?('是（'+k.length+' 字节）'):'否';}));
 console.log();
 console.log('=== 2. 可联动：改 L → R 与等级跟着变 ===');
 const r0 = await p.evaluate(()=>{
   const tr=document.querySelector('.jsa-edit tbody tr');
   return {L:tr.querySelectorAll('.lvl-in')[0].value, S:tr.querySelectorAll('.lvl-in')[1].value,
           R:tr.querySelector('.rv').textContent, grade:tr.querySelector('.tag').textContent.trim()};
 });
 await p.evaluate(()=>{ const i=document.querySelectorAll('.jsa-edit tbody tr .lvl-in')[0]; i.value='5'; i.dispatchEvent(new Event('input',{bubbles:true})); });
 await p.waitForTimeout(700);
 const r1 = await p.evaluate(()=>{
   const tr=document.querySelector('.jsa-edit tbody tr');
   return {L:tr.querySelectorAll('.lvl-in')[0].value, R:tr.querySelector('.rv').textContent,
           grade:tr.querySelector('.tag').textContent.trim(),
           kpi:document.querySelector('#jsaBody .kpi').innerText.replace(/\n/g,' '),
           warn:document.querySelector('#jsaBody .notice')?document.querySelector('#jsaBody .notice').innerText.replace(/\n+/g,' | ').slice(0,110):'无'};
 });
 console.log('  改前 L='+r0.L+' S='+r0.S+' → R='+r0.R+' ('+r0.grade+')');
 console.log('  改后 L='+r1.L+' → R='+r1.R+' ('+r1.grade+')');
 console.log('  KPI 联动:', r1.kpi);
 console.log('  校验提示:', r1.warn);
 console.log();
 console.log('=== 3. 刷新后编辑是否保住 ===');
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2200);
 await p.evaluate(()=>{location.hash='#jsa';}); await p.waitForTimeout(1400);
 const r2 = await p.evaluate(()=>{
   const tr=document.querySelector('.jsa-edit tbody tr');
   return {step:tr.querySelector('td input').value, L:tr.querySelectorAll('.lvl-in')[0].value,
           R:tr.querySelector('.rv').textContent};
 });
 console.log('  刷新后:', r2.step, 'L='+r2.L, 'R='+r2.R);
 console.log();
 console.log('=== 4. 各页签 ===');
 for(const t of ['matrix','redlines','ppe','drill','signoff','guide']){
   await p.evaluate(x=>{const b=[...document.querySelectorAll('#jsaTabs button')].find(y=>y.dataset.jsa===x); if(b)b.click();}, t);
   await p.waitForTimeout(600);
   const r = await p.evaluate(()=>{
     const el=document.getElementById('jsaBody');
     return {txt:el.innerText.replace(/\s+/g,' ').length,
             tables:el.querySelectorAll('table').length,
             inputs:el.querySelectorAll('input,textarea').length,
             html:el.innerHTML.length};
   });
   console.log('  '+t.padEnd(10)+' 文字'+String(r.txt).padStart(6)+'  表'+r.tables+'  输入'+r.inputs+'  HTML'+r.html);
 }
 console.log();
 console.log('=== 5. 导出（CSV/Word/JSON）===');
 const dl = await p.evaluate(async ()=>{
   const out=[];
   // 拦截下载
   const orig=HTMLAnchorElement.prototype.click;
   let last=null;
   HTMLAnchorElement.prototype.click=function(){ last={name:this.download, href:this.href}; };
   try{
     JSAW.exportCsv(); out.push('CSV: '+(last?last.name:'未触发'));
     JSAW.exportWord(); out.push('Word: '+(last?last.name:'未触发'));
     JSAW.exportJson(); out.push('JSON: '+(last?last.name:'未触发'));
   }catch(e){ out.push('异常: '+e.message); }
   HTMLAnchorElement.prototype.click=orig;
   return out;
 });
 dl.forEach(x=>console.log('  '+x));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
