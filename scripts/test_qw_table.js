const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const PROT=path.join(ROOT,'prototype');
const LOCAL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const URL = process.env.STD_TARGET === 'local' ? LOCAL
  : 'https://xiongying118.github.io/infant-std-watch/';
let pass=0, fail=0;
function ck(ok,msg){ if(ok){pass++;console.log('  ✓ '+msg);} else {fail++;console.log('  ✗ '+msg);} }

(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext({viewport:{width:1600,height:1100},permissions:['clipboard-read','clipboard-write']});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  /* ★ 线上访问偶发 ERR_CONNECTION_RESET（本地网络抖动）→ 自动重试 ★ */
  let navOK=false;
  for(let i=0;i<6&&!navOK;i++){
    try{
      await p.goto(URL+'#qmtools',{waitUntil:'domcontentloaded',timeout:60000});
      navOK=true;
    }catch(e){
      console.log('  (网络重试 '+(i+1)+')');
      await p.waitForTimeout(4000);
    }
  }
  if(!navOK){ console.log('网络不通，测试中止'); await b.close(); process.exit(2); }
  await p.waitForTimeout(4000);

  console.log('=== ① 所有示例数据块：表格列必须严格对齐 ===');
  const keys=await p.evaluate(()=>{
    const q=window.STDWATCH_DATA&&window.STDWATCH_DATA.QMTOOLS;
    const t=Array.isArray(q)?(q[0]||q):q;
    return (t&&t.tools||[]).map(x=>x.toolKey);
  });
  const bad=[];
  for(const k of keys){
    await p.evaluate(async key=>{
      if(typeof curQmKey!=='undefined'&&curQmKey&&curQmKey!==key) toggleQm(curQmKey);
      if(typeof curQmKey==='undefined'||curQmKey!==key) toggleQm(key);
      await new Promise(r=>setTimeout(r,400)); QW_open(key);
    }, k);
    await p.waitForTimeout(650);
    const r=await p.evaluate(()=>{
      const t=document.querySelector('.view:not(.hide) .qwg-table');
      if(!t) return {noTable:true};
      const rows=[...t.querySelectorAll('tr')];
      // 每行单元格数一致？
      const counts=rows.map(tr=>tr.querySelectorAll('th,td').length);
      const same=counts.every(c=>c===counts[0]);
      // 每一列的 left 是否所有行一致
      const cols=rows.map(tr=>[...tr.querySelectorAll('th,td')].map(c=>Math.round(c.getBoundingClientRect().left)));
      const ncol=cols[0].length;
      let aligned=true;
      for(let ci=0; ci<ncol; ci++){
        const vals=cols.map(r=>r[ci]);
        if(vals.some(v=>v!==vals[0])) aligned=false;
      }
      // 是否有表头
      const hasHead=!!t.querySelector('thead');
      return {same, aligned, ncol, rows:rows.length, hasHead};
    });
    if(r.noTable) continue;   // 该工具本来就没有表格型示例
    if(!(r.same && r.aligned)) bad.push(k+' '+JSON.stringify(r));
  }
  ck(bad.length===0, '所有表格型示例数据的列都严格对齐'+(bad.length?(' → 问题: '+bad.join(' | ')):''));

  console.log('\n=== ② HACCP 8 列（截图那张）===');
  await p.evaluate(async()=>{
    if(typeof curQmKey!=='undefined'&&curQmKey) toggleQm(curQmKey);
    toggleQm('haccp'); await new Promise(r=>setTimeout(r,500)); QW_open('haccp');
  });
  await p.waitForTimeout(1200);
  const hac=await p.evaluate(()=>{
    const t=document.querySelector('.view:not(.hide) .qwg-table');
    if(!t) return null;
    const rows=[...t.querySelectorAll('tr')];
    const head=[...rows[0].querySelectorAll('th,td')].map(c=>c.textContent.trim());
    const cols=rows.map(tr=>[...tr.querySelectorAll('th,td')].map(c=>Math.round(c.getBoundingClientRect().left)));
    return {head, ncol:cols[0].length,
            aligned: cols.every(r=>r.every((v,i)=>i===0||v===cols[0][i]))};
  });
  ck(hac && hac.ncol===8, `HACCP 表 8 列（实际 ${hac&&hac.ncol}）`);
  ck(hac && hac.aligned, 'HACCP 表每列严格对齐');
  ck(hac && hac.head.join('|')==='工序|危害类型|危害描述|是否CCP|关键限|监控方法|纠偏措施|验证方式',
     'HACCP 表头正确: '+(hac?hac.head.join('|'):''));

  console.log('\n=== ③ 复制按钮：复制出来是 TSV ===');
  const cp=await p.evaluate(async()=>{
    const btn=document.querySelector('.view:not(.hide) .qwg-copy');
    if(!btn) return {noBtn:true};
    btn.click();
    await new Promise(r=>setTimeout(r,700));
    return {clicked:true};
  });
  ck(!cp.noBtn, '有「📋 复制数据」按钮');
  let clip='';
  try{
    clip=await p.evaluate(async()=>{
      try{ return await navigator.clipboard.readText(); }catch(e){ return '(读不到:'+String(e).slice(0,40)+')'; }
    });
  }catch(e){ clip='(异常)'; }
  ck(clip.indexOf('\t')>=0, '复制出来是制表符分隔（可直接粘进 Excel 自动分列）');
  ck(clip.indexOf('危害类型')>=0 && clip.indexOf('每批取样检测')>=0, '复制内容包含表头和数据');

  console.log('\n=== ④ 鱼骨图首行是数据不是表头 ===');
  await p.evaluate(async()=>{
    if(typeof curQmKey!=='undefined'&&curQmKey) toggleQm(curQmKey);
    toggleQm('fishbone'); await new Promise(r=>setTimeout(r,500)); QW_open('fishbone');
  });
  await p.waitForTimeout(1000);
  const fb=await p.evaluate(()=>{
    const t=document.querySelector('.view:not(.hide) .qwg-table');
    if(!t) return null;
    return {hasHead:!!t.querySelector('thead'),
            firstRow:[...t.querySelectorAll('tbody tr:first-child td')].map(c=>c.textContent.trim())};
  });
  ck(fb && fb.hasHead===false, '鱼骨图没有表头行（首行是数据）');
  ck(fb && fb.firstRow[0]==='人', '鱼骨图首行数据完整: '+(fb?fb.firstRow.join('|'):''));

  console.log('\n=== ⑤ 纯文本示例（SPC 数值序列）没被误转成表格 ===');
  await p.evaluate(async()=>{
    if(typeof curQmKey!=='undefined'&&curQmKey) toggleQm(curQmKey);
    toggleQm('spc_control_chart'); await new Promise(r=>setTimeout(r,500)); QW_open('spc_control_chart');
  });
  await p.waitForTimeout(1000);
  const sp=await p.evaluate(()=>{
    const host=document.querySelector('.view:not(.hide) [data-qw-host]');
    return {hasTable: !!host.querySelector('.qwg-table'),
            hasPre: !!host.querySelector('.qwg-pre'),
            preTxt: (host.querySelector('.qwg-pre')||{}).textContent||''};
  });
  ck(sp.hasPre===true && sp.hasTable===false, 'SPC 的数值序列仍是纯文本块');
  ck(sp.preTxt.indexOf('3.21')>=0, 'SPC 数值内容完整');

  console.log('\n=== ⑥ 窄屏不横向溢出 ===');
  await p.setViewportSize({width:420,height:900});
  await p.waitForTimeout(700);
  const ov=await p.evaluate(()=>{
    const w=document.querySelector('.view:not(.hide) .qwg-tablewrap');
    const pr=document.querySelector('.view:not(.hide) .qwg-pre');
    const host=document.querySelector('.view:not(.hide) [data-qw-host]');
    return {
      wrapOverflow: w? (w.scrollWidth>w.clientWidth) : null,
      preOverflow: pr? (pr.scrollWidth>pr.clientWidth+2) : null,
      hostOverflow: host? (host.scrollWidth>host.clientWidth+2) : null
    };
  });
  ck(ov.wrapOverflow===true || ov.wrapOverflow===null, '表格在窄屏内部横向滚动（不撑破卡片）');
  ck(ov.preOverflow===false || ov.preOverflow===null, '纯文本块不横向溢出');
  ck(ov.hostOverflow===false || ov.hostOverflow===null, '工具卡片整体不被撑破');

  console.log('\n=== ⑦ 无 JS 错误 ===');
  ck(errs.length===0, '页面无 JS 错误'+(errs.length?('：'+errs.slice(0,2).join(' | ')):''));

  console.log('\n=== 汇总 ===');
  console.log('  通过 '+pass+' / 失败 '+fail);
  await b.close();
  process.exit(fail?1:0);
})();
