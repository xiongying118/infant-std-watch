/* 2026-11-11 侧栏副标题「（标准更新提醒）」可读性回归
   NODE_PATH=<playwright路径> node scripts/test_nav_sub_20261111.js
   （默认验线上；STD_TARGET=local 验本地 file://） */
const {chromium}=require('playwright-core');
const path=require('path');
const fs=require('fs');
const PROT=path.resolve(__dirname,'..','prototype');
const LOCAL='file:///'+PROT.replace(/\\/g,'/')+'/index.html';
const URL=process.env.STD_TARGET==='local'?LOCAL:'https://xiongying118.github.io/infant-std-watch/';
const SHOT=path.resolve(__dirname,'..','.tmp_v');
function lum(rgb){
  const c=rgb.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
function parse(s){const m=s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null;}
function blend(fg,bg,a){return fg.map((v,i)=>v*a+bg[i]*(1-a));}
function ratio(a,b){const L1=lum(a),L2=lum(b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);}
async function gotoRetry(p,url){
  for(let i=0;i<6;i++){
    try{await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});return true}
    catch(e){console.log('  (网络重试 '+(i+1)+')');await p.waitForTimeout(4000)}
  }
  return false;
}
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  let pass=0,fail=0;
  const ck=(ok,msg)=>{ok?(pass++,console.log('  ✓ '+msg)):(fail++,console.log('  ✗ '+msg))};
  for(const vp of [{w:1600,h:1000,tag:'pc'},{w:390,h:844,tag:'mobile'}]){
    const p=await b.newPage({viewport:{width:vp.w,height:vp.h},deviceScaleFactor:2});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    if(!(await gotoRetry(p,URL+'#home'))){console.log('网络不通');await b.close();process.exit(2)}
    await p.waitForTimeout(2200);
    if(vp.tag==='mobile'){
      await p.evaluate(()=>{ if(typeof toggleNav==='function') toggleNav(true); });
      await p.waitForTimeout(500);
    }
    const d=await p.evaluate(()=>{
      const on=document.querySelector('.nav a.on .tx .sub');
      const off=document.querySelector('.nav a:not(.on) .tx .sub');
      const g=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();
        return {color:s.color,opacity:s.opacity,fontSize:s.fontSize,fontWeight:s.fontWeight,
                text:e.textContent.trim(),w:r.width,h:r.height,x:r.x,y:r.y,
                visible:r.width>0&&r.height>0}};
      const bar=document.querySelector('.nav a.on');
      return {on:on?g(on):null,off:off?g(off):null,
              onBg:bar?getComputedStyle(bar).backgroundColor:null,
              sideBg:getComputedStyle(document.querySelector('.side')).backgroundColor};
    });
    console.log('\n=== '+vp.tag+' '+vp.w+'x'+vp.h+' ===');
    ck(errs.length===0,'无 JS 报错'+(errs.length?': '+errs.join(' | '):''));
    ck(!!d.on&&d.on.visible,'选中项副标题存在且可见：'+(d.on?d.on.text:'无'));
    const fg=parse(d.on.color),bg=parse(d.sideBg)||[18,42,78];
    const eff=blend(fg,bg,fg[3]*parseFloat(d.on.opacity));
    const cr=ratio(eff,bg);
    console.log('    选中态 color='+d.on.color+' opacity='+d.on.opacity+' size='+d.on.fontSize
      +' 与侧栏底色对比度≈'+cr.toFixed(2)+':1');
    ck(cr>=4.5,'选中态文字对比度 ≥4.5:1（WCAG AA）实为 '+cr.toFixed(2));
    ck(parseFloat(d.on.opacity)===1,'选中态无 opacity 衰减');
    ck(!/27, 58, 107|139, 148, 166|138, 148, 166/.test(d.on.color),'不再是深墨蓝/浅灰旧值');
    if(d.off){
      const f2=parse(d.off.color),e2=blend(f2,bg,f2[3]*parseFloat(d.off.opacity));
      const cr2=ratio(e2,bg);
      console.log('    普通态 color='+d.off.color+' 对比度≈'+cr2.toFixed(2)+':1');
      ck(cr2>=3.5,'普通态对比度 ≥3.5:1 实为 '+cr2.toFixed(2));
    }
    // 裁切检查：副标题完整显示（scrollWidth <= clientWidth + 1）
    const clip=await p.evaluate(()=>{
      const e=document.querySelector('.nav a.on .tx');
      return {sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight,
              subW:document.querySelector('.nav a.on .tx .sub').getBoundingClientRect().width};
    });
    console.log('    .tx scrollW='+clip.sw+' clientW='+clip.cw+' scrollH='+clip.sh+' clientH='+clip.ch);
    ck(clip.sw<=clip.cw+2,'副标题未被横向裁切');
    const pos=await p.evaluate(()=>{
      const s=document.querySelector('.side').getBoundingClientRect();
      const a=document.querySelector('.nav a.on').getBoundingClientRect();
      return {sideX:s.x,sideW:s.width,onX:a.x,onY:a.y,onW:a.width,onH:a.height};
    });
    console.log('    位置 side.x='+pos.sideX+' on.x='+pos.onX+' on.y='+pos.onY);
    ck(pos.onX>=0&&pos.onX<vp.w,'选中项位于可视屏幕内');
    const nav=await p.$('.nav a.on');
    if(nav){
      const box=await nav.boundingBox();
      if(box&&box.x>=0){
        const buf=await p.screenshot({clip:{x:Math.max(0,box.x-14),y:Math.max(0,box.y-10),
          width:Math.min(vp.w-Math.max(0,box.x-14),280),height:Math.min(vp.h-Math.max(0,box.y-10),box.height+20)}});
        fs.writeFileSync(path.join(SHOT,'_navsub_'+vp.tag+'.png'),buf);
      }
    }
    if(vp.tag==='mobile'){
      const full=await p.screenshot();
      fs.writeFileSync(path.join(SHOT,'_navsub_mobile_full.png'),full);
    }
    await p.close();
  }
  await b.close();
  console.log('\n结果 '+pass+' 通过 / '+fail+' 失败');
  process.exit(fail?1:0);
})();
