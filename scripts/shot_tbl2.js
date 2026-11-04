const {chromium}=require('playwright-core');
const path=require('path');
const fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
const PROT=path.join(ROOT,'prototype');
const URL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const OUT=path.join(PROT,'_shots');
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await (await b.newContext({viewport:{width:1560,height:1200},deviceScaleFactor:1.6})).newPage();
  await p.goto(URL+'#qmtools',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(4000);
  for(const k of ['haccp','checklist','poka_yoke','fishbone']){
    await p.evaluate(async key=>{
      if(typeof curQmKey!=='undefined'&&curQmKey) toggleQm(curQmKey);
      toggleQm(key); await new Promise(r=>setTimeout(r,600)); QW_open(key);
    }, k);
    await p.waitForTimeout(1400);
    const el=await p.$('.view:not(.hide) .qwg-tablewrap');
    if(el) await el.screenshot({path:path.join(OUT,'T_'+k+'.png')}).catch(e=>console.log(k,e.message));
    else {
      const el2=await p.$('.view:not(.hide) .qwg-pre');
      if(el2) await el2.screenshot({path:path.join(OUT,'T_'+k+'.png')}).catch(e=>console.log(k,e.message));
    }
    console.log(k,'截图完成');
  }
  await b.close();
})();
