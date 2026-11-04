const {chromium}=require('playwright-core');
const path=require('path');
const fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
const PROT=path.join(ROOT,'prototype');
const URL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const OUT=path.join(PROT,'_shots');
(async()=>{
  if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await (await b.newContext({viewport:{width:1560,height:1200},deviceScaleFactor:1.4})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL+'#qmtools',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(4000);
  // HACCP 工具
  await p.evaluate(async()=>{
    if(typeof curQmKey!=='undefined'&&curQmKey) toggleQm(curQmKey);
    toggleQm('haccp'); await new Promise(r=>setTimeout(r,600)); QW_open('haccp');
  });
  await p.waitForTimeout(1500);
  const el=await p.$('.view:not(.hide) [data-qw-host]');
  if(el) await el.screenshot({path:path.join(OUT,'tbl_haccp.png')});
  // 统计一下各列 x 坐标是否一致
  const cols=await p.evaluate(()=>{
    const t=document.querySelector('.view:not(.hide) .qwg-table');
    if(!t) return null;
    const rows=[...t.querySelectorAll('tr')];
    return rows.map(tr=>[...tr.querySelectorAll('th,td')].map(c=>Math.round(c.getBoundingClientRect().left)));
  });
  console.log('各行单元格左边界:', JSON.stringify(cols));
  const aligned = cols && cols.every(r=>r.every((x,i)=>i===0||x===r[0]));
  console.log('列对齐:', aligned);
  console.log('JS错误:', errs.slice(0,3));
  await b.close();
})();
