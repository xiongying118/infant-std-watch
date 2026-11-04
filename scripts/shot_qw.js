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
  const p=await (await b.newContext({viewport:{width:1560,height:1000},deviceScaleFactor:1.4})).newPage();
  await p.goto(URL+'#qmtools',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(3500);
  for(const k of ['fishbone','spc_control_chart','histogram','pareto']){
    await p.evaluate(async key=>{
      if(typeof curQmKey!=='undefined' && curQmKey===key){ toggleQm(key); }
      else { if(typeof curQmKey!=='undefined'&&curQmKey) toggleQm(curQmKey); toggleQm(key); }
      await new Promise(r=>setTimeout(r,500));
      QW_open(key);
    }, k);
    await p.waitForTimeout(1200);
    // 关掉可能的提示弹窗
    await p.evaluate(()=>{
      const btns=[...document.querySelectorAll('button')].filter(b=>/知道了|确定|关闭/.test(b.textContent));
      btns.forEach(b=>b.click());
      document.querySelectorAll('.dlg,.mask,.modal-mask').forEach(e=>{ if(e.parentNode) e.parentNode.removeChild(e); });
    });
    await p.waitForTimeout(400);
    const el=await p.$('.view:not(.hide) [data-qw-host]');
    if(el) await el.screenshot({path:path.join(OUT,'fix_'+k+'.png')}).catch(e=>console.log(k,'截图失败'));
    console.log(k,'已截图');
  }
  await b.close();
})();
