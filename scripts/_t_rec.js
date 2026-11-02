const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.setViewportSize({width:1440,height:1000});
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(2400);
 await p.evaluate(()=>{location.hash='#lab';}); await p.waitForTimeout(1500);
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='record'); if(b)b.click();});
 await p.waitForTimeout(1200);

 console.log('=== 1. 方法清单 ===');
 console.log(await p.evaluate(()=>{
   const o=LAB.methodOptions();
   const groups={}; o.forEach(x=>{groups[x.group||'其它']=(groups[x.group||'其它']||0)+1;});
   const out=['共 '+o.length+' 个方法'];
   Object.keys(groups).forEach(g=>out.push('  '+g.padEnd(14)+groups[g]));
   return out.join(String.fromCharCode(10));
 }));
 console.log();
 console.log('=== 2. 过期方法已剔除 ===');
 console.log(await p.evaluate(()=>{
   const o=LAB.methodOptions().map(x=>x.no.replace(/\s+/g,''));
   const bad=['GB5413.17-2010','GB5413.16-2010','GB5413.12-2010','GB5413.14-2010','GB5413.19-2010','GB4789.3-2016','GB4789.4-2016','GB5009.89-2016'];
   const left=bad.filter(b=>o.indexOf(b)>=0);
   return left.length? ('✗ 还在列表里: '+left.join(', ')) : ('✓ 8 个过期方法全部剔除');
 }));
 console.log();
 console.log('=== 3. 通则方法已加入 ===');
 console.log(await p.evaluate(()=>{
   const o=LAB.methodOptions();
   const tg=o.filter(x=>x.src.indexOf('通则')>=0);
   const sample=tg.slice(0,4).map(x=>'  '+x.no+' · '+x.title).join(String.fromCharCode(10));
   return '通则来源 '+tg.length+' 条'+String.fromCharCode(10)+sample;
 }));
 console.log();
 console.log('=== 4. 选择后能保持选中（原来会跳回占位符）===');
 const sel = await p.evaluate(()=>{
   const s=document.getElementById('recMethod');
   const opts=[...s.options].filter(o=>o.value&&o.value!=='__manual__');
   const target=opts[3];
   s.value=target.value;
   s.dispatchEvent(new Event('change',{bubbles:true}));
   return {picked:target.value, text:target.textContent};
 });
 await p.waitForTimeout(1100);
 const after = await p.evaluate(()=>{
   const s=document.getElementById('recMethod');
   const h=document.querySelector('#labBody .card-h h3');
   return {val:s?s.value:'(无)', selText:s&&s.selectedOptions[0]?s.selectedOptions[0].textContent:'(无)',
           title:h?h.textContent.trim():'(无)',
           rows:document.querySelectorAll('#labBody tbody tr').length};
 });
 console.log('  选的:', sel.text);
 console.log('  重渲染后 select 值:', after.val, '| 显示:', after.selText);
 console.log('  生成的表:', after.title, '·', after.rows, '行');
 console.log('  ', (after.val===sel.picked && after.rows>0)?'✓ 选中了且出表':'✗ 没保持');
 console.log();
 console.log('=== 5. 搜索过滤 ===');
 await p.evaluate(()=>{const i=document.getElementById('recSearch'); i.value='5009.5'; i.dispatchEvent(new Event('input',{bubbles:true}));});
 await p.waitForTimeout(700);
 console.log('  ', await p.evaluate(()=>{
   const s=document.getElementById('recMethod');
   const vis=[...s.options].filter(o=>!o.hidden&&o.value&&o.value!=='__manual__');
   return '搜「5009.5」→ 可见 '+vis.length+' 个：'+vis.slice(0,3).map(o=>o.textContent).join(' | ');
 }));
 console.log();
 console.log('=== 6. 人工添加方法 ===');
 await p.evaluate(()=>{const i=document.getElementById('recSearch'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}));});
 await p.waitForTimeout(400);
 await p.evaluate(()=>{const s=document.getElementById('recMethod'); s.value='__manual__'; s.dispatchEvent(new Event('change',{bubbles:true}));});
 await p.waitForTimeout(900);
 console.log('  人工表单出现:', await p.evaluate(()=>!!document.getElementById('mNo')));
 await p.evaluate(()=>{ LAB.setManualField('no','GB 9999.1-2026'); LAB.setManualField('title','企业内部方法'); LAB.setManualField('tpl','通用'); });
 await p.waitForTimeout(300);
 await p.evaluate(()=>{LAB.addManualMethod();});
 await p.waitForTimeout(1200);
 console.log('  添加后:', await p.evaluate(()=>{
   const s=document.getElementById('recMethod');
   const h=document.querySelector('#labBody .card-h h3');
   return 'select='+(s?s.value:'-')+' | 表头='+(h?h.textContent.trim():'-');
 }));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
