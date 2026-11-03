const {chromium}=require('playwright-core');
(async()=>{
  const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const ctx=await b.newContext();
  const p=await ctx.newPage();
  // 1) 直接 goto（无 referrer）
  await p.goto('https://sppt.cfsa.net.cn:8086/db?task=index',{waitUntil:'domcontentloaded',timeout:40000});
  await p.waitForTimeout(3000);
  let h=await p.content();
  console.log('A 直接 goto    :', p.url().slice(0,80), '| len', h.length, '| 404:', /FILE NOT FOUND/i.test(h));
  // 2) 从线上页面 window.open
  const p2=await ctx.newPage();
  await p2.goto('https://xiongying118.github.io/infant-std-watch/',{waitUntil:'domcontentloaded',timeout:60000});
  await p2.waitForTimeout(3000);
  const [np]=await Promise.all([
    ctx.waitForEvent('page',{timeout:20000}).catch(()=>null),
    p2.evaluate(()=>window.open('https://sppt.cfsa.net.cn:8086/db?task=index','_blank'))
  ]);
  if(np){
    await np.waitForLoadState('domcontentloaded').catch(()=>{});
    await np.waitForTimeout(3000);
    const hh=await np.content();
    console.log('B 线上 window.open:', np.url().slice(0,80), '| len', hh.length, '| 404:', /FILE NOT FOUND/i.test(hh));
    console.log('   片段:', hh.replace(/\s+/g,' ').slice(0,200));
  }
  await b.close();
})();
