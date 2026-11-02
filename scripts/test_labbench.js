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

  console.log('\n=== ⑤ 联动看板（独立页签「需要处理」）===');
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='board');
    if(btn) btn.click();
  });
  await p.waitForTimeout(800);
  const board=await p.evaluate(()=>{
    const el=document.getElementById('labBody');
    const hs=[...el.querySelectorAll('.card-h h3')].map(h=>h.textContent);
    if(!hs.some(x=>x.indexOf('需要处理')>=0)) return null;
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

  console.log('\n=== ⑫ LAB 公开 API 完整性（防误删同级函数）===');
  /* 2026-11-02 教训：用脚本替换某个函数时把中间 17 个函数一起删了，
     页面直接白屏（setCap is not defined）。这里逐个点名断言。 */
  const API=['render','pickMethod','filterMethods','setManualField','cancelManual',
    'addManualMethod','methodOptions','setRec','setSign','openMethod',
    'setCap','addCapability','delCap',
    'exportCapability','exportEquip','exportReagent','exportSample',
    'exportQCPlan','exportQCRec','exportPT','exportRecord','printRecord'];
  const missing=await p.evaluate((list)=>list.filter(k=>typeof window.LAB[k]!=='function'), API);
  ck(missing.length===0, missing.length?
      ('LAB 缺少这些 API：'+missing.join(', ')):
      ('LAB 公开 API '+API.length+' 个齐全'));
  /* 内部函数没导出到 window，但必须在源码里存在 ——
     2026-11-02 我替换 pickMethod 时把中间 17 个函数一起删了。 */
  const src=fs.readFileSync(path.join(ROOT,'prototype','labbench.js'),'utf8');
  const INNER=['capData','saveCap','dl','linkBoard','boardView','prependBoard'];
  const gone=INNER.filter(k=>src.indexOf('function '+k+'(')<0);
  ck(gone.length===0, gone.length?
      ('labbench.js 里这些函数不见了：'+gone.join(', ')):
      ('内部函数 '+INNER.length+' 个都在源码里'));

  console.log('\n=== ⑬ 原始记录生成器 · 方法选择器 ===');
  await p.evaluate(()=>{location.hash='#lab';});
  await p.waitForTimeout(900);
  await p.evaluate(()=>{
    const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='record');
    if(b)b.click();
  });
  await p.waitForTimeout(900);
  const mo=await p.evaluate(()=>{
    const o=window.LAB.methodOptions();
    const nos=o.map(x=>String(x.no).replace(/\s+/g,'').toUpperCase());
    return {
      total:o.length,
      groups:new Set(o.map(x=>x.group||'其它')).size,
      tongze:o.filter(x=>x.src.indexOf('通则')>=0).length,
      expired:['GB5413.17-2010','GB5413.16-2010','GB5413.12-2010','GB5413.14-2010',
               'GB5413.19-2010','GB4789.3-2016','GB4789.4-2016','GB5009.89-2016']
               .filter(x=>nos.indexOf(x)>=0),
      dupText:o.filter(x=>x.method && x.method.indexOf(String(x.no).replace(/\s/g,''))===0).length
    };
  });
  ck(mo.total>=70, '方法清单 ≥ 70 个（实际 '+mo.total+'）');
  ck(mo.tongze>=55, '通则方法已加入 ≥ 55 条（实际 '+mo.tongze+'）');
  ck(mo.expired.length===0, mo.expired.length?
      ('过期方法还在：'+mo.expired.join(', ')):
      '8 个被替代的旧版本已全部剔除');
  ck(mo.dupText===0, '选项文字不重复标准号');

  // 选中后能保持（原来会跳回占位符）
  const keep=await p.evaluate(async ()=>{
    const s=document.getElementById('recMethod');
    if(!s) return {err:'没有 recMethod'};
    const opt=[...s.options].find(o=>o.value && o.value!=='__manual__');
    if(!opt) return {err:'没有可选方法'};
    s.value=opt.value;
    s.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,600));
    const s2=document.getElementById('recMethod');
    return {picked:opt.value, now:s2?s2.value:'(无)',
            rows:document.querySelectorAll('#labBody tbody tr').length};
  });
  ck(!keep.err && keep.now===keep.picked,
     '选中方法后重渲染仍保持选中（原来会跳回「— 选择方法 —」）');
  ck(keep.rows>0, '选中后生成了原始记录表（'+keep.rows+' 行）');

  // 人工添加
  const man=await p.evaluate(async ()=>{
    const s=document.getElementById('recMethod');
    s.value='__manual__';
    s.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,600));
    const hasForm=!!document.getElementById('mNo');
    window.LAB.setManualField('no','GB/T 9999-2026');
    window.LAB.setManualField('title','企业内部方法');
    window.LAB.addManualMethod();
    await new Promise(r=>setTimeout(r,800));
    const s2=document.getElementById('recMethod');
    return {hasForm:hasForm, val:s2?s2.value:'(无)',
            rows:document.querySelectorAll('#labBody tbody tr').length};
  });
  ck(man.hasForm, '「✏️ 人工添加方法」能打开输入表单');
  ck(man.val.indexOf('__m')===0, '人工添加的方法能选中并出表（'+man.val+'）');

  console.log('\n=== ⑭ 「需要处理」不重复出现在各台账页 ===');
  const dupTabs=[];
  for(const t2 of ['capability','equip','reagent','sample','orders','capa','audit','env']){
    await p.evaluate(x=>{
      const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab===x);
      if(b)b.click();
    }, t2);
    await p.waitForTimeout(600);
    const n=await p.evaluate(()=>[...document.querySelectorAll('#labBody .card-h h3')]
      .filter(h=>h.textContent.indexOf('需要处理')>=0).length);
    if(n>0) dupTabs.push(t2);
  }
  ck(dupTabs.length===0, dupTabs.length?
      ('这些页还出现「需要处理」：'+dupTabs.join(', ')):
      '各台账页不再重复出现「需要处理」');
  const boardTab=await p.evaluate(()=>{
    const b=[...document.querySelectorAll('#labTabs button')].find(y=>y.dataset.lab==='board');
    return b?b.textContent.trim():'(无)';
  });
  ck(boardTab.indexOf('需要处理')===0, '「需要处理」是独立页签（'+boardTab+'）');

  console.log('\n=== ⑫ 无 JS 错误 ===');
  ck(errs.length===0, errs.length?('有错误：'+errs.join(' | ')):'全程无 JS 错误');

  console.log('\n'+'─'.repeat(52));
  console.log('  通过 '+pass+' · 失败 '+fail);
  console.log('─'.repeat(52));
  await b.close();
  process.exit(fail?1:0);
})();
