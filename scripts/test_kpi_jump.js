/* 首页 KPI 直达 / 20 天勘误独立提醒 回归测试（2026-11-07）
   NODE_PATH=<playwright 路径> node scripts/test_kpi_jump.js */
const {chromium}=require('playwright-core');
const path=require('path');
const PROT=path.resolve(__dirname,'..','prototype');
const LOCAL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
/* 默认线上（改完就是验线上），STD_TARGET=local 才验本地 file:// */
const URL = process.env.STD_TARGET === 'local' ? LOCAL
  : 'https://xiongying118.github.io/infant-std-watch/';
let pass=0,fail=0;
function ck(ok,msg){ if(ok){pass++;console.log('  ✓ '+msg);} else {fail++;console.log('  ✗ '+msg);} }
/* ★ 线上偶发 ERR_CONNECTION_RESET（本地网络抖动）→ 6 次 / 4 秒重试 ★ */
async function gotoRetry(p,url){
  for(let i=0;i<6;i++){
    try{ await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000}); return true; }
    catch(e){ console.log('  (网络重试 '+(i+1)+')'); await p.waitForTimeout(4000); }
  }
  return false;
}
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const p=await b.newPage({viewport:{width:1600,height:1100}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通，测试中止'); await b.close(); process.exit(2);}
  await p.waitForTimeout(2500);

  console.log('=== ① 首页结构 ===');
  ck(errs.length===0,'无 JS 报错'+(errs.length?': '+errs.join(' | '):''));
  const dig=await p.evaluate(()=>({
    rows:document.querySelectorAll('#refDigest .rem-item').length,
    soon:document.querySelectorAll('#refDigest .notice.warn').length
  }));
  ck(dig.rows===0,'首页分组清单已删除（rem-item='+dig.rows+'）');
  ck(dig.soon===1,'换版黄框仍在');

  const rem=await p.evaluate(()=>{
    const e=document.getElementById('erataRemind');
    return {display:getComputedStyle(e).display,txt:e.innerText.trim(),
            lines:e.querySelectorAll('.erata-line').length};
  });
  ck(rem.display!=='none','20 天勘误提醒框显示');
  ck(rem.lines===1,'提醒框条目数 = 1（实为 '+rem.lines+'）');
  ck(/GB 5009\.33-2025/.test(rem.txt),'提醒框含 GB 5009.33-2025');
  ck(!/一年内换版/.test(rem.txt),'提醒框不含换版内容（不与换版混放）');
  console.log('    提醒框文字：'+rem.txt.replace(/\n/g,' / ').slice(0,220));

  const kpi=await p.evaluate(()=>({
    n:document.querySelectorAll('.kpi[data-kpi]').length,
    v20:document.getElementById('kpiErata20').textContent,
    v365:document.getElementById('kpiSoon365').textContent
  }));
  ck(kpi.n===6,'6 张 KPI 全部可点击');
  ck(kpi.v20===String(rem.lines),'KPI 数字与提醒框条目数一致（'+kpi.v20+' vs '+rem.lines+'）');

  console.log('=== ② 点击直达 ===');
  await p.click('.kpi[data-kpi="erata20"]');
  await p.waitForTimeout(700);
  let r=await p.evaluate(()=>({hash:location.hash,view:document.querySelector('.view:not(.hide)').id,
    chip:document.querySelector('#alertFilters .chip.on')?.textContent.trim()||'',
    txt:(document.getElementById('alertList')?.innerText||'').slice(0,120)}));
  ck(r.hash==='#alerts'&&r.view==='v-alerts','勘误 KPI → 提醒中心');
  ck(/勘误/.test(r.chip),'自动切到「勘误」视图（chip='+r.chip+'）');

  if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通，测试中止'); await b.close(); process.exit(2);} await p.waitForTimeout(1500);
  await p.click('.kpi[data-kpi="soon365"]');
  await p.waitForTimeout(700);
  r=await p.evaluate(()=>({hash:location.hash,view:document.querySelector('.view:not(.hide)').id,
    cnt:document.getElementById('listCnt').innerText.trim(),
    rows:document.querySelectorAll('#listBody tr.rowlink').length,
    focus:typeof kpiFocus!=='undefined'?kpiFocus:'?'}));
  ck(r.hash==='#list'&&r.focus==='soon365','换版 KPI → 标准清单且带聚焦');
  ck(r.rows>0,'筛选结果非空（'+r.rows+' 行）');
  console.log('    计数条：'+r.cnt.replace(/\n/g,' '));

  await p.click('#listCnt button');
  await p.waitForTimeout(400);
  r=await p.evaluate(()=>({focus:typeof kpiFocus!=='undefined'?kpiFocus:'?',
    rows:document.querySelectorAll('#listBody tr.rowlink').length}));
  ck(r.focus===null,'清除筛选按钮生效');

  if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通，测试中止'); await b.close(); process.exit(2);} await p.waitForTimeout(1500);
  await p.click('.kpi[data-kpi="std"]');
  await p.waitForTimeout(600);
  r=await p.evaluate(()=>({hash:location.hash,focus:typeof kpiFocus!=='undefined'?kpiFocus:'?'}));
  ck(r.hash==='#list'&&r.focus===null,'现行有效标准 KPI → 全量清单（无聚焦）');

  if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通，测试中止'); await b.close(); process.exit(2);} await p.waitForTimeout(1500);
  await p.click('.kpi[data-kpi="law"]');
  await p.waitForTimeout(600);
  ck((await p.evaluate(()=>location.hash))==='#law','法规与体系 KPI → 法规页');

  if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通，测试中止'); await b.close(); process.exit(2);} await p.waitForTimeout(1800);
  console.log('\n通过 '+pass+' / 失败 '+fail);
  await b.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
