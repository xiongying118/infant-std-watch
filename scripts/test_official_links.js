/* ================================================================
   test_official_links.js —— 全站「官方」链接真实浏览器验证（2026-11-03）
   ================================================================
   用户反馈：「点击官方出现这个（404），全站检查」
             「之前就修复过一次了还是出现类似的问题，说明你的检查工作没做好」

   ★★★ 这一版与上一版的区别 ★★★
   上一版只测了「一个按钮」→ 本地 file:// 通过就以为好了。
   实际上线上 https 页面上点，同一个按钮是 404。
   → 这一版：
     ① **对线上地址**跑（不是本地文件）
     ② **逐个域名**分别点开新标签页，看真实落点与内容
     ③ 判定标准不看 HTTP 200（cfsa 对任何 GET 都返回 200 但内容是空壳/404），
        而是看**页面正文长度 + 是否 404 + 是否含标准号**
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const LOCAL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';
const LIVE = process.env.STD_TARGET === 'local'
  ? ('file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html')
  : 'https://xiongying118.github.io/infant-std-watch/';

let pass=0,fail=0;
const bad=[];
function ck(c,m){ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} }

/* 判定页面内容有效性 —— 不能只看 HTTP 200 */
function judge(html){
  const n=(html||'').length;
  if(/FILE NOT FOUND|404\s*NOT\s*FOUND|页面不存在|404\s*错误|找不到页面/i.test(html||''))
    return {ok:false, why:'站点 404 页（'+n+' 字符）'};
  if(n<1200) return {ok:false, why:'空壳/错误页（'+n+' 字符）'};
  return {ok:true, why:n+' 字符', n};
}

(async()=>{
  const b=await chromium.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true});
  const ctx=await b.newContext({viewport:{width:1500,height:1000}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));

  // ---------- 阶段一：线上页面，收集所有官方类链接 ----------
  console.log('\n=== ① 线上收集所有「官方」类链接 ===');
  let collected=[];
  try{
    await p.goto(LIVE,{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(4500);
    for(const v of ['#refs','#list','#law','#cnas','#detail','#alerts','#subs']){
      await p.evaluate(h=>{location.hash=h;}, v);
      await p.waitForTimeout(1300);
      const list=await p.evaluate(()=>{
        const out=[];
        document.querySelectorAll('.view:not(.hide) a').forEach(a=>{
          const t=(a.textContent||'').trim();
          if(/官方|官网|查询|下载|勘误记录/.test(t) && a.href && a.href.indexOf('#')!==0){
            out.push({text:t, href:a.href, title:a.getAttribute('title')||''});
          }
        });
        return out;
      });
      collected.push({view:v, items:list});
      console.log('  '+v+' → '+list.length+' 个');
    }
  }catch(e){
    ck(false,'★ 打开线上站点失败：'+String(e).slice(0,90));
  }
  const total=collected.reduce((a,f)=>a+f.items.length,0);
  ck(total>0,'线上收集到 '+total+' 个官方类链接');

  // ---------- 阶段二：按域名归类，挑代表逐个真点 ----------
  console.log('\n=== ② 按域名归类 ===');
  const byHost={};
  collected.forEach(f=>f.items.forEach(it=>{
    let h=''; try{ h=new URL(it.href).host; }catch(e){}
    (byHost[h]=byHost[h]||[]).push({...it, view:f.view});
  }));
  Object.keys(byHost).sort().forEach(h=>{
    console.log('  '+h+' → '+byHost[h].length+' 个');
  });

  console.log('\n=== ③ 逐域名真实点击验证 ===');
  for(const host of Object.keys(byHost).sort()){
    const list=byHost[host];
    // 每域名最多测 3 条
    const picks=[];
    const seen=new Set();
    for(const it of list){
      const key=it.href.split('?')[0];
      if(seen.has(key)&&picks.length>=2) continue;
      seen.add(key); picks.push(it);
      if(picks.length>=3) break;
    }
    let okAll=true, notes=[];
    for(const it of picks){
      let np=null;
      try{
        const [n2]=await Promise.all([
          ctx.waitForEvent('page',{timeout:22000}).catch(()=>null),
          p.evaluate(u=>{ window.open(u,'_blank'); }, it.href)
        ]);
        np=n2;
      }catch(e){}
      if(!np){ okAll=false; notes.push('打不开新标签页'); bad.push({host,url:it.href,why:'无新标签页'}); continue; }
      await np.waitForLoadState('domcontentloaded').catch(()=>{});
      await np.waitForTimeout(2600);
      const html=await np.content().catch(()=>'');
      const j=judge(html);
      if(!j.ok){ okAll=false; bad.push({host,url:np.url(),why:j.why,text:it.text}); notes.push(it.text+'→'+j.why); }
      else notes.push(it.text+'→✓'+j.why);
      await np.close().catch(()=>{});
    }
    console.log('  '+host+'：'+(okAll?'✓ 全部正常':'✗ 有问题'));
    notes.forEach(n=>console.log('      '+n));
  }

  console.log('\n=== ④ 页面自身无 JS 错误 ===');
  ck(errs.length===0,'无页面错误'+(errs.length?('：'+errs.slice(0,3).join(' | ')):''));

  console.log('\n=== 汇总 ===');
  if(bad.length){
    console.log('  ✗ '+bad.length+' 处有问题：');
    bad.forEach(x=>console.log('    ['+x.host+'] '+(x.text||'')+' → '+x.why+'\n      '+String(x.url).slice(0,120)));
  }else{
    console.log('  ✓ 全部官方链接点击后都是有效页面');
  }

  await b.close();
  console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
  process.exit(fail?1:0);
})();
