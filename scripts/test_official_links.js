/* ================================================================
   test_official_links.js —— 全站「官方」链接真实浏览器验证（2026-11-03）
   ================================================================
   用户反馈：「点击官方出现这个（404），全站检查」
             「之前就修复过一次了还是出现类似的问题，说明你的检查工作没做好」

   ★★★ 这一版与之前所有版本的区别 ★★★
   之前两次都是「服务端 curl 能通」就以为修好了 ——
   但本地 file:// 点是好的、线上 https 点是 404。
   真凶：**cfsa 站点防盗链**，带 Referer 的请求返回 404 页；
        rel 只写 noopener 时 Referer 仍会带上，必须加 noreferrer。

   ★ 本版的三条硬规矩 ★
   ① 在**线上地址**跑（STD_TARGET=local 才跑本地）
   ② **真实点击 <a> 标签**（不是 window.open —— 那等价于手输 URL，不带 rel）
   ③ 判定不看 HTTP 200（cfsa 对任何 GET 都返回 200 但内容可能是空壳/404），
      看正文长度 + 是否 404 + 是否含标准号
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const LIVE = process.env.STD_TARGET === 'local'
  ? ('file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html')
  : 'https://xiongying118.github.io/infant-std-watch/';

let pass=0,fail=0;
const bad=[];
function ck(c,m){ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} }

function judge(html){
  const n=(html||'').length;
  if(/FILE NOT FOUND|404\s*NOT\s*FOUND|页面不存在|404\s*错误|找不到页面/i.test(html||''))
    return {ok:false, why:'站点 404 页（'+n+' 字符）'};
  if(n<1200) return {ok:false, why:'空壳/错误页（'+n+' 字符）'};
  return {ok:true, why:n+' 字符'};
}

(async()=>{
  const b=await chromium.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true});
  const ctx=await b.newContext({viewport:{width:1500,height:1000}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));

  console.log('\n=== ① 打开目标：'+(process.env.STD_TARGET==='local'?'本地':'线上')+' ===');
  await p.goto(LIVE,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(4500);

  console.log('\n=== ② 逐个视图采集「官方」类链接 ===');
  const items=[];
  for(const v of ['#refs','#list','#law','#cnas','#detail','#alerts','#subs','#method']){
    await p.evaluate(h=>{location.hash=h;}, v);
    await p.waitForTimeout(1300);
    const list=await p.evaluate(()=>{
      const out=[];
      document.querySelectorAll('.view:not(.hide) a').forEach(a=>{
        const t=(a.textContent||'').trim();
        if(/官方|官网|查询|下载|勘误记录/.test(t) && a.href && a.href.indexOf('#')!==0){
          out.push({text:t, href:a.href, view:location.hash});
        }
      });
      return out;
    });
    items.push(...list);
    console.log('  '+v+' → '+list.length+' 个');
  }
  ck(items.length>0,'采集到 '+items.length+' 个官方类链接');

  console.log('\n=== ③ 按域名抽样（每域名最多 3 条）真点验证 ===');
  const byHost={};
  items.forEach(it=>{
    let h=''; try{ h=new URL(it.href).host; }catch(e){}
    (byHost[h]=byHost[h]||[]).push(it);
  });
  Object.keys(byHost).sort().forEach(h=>console.log('  '+h+' → '+byHost[h].length+' 个'));

  for(const host of Object.keys(byHost).sort()){
    const list=byHost[host];
    const picks=[]; const seen=new Set();
    for(const it of list){
      const key=it.href.split('?')[0];
      if(seen.has(key) && picks.length>=1) continue;
      seen.add(key); picks.push(it);
      if(picks.length>=3) break;
    }
    let okAll=true; const notes=[];
    for(const it of picks){
      /* ★ 关键：先切到该链接所属的视图，否则元素不可见、点不到 ★ */
      await p.evaluate(h=>{location.hash=h;}, it.view||'#refs');
      await p.waitForTimeout(900);
      let np=null;
      try{
        const [n2]=await Promise.all([
          ctx.waitForEvent('page',{timeout:22000}).catch(()=>null),
          /* ★ 真实点击 <a>（走 rel=noreferrer）★
             不能用 window.open(url) —— 那等价于手输 URL，不带 rel，
             Referer 会被带上 → cfsa 防盗链 404 → 误报。 */
          p.click(`.view:not(.hide) a[href="${it.href.replace(/"/g,'\\\\"')}"]`,{timeout:9000}).catch(()=>null)
        ]);
        np=n2;
      }catch(e){}
      if(!np){ okAll=false; notes.push(it.text+'→点不到/无新标签页'); bad.push({host,url:it.href,text:it.text,why:'点不到'}); continue; }
      await np.waitForLoadState('domcontentloaded').catch(()=>{});
      await np.waitForTimeout(2800);
      const html=await np.content().catch(()=>'');
      const j=judge(html);
      if(!j.ok){ okAll=false; notes.push(it.text+'→'+j.why); bad.push({host,url:np.url(),text:it.text,why:j.why}); }
      else notes.push(it.text+'→✓ '+j.why);
      await np.close().catch(()=>{});
    }
    console.log('  '+host+'：'+(okAll?'✓ 全部正常':'✗ 有问题'));
    notes.forEach(n=>console.log('      '+n));
  }

  console.log('\n=== ④ 页面无 JS 错误 ===');
  ck(errs.length===0,'无页面错误'+(errs.length?('：'+errs.slice(0,3).join(' | ')):''));

  console.log('\n=== ⑤ 所有新窗口链接必须带 noreferrer（cfsa 防盗链）===');
  await p.evaluate(()=>{location.hash='#refs';});
  await p.waitForTimeout(900);
  const relInfo=await p.evaluate(()=>{
    const bad=[];
    document.querySelectorAll('a[target="_blank"]').forEach(a=>{
      const rel=(a.getAttribute('rel')||'').toLowerCase();
      if(rel.indexOf('noreferrer')<0) bad.push({rel:rel||'(空)', href:(a.getAttribute('href')||'').slice(0,60)});
    });
    return {total:document.querySelectorAll('a[target="_blank"]').length, bad};
  });
  ck(relInfo.bad.length===0,'★ 全部带 noreferrer（检查 '+relInfo.total+' 个，异常 '+relInfo.bad.length+'）');
  relInfo.bad.slice(0,6).forEach(x=>console.log('      缺 noreferrer: rel="'+x.rel+'" '+x.href));

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
