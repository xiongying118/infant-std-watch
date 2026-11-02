const {chromium}=require('playwright-core');
const U='https://xiongying118.github.io/infant-std-watch/index.html';
const VIEWS=['home','list','law','cnas','refs','subs','qmtools','rdtools','jsa','method','alerts','admin'];
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(U,{waitUntil:'networkidle',timeout:60000});
 await p.waitForTimeout(2500);
 console.log('=== 各视图内容量 ===');
 for(const v of VIEWS){
   await p.evaluate(x=>{location.hash='#'+x;}, v);
   await p.waitForTimeout(1100);
   const r = await p.evaluate(()=>{
     const el=document.querySelector('.view:not(.hide)');
     if(!el) return null;
     return {
       id: el.id,
       txt: el.innerText.replace(/\s+/g,' ').trim().length,
       cards: el.querySelectorAll('.card,.qmcard,.rdcard,.row,.item,.tile,.alert,.law,.std').length,
       inputs: el.querySelectorAll('input,select,textarea,button').length,
       svgs: el.querySelectorAll('svg').length,
       tables: el.querySelectorAll('table').length,
       empty: el.innerText.replace(/\s+/g,' ').trim().length < 80
     };
   });
   if(r) console.log('  '+r.id.padEnd(12)+' 文字'+String(r.txt).padStart(6)+'  块'+String(r.cards).padStart(4)+'  控件'+String(r.inputs).padStart(4)+'  图'+r.svgs+'  表'+r.tables+(r.empty?'   ← 近乎空白':''));
 }
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
