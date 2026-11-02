const {chromium}=require('playwright-core');
const U='https://xiongying118.github.io/infant-std-watch/index.html';
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';

async function run(url, label){
 const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.setViewportSize({width:1440,height:1000});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url,{waitUntil:'networkidle',timeout:60000});
 await p.waitForTimeout(2500);
 console.log('===== '+label+' =====');
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 console.log('标题:', await p.title());
 const th = await p.evaluate(()=>{
   const cs=getComputedStyle(document.documentElement);
   return {brand:cs.getPropertyValue('--brand').trim(), gold:cs.getPropertyValue('--gold').trim(),
           sideW:Math.round(document.querySelector('.side').getBoundingClientRect().width),
           theme: !!([...document.styleSheets].find(x=>(x.href||'').indexOf('theme.css')>=0))};
 });
 console.log('主题:', th.theme?'theme.css 已加载':'✗ 没加载', '· 主色', th.brand, '· 强调', th.gold, '· 侧栏', th.sideW+'px');
 console.log('导航分组:', await p.evaluate(()=>[...document.querySelectorAll('.nav .nav-label')].map(l=>l.textContent.trim()).join(' → ')));
 console.log('徽标:', await p.evaluate(()=>{
   const out=[];
   document.querySelectorAll('.nav a .badge').forEach(bd=>{
     const a=bd.closest('a'); out.push((a.querySelector('.tx')||a).innerText.trim().replace(/\n/g,' ')+'='+bd.textContent);
   });
   return out.join(' | ');
 }));
 // 各视图内容量
 for(const v of ['home','list','law','cnas','refs','qmtools','rdtools','lab','jsa','method','subs','alerts','admin']){
   await p.evaluate(x=>{location.hash='#'+x;}, v);
   await p.waitForTimeout(900);
   const r = await p.evaluate(()=>{
     const el=document.querySelector('.view:not(.hide)');
     if(!el) return null;
     return {id:el.id, txt:el.innerText.replace(/\s+/g,' ').trim().length,
             inputs:el.querySelectorAll('input,select,textarea').length,
             btns:el.querySelectorAll('button,.btn').length,
             svgs:el.querySelectorAll('svg').length, rows:el.querySelectorAll('tbody tr').length};
   });
   if(r) console.log('  '+r.id.padEnd(9)+' 文字'+String(r.txt).padStart(6)+'  输入'+String(r.inputs).padStart(4)+'  按钮'+String(r.btns).padStart(4)+'  图'+String(r.svgs).padStart(3)+'  行'+String(r.rows).padStart(4));
 }
 console.log('JS 错误(累计):', errs.length?errs.join(' | '):'无');
 await b.close();
}
(async()=>{
 await run(U,'线上');
})();
