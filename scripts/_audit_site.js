const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
const W=Number(process.argv[2]||1440);

const VIEWS=['home','list','law','cnas','refs','qmtools','rdtools','lab','jsa','method','subs','alerts','admin'];

(async()=>{
 const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.setViewportSize({width:W,height:1000});
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(2400);

 const issues=[];

 // 逐视图 + 逐子页签扫描
 for(const v of VIEWS){
   await p.evaluate(x=>{location.hash='#'+x;}, v);
   await p.waitForTimeout(1200);
   // 找出该视图内的所有可切换子页签
   const subs = await p.evaluate(()=>{
     const el=document.querySelector('.view:not(.hide)');
     if(!el) return [];
     const out=[];
     el.querySelectorAll('[id$="Tabs"] button, .tabs button').forEach(b=>out.push(b.textContent.trim()));
     return out;
   });
   const modes = ['__main__'];
   if(subs.length){
     // 逐个点子页签
     for(let i=0;i<subs.length;i++){
       await p.evaluate(([v,idx])=>{
         const el=document.querySelector('.view:not(.hide)');
         const bs=[...el.querySelectorAll('[id$="Tabs"] button, .tabs button')];
         if(bs[idx]) bs[idx].click();
       },[v,i]);
       await p.waitForTimeout(750);
       modes.push(subs[i]);
     }
   }
   for(const mode of modes){
     const r = await p.evaluate((mode)=>{
       const el=document.querySelector('.view:not(.hide)');
       if(!el) return null;
       const out={mode:mode, narrow:[], clipped:[], overflow:[], tiny:[]};
       // ① 被压扁的输入控件（数字框/文本框宽度 < 26px）
       el.querySelectorAll('input,select').forEach(x=>{
         const rc=x.getBoundingClientRect();
         if(rc.width>0 && rc.width<26 && x.type!=='checkbox' && x.type!=='radio'){
           out.narrow.push(x.tagName+'.'+(x.className||x.type)+' '+Math.round(rc.width)+'px');
         }
       });
       // ② 裁字的 textarea
       el.querySelectorAll('textarea').forEach(x=>{
         if(x.scrollHeight > x.clientHeight+3) out.clipped.push((x.className||'textarea')+' 显示'+x.clientHeight+'/需'+x.scrollHeight);
       });
       // ③ 元素横向溢出容器
       const host=el.getBoundingClientRect();
       el.querySelectorAll('table,.jcard,.lcard,.qwt,.ledger-cards').forEach(x=>{
         const rc=x.getBoundingClientRect();
         if(rc.width>host.width+4) out.overflow.push((x.className||x.tagName)+' '+Math.round(rc.width)+' > 容器'+Math.round(host.width));
       });
       // ④ 文字被 ellipsis 截断但没有 title（看不到全文）
       el.querySelectorAll('*').forEach(x=>{
         if(x.children.length===0 && x.scrollWidth>x.clientWidth+2 && x.clientWidth>0){
           const cs=getComputedStyle(x);
           if(cs.textOverflow==='ellipsis' && !x.getAttribute('title') && !x.closest('[title]')){
             out.tiny.push((x.className||x.tagName)+' "'+(x.textContent||'').trim().slice(0,18)+'"');
           }
         }
       });
       return out;
     }, mode);
     if(r){
       for(const k of ['narrow','clipped','overflow']){
         if(r[k].length) issues.push({view:v, mode:mode, kind:k, list:[...new Set(r[k])]});
       }
     }
   }
 }

 console.log('=== 视口宽度 '+W+'px 全站扫描 ===');
 if(!issues.length){ console.log('  ✓ 没发现压扁/裁字/溢出问题'); }
 else{
   for(const it of issues){
     const label = it.mode==='__main__'? it.view : it.view+' / '+it.mode;
     console.log('  ['+label+'] '+it.kind+':');
     it.list.slice(0,6).forEach(x=>console.log('     · '+x));
   }
 }
 console.log();
 console.log('JS 错误:', errs.length?errs.join(' | '):'无');
 await b.close();
})();
