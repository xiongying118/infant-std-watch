/* ================================================================
   test_jsa_row.js —— JSA 一行式排版溢出检查
   验收：10 列（危害/事件/控制/措施/L/S/R/责任人/期限/操作）全部可见，
        卡片右边界不出现横向裁切，最后一列（删除按钮）能点到。
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

  console.log('\n=== ① JSA 一行式不横向裁切 ===');
  const info=await p.evaluate(()=>{
    const card=document.querySelector('#v-jsa .jcard');
    if(!card) return null;
    const body=card.querySelector('.jcard-body');
    const wrap=body?body.parentElement:null;
    const host=wrap?wrap.parentElement:null;
    const cols=[...body.children].map(c=>{
      const r=c.getBoundingClientRect();
      return {cls:c.className,x:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width)};
    });
    return {
      bodyScrollW:body.scrollWidth,
      bodyClientW:body.clientWidth,
      bodyRect:Math.round(body.getBoundingClientRect().right),
      wrapRight:wrap?Math.round(wrap.getBoundingClientRect().right):null,
      hostRight:host?Math.round(host.getBoundingClientRect().right):null,
      cols,
      viewW:Math.round(document.querySelector('#v-jsa').getBoundingClientRect().width)
    };
  });
  ck(!!info,'找到 JSA 步骤卡');
  if(info){
    console.log('    view宽='+info.viewW+' bodyScrollW='+info.bodyScrollW+' bodyClientW='+info.bodyClientW);
    ck(info.bodyScrollW<=info.bodyClientW+1,
       '★ 卡片内容不溢出（scrollW '+info.bodyScrollW+' <= clientW '+info.bodyClientW+'）');
    ck(info.cols.length===10,'一行 10 列（实际 '+info.cols.length+'）');
    const last=info.cols[info.cols.length-1];
    ck(last.right<=info.wrapRight+1,'★ 最后一列（操作）在卡片右边界内（右 '+last.right+' / 卡右 '+info.wrapRight+'）');
    const act=await p.evaluate(()=>{
      const btn=document.querySelector('#v-jsa .jcard-act .x');
      if(!btn) return null;
      const r=btn.getBoundingClientRect();
      const host=document.querySelector('#v-jsa .jcard').getBoundingClientRect();
      return {right:Math.round(r.right),left:Math.round(r.left),hostRight:Math.round(host.right),
              visible:r.right<=host.right+1&&r.left>=host.left-1};
    });
    ck(act&&act.visible,'★ 删除按钮完全可见可点');
  }

  console.log('\n=== ② 无 JS 错误 ===');
  ck(errs.length===0,'无页面错误'+(errs.length?('：'+errs.slice(0,3).join(' | ')):''));

  await b.close();
  console.log('\n结果：'+pass+' 通过 / '+fail+' 失败');
  process.exit(fail?1:0);
})();
