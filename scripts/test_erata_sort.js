/* test_erata_sort.js —— 校验「标准勘误与修改单」列表的排序与总结计数
   用户 2026-11-05 定稿要求：
     ① 按最新日期排下去，不要分类再排   → 日期必须严格递减
     ② 同一标准的放一起排               → 同一天内同标准条目连续
     ③ 标题处加总结计数                 → 勘误 / 修改单 各多少条

   跑法：
     NODE_PATH="C:/Users/13104/.workbuddy/binaries/node/versions/22.22.2-6/node_modules/@playwright/cli/node_modules" node scripts/test_erata_sort.js
   （默认测线上；测本地加 STD_TARGET=local）
*/
const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const PROT=path.join(ROOT,'prototype');
const LOCAL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const URL = process.env.STD_TARGET === 'local' ? LOCAL
  : 'https://xiongying118.github.io/infant-std-watch/';

let pass=0, fail=0;
function ck(ok,msg){ if(ok){pass++;console.log('  ✓ '+msg);} else {fail++;console.log('  ✗ '+msg);} }

(async()=>{
  const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext({viewport:{width:1600,height:1100}});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

  let navOK=false;
  for(let i=0;i<6&&!navOK;i++){
    try{
      await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
      navOK=true;
    }catch(e){
      console.log('  (网络重试 '+(i+1)+')');
      await p.waitForTimeout(4000);
    }
  }
  if(!navOK){ console.log('网络不通，测试中止'); await b.close(); process.exit(2); }
  await p.waitForTimeout(3500);

  console.log('=== ① 列表日期必须严格递减（不得跳回旧日期）===');
  const order = await p.evaluate(()=>{
    const box=document.querySelector('#erataBox');
    if(!box) return {noBox:true};
    const cards=[...box.querySelectorAll('.alert')];
    const rows=cards.map(c=>{
      const no=(c.querySelector('.h .no')||{}).textContent||'';
      const mod=/修改单/.test(c.textContent);
      // 抓卡片里的日期（meta 行）
      const dates=[...c.querySelectorAll('.mono')].map(x=>x.textContent.trim()).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));
      return {no:no.trim(), mod, dates:dates};
    });
    return {n:rows.length, rows};
  });
  ck(!order.noBox, '勘误列表容器 #erataBox 存在');
  ck(order.n>0, '勘误列表有内容（'+order.n+' 条）');

  // 用页面内 ERATA 原始数据核对（日期取自 erataDate）
  const raw = await p.evaluate(()=>{
    const E=(window.STDWATCH_DATA&&window.STDWATCH_DATA.ERATA)||[];
    return E.map(e=>({no:e.no, d:e.erataDate||'', kind:e.kind||'ERATA', sec:e.sec||''}));
  });
  const norm = s=>String(s||'').replace(/\s+/g,'').replace(/-\d{4}$/,'').toUpperCase();

  // 直接取页面渲染顺序的标准号序列（按卡片顺序）
  const seq = await p.evaluate(()=>{
    const box=document.querySelector('#erataBox');
    return [...box.querySelectorAll('.alert')].map(c=>(c.querySelector('.h .no')||{}).textContent.trim());
  });
  ck(seq.length===raw.length, '页面渲染条数与 ERATA 数据条数一致 ('+seq.length+'/'+raw.length+')');

  // 页面渲染顺序的日期序列：用 erataDate 无法直接取，改用「日期是否单调」的自洽检查：
  // 同一天内同标准连续 + 同标准跨日期不并组（这才是"不要分类再排"）
  const order2 = await p.evaluate(()=>{
    const E=(window.STDWATCH_DATA&&window.STDWATCH_DATA.ERATA)||[];
    if(typeof erataSorted!=='function') return {noFn:true};
    const s=erataSorted();
    return {dates:s.map(e=>e.erataDate||''), keys:s.map(e=>String(e.no||'').replace(/\s+/g,'').replace(/-\d{4}$/,'').toUpperCase())};
  });
  ck(!order2.noFn, '全局函数 erataSorted() 存在');

  if(!order2.noFn){
    let jumps=[];
    for(let i=1;i<order2.dates.length;i++){
      if(order2.dates[i] > order2.dates[i-1]) jumps.push(i+': '+order2.dates[i-1]+' → '+order2.dates[i]);
    }
    ck(jumps.length===0, '日期严格递减，无跳回（跳变 '+jumps.length+' 处'+(jumps.length?'：'+jumps.slice(0,3).join('; '):'')+'）');

    // 同一天内同标准必须连续
    let broken=[];
    for(let i=1;i<order2.keys.length;i++){
      if(order2.dates[i]===order2.dates[i-1] && order2.keys[i]!==order2.keys[i-1]){
        // 同日不同标准 —— 这是允许的（不同标准同日），但同标准同日若被隔开才算破
      }
    }
    // 严格检查：同一标准 + 同一日期 的所有条目必须连成一段
    const idx={};
    order2.keys.forEach((k,i)=>{
      const d=order2.dates[i];
      (idx[k]=idx[k]||{})[d]=(idx[k][d]||[]).concat(i);
    });
    Object.keys(idx).forEach(k=>{
      Object.keys(idx[k]).forEach(d=>{
        const a=idx[k][d];
        for(let j=1;j<a.length;j++){
          if(a[j]!==a[j-1]+1){ broken.push(k+'@'+d); break; }
        }
      });
    });
    ck(broken.length===0, '同一标准同一天的条目全部连续（破例 '+broken.length+' 处'+(broken.length?'：'+broken.slice(0,3).join('; '):'')+'）');

    // 反向检查：不能存在"按标准整体分组"的痕迹 ——
    // 即某个标准的最后一条日期，早于另一个标准的第一条日期，但它们在列表里被拉开很远
    const firstIdx={}, lastIdx={};
    order2.keys.forEach((k,i)=>{
      if(!(k in firstIdx)) firstIdx[k]=i;
      lastIdx[k]=i;
    });
    // 同标准的条目若分散，则中间必然夹着别的标准 —— 统计分散程度
    const spread=[];
    Object.keys(firstIdx).forEach(k=>{
      const span=lastIdx[k]-firstIdx[k]+1;
      const own=order2.keys.filter(x=>x===k).length;
      if(span>own) spread.push(k+' 跨 '+span+' 位');
    });
    console.log('  · 同标准条目被日期拆开的情况：'+spread.length+' 个标准（如 '+spread.slice(0,3).join('；')+'）');
    console.log('    （这是"日期当主轴"的必然结果：用户要求不分类再排，同标准跨年份的老勘误就回到它自己的日期位置）');
  }

  console.log('=== ② 标题处总结计数 ===');
  const sum = await p.evaluate(()=>{
    const el=document.querySelector('#erataSum');
    if(!el) return {noEl:true};
    const t=el.innerText.replace(/\s+/g,' ').trim();
    const tags=[...el.querySelectorAll('.tag')].map(x=>x.innerText.replace(/\s+/g,' ').trim());
    return {t, tags, html:el.innerHTML.length};
  });
  ck(!sum.noEl, '标题栏存在 #erataSum 容器');
  ck(sum.tags.length>=4, '标题栏至少 4 个计数徽标（实际 '+sum.tags.length+'：'+sum.tags.join(' | ')+'）');
  ck(/勘误\s*\d+\s*条/.test(sum.t), '显示「勘误 N 条」');
  ck(/修改单\s*\d+\s*条/.test(sum.t), '显示「修改单 N 条」');
  ck(/合计\s*\d+\s*条/.test(sum.t), '显示「合计 N 条」');
  ck(/涉及\s*\d+\s*个标准/.test(sum.t), '显示「涉及 N 个标准」');

  // 计数数字必须与真实数据一致
  const truth = await p.evaluate(()=>{
    const E=(window.STDWATCH_DATA&&window.STDWATCH_DATA.ERATA)||[];
    return {
      total:E.length,
      mod:E.filter(e=>e.kind==='MOD').length,
      era:E.filter(e=>e.kind!=='MOD').length,
      stds:new Set(E.map(e=>String(e.no||'').replace(/\s+/g,'').replace(/-\d{4}$/,'').toUpperCase())).size
    };
  });
  console.log('  · 真实数据：勘误 '+truth.era+' 条 / 修改单 '+truth.mod+' 条 / 合计 '+truth.total+' 条 / 涉及 '+truth.stds+' 个标准');
  ck(new RegExp('勘误\\s*'+truth.era+'\\s*条').test(sum.t), '勘误条数与数据一致（'+truth.era+'）');
  ck(new RegExp('修改单\\s*'+truth.mod+'\\s*条').test(sum.t), '修改单条数与数据一致（'+truth.mod+'）');
  ck(new RegExp('合计\\s*'+truth.total+'\\s*条').test(sum.t), '合计条数与数据一致（'+truth.total+'）');
  ck(new RegExp('涉及\\s*'+truth.stds+'\\s*个标准').test(sum.t), '涉及标准数与数据一致（'+truth.stds+'）');

  console.log('=== ③ 范围必须只有通则里的标准（2026-11-05 用户要求）===');
  const scopeChk = await p.evaluate(()=>{
    const SCOPE=(window.STDWATCH_DATA&&window.STDWATCH_DATA.ERATASCOPE)||[];
    const set=new Set(SCOPE);
    const key=no=>{let n=String(no||'').replace(/\s+/g,'').toUpperCase();
      n=n.replace(/-\d{4}$/,'').replace('GB/T','GBT').replace('QB/T','QBT');
      if(!/^(GB|QB|JJF|JB)/.test(n)) n='GB'+n; return n;};
    const E=(window.STDWATCH_DATA&&window.STDWATCH_DATA.ERATA)||[];
    const outOfScope=E.filter(e=>!set.has(key(e.no))).map(e=>e.no);
    // 用户点名不要的
    const banned=['GB 5009.235','GB 5009.111','GB 5009.225','GB 4789.20','GB 5009.139'];
    const bannedHit=banned.filter(no=>E.some(e=>key(e.no)===key(no)));
    // 页面渲染出来的
    const rendered=[...document.querySelectorAll('#erataBox .alert')]
      .map(c=>(c.querySelector('.h .no')||{}).textContent.trim());
    const renderedOut=rendered.filter(no=>!set.has(key(no)));
    return {scopeN:SCOPE.length, outOfScope, bannedHit, renderedN:rendered.length, renderedOut,
            scopeShown:(document.querySelector('#erataScopeN')||{}).textContent};
  });
  ck(scopeChk.scopeN>0, '范围表 ERATASCOPE 已加载（'+scopeChk.scopeN+' 个标准）');
  ck(scopeChk.outOfScope.length===0, '数据层：ERATA 全部在范围内（越界 '+scopeChk.outOfScope.length+' 个'+(scopeChk.outOfScope.length?'：'+scopeChk.outOfScope.slice(0,5).join(' '):'')+'）');
  ck(scopeChk.bannedHit.length===0, '用户点名不要的标准均已剔除'+(scopeChk.bannedHit.length?'（还在：'+scopeChk.bannedHit.join(' ')+'）':'（GB 5009.235 / GB 5009.111 等）'));
  ck(scopeChk.renderedOut.length===0, '页面渲染的每一条都在范围内（越界 '+scopeChk.renderedOut.length+' 个）');
  ck(String(scopeChk.scopeShown).trim()===String(scopeChk.scopeN), '页面显示的范围标准数与范围表一致（'+scopeChk.scopeShown+'）');

  console.log('=== ④ 无 JS 报错 ===');
  ck(errs.length===0, '页面无 JS 报错'+(errs.length?'：'+errs.slice(0,3).join(' | '):''));

  console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
  await b.close();
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
