const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';
(async()=>{
  const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await (await b.newContext({viewport:{width:1680,height:1000}})).newPage();
  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2000);
  const r=await p.evaluate(()=>{
    const raw=window.STDWATCH_DATA.JSA[0];
    raw.__v=1;
    raw.zones=raw.zones.slice(0,7);
    raw.zones[1].steps[0].step='【用户改过的步骤名】';
    window.Store.set('jsa.work', raw);
    return {
      rawSids: raw.zones.slice(0,3).map(z=>z.steps.slice(0,3).map(s=>({t:s.step, sid:s.sid||'(无)'}))),
      rawZoneLens: raw.zones.map(z=>(z.steps||[]).length),
      rawTotal: raw.zones.reduce((a,z)=>a+(z.steps||[]).length,0),
      fullZoneLens: window.STDWATCH_DATA.JSA[0].zones.map(z=>(z.steps||[]).length),
      fullTotal: window.STDWATCH_DATA.JSA[0].zones.reduce((a,z)=>a+(z.steps||[]).length,0)
    };
  });
  console.log('raw 前7区步数:',r.rawZoneLens,'总:',r.rawTotal);
  console.log('完整 18 区步数:',r.fullZoneLens,'总:',r.fullTotal);
  console.log('前几区步骤 sid:');
  r.rawSids.forEach((z,i)=>z.forEach(s=>console.log('  区'+i,s.t,'| sid=',s.sid)));
  await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(2000);
  const after=await p.evaluate(()=>{
    const s=window.Store.get('jsa.work',null);
    return {
      lens:s.zones.map(z=>(z.steps||[]).length),
      total:s.zones.reduce((a,z)=>a+(z.steps||[]).length,0),
      z1s0:{step:s.zones[1].steps[0].step, sid:s.zones[1].steps[0].sid||'(无)'},
      z1all:s.zones[1].steps.map(x=>x.step+' | '+(x.sid||'(无)'))
    };
  });
  console.log('合并后各区步数:',after.lens,'总:',after.total);
  console.log('区1第0条:',after.z1s0);
  console.log('区1全部:'); after.z1all.forEach(x=>console.log('   ',x));
  await b.close();
})();
