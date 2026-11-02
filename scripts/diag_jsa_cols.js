const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';
(async()=>{
  const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await (await b.newContext({viewport:{width:1680,height:1000}})).newPage();
  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2200);
  const r=await p.evaluate(()=>{
    const body=document.querySelector('#v-jsa .jcard-body');
    const cs=getComputedStyle(body);
    const cols=[...body.children].map((c,i)=>{
      const r=c.getBoundingClientRect();
      const inp=c.querySelector('input,textarea');
      return {i, cls:c.className, w:Math.round(r.width), sw:c.scrollWidth,
              cw:c.clientWidth, minContent:c.style.minWidth,
              inpW: inp?Math.round(inp.getBoundingClientRect().width):0,
              inpMin: inp?getComputedStyle(inp).minWidth:''};
    });
    return {clientW:body.clientWidth, scrollW:body.scrollWidth,
      tmpl:cs.gridTemplateColumns, gap:cs.columnGap, cols};
  });
  console.log('容器 clientW=',r.clientW,' scrollW=',r.scrollW);
  console.log('grid 模板:',r.tmpl);
  console.log('gap:',r.gap);
  r.cols.forEach(c=>console.log('  列'+c.i,c.cls.padEnd(12),'w='+c.w,'sw='+c.sw,'cw='+c.cw,'input='+c.inpW,'inputMin='+c.inpMin));
  await b.close();
})();
