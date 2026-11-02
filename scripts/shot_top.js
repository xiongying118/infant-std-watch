const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';
const OUT=path.join(ROOT,'prototype','_shots');
(async()=>{
  const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1.5});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error') errs.push(m.text());});
  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);

  const at = async()=>p.evaluate(()=>{
    const br=document.querySelector('.topbrand');
    const t=document.querySelector('#pgTitle');
    const tr=t.getBoundingClientRect();
    const brr=br.getBoundingClientRect();
    return {
      y:Math.round(window.pageYOffset),
      brandTop:Math.round(brr.top),
      brandH:Math.round(brr.height),
      titleTop:Math.round(tr.top),
      titleVisible:(tr.top>=0 && tr.top<120),
      sticky:getComputedStyle(document.querySelector('.top')).position
    };
  });
  console.log('顶部:',JSON.stringify(await at()));
  await p.evaluate(()=>window.scrollTo(0,900));
  await p.waitForTimeout(700);
  console.log('滚动900:',JSON.stringify(await at()));
  await p.screenshot({path:path.join(OUT,'top_scroll.png'),clip:{x:0,y:0,width:1600,height:200}});
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.waitForTimeout(700);
  console.log('回顶部:',JSON.stringify(await at()));
  await p.screenshot({path:path.join(OUT,'top_top.png'),clip:{x:0,y:0,width:1600,height:200}});
  console.log('错误:',errs.length?errs.slice(0,3):'无');
  await b.close();
})();
