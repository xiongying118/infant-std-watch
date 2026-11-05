const fs=require('fs');
const ROOT=__dirname+'/..';
global.window={};
require(ROOT+'/prototype/data.js');
const norm=s=>String(s||'').replace(/\s+/g,'').replace(/-\d{4}$/,'').toUpperCase();

const scopeRaw=JSON.parse(fs.readFileSync(ROOT+'/data/refscope.json','utf8')).scope;
const txt=fs.readFileSync(ROOT+'/data/_refjs.txt','utf8');
const rg={};
{ const re=new RegExp('no:"([^"]+)"','g'); let m;
  while((m=re.exec(txt))) { const k=norm(m[1]); (rg[k]=rg[k]||[]).push(m[1]); } }

const E=window.STDWATCH_DATA.ERATA;
const by={}; E.forEach(e=>{const k=norm(e.no);(by[k]=by[k]||[]).push(e);});

console.log('=== scope 里但页面 REFGROUPS 没有的（全部）===');
Object.keys(scopeRaw).filter(k=>!rg[norm(k)]).sort().forEach(k=>{
  console.log('  ',k.padEnd(13),JSON.stringify(scopeRaw[k]).padEnd(30),'ERATA:',(by[k]||[]).length,'条');
});
console.log('\n=== REFGROUPS 里但 scope 没有的 ===');
console.log('  ',Object.keys(rg).filter(k=>!scopeRaw[k]).join(', '));
