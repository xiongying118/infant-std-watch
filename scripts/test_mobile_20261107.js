/* ================================================================
   2026-11-07 四点改造 + 手机版适配 回归测试
   ① 首页「高优提醒（置顶）」卡片删除（且渲染 JS 不报错）
   ② KPI 标题口径备注：一年内要换版 / 20 天内勘误 → （通则引用标准）
   ③ 手机适配：390/430/768 不横向溢出、侧栏真抽屉、KPI 2 列
   ④ 近 20 天勘误提醒显示标准全称（不是只有标准号）
   另：13 个导航视图逐个巡检横向溢出 + 抽屉开关

   跑法：
     NODE_PATH=<playwright 路径> node scripts/test_mobile_20261107.js
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
let pass=0,fail=0;
function ck(ok,msg){ if(ok){pass++;console.log('  ✓ '+msg);} else {fail++;console.log('  ✗ '+msg);} }

(async()=>{
  const b=await chromium.launch({executablePath:EXE,headless:true});
  const errs=[];

  /* ── 桌面：四点内容改动 ───────────────────────────────── */
  {
    const p=await b.newPage({viewport:{width:1600,height:1000}});
    p.on('pageerror',e=>errs.push('desktop: '+e.message));
    await p.goto(URL+'#home',{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(2200);
    console.log('=== ① 桌面 · 四点改动 ===');
    ck(errs.length===0,'无 JS 报错'+(errs.length?': '+errs.join(' | '):''));
    const r=await p.evaluate(()=>({
      highEl:!!document.getElementById('highAlerts'),
      highTitle:[...document.querySelectorAll('#v-home .card-h h3')].some(x=>x.textContent.includes('高优提醒（置顶）')),
      notes:['soon365','erata20','soon365b'].map(k=>{
        const e=document.querySelector('.kpi[data-kpi="'+k+'"] .knote');
        return e?e.textContent.trim():null;
      }),
      kpiN:document.querySelectorAll('.kpi[data-kpi]').length,
      name:(document.querySelector('#erataRemind .erata-name')||{}).textContent||'',
      remind:(document.getElementById('erataRemind')||{}).innerText||'',
      lines:document.querySelectorAll('#erataRemind .erata-line').length
    }));
    ck(!r.highEl&&!r.highTitle,'高优提醒（置顶）卡片已删');
    ck(r.notes[0]==='（通则引用标准）','换版 KPI 备注 = （通则引用标准）');
    ck(r.notes[1]==='（通则引用标准）','勘误 KPI 备注 = （通则引用标准）');
    ck(r.notes[2]==='（标准清单全部）','第二行同名卡备注 = （标准清单全部）');
    ck(r.kpiN===6,'6 张 KPI 仍全部可点击');
    ck(/食品安全国家标准/.test(r.name)&&!/…/.test(r.name),'勘误提醒含完整标准全称（未截断）');
    ck(/GB 5009\.33-2025/.test(r.remind),'勘误提醒仍含标准号');
    ck(r.lines>0,'提醒框有条目（'+r.lines+'）');
    console.log('    提醒框：'+r.remind.replace(/\n/g,' / ').slice(0,190));
    await p.close();
  }

  /* ── 手机：三种视口 + 抽屉 ─────────────────────────────── */
  for(const W of [390,430,768]){
    const p=await b.newPage({viewport:{width:W,height:844}});
    p.on('pageerror',e=>errs.push('W'+W+': '+e.message));
    await p.goto(URL+'#home',{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(1800);
    console.log('=== ② 手机视口 '+W+'px ===');
    const r=await p.evaluate(()=>{
      const side=document.querySelector('.side'),main=document.querySelector('.main');
      const g=[...document.querySelectorAll('#v-home .grid.g2,#v-home .grid.g4')]
        .filter(x=>x.getBoundingClientRect().height>0)
        .map(x=>getComputedStyle(x).gridTemplateColumns.split(' ').length);
      return {
        iw:innerWidth,sw:document.documentElement.scrollWidth,
        mainW:Math.round(main.getBoundingClientRect().width),
        sidePos:getComputedStyle(side).position,
        topH:Math.round(document.querySelector('.top').getBoundingClientRect().height),
        burger:getComputedStyle(document.querySelector('.burger')).display,
        cols:g
      };
    });
    ck(r.sw<=r.iw+1,'无横向溢出（scrollWidth='+r.sw+' / '+r.iw+'）');
    ck(Math.abs(r.mainW-r.iw)<=2,'主区占满屏宽（'+r.mainW+'）');
    ck(r.sidePos==='fixed','侧栏是 fixed 抽屉（实测 '+r.sidePos+'）');
    ck(r.burger==='flex','汉堡按钮显示');
    ck(r.topH<=140,'顶栏高度合理（'+r.topH+'px）');
    if(W<=640) ck(r.cols.length>0&&r.cols.every(n=>n===2),'KPI/网格 2 列（'+r.cols.join(',')+'）');

    if(W===390){
      await p.click('#burger'); await p.waitForTimeout(350);
      const opened=await p.evaluate(()=>({cls:document.body.classList.contains('nav-open'),
        x:Math.round(document.querySelector('.side').getBoundingClientRect().x),
        mask:getComputedStyle(document.getElementById('sideMask')).display}));
      ck(opened.cls&&opened.x>=-2,'抽屉能打开（x='+opened.x+'）');
      ck(opened.mask!=='none','遮罩生效');
      await p.click('#sideMask'); await p.waitForTimeout(350);
      const closed=await p.evaluate(()=>document.body.classList.contains('nav-open'));
      ck(!closed,'点遮罩能关闭抽屉');
    }
    await p.close();
  }

  /* ── 390px：13 个视图逐个巡检 ──────────────────────────── */
  {
    const p=await b.newPage({viewport:{width:390,height:844}});
    p.on('pageerror',e=>errs.push('views: '+e.message));
    await p.goto(URL+'#home',{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(1600);
    console.log('=== ③ 390px · 13 个视图横向溢出巡检 ===');
    for(const h of HASHES){
      await p.evaluate(hh=>{location.hash=hh},h);
      await p.waitForTimeout(420);
      const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,
        view:(document.querySelector('.view:not(.hide)')||{}).id||'-'}));
      ck(r.sw<=r.iw+1,h+' → '+r.view+' 不溢出（'+r.sw+'/'+r.iw+'）');
    }
    await p.close();
  }

  ck(errs.length===0,'全程无 JS 报错'+(errs.length?': '+errs.slice(0,4).join(' | '):''));
  console.log('\n通过 '+pass+' / 失败 '+fail);
  await b.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
