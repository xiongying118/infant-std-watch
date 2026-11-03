const {chromium}=require('playwright-core');
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext();
  const p=await ctx.newPage();
  // 模拟带 referer 的请求
  for(const [label,extra] of [
      ['无 referer',{}],
      ['带 github referer',{referer:'https://xiongying118.github.io/infant-std-watch/'}],
      ['带 github referer + no-referrer',{referer:'https://xiongying118.github.io/infant-std-watch/'}]
  ]){
    const r=await ctx.request.get('https://sppt.cfsa.net.cn:8086/db?task=index',{timeout:40000, ...extra});
    const t=await r.text();
    console.log(label.padEnd(28),'status='+r.status(),'len='+t.length,'404:',/FILE NOT FOUND/i.test(t));
  }
  // 浏览器里用 referrerPolicy=no-referrer
  const p2=await ctx.newPage();
  await p2.goto('https://xiongying118.github.io/infant-std-watch/',{waitUntil:'domcontentloaded',timeout:60000});
  await p2.waitForTimeout(2500);
  const [np]=await Promise.all([
    ctx.waitForEvent('page',{timeout:20000}).catch(()=>null),
    p2.evaluate(()=>{
      const a=document.createElement('a');
      a.href='https://sppt.cfsa.net.cn:8086/db?task=index';
      a.target='_blank'; a.rel='noreferrer';
      document.body.appendChild(a); a.click();
    })
  ]);
  if(np){
    await np.waitForLoadState('domcontentloaded').catch(()=>{});
    await np.waitForTimeout(3000);
    const h=await np.content();
    console.log('浏览器 rel=noreferrer'.padEnd(28),'len='+h.length,'404:',/FILE NOT FOUND/i.test(h));
  }
  await b.close();
})();
