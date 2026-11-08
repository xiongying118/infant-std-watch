/* ================================================================
   2026-11-08 第五轮回归：全站「字看不全」巡检 + 通则引用标准「全部」页签

   背景：上一轮只验了 documentElement.scrollWidth 和默认视图，
   方法卡片**展开态**的试剂表被 .view table{min-width:520px} 撑到 520px、
   外层 div 又是 overflow:hidden → 390 视口右半截 154px 文字全看不到，
   而默认态测试 64/64 全绿。所以这里必须覆盖「展开态 + 文字实际边界」。

   跑法：
     NODE_PATH=<playwright 路径> node scripts/test_clip_20261108.js
   默认验线上；STD_TARGET=local 验本地 file://
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');
const PROT=path.resolve(__dirname,'..','prototype');
const LOCAL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const URL=process.env.STD_TARGET==='local'?LOCAL
  :'https://xiongying118.github.io/infant-std-watch/';
const EXE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HASHES=['#home','#refs','#list','#law','#cnas','#subs','#jsa','#lab','#method','#qmtools','#rdtools','#alerts','#admin'];
let pass=0,fail=0,errs=[];
function ck(ok,msg){ if(ok){pass++;console.log('  ✓ '+msg);}else{fail++;console.log('  ✗ '+msg);} }
async function gotoRetry(p,url){
  for(let i=0;i<6;i++){
    try{ await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000}); return true; }
    catch(e){ console.log('  (网络重试 '+(i+1)+')'); await p.waitForTimeout(4000); }
  }
  return false;
}

/* 文字元素右边界是否越出视口 / 被裁。
   只查「含直接文本」的元素，避开 .kpi::after 装饰圆造成的容器 scrollWidth 误报。 */
const TEXT_EDGE=()=>{
  const iw=innerWidth, bad=[];
  const roots=document.querySelectorAll('.view:not(.hide) *');
  for(const el of roots){
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden') continue;
    if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) continue;
    if(cs.textOverflow==='ellipsis') continue;          // 刻意省略（顶栏/导航）
    const r=el.getBoundingClientRect();
    if(r.width<8||r.height<6) continue;
    const over=Math.round(r.right-iw);
    const selfClip=el.scrollWidth>el.clientWidth+3 &&
                   (cs.overflowX==='hidden'||cs.overflowX==='clip');
    /* ★ 祖先链决定「看不到」还是「可以滑过去看」：
       .twrap / .jcard-body 这类 overflow-x:auto 的横向滚动容器是既定设计
       （宽表格 9 列在 390px 屏不可能折行），用户左右滑就能看到全部文字，
       不算裁切；只有被 overflow:hidden 祖先吃掉、且没有任何可滚祖先的，
       才是用户永远看不到的字（方法详情试剂表原来就是这种）。 */
    let scrollable=null, anc=null, p=el.parentElement;
    while(p&&p!==document.body){
      const s=getComputedStyle(p), ox=s.overflowX;
      if(ox==='auto'||ox==='scroll'){ scrollable=(p.className||p.tagName).toString().slice(0,30); break; }
      if((ox==='hidden'||ox==='clip') && p.getBoundingClientRect().right<r.right-2 && !anc)
        anc=(p.className||p.tagName).toString().slice(0,40);
      p=p.parentElement;
    }
    if(scrollable) continue;                       // 可横滚 → 跳过
    if(over>2||selfClip||anc){
      bad.push({cls:(el.className||el.tagName).toString().slice(0,40),
        over,selfClip,anc,txt:(el.innerText||'').slice(0,45).replace(/\n/g,' / ')});
    }
  }
  return {iw,sw:document.documentElement.scrollWidth,bad:bad.slice(0,8),n:bad.length};
};

(async()=>{
  const b=await chromium.launch({executablePath:EXE,headless:true});

  /* ── ① 三视口 × 13 视图（默认态 + 方法展开态） ── */
  for(const W of [1440,1080,390]){
    const p=await b.newPage({viewport:{width:W,height:900}});
    p.on('pageerror',e=>errs.push('W'+W+': '+e.message));
    if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通，测试中止');await b.close();process.exit(2);}
    await p.waitForTimeout(1800);
    console.log('\n=== ① 视口 '+W+'px · 13 视图 + 方法展开态 ===');
    for(const h of HASHES){
      await p.evaluate(hh=>{location.hash=hh;},h);
      await p.waitForTimeout(320);
      let r=await p.evaluate(TEXT_EDGE);
      let tag=h;
      if(h==='#method'){
        await p.evaluate(()=>{
          document.querySelectorAll('.mcard .hd').forEach(x=>{
            if(!x.parentElement.querySelector('.dt')) x.click();
          });
        });
        await p.waitForTimeout(380);
        r=await p.evaluate(TEXT_EDGE); tag='#method [18 张卡片全展开]';
      }
      ck(r.sw<=r.iw+1 && r.n===0,
         tag+' 文字无裁切（doc '+r.sw+'/'+r.iw+' · 越界 '+r.n+'）'+
         (r.n?' :: '+JSON.stringify(r.bad[0]):''));
    }
    /* 试剂表本身也必须完整可见：不超宽、每个单元格文字不裁 */
    const rt=await p.evaluate(()=>{
      const ts=[...document.querySelectorAll('#methodList table.rt')];
      const cells=[...document.querySelectorAll('#methodList table.rt td')];
      return {n:ts.length,
        tableOver:ts.filter(t=>t.scrollWidth>t.clientWidth+2).length,
        cellClip:cells.filter(c=>c.scrollWidth>c.clientWidth+2).length,
        maxRight:Math.max(0,...cells.map(c=>Math.round(c.getBoundingClientRect().right-innerWidth)))};
    });
    ck(rt.n>0,'方法试剂表已渲染（'+rt.n+' 张）');
    ck(rt.tableOver===0&&rt.cellClip===0&&rt.maxRight<=2,
       '试剂表文字完整可见（表超宽 '+rt.tableOver+' · 单元格裁切 '+rt.cellClip+' · 右越界 '+rt.maxRight+'）');
    await p.close();
  }

  /* ── ② 吸顶栏不透明（不再透出半行模糊字） ── */
  {
    const p=await b.newPage({viewport:{width:1440,height:900}});
    p.on('pageerror',e=>errs.push('top: '+e.message));
    if(!(await gotoRetry(p,URL+'#method'))){console.log('网络不通，测试中止');await b.close();process.exit(2);}
    await p.waitForTimeout(1500);
    console.log('\n=== ② 吸顶栏 ===');
    const top=await p.evaluate(()=>{
      const cs=getComputedStyle(document.querySelector('.top'));
      return {bg:cs.backgroundColor,blur:cs.backdropFilter||cs.webkitBackdropFilter||'none',pos:cs.position};
    });
    ck(!/rgba\([^)]*,\s*0?\.\d+\)/.test(top.bg),'顶栏背景不透明（'+top.bg+'）');
    ck(top.blur==='none','去掉毛玻璃，内容不再透出半行字（'+top.blur+'）');
    ck(top.pos==='sticky','顶栏仍吸顶');
    await p.close();
  }

  /* ── ③ 通则引用标准「全部」页签 ── */
  {
    const p=await b.newPage({viewport:{width:1440,height:900}});
    p.on('pageerror',e=>errs.push('refs: '+e.message));
    if(!(await gotoRetry(p,URL+'#refs'))){console.log('网络不通，测试中止');await b.close();process.exit(2);}
    await p.waitForTimeout(1600);
    console.log('\n=== ③ 通则引用标准 · 全部页签 ===');
    const t0=await p.evaluate(()=>{
      const bs=[...document.querySelectorAll('#refTabs button')];
      return {n:bs.length,first:bs[0]?bs[0].textContent.trim():'',
        firstOn:bs[0]?bs[0].classList.contains('on'):false,
        secondOn:bs[1]?bs[1].classList.contains('on'):false,
        cards:document.querySelectorAll('#refBox .card').length,
        groups:typeof REFGROUPS!=='undefined'?REFGROUPS.length:-1};
    });
    ck(t0.first.startsWith('全部'),'第一位置是「全部」（'+t0.first+'）');
    ck(t0.n===t0.groups+1,'页签总数 = 分组数 + 1（'+t0.n+' / '+(t0.groups+1)+'）');
    ck(t0.secondOn&&!t0.firstOn,'默认仍选中第一组（照用户截图，未改选中态）');
    ck(t0.cards===1,'默认只显示一组（'+t0.cards+' 张卡片）');

    await p.click('#refTabs button[data-ref-tab="all"]');
    await p.waitForTimeout(450);
    const t1=await p.evaluate(()=>({
      on:document.querySelector('#refTabs button[data-ref-tab="all"]').classList.contains('on'),
      cards:document.querySelectorAll('#refBox .card').length,
      items:document.querySelectorAll('#refBox .rem-item').length,
      groups:typeof REFGROUPS!=='undefined'?REFGROUPS.length:-1,
      total:typeof REFGROUPS!=='undefined'?REFGROUPS.reduce((a,g)=>a+g.items.length,0):-1
    }));
    ck(t1.on,'点「全部」后该项高亮');
    ck(t1.cards===t1.groups,'「全部」铺开所有分组（'+t1.cards+' 张卡片 / '+t1.groups+' 组）');
    ck(t1.items===t1.total,'条目数无遗漏（'+t1.items+' / '+t1.total+'）');

    await p.click('#refTabs button[data-ref-tab="0"]');
    await p.waitForTimeout(350);
    const t2=await p.evaluate(()=>({cards:document.querySelectorAll('#refBox .card').length,
      first:document.querySelector('#refTabs button').textContent.trim()}));
    ck(t2.cards===1&&t2.first.startsWith('全部'),'切回单组正常，「全部」仍在第一位');
    await p.close();
  }

  ck(errs.length===0,'全程无 JS 报错'+(errs.length?': '+errs.slice(0,4).join(' | '):''));
  console.log('\n通过 '+pass+' / 失败 '+fail);
  await b.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
