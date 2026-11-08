/* ================================================================
   2026-11-08 第六轮回归：全站「字与框边线粘在一起」巡检

   背景：用户截图（检测方法原理展开态）里，原理正文 / 「检测方法原理」/
   「试剂与作用」标题全部压在 .mcard::before 的 3px 蓝色竖条上。
   根因：.mcard 展开区 .dt 从来没定义 padding（间距实测 0px）；
        手机端 .card / .kpi 又只剩 10~12px，左侧 3.5px 色条再吃掉
        一半，文字离色条仅 6.5px。桌面与手机都中招。

   判据：用 Range 量「行首文字真实起点」，与最外层卡片框左边界比较，
        间距 < 12px（含负数 = 压在线上）即判为贴边。
        小徽标 / 按钮 / 可横滚表格内部的紧凑排布不算。
   覆盖：3 视口 × 14 视图 × 展开态 + refs「全部」页签。

   跑法：
     NODE_PATH=<playwright 路径> node scripts/test_padding_20261108.js
   默认验线上；STD_TARGET=local 验本地 file://
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');
const PROT=path.resolve(__dirname,'..','prototype');
const LOCAL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const URL=process.env.STD_TARGET==='local'?LOCAL
  :'https://xiongying118.github.io/infant-std-watch/';
const EXE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIEWS=['home','list','law','cnas','refs','method','lab','jsa',
             'qmtools','rdtools','subs','alerts','admin'];
let pass=0,fail=0,errs=[];
function ck(ok,msg){ if(ok){pass++;console.log('  ✓ '+msg);}else{fail++;console.log('  ✗ '+msg);} }
async function gotoRetry(p,url){
  for(let i=0;i<6;i++){
    try{ await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000}); return true; }
    catch(e){ await p.waitForTimeout(4000); }
  }
  return false;
}

/* 浏览器内：找所有"贴框线"的行首文字 */
const SCAN = () => {
  const out=[];
  const SKIP=/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|OPTION)$/;
  function deco(el){
    const s=getComputedStyle(el);
    const bw=parseFloat(s.borderLeftWidth)||0;
    if(bw>=2 && s.borderLeftStyle!=='none' && s.borderLeftColor!=='rgba(0, 0, 0, 0)') return bw;
    const b=getComputedStyle(el,'::before');
    if(b.position==='absolute' && b.content!=='none' && b.content!=='normal'){
      const w=parseFloat(b.width)||0;
      const bg=b.backgroundImage!=='none'||
        (b.backgroundColor && b.backgroundColor!=='rgba(0, 0, 0, 0)');
      if(w>0 && w<=5 && bg && (parseFloat(b.left)||0)<=1) return w;
    }
    return 0;
  }
  function framed(el){
    const s=getComputedStyle(el);
    const bl=parseFloat(s.borderLeftWidth)||0;
    const bt=parseFloat(s.borderTopWidth)||0;
    const br=parseFloat(s.borderRightWidth)||0;
    return (bl>0||bt>0||br>0) && el.getBoundingClientRect().width>70 ? bl : 0;
  }
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let n;
  while((n=walker.nextNode())){
    const t=(n.nodeValue||'').trim();
    if(!t) continue;
    const p=n.parentElement;
    if(!p || !p.closest('.view:not(.hide)')) continue;
    if(SKIP.test(p.tagName) || p.closest('button,a,input,select,textarea,label')) continue;
    const st=getComputedStyle(p);
    if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity||'1')===0) continue;
    let r;
    try{ const rg=document.createRange(); rg.selectNodeContents(n); r=rg.getBoundingClientRect(); }catch(e){ continue; }
    if(!r.width || !r.height) continue;
    let cur=p, card=null;
    while(cur && cur!==document.body){
      const d=deco(cur), f=framed(cur);
      const w=cur.getBoundingClientRect().width;
      if((d||f) && w>70 && w<document.documentElement.clientWidth*1.2) card=cur;
      cur=cur.parentElement;
    }
    if(!card) continue;
    const cr=card.getBoundingClientRect();
    const gap=Math.round(r.left-cr.left-(parseFloat(getComputedStyle(card).borderLeftWidth)||0));
    if(gap>-12 && gap<12){
      out.push({gap,cls:(card.className||card.tagName).toString().slice(0,30),
        txt:t.slice(0,36).replace(/\s+/g,' ')});
    }
  }
  return out;
};

(async()=>{
  const b=await chromium.launch({executablePath:EXE,headless:true});
  for(const [label,w,h] of [['桌面 1440',1440,900],['中屏 1024',1024,800],['手机 390',390,844]]){
    console.log('\n===== '+label+' =====');
    const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
    const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push(label+': '+e.message));
    if(!(await gotoRetry(p,URL+'#home'))){ console.log('网络不通，测试中止'); await b.close(); process.exit(2); }
    await p.waitForTimeout(900);

    // 关键 CSS 值：三视口都不得低于下限
    const css=await p.evaluate(()=>{
      const g=(sel,prop)=>{ const e=document.querySelector(sel); return e?parseFloat(getComputedStyle(e)[prop]):-1; };
      const dt=document.createElement('div');
      return {
        kpi:g('#v-home .grid.kpi4 .kpi','paddingLeft'),
        card:g('#v-home .card','paddingLeft'),
        h3:g('.card-h h3','paddingLeft'),
        dt:g('.mcard .dt','paddingLeft'),
        sw:document.documentElement.scrollWidth, iw:innerWidth
      };
    });
    const minKpi = w<=430?15:(w<=900?16:17);
    ck(css.kpi>=minKpi, label+' KPI 左内边距 '+css.kpi+'px ≥ '+minKpi+'px');
    const minCard = w<=430?13:14;
    if(css.card>=0) ck(css.card>=minCard, label+' 卡片左内边距 '+css.card+'px ≥ '+minCard+'px');
    if(css.h3>=0) ck(css.h3>=14, label+' 卡片标题竖条留白 '+css.h3+'px ≥ 14px');
    ck(css.sw<=css.iw+1, label+' 首页不横向溢出（'+css.sw+'/'+css.iw+'）');

    for(const v of VIEWS){
      await p.evaluate(v=>{location.hash='#'+v;},v);
      await p.waitForTimeout(360);
      await p.evaluate(()=>{
        const all=document.querySelector('#refTabs button[data-ref-tab="all"]');
        if(all){ try{ all.click(); }catch(e){} }
      });
      await p.evaluate(()=>{
        document.querySelectorAll('.view:not(.hide) .mcard .hd, .view:not(.hide) .qmcard-h')
          .forEach((el,i)=>{ if(i<8){ try{ el.click(); }catch(e){} } });
      });
      await p.waitForTimeout(300);
      if(v==='law'){
        const dup=await p.evaluate(()=>({
          old:!!document.querySelector('#lawTabs'),
          all:[...document.querySelectorAll('#v-law .tabs button,#v-law .chips button')]
                .filter(b=>b.textContent.trim().startsWith('全部')).length,
          list:document.querySelectorAll('#lawList .card').length
        }));
        ck(!dup.old, label+' 法规页多余的「全部」分类页签已删除');
        ck(dup.all===1, label+' 法规页只剩一个「全部」（实际 '+dup.all+' 个）');
        ck(dup.list>0, label+' 法规页列表仍渲染 '+dup.list+' 条');
      }
      const bad=await p.evaluate(SCAN);
      ck(bad.length===0, label+' #'+v+' 无贴框线文字'+
        (bad.length?'（'+bad.length+' 处：'+bad.slice(0,3).map(x=>'gap='+x.gap+' '+x.cls+' 「'+x.txt+'」').join('；')+'）':''));
      if(w<=430){
        const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth}));
        ck(ov.sw<=ov.iw+1, label+' #'+v+' 不横向溢出（'+ov.sw+'/'+ov.iw+'）');
      }
    }

    // 方法卡展开区的实际内边距（展开后才存在）
    await p.evaluate(()=>{location.hash='#method';});
    await p.waitForTimeout(360);
    await p.evaluate(()=>{ const hd=document.querySelector('#v-method .mcard .hd'); if(hd) hd.click(); });
    await p.waitForTimeout(300);
    const dt=await p.evaluate(()=>{
      const e=document.querySelector('.mcard .dt');
      if(!e) return -1;
      return parseFloat(getComputedStyle(e).paddingLeft);
    });
    ck(dt>=12, label+' 方法卡展开区左内边距 '+dt+'px ≥ 12px（原来 0px）');
    // 手机搜索框提示：占位 .sp 必须让位
    if(w<=640){
      const q=await p.evaluate(()=>{
        const sp=document.querySelector('#methodFilter>.sp');
        const i=document.querySelector('#methodSearch');
        return {sp:sp?getComputedStyle(sp).display:'gone',
                iw:i?i.clientWidth:0, mw:i?parseFloat(getComputedStyle(i).maxWidth):0};
      });
      ck(q.sp==='none', label+' 方法页搜索框占位让位（'+q.sp+'）');
      ck(q.iw>=250, label+' 方法页搜索框宽度 '+q.iw+'px ≥ 250px（提示文字完整）');
    }
    await ctx.close();
  }
  await b.close();
  console.log('\n========================================');
  console.log('通过 '+pass+' / 失败 '+fail+'；JS 报错 '+errs.length+' 条');
  errs.slice(0,6).forEach(e=>console.log('  ! '+e));
  console.log('========================================');
  process.exit(fail||errs.length?1:0);
})();
