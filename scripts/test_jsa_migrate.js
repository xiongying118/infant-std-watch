/* ================================================================
   test_jsa_migrate.js —— 真实老用户迁移场景（2026-11-02）
   场景：用户本地存着「7 区 48 步」旧副本，且改过其中 3 条的
        危害/控制文字 + 1 条步骤名 + 1 条 L/S 评级。
   期望：刷新后
        · 分区数 = 18（新增 11 个分区都补上）
        · 步骤数 = 108 + 用户自己加的条数（不重复、不丢）
        · 用户改过的 3 条内容原样保留
        · 用户改名的步骤不出现重复行
        · 用户改过的 L/S 评级保留
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const URL='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/')+'/index.html';

let pass=0,fail=0;
function ck(c,m){ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} }

(async()=>{
  const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext({viewport:{width:1680,height:1000}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2000);

  // 构造真实老用户状态：只存 7 区（旧版），__v=1
  await p.evaluate(()=>{
    const raw=JSON.parse(JSON.stringify(window.STDWATCH_DATA.JSA[0]));
    raw.__v=1;
    raw.zones=raw.zones.slice(0,7);
    // 用户改过 3 条内容
    raw.zones[0].steps[0].hazard='【用户改过的危害描述】';
    raw.zones[0].steps[0].control='【用户改过的控制措施】';
    raw.zones[2].steps[1].event='【用户改过的事件】';
    // 用户改过 1 条步骤名
    raw.zones[1].steps[0].step='【用户改过的步骤名】';
    // 用户改过 1 条评级
    raw.zones[3].steps[2].L=4; raw.zones[3].steps[2].S=5;
    // 用户自己加了 2 条步骤
    raw.zones[0].steps.push({step:'【用户自建步骤A】',hazard:'h',event:'e',control:'c',L:2,S:2,rL:2,rS:2,add:'',owner:'',due:'',done:false});
    raw.zones[0].steps.push({step:'【用户自建步骤B】',hazard:'h',event:'e',control:'c',L:2,S:2,rL:2,rS:2,add:'',owner:'',due:'',done:false});
    window.Store.set('jsa.work', raw);
  });

  await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(2200);

  console.log('\n=== ① 迁移后总量 ===');
  const r=await p.evaluate(()=>{
    const k=document.querySelector('#v-jsa .kpi .v');
    const d=document.querySelector('#v-jsa .kpi .d');
    return {total:parseInt(k.textContent.trim(),10), zonesTxt:d.textContent.trim()};
  });
  ck(r.total===110, '★ 步骤数 = 110（108 预填 + 2 用户自建），实际 '+r.total);
  ck(r.zonesTxt.indexOf('18')>=0, '★ 分区数 = '+r.zonesTxt);

  console.log('\n=== ② 用户改的内容全部保留 ===');
  const st=await p.evaluate(()=>{
    const st=(window.STDWATCH_DATA&&null);
    const s=window.Store.get('jsa.work',null);
    const z0=s.zones[0], z1=s.zones[1], z2=s.zones[2], z3=s.zones[3];
    const all=s.zones.reduce((a,z)=>a.concat(z.steps),[]);
    return {
      hazard: z0.steps[0].hazard,
      control:z0.steps[0].control,
      event:  z2.steps[1].event,
      renamed:z1.steps[0].step,
      LS:     [z3.steps[2].L, z3.steps[2].S],
      selfA:  all.filter(x=>x.step==='【用户自建步骤A】').length,
      selfB:  all.filter(x=>x.step==='【用户自建步骤B】').length,
      dupRenamed: all.filter(x=>x.step==='【用户改过的步骤名】').length,
      // 改名那条的 sid 应保留 → 合并时能被认出来
      renamedSid: z1.steps[0].sid
    };
  });
  ck(st.hazard==='【用户改过的危害描述】','危害描述保留');
  ck(st.control==='【用户改过的控制措施】','控制措施保留');
  ck(st.event==='【用户改过的事件】','事件描述保留');
  ck(st.renamed==='【用户改过的步骤名】','改名步骤保留');
  ck(st.LS[0]===4&&st.LS[1]===5,'L/S 评级保留（实际 '+st.LS.join('×')+'）');
  ck(st.selfA===1,'用户自建步骤A 只出现 1 次（实际 '+st.selfA+'）');
  ck(st.selfB===1,'用户自建步骤B 只出现 1 次（实际 '+st.selfB+'）');
  ck(st.dupRenamed===1,'★ 改名步骤不重复（实际 '+st.dupRenamed+' 次）');
  ck(!!st.renamedSid,'★ 改名步骤仍带 sid（下次合并不会再重复）');

  console.log('\n=== ③ 页面渲染无重复、无报错 ===');
  const pg=await p.evaluate(()=>({
    steps:document.querySelectorAll('#v-jsa .jcard').length,
    zones:[...document.querySelectorAll('#v-jsa .chip')].length
  }));
  ck(pg.zones===18,'页面渲染 '+pg.zones+' 个分区按钮');
  ck(errs.length===0,'无 JS 错误'+(errs.length?('：'+errs.slice(0,3).join(' | ')):''));

  await b.close();
  console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
  process.exit(fail?1:0);
})();
