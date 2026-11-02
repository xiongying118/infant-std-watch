const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/index.html#lab',{waitUntil:'networkidle'});
 await p.waitForTimeout(2200);
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 console.log('页签:', await p.evaluate(()=>[...document.querySelectorAll('#labTabs button')].map(x=>x.textContent.trim()).join(' | ')));
 console.log();
 const tabs=['capability','equip','reagent','prep','sample','flows','orders','qc','pt','capa','audit','schedule','env','record'];
 for(const t of tabs){
   await p.evaluate(x=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab===x); if(b)b.click();}, t);
   await p.waitForTimeout(500);
   const r = await p.evaluate(()=>{
     const el=document.getElementById('labBody');
     return {txt:el.innerText.replace(/\s+/g,' ').length,
             rows:el.querySelectorAll('tbody tr').length,
             inputs:el.querySelectorAll('input,select,textarea').length,
             btns:el.querySelectorAll('.btn').length};
   });
   console.log('  '+t.padEnd(11)+' 文字'+String(r.txt).padStart(6)+'  行'+String(r.rows).padStart(4)+'  输入'+String(r.inputs).padStart(4)+'  按钮'+r.btns);
 }
 console.log();
 console.log('=== 计量设备台账：一键导入导出 ===');
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip'); if(b)b.click();});
 await p.waitForTimeout(600);
 console.log('  工具条:', await p.evaluate(()=>[...document.querySelectorAll('#labBody .card-h .btn')].map(b=>b.textContent.trim()).join(' | ')));
 console.log('  KPI:', await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join(' | ')));
 console.log();
 console.log('=== 导入：解析 CSV → 预览 → 写入 ===');
 const imp = await p.evaluate(()=>{
   const out=[];
   // 造一份 CSV（含引号、内嵌逗号、中文表头）
   const csv = '\uFEFF编号,设备名称,品牌,型号,出厂序列号,类型,校准/检定方式,周期(月),上次校准,下次校准,溯源证书号,状态,安装位置,责任人,用途,关键设备\r\n'
     + 'EQ-900,气相色谱仪（进口）,安捷伦,8890A,"GC-900, SN12345",强制检定,检定,12,2026-10-01,2027-10-01,TEST-001,在用,色谱室,测试员,测试导入,否\r\n'
     + 'EQ-901,液相色谱仪,岛津,LC-20,SN67890,内部校准,校准,12,2026-09-01,2027-09-01,TEST-002,在用,色谱室,测试员,"含逗号, 的用途",是\r\n';
   // 直接测解析器
   const m = Ledger.parseCsv(csv);
   out.push('CSV 解析：'+m.length+' 行');
   out.push('表头：'+m[0].join('|'));
   out.push('第2行：'+m[1].join('|'));
   out.push('第3行：'+m[2].join('|'));
   // 转行对象
   const def = Ledger._defs['equip'];
   const rows = Ledger.rowsFromMatrix(def, m);
   out.push('映射成行：'+rows.length+' 行');
   out.push('第1行 id='+rows[0].id+' name='+rows[0].name+' nextCal='+rows[0].nextCal+' critical='+rows[0].critical);
   out.push('第2行 id='+rows[1].id+' use='+rows[1].use+' critical='+rows[1].critical);
   return out;
 });
 imp.forEach(x=>console.log('  '+x));
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
