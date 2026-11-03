const {chromium}=require('playwright-core');
const path=require('path');
const URL='https://xiongying118.github.io/infant-std-watch/';
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error') errs.push('console: '+m.text());});
  await p.goto(URL+'#jsa',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(3000);
  const r=await p.evaluate(()=>{
    const d=window.STDWATCH_DATA.JSA[0];
    const zones=d.zones;
    const st=window.JSAW?window.JSAW._state():null;
    const tb=document.querySelector('.top');
    const br=document.querySelector('.topbrand');
    const card=document.querySelector('#v-jsa .jcard');
    const body=card?card.querySelector('.jcard-body'):null;
    return {
      nav:[...document.querySelectorAll('.nav a .tx')].map(x=>x.textContent.trim()).filter(t=>t.indexOf('日常')>=0),
      hasOld:document.body.innerText.indexOf('日常台账')>=0,
      alertBtn:!!document.querySelector('#alertBtn'),
      brandCenter:(()=>{const g=br.getBoundingClientRect(),m=document.querySelector('.main').getBoundingClientRect();return Math.round(g.left+g.width/2-m.left-m.width/2);})(),
      topSticky:getComputedStyle(tb).position,
      jsaZones:zones.length, jsaSteps:zones.reduce((a,z)=>a+z.steps.length,0),
      liveZones:st?st.zones.length:0, liveSteps:st?st.zones.reduce((a,z)=>a+z.steps.length,0):0,
      kpi:document.querySelector('#v-jsa .kpi .v')?document.querySelector('#v-jsa .kpi .v').textContent.trim():'',
      tabs:[...document.querySelectorAll('#jsaTabs button')].map(x=>x.textContent.trim()),
      overflow: body? (body.scrollWidth-body.clientWidth) : -1,
      cols: body? body.children.length : 0
    };
  });
  console.log(JSON.stringify(r,null,1));
  console.log('JS 错误:',errs.length?errs.slice(0,3):'无');
  await b.close();
})();
