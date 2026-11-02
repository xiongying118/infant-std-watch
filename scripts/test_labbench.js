/* ================================================================
   test_labbench.js —— 实验室管理台账测试（2026-11-01）
   ================================================================
   覆盖三件事：
     ① 可编辑 —— 台账字段能改，改完落盘
     ② 可联动 —— 设备超期 → 能力矩阵标红；QC 超限 → 看板提示
     ③ 可交付 —— 一键导入能正确解析（引号/内嵌逗号/BOM/中文表头）
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');
const fs=require('fs');

const ROOT=path.resolve(__dirname,'..');
const PROTOTYPE='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/');
const URL=PROTOTYPE+'/index.html';

let pass=0, fail=0;
function ck(cond,msg){
  if(cond){ pass++; console.log('  ✓ '+msg); }
  else { fail++; console.log('  ✗ '+msg); }
}

(async()=>{
  const b=await chromium.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true});
  const ctx=await b.newContext();
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

  await p.goto(URL+'#lab',{waitUntil:'networkidle'});
  await p.waitForTimeout(2200);

  console.log('\n=== ① 页面与脚本加载 ===');
  ck(await p.evaluate(()=>typeof window.Store==='object'), 'store.js 已加载');
  ck(await p.evaluate(()=>typeof window.Ledger==='object'), 'ledger.js 已加载');
  ck(await p.evaluate(()=>!!window.LABDATA), 'labdata.js 已加载');
  ck(await p.evaluate(()=>!!window.LABDATA2), 'labdata2.js 已加载');
  ck(await p.evaluate(()=>!!window.LABDATA && !!window.LABDATA.EQUIPMENT), '设备台账种子数据存在');
  ck(await p.evaluate(()=>!!window.LABDATA2 && !!window.LABDATA2.ORDERS), '委托单种子数据存在');

  console.log('\n=== ② 台账注册与页签 ===');
  const tabs=await p.evaluate(()=>[...document.querySelectorAll('#labTabs button')].map(x=>x.dataset.lab));
  ck(tabs.length>=14, '实验室管理页签 ≥ 14 个（实际 '+tabs.length+'）');
  ['capability','equip','reagent','prep','sample','flows','orders','qcplan','qcrec',
   'pt','capa','audit','schedule','env','record'].forEach(k=>{
    ck(tabs.indexOf(k)>=0, '页签含「'+k+'」');
  });
  const defs=await p.evaluate(()=>Object.keys(window.Ledger._defs));
  ck(defs.length>=13, '注册台账 ≥ 13 个（实际 '+defs.length+'）');

  console.log('\n=== ③ 可编辑：改字段 → 落盘 → KPI 跟着变 ===');
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip');
    if(btn) btn.click();
  });
  await p.waitForTimeout(700);
  const kpi0=await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join('|'));
  ck(/设备总数/.test(kpi0), '设备台账有 KPI 卡');
  // 改第一台设备的下次校准为过去日期
  await p.evaluate(()=>{
    const card=document.querySelector('.lcard');
    const dates=[...card.querySelectorAll('input[type=date]')];
    dates[1].value='2020-01-01';
    dates[1].dispatchEvent(new Event('input',{bubbles:true}));
  });
  await p.waitForTimeout(800);
  const kpi1=await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join('|'));
  ck(kpi1!==kpi0, '改「下次校准」→ KPI 随之变化');
  const saved=await p.evaluate(()=>localStorage.getItem('swd:ledger.equip'));
  ck(!!saved && saved.length>100, '台账数据已落盘（'+((saved||"").length)+' 字节）');
  // 刷新后还在
  await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(2000);
  await p.evaluate(()=>{location.hash='#lab';});
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip');
    if(btn) btn.click();
  });
  await p.waitForTimeout(700);
  const kpi2=await p.evaluate(()=>[...document.querySelectorAll('#labBody .kpi')].map(k=>k.innerText.replace(/\n/g,' ')).join('|'));
  ck(kpi2===kpi1, '★ 刷新后编辑仍保留');

  console.log('\n=== ④ 可联动：设备超期 → 能力矩阵标红 ===');
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='capability');
    if(btn) btn.click();
  });
  await p.waitForTimeout(800);
  const red=await p.evaluate(()=>document.querySelectorAll('#labBody tbody tr.bad').length);
  ck(red>0, '依赖超期设备的能力项已标红（'+red+' 行）');
  const redTip=await p.evaluate(()=>{
    const t=[...document.querySelectorAll('#labBody tbody tr.bad')].map(r=>r.innerText).join(' ');
    return t.indexOf('暂停接单')>=0;
  });
  ck(redTip, '标红行给出「暂停接单」提示');

  console.log('\n=== ⑤ 联动看板 ===');
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='equip');
    if(btn) btn.click();
  });
  await p.waitForTimeout(800);
  const board=await p.evaluate(()=>{
    const el=document.getElementById('labBody');
    const h=el.querySelector('.card-h h3');
    if(!h||h.textContent.indexOf('需要处理')<0) return null;
    return [...el.querySelectorAll('.alert')].map(a=>a.innerText.replace(/\s+/g,' '));
  });
  ck(!!board, '联动看板已显示');
  ck(board && board.some(x=>/设备校准已超期/.test(x)), '看板提示「设备校准已超期」');
  ck(board && board.some(x=>/未闭环|超期|不符合/.test(x)), '看板汇总了其他台账的待办');

  console.log('\n=== ⑥ 可交付：一键导入（CSV 解析）===');
  const parse=await p.evaluate(()=>{
    const csv='\uFEFF编号,设备名称,品牌,型号,出厂序列号,类型,校准/检定方式,周期(月),上次校准,下次校准,溯源证书号,状态,安装位置,责任人,用途,关键设备\r\n'
      +'EQ-900,气相色谱仪（进口）,安捷伦,8890A,"GC-900, SN12345",强制检定,检定,12,2026-10-01,2027-10-01,TEST-001,在用,色谱室,测试员,测试导入,否\r\n'
      +'EQ-901,液相色谱仪,岛津,LC-20,SN67890,内部校准,校准,12,2026-09-01,2027-09-01,TEST-002,在用,色谱室,测试员,"含逗号, 的用途",是\r\n';
    const m=Ledger.parseCsv(csv);
    const rows=Ledger.rowsFromMatrix(Ledger._defs['equip'], m);
    return {n:m.length, head:m[0].length, r1:m[1].length, r2:m[2].length,
            rows:rows.length,
            id:rows[0]&&rows[0].id, name:rows[0]&&rows[0].name,
            sn:rows[0]&&rows[0].sn, use:rows[1]&&rows[1].use,
            crit:rows[1]&&rows[1].critical, next:rows[0]&&rows[0].nextCal};
  });
  ck(parse.n===3, 'CSV 解析出 3 行（含表头）（实际 '+parse.n+'）');
  ck(parse.head===16, '表头 16 列全部识别（实际 '+parse.head+'）');
  ck(parse.r1===16, '含引号包裹的字段正确拆分（实际 '+parse.r1+' 列）');
  ck(parse.r2===16, '含内嵌逗号的字段正确拆分（实际 '+parse.r2+' 列）');
  ck(parse.rows===2, '映射成 2 行台账记录');
  ck(parse.id==='EQ-900', '编号映射正确');
  ck(parse.sn==='GC-900, SN12345', '引号内逗号保留');
  ck(parse.use==='含逗号, 的用途', '末列内嵌逗号保留');
  ck(parse.crit===true, '"是" 正确映射为勾选');
  ck(parse.next==='2027-10-01', '日期字段保留');

  console.log('\n=== ⑦ 导出按钮齐全 ===');
  for(const k of ['equip','reagent','orders','capa']){
    await p.evaluate(x=>{
      const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab===x);
      if(btn) btn.click();
    }, k);
    await p.waitForTimeout(600);
    const btns=await p.evaluate(()=>[...document.querySelectorAll('#labBody .card-h .btn')].map(b=>b.textContent.trim()));
    ck(btns.some(x=>x.indexOf('CSV')>=0), k+' 有 CSV 导出');
    ck(btns.some(x=>x.indexOf('Word')>=0), k+' 有 Word 导出');
    ck(btns.some(x=>x.indexOf('导入')>=0), k+' 有一键导入');
    ck(btns.some(x=>x.indexOf('模板')>=0), k+' 有空白模板');
  }

  console.log('\n=== ⑧ 导出实际触发 ===');
  const dl=await p.evaluate(()=>{
    const out=[];
    const orig=HTMLAnchorElement.prototype.click;
    let last=null;
    HTMLAnchorElement.prototype.click=function(){ last=this.download; };
    try{
      Ledger.exportCsv('equip');  out.push(['equip CSV',last]);
      Ledger.exportWord('equip'); out.push(['equip Word',last]);
      Ledger.exportTemplate('equip'); out.push(['equip 模板',last]);
    }catch(e){ out.push(['异常',e.message]); }
    HTMLAnchorElement.prototype.click=orig;
    return out;
  });
  dl.forEach(([k,v])=>ck(!!v && String(v).indexOf('.')>0, k+' 导出文件名：'+(v||'(未触发)')));

  console.log('\n=== ⑨ 各台账渲染无错 ===');
  for(const k of ['equip','reagent','prep','sample','flows','orders','qcplan','qcrec','pt','capa','audit','schedule','env']){
    await p.evaluate(x=>{
      const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab===x);
      if(btn) btn.click();
    }, k);
    await p.waitForTimeout(450);
    const r=await p.evaluate(()=>{
      const el=document.getElementById('labBody');
      return {rows:el.querySelectorAll('tbody tr, .lcard').length,
              inputs:el.querySelectorAll('input,select,textarea').length,
              txt:el.innerText.replace(/\s+/g,' ').length};
    });
    ck(r.rows>0 && r.inputs>0, k+' 渲染正常（'+r.rows+' 行 / '+r.inputs+' 个可编辑控件）');
  }

  console.log('\n=== ⑩ JSA 工作台 ===');
  await p.evaluate(()=>{location.hash='#jsa';});
  await p.waitForTimeout(1400);
  const jsa=await p.evaluate(()=>{
    const el=document.getElementById('jsaBody');
    return {tabs:[...el.parentElement.querySelectorAll('#jsaTabs button')].length,
            inputs:el.querySelectorAll('input,textarea').length,
            cards:el.querySelectorAll('.jsa-edit tr').length};
  });
  ck(jsa.tabs>=7, 'JSA 页签 ≥ 7 个');
  ck(jsa.inputs>50, 'JSA 可编辑控件 ≥ 50 个（实际 '+jsa.inputs+'）');
  const jsaZones=await p.evaluate(()=>window.JSAW ? window.JSAW._state().zones.length : 0);
  ck(jsaZones===7, 'JSA 7 个分区（实际 '+jsaZones+'）');
  const jsaSteps=await p.evaluate(()=>window.JSAW ?
    window.JSAW._state().zones.reduce((a,z)=>a+z.steps.length,0) : 0);
  ck(jsaSteps===48, 'JSA 48 个作业步骤（实际 '+jsaSteps+'）');

  console.log('\n=== ⑪ 主题 ===');
  const theme=await p.evaluate(()=>({
    brand:getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    gold:getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
    loaded:[...document.styleSheets].some(x=>(x.href||'').indexOf('theme.css')>=0)
  }));
  ck(theme.loaded, 'theme.css 已加载');
  ck(theme.brand.toUpperCase()==='#1B3A6B', '主色为深墨蓝');
  ck(theme.gold.toUpperCase()==='#C9A227', '强调色为翡翠金');

  console.log('\n=== ⑫ 无 JS 错误 ===');
  ck(errs.length===0, errs.length?('有错误：'+errs.join(' | ')):'全程无 JS 错误');

  console.log('\n'+'─'.repeat(52));
  console.log('  通过 '+pass+' · 失败 '+fail);
  console.log('─'.repeat(52));
  await b.close();
  process.exit(fail?1:0);
})();
