const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';
const OUT=path.join(ROOT,'prototype','_shots');
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await (await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:1.5})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);
  await p.evaluate(()=>{[...document.querySelectorAll('#jsaTabs button')].find(x=>x.dataset.jsa==='matrix').click();});
  await p.waitForTimeout(900);
  const el=await p.$('#v-jsa .card');
  await el.screenshot({path:path.join(OUT,'matrix_new.png')});
  // 取每档实际背景色
  const bg=await p.evaluate(()=>{
    const out={};
    document.querySelectorAll('#v-jsa .jsa-matrix td').forEach(td=>{
      const txt=(td.querySelector('div')||{}).textContent||'';
      const m=txt.match(/^(\d+)\s*(低|一般|中等|高)/);
      if(!m) return;
      const k=m[2];
      if(out[k]) return;
      out[k]={r:m[1], bg:getComputedStyle(td).backgroundColor,
             fg:getComputedStyle(td.querySelector('div')).color};
    });
    return out;
  });
  console.log(JSON.stringify(bg,null,1));
  console.log('错误:',errs.length?errs.slice(0,2):'无');
  await b.close();
})();
