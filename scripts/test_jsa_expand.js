/* ================================================================
   test_jsa_expand.js —— JSA 扩充 + 排版回归（2026-11-02）
   覆盖：
     ① 分区/步骤数量达标（18 区 / 108 步）
     ② 新增分区都在，含关键环节
     ③ 一行式 10 列不横向裁切（删除按钮可见可点）
     ④ 作业前确认卡 + 责任矩阵两个页签能渲染
     ⑤ 旧本地副本增量合并（版本合并不丢用户编辑）
     ⑥ 无 JS 错误
   ================================================================ */
const {chromium}=require('playwright-core');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const PROTOTYPE='file:///'+path.join(ROOT,'prototype').replace(/\\/g,'/');
const URL=PROTOTYPE+'/index.html';

let pass=0,fail=0;
function ck(c,m){ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} }

(async()=>{
  const b=await chromium.launch({
    executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless:true});
  const ctx=await b.newContext({viewport:{width:1680,height:1000}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

  await p.goto(URL+'#jsa',{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);

  console.log('\n=== ① 作业步骤数量扩充 ===');
  const stat=await p.evaluate(()=>{
    const st=window.JSAW? null : null;
    const zones=(window.STDWATCH_DATA.JSA[0].zones)||[];
    let n=0; zones.forEach(z=>n+=(z.steps||[]).length);
    return {zn:zones.length, sn:n, titles:zones.map(z=>z.title)};
  });
  ck(stat.zn>=18, '★ 分区数 ≥ 18（实际 '+stat.zn+'）');
  ck(stat.sn>=105, '★ 作业步骤 ≥ 105（实际 '+stat.sn+'）');
  ['样品制备与乳粉复原区（复溶/均质/分样）','常规理化指标区（水分/灰分/脂肪/溶解性/感官）',
   '维生素与矿物质检测区','抗生素与真菌毒素残留检测区',
   '微生物常规指标检验区（菌落总数/大肠菌群/金葡）','过敏原与标签符合性检测区',
   '现场取样与抽样区（GB/T 2828.1）','计量校准与期间核查区',
   '检验报告与数据管理区','清洁消毒与器皿管理区','实验室准入与人员管理区'
  ].forEach(t=>{
    ck(stat.titles.indexOf(t)>=0, '含分区「'+t.replace(/（.*/,'')+'」');
  });

  console.log('\n=== ② 页面 KPI 显示的是新数量 ===');
  const kpi=await p.evaluate(()=>{
    const v=document.querySelector('#v-jsa .kpi .v');
    const d=document.querySelector('#v-jsa .kpi .d');
    return {v:v?v.textContent.trim():'', d:d?d.textContent.trim():''};
  });
  ck(kpi.v===String(stat.sn), '★ KPI 作业步骤总数 = '+kpi.v+'（数据 '+stat.sn+'）');
  ck(kpi.d.indexOf(String(stat.zn))>=0, '★ KPI 分区数 = '+kpi.d);

  console.log('\n=== ③ 一行式 10 列不横向裁切 ===');
  const lay=await p.evaluate(()=>{
    const card=document.querySelector('#v-jsa .jcard');
    if(!card) return null;
    const body=card.querySelector('.jcard-body');
    const host=body.parentElement;
    const btn=card.querySelector('.jcard-act .x');
    const cr=card.getBoundingClientRect(), br=btn?btn.getBoundingClientRect():null;
    return {
      scrollW:body.scrollWidth, clientW:body.clientWidth,
      cols:body.children.length,
      btnVisible: br ? (br.right<=cr.right+1 && br.left>=cr.left-1) : false,
      overflowX:getComputedStyle(body).overflowX
    };
  });
  ck(!!lay,'找到 JSA 步骤卡');
  if(lay){
    ck(lay.cols===10,'一行 10 列（实际 '+lay.cols+'）');
    ck(lay.scrollW<=lay.clientW+1,'★ 卡片内容不溢出（'+lay.scrollW+' <= '+lay.clientW+'）');
    ck(lay.btnVisible,'★ 删除按钮完全可见');
    ck(lay.overflowX==='auto','★ 横向滚动兜底已开（overflow-x:'+lay.overflowX+'）');
  }

  console.log('\n=== ④ 新页签能渲染 ===');
  const tabs=await p.evaluate(()=>[...document.querySelectorAll('#jsaTabs button')].map(x=>x.dataset.jsa));
  ck(tabs.indexOf('precheck')>=0,'有「作业前确认卡」页签');
  ck(tabs.indexOf('owners')>=0,'有「分区责任矩阵」页签');

  await p.evaluate(()=>{[...document.querySelectorAll('#jsaTabs button')]
    .find(x=>x.dataset.jsa==='precheck').click();});
  await p.waitForTimeout(500);
  const pc=await p.evaluate(()=>({
    rows:document.querySelectorAll('#v-jsa tbody tr').length,
    head:document.querySelector('#v-jsa .card-h h3')?document.querySelector('#v-jsa .card-h h3').textContent:''
  }));
  ck(pc.rows>=8,'确认卡渲染出 '+pc.rows+' 行（应 ≥ 8）');
  ck(pc.head.indexOf('确认卡')>=0,'标题是「'+pc.head+'」');

  await p.evaluate(()=>{[...document.querySelectorAll('#jsaTabs button')]
    .find(x=>x.dataset.jsa==='owners').click();});
  await p.waitForTimeout(500);
  const ow=await p.evaluate(()=>({
    rows:document.querySelectorAll('#v-jsa tbody tr').length,
    head:document.querySelector('#v-jsa .card-h h3')?document.querySelector('#v-jsa .card-h h3').textContent:''
  }));
  ck(ow.rows>=18,'责任矩阵渲染出 '+ow.rows+' 行（应 ≥ 18）');
  ck(ow.head.indexOf('责任矩阵')>=0,'标题是「'+ow.head+'」');

  console.log('\n=== ⑤ 旧本地副本增量合并 ===');
  const merge=await p.evaluate(()=>{
    const raw=window.STDWATCH_DATA.JSA[0];
    /* 模拟老用户：只存了前 2 个分区、且改了其中一条步骤的文字 */
    const old=JSON.parse(JSON.stringify(raw));
    old.__v=1;
    old.zones=old.zones.slice(0,2);
    old.zones[0].steps[0].step='【用户改过的步骤名】';
    old.guide.preJobCheck=[]; old.guide.zoneOwners=[];
    window.Store.set('jsa.work', old);
    window.JSAW.load(); window.JSAW.render();
    const st=window.STDWATCH_DATA.JSA[0];
    return {
      zn:(window.__JSA_ZONES||[]).length
    };
  });
  await p.reload({waitUntil:'networkidle'});
  await p.waitForTimeout(2200);
  const after=await p.evaluate(()=>{
    const k=document.querySelector('#v-jsa .kpi .v');
    return {v:k?k.textContent.trim():''};
  });
  ck(parseInt(after.v,10)>=105,'★ 合并后步骤数 = '+after.v+'（旧本地只有 2 区也应补齐）');
  const kept=await p.evaluate(()=>{
    /* 用户的自定义步骤名必须还在 */
    const names=[...document.querySelectorAll('#v-jsa .jcard-step')].map(x=>x.value);
    return names.indexOf('【用户改过的步骤名】')>=0;
  });
  ck(kept,'★ 用户改过的内容没被覆盖');

  console.log('\n=== ⑥ 无 JS 错误 ===');
  ck(errs.length===0,'无页面错误'+(errs.length?('：'+errs.slice(0,3).join(' | ')):''));

  await b.close();
  console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
  process.exit(fail?1:0);
})();
