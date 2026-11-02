const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';
const OUT=path.join(ROOT,'prototype','_shots');
(async()=>{
  const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1.5});
  const p=await ctx.newPage();
  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);
  await p.screenshot({path:path.join(OUT,'jsa_2026-11-02.png'),fullPage:false});
  // 分区列表
  await p.evaluate(()=>{document.querySelector('#v-jsa .jcard-body').scrollIntoView({block:'center'});});
  await p.waitForTimeout(400);
  await p.screenshot({path:path.join(OUT,'jsa_row_2026-11-02.png'),fullPage:false});
  // 确认卡
  await p.evaluate(()=>{[...document.querySelectorAll('#jsaTabs button')].find(x=>x.dataset.jsa==='precheck').click();});
  await p.waitForTimeout(600);
  await p.screenshot({path:path.join(OUT,'jsa_precheck_2026-11-02.png'),fullPage:false});
  // 责任矩阵
  await p.evaluate(()=>{[...document.querySelectorAll('#jsaTabs button')].find(x=>x.dataset.jsa==='owners').click();});
  await p.waitForTimeout(600);
  await p.screenshot({path:path.join(OUT,'jsa_owners_2026-11-02.png'),fullPage:false});
  // 导航
  await p.goto(URL+'#home',{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  await p.screenshot({path:path.join(OUT,'nav_2026-11-02.png'),clip:{x:0,y:0,width:300,height:700}});
  await b.close();
  console.log('截图完成');
})();
